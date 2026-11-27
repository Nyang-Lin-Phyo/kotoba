/**
 * Application-level key/value settings (theme, last backup day).
 *
 * Learning data never lives here: these are UI and housekeeping values only.
 */

import { tableExists, type Db } from '../connection';

const SETTINGS_TABLE = 'app_settings';

export function getSetting(db: Db, key: string): string | null {
  // Settings can be read during an upgrade, before the table exists.
  if (!tableExists(db, SETTINGS_TABLE)) {
    return null;
  }
  const row = db.prepare(`select value from ${SETTINGS_TABLE} where key = ?`).get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(db: Db, key: string, value: string, nowIso: string): void {
  db.prepare(
    `insert into ${SETTINGS_TABLE} (key, value, updated_at) values (?, ?, ?)
     on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at`,
  ).run(key, value, nowIso);
}

export function getAllSettings(db: Db): Record<string, string> {
  if (!tableExists(db, SETTINGS_TABLE)) {
    return {};
  }
  const rows = db.prepare(`select key, value from ${SETTINGS_TABLE}`).all() as {
    key: string;
    value: string;
  }[];
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}
