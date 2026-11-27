/**
 * Migration runner.
 *
 * Each migration is applied inside its own transaction, so a failed upgrade
 * leaves the database at the previous version rather than half-migrated.
 * An upgrade of an existing database triggers a backup first (the caller
 * supplies that hook, because backups live outside the database module).
 */

import { AppError } from '../../shared/errors';
import { tableExists, transaction, type Db } from './connection';
import { LATEST_SCHEMA_VERSION, MIGRATIONS } from './migrations';

export type MigrateOptions = {
  readonly nowMs?: number;
  /** Called once before any pending migration is applied to an existing database. */
  readonly backupBeforeUpgrade?: () => void;
};

export type MigrationOutcome = {
  readonly from: number;
  readonly to: number;
  readonly applied: readonly number[];
};

const MIGRATIONS_TABLE = 'schema_migrations';

function ensureMigrationsTable(db: Db): void {
  db.exec(`
    create table if not exists ${MIGRATIONS_TABLE} (
      version integer primary key,
      applied_at text not null
    )
  `);
}

export function readSchemaVersion(db: Db): number {
  if (!tableExists(db, MIGRATIONS_TABLE)) {
    return 0;
  }
  const row = db.prepare(`select max(version) as version from ${MIGRATIONS_TABLE}`).get() as
    | { version: number | null }
    | undefined;
  return row?.version ?? 0;
}

export function migrate(db: Db, options: MigrateOptions = {}): MigrationOutcome {
  const nowIso = new Date(options.nowMs ?? Date.now()).toISOString();

  ensureMigrationsTable(db);
  const from = readSchemaVersion(db);

  if (from > LATEST_SCHEMA_VERSION) {
    throw AppError.dataMissing(
      `This profile database uses schema v${from}, but this build only understands v${LATEST_SCHEMA_VERSION}. Update Kotoba instead of downgrading.`,
    );
  }

  const pending = MIGRATIONS.filter((migration) => migration.version > from).toSorted(
    (left, right) => left.version - right.version,
  );

  if (pending.length === 0) {
    return { from, to: from, applied: [] };
  }

  // A fresh database has nothing worth preserving; an upgrade does.
  if (from > 0 && options.backupBeforeUpgrade !== undefined) {
    options.backupBeforeUpgrade();
  }

  const applied: number[] = [];
  for (const migration of pending) {
    transaction(db, () => {
      db.exec(migration.sql);
      db.prepare(`insert into ${MIGRATIONS_TABLE} (version, applied_at) values (?, ?)`).run(
        migration.version,
        nowIso,
      );
    });
    applied.push(migration.version);
  }

  return { from, to: readSchemaVersion(db), applied };
}
