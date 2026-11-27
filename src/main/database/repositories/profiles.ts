/**
 * Profile rows.
 *
 * Repositories issue statements only; transactions belong to the services so a
 * multi-table change (profile + first goal version) commits atomically.
 */

import { randomUUID } from 'node:crypto';
import type { Profile, ProfilePreferences } from '../../../shared/contracts';
import { INTERESTS, type Interest } from '../../../shared/enums';
import type { ProfileInput, ProfileUpdateInput } from '../../../shared/schemas';
import type { Db } from '../connection';

type ProfileRow = {
  id: string;
  display_name: string;
  start_date: string;
  horizon_months: number;
  timezone: string;
  initial_level: string;
  target_jlpt: string | null;
  interests_json: string;
  preferences_json: string;
  created_at: string;
  updated_at: string;
};

const DEFAULT_PREFERENCES: ProfilePreferences = {
  romaji: true,
  furigana: true,
  audio: 'off',
};

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function knownInterests(values: readonly string[]): Interest[] {
  const allowed = new Set<string>(INTERESTS);
  return values.filter((value): value is Interest => allowed.has(value));
}

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    displayName: row.display_name,
    startDate: row.start_date,
    horizonMonths: row.horizon_months,
    timezone: row.timezone,
    initialLevel: row.initial_level as Profile['initialLevel'],
    targetJlpt: row.target_jlpt as Profile['targetJlpt'],
    interests: knownInterests(parseJson<string[]>(row.interests_json, [])),
    preferences: {
      ...DEFAULT_PREFERENCES,
      ...parseJson<Partial<ProfilePreferences>>(row.preferences_json, {}),
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLUMNS = `
  id, display_name, start_date, horizon_months, timezone, initial_level,
  target_jlpt, interests_json, preferences_json, created_at, updated_at
`;

export function insertProfile(db: Db, input: ProfileInput, nowIso: string): Profile {
  const id = randomUUID();
  db.prepare(
    `insert into profiles (
       id, display_name, start_date, horizon_months, timezone, initial_level,
       target_jlpt, interests_json, preferences_json, is_active, created_at, updated_at
     ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  ).run(
    id,
    input.displayName,
    input.startDate,
    input.horizonMonths,
    input.timezone,
    input.initialLevel,
    input.targetJlpt,
    JSON.stringify(input.interests),
    JSON.stringify(input.preferences),
    nowIso,
    nowIso,
  );

  const created = findProfileById(db, id);
  if (created === null) {
    throw new Error('Inserted profile could not be read back');
  }
  return created;
}

export function findProfileById(db: Db, id: string): Profile | null {
  const row = db.prepare(`select ${SELECT_COLUMNS} from profiles where id = ?`).get(id) as
    | ProfileRow
    | undefined;
  return row === undefined ? null : toProfile(row);
}

export function getActiveProfile(db: Db): Profile | null {
  const row = db
    .prepare(`select ${SELECT_COLUMNS} from profiles where is_active = 1`)
    .get() as ProfileRow | undefined;
  return row === undefined ? null : toProfile(row);
}

export function updateProfileRow(
  db: Db,
  id: string,
  patch: ProfileUpdateInput,
  nowIso: string,
): void {
  const assignments: string[] = [];
  const values: (string | null)[] = [];

  if (patch.displayName !== undefined) {
    assignments.push('display_name = ?');
    values.push(patch.displayName);
  }
  if (patch.timezone !== undefined) {
    assignments.push('timezone = ?');
    values.push(patch.timezone);
  }
  if (patch.targetJlpt !== undefined) {
    assignments.push('target_jlpt = ?');
    values.push(patch.targetJlpt);
  }
  if (patch.interests !== undefined) {
    assignments.push('interests_json = ?');
    values.push(JSON.stringify(patch.interests));
  }
  if (patch.preferences !== undefined) {
    assignments.push('preferences_json = ?');
    values.push(JSON.stringify(patch.preferences));
  }

  if (assignments.length === 0) {
    return;
  }

  assignments.push('updated_at = ?');
  values.push(nowIso);

  db.prepare(`update profiles set ${assignments.join(', ')} where id = ?`).run(...values, id);
}

export function countProfiles(db: Db): number {
  const row = db.prepare('select count(*) as total from profiles').get() as
    | { total: number }
    | undefined;
  return row?.total ?? 0;
}
