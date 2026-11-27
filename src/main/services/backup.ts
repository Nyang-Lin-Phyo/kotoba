/**
 * Consistent SQLite backups.
 *
 * `VACUUM INTO` is used instead of copying files: copying a live WAL database
 * can capture a torn state (the `.db` alone is not the whole database while a
 * `-wal` file exists). `VACUUM INTO` produces a single-file, fully consistent
 * snapshot that can be opened read-only to verify it.
 *
 * Writes go to a `.partial` file and are renamed into place, so an interrupted
 * backup never looks like a valid one.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { BackupInfo, RestoreResult } from '../../shared/contracts';
import { AppError } from '../../shared/errors';
import { quoteSqlString, type Db } from '../database/connection';
import { readSchemaVersion } from '../database/migrate';
import { LATEST_SCHEMA_VERSION } from '../database/migrations';
import { getSetting, setSetting } from '../database/repositories/settings';

export type BackupReason = 'daily' | 'pre-migration' | 'pre-restore' | 'manual';

export const BACKUP_REASONS: readonly BackupReason[] = [
  'daily',
  'pre-migration',
  'pre-restore',
  'manual',
];

const NAME_PATTERN =
  /^kotoba-(\d{8})-(\d{6})-(daily|pre-migration|pre-restore|manual)(?:-(\d+))?\.db$/;

/** Automatic daily snapshots are kept for two weeks. */
const KEEP_DAILY = 14;
/** Safety snapshots taken around migrations/restores are kept per reason. */
const KEEP_OTHER = 5;

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function reasonOf(fileName: string): string {
  return NAME_PATTERN.exec(fileName)?.[3] ?? 'unknown';
}

function toBackupInfo(directory: string, fileName: string): BackupInfo {
  const stat = statSync(path.join(directory, fileName));
  return {
    fileName,
    createdAt: stat.mtime.toISOString(),
    sizeBytes: stat.size,
    reason: reasonOf(fileName),
  };
}

function listBackupNames(directory: string): string[] {
  if (!existsSync(directory)) {
    return [];
  }
  return readdirSync(directory).filter((name) => NAME_PATTERN.test(name));
}

