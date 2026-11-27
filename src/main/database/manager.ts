/**
 * Owns the single writable profile database connection for the app's lifetime.
 *
 * Everything that opens, closes or replaces the database goes through here, so
 * a restore can safely swap the file underneath without leaving a stale handle.
 */

import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { AppError } from '../../shared/errors';
import { openDatabase, type Db } from './connection';
import { migrate, type MigrateOptions } from './migrate';

export type OpenHooks = {
  /** Invoked with the open connection before an upgrade of an existing database. */
  readonly backupBeforeUpgrade?: (db: Db) => void;
};

export class DatabaseManager {
  readonly root: string;
  readonly file: string;
  readonly backupsDir: string;
  #db: Db | null = null;

  constructor(root: string) {
    this.root = path.resolve(root);
    this.file = path.join(this.root, 'profile.db');
    this.backupsDir = path.join(this.root, 'backups');
  }

  open(nowMs: number, hooks: OpenHooks = {}): Db {
    if (this.#db !== null) {
      throw AppError.conflict('The profile database is already open.');
    }

    mkdirSync(this.root, { recursive: true });
    mkdirSync(this.backupsDir, { recursive: true });

    const db = openDatabase(this.file);
    const migrateOptions: MigrateOptions = {
      nowMs,
      ...(hooks.backupBeforeUpgrade === undefined
        ? {}
        : { backupBeforeUpgrade: () => hooks.backupBeforeUpgrade?.(db) }),
    };

    try {
      migrate(db, migrateOptions);
    } catch (cause) {
      try {
        db.close();
      } catch {
        // Nothing useful to do if the failed handle also refuses to close.
      }
      throw cause;
    }

    this.#db = db;
    return db;
  }

  get(): Db {
    if (this.#db === null) {
      throw AppError.dbIo('The profile database is not open.');
    }
    return this.#db;
  }

  isOpen(): boolean {
    return this.#db !== null;
  }

  close(): void {
    const db = this.#db;
    this.#db = null;
    if (db !== null) {
      db.close();
    }
  }

  /** Removes the database file and its WAL sidecars. Used only by restore. */
  removeFiles(): void {
    for (const file of [this.file, `${this.file}-wal`, `${this.file}-shm`]) {
      rmSync(file, { force: true });
    }
  }
}
