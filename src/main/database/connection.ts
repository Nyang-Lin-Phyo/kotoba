/**
 * SQLite access for the writable profile database.
 *
 * `node:sqlite` is used deliberately: it ships inside Electron's Node, so there
 * is no native addon to rebuild per platform, no ABI mismatch between the Linux
 * development build and the Windows CI build, and no MSVC toolchain requirement
 * on the runner. FTS5, WAL, foreign keys and `VACUUM INTO` were all verified
 * present in Electron 45 (SQLite 3.54.1) before this module was written.
 */

import { DatabaseSync } from 'node:sqlite';

export type Db = DatabaseSync;

/**
 * Opens (or creates) the profile database with the pragmas Kotoba depends on.
 * Foreign keys are per-connection in SQLite, so this must never be skipped.
 */
export function openDatabase(file: string): Db {
  const db = new DatabaseSync(file);
  db.exec('pragma journal_mode = wal');
  db.exec('pragma foreign_keys = on');
  db.exec('pragma busy_timeout = 5000');
  db.exec('pragma synchronous = normal');
  return db;
}

/**
 * Runs `run` inside `BEGIN IMMEDIATE ... COMMIT`, rolling back on any throw.
 *
 * Transactions are not nested: services own the transaction and repositories
 * only issue statements. Calling this inside another transaction would raise
 * SQLite's "cannot start a transaction within a transaction".
 */
export function transaction<T>(db: Db, run: () => T): T {
  db.exec('begin immediate');
  try {
    const result = run();
    db.exec('commit');
    return result;
  } catch (cause) {
    try {
      db.exec('rollback');
    } catch {
      // The transaction may already have been rolled back by SQLite itself.
    }
    throw cause;
  }
}

/** Quotes a string for the few statements that cannot take bound parameters. */
export function quoteSqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function tableExists(db: Db, name: string): boolean {
  const row = db
    .prepare("select name from sqlite_master where type = 'table' and name = ?")
    .get(name);
  return row !== undefined;
}