/** Newest first. */
export function listBackups(directory: string): BackupInfo[] {
  return listBackupNames(directory)
    .map((fileName) => toBackupInfo(directory, fileName))
    .toSorted((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function pruneBackups(directory: string): void {
  const byReason = new Map<string, BackupInfo[]>();

  for (const info of listBackups(directory)) {
    const bucket = byReason.get(info.reason) ?? [];
    bucket.push(info);
    byReason.set(info.reason, bucket);
  }

  for (const [reason, backups] of byReason) {
    const keep = reason === 'daily' ? KEEP_DAILY : KEEP_OTHER;
    for (const stale of backups.slice(keep)) {
      rmSync(path.join(directory, stale.fileName), { force: true });
    }
  }
}

/**
 * Creates a consistent snapshot of `db` and returns its metadata.
 * Pruning only ever touches files matching Kotoba's own backup naming scheme.
 */
export function createBackup(
  db: Db,
  directory: string,
  nowMs: number,
  reason: BackupReason,
): BackupInfo {
  mkdirSync(directory, { recursive: true });

  const iso = new Date(nowMs).toISOString();
  const date = iso.slice(0, 10).replaceAll('-', '');
  const time = iso.slice(11, 19).replaceAll(':', '');

  let fileName = `kotoba-${date}-${time}-${reason}.db`;
  let attempt = 1;
  while (existsSync(path.join(directory, fileName))) {
    attempt += 1;
    fileName = `kotoba-${date}-${time}-${reason}-${attempt}.db`;
  }

  const finalPath = path.join(directory, fileName);
  const partialPath = `${finalPath}.partial`;
  rmSync(partialPath, { force: true });

  try {
    db.exec(`vacuum into ${quoteSqlString(partialPath)}`);
    renameSync(partialPath, finalPath);
  } catch (cause) {
    rmSync(partialPath, { force: true });
    throw AppError.dbIo(`Could not create a backup: ${describe(cause)}`);
  }

  pruneBackups(directory);
  return toBackupInfo(directory, fileName);
}

/**
 * Verifies that a file really is a Kotoba database before anything is replaced.
 * Throws a structured error rather than letting a corrupt file reach the app.
 */
export function validateBackupFile(filePath: string): number {
  if (!existsSync(filePath)) {
    throw AppError.notFound('That backup file no longer exists.');
  }
  if (!statSync(filePath).isFile()) {
    throw AppError.validation('That backup path is not a file.');
  }

  let probe: DatabaseSync | null = null;
  try {
    probe = new DatabaseSync(filePath, { readOnly: true });
    const integrity = probe.prepare('pragma integrity_check').get() as
      | { integrity_check: string }
      | undefined;
    if (integrity?.integrity_check !== 'ok') {
      throw AppError.dataMissing('That backup failed its integrity check.');
    }

    const version = readSchemaVersion(probe);
    if (version === 0) {
      throw AppError.dataMissing('That file is not a Kotoba profile database.');
    }
    if (version > LATEST_SCHEMA_VERSION) {
      throw AppError.dataMissing(
        `That backup uses schema v${version}, newer than this build understands (v${LATEST_SCHEMA_VERSION}).`,
      );
    }
    return version;
  } catch (cause) {
    if (cause instanceof AppError) {
      throw cause;
    }
    throw AppError.dataMissing(`That file is not a readable SQLite database: ${describe(cause)}`);
  } finally {
    probe?.close();
  }
}

/** The slice of the connection manager that a restore needs. */
export type RestoreTarget = {
  readonly file: string;
  readonly backupsDir: string;
  get(): Db;
  close(): void;
  open(nowMs: number): Db;
};

/**
 * Restores a backup over the live profile database.
 *
 * Order matters: verify the source, snapshot the current database, then close,
 * replace and reopen. If reopening fails the app is left with a clear error
 * rather than a half-open database.
 */
export function restoreBackup(
  target: RestoreTarget,
  fileName: string,
  nowMs: number,
): RestoreResult {
  // Defense in depth: the IPC schema already restricts this, but a path that
  // escapes the backups directory must never reach `path.join`.
  if (!NAME_PATTERN.test(fileName)) {
    throw AppError.validation('That is not a Kotoba backup file name.');
  }

  const sourcePath = path.join(target.backupsDir, fileName);
  validateBackupFile(sourcePath);

  const safety: BackupInfo = createBackup(target.get(), target.backupsDir, nowMs, 'pre-restore');

  target.close();
  for (const sidecar of [target.file, `${target.file}-wal`, `${target.file}-shm`]) {
    rmSync(sidecar, { force: true });
  }
  copyFileSync(sourcePath, target.file);

  try {
    target.open(nowMs);
  } catch (cause) {
    throw AppError.dbIo(
      `The backup was copied but the database could not be reopened: ${describe(cause)}. Safety backup: ${safety.fileName}`,
    );
  }

  return { restored: fileName, safetyBackup: safety.fileName };
}

const LAST_BACKUP_DAY_KEY = 'last_backup_day';

/**
 * Takes at most one automatic snapshot per study day, after a successful write.
 * Returns `null` when today's snapshot already exists.
 */
export function maybeDailyBackup(
  db: Db,
  directory: string,
  nowMs: number,
  dayKey: string,
): BackupInfo | null {
  if (getSetting(db, LAST_BACKUP_DAY_KEY) === dayKey) {
    return null;
  }

  const info = createBackup(db, directory, nowMs, 'daily');
  setSetting(db, LAST_BACKUP_DAY_KEY, dayKey, new Date(nowMs).toISOString());
  return info;
}
