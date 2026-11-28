/** Personal vocabulary and saved daily word assignments. Statement-only. */

import type { DictionaryEntry } from '../../../shared/contracts';
import type { Db } from '../connection';

export type UserVocabularyRow = {
  readonly id: string;
  readonly profileId: string;
  readonly itemKey: string;
  readonly sourceEntryId: string;
  readonly snapshot: DictionaryEntry;
  readonly introducedAt: string | null;
  readonly introducedDayKey: string | null;
  readonly familiarityFlag: boolean;
  readonly notes: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

type Row = {
  id: string;
  profile_id: string;
  item_key: string;
  source_entry_id: string;
  snapshot_json: string;
  introduced_at: string | null;
  introduced_day_key: string | null;
  familiarity_flag: number;
  notes: string;
  created_at: string;
  updated_at: string;
};

const COLUMNS = `id, profile_id, item_key, source_entry_id, snapshot_json, introduced_at,
  introduced_day_key, familiarity_flag, notes, created_at, updated_at`;

function toRow(row: Row): UserVocabularyRow {
  return {
    id: row.id,
    profileId: row.profile_id,
    itemKey: row.item_key,
    sourceEntryId: row.source_entry_id,
    snapshot: JSON.parse(row.snapshot_json) as DictionaryEntry,
    introducedAt: row.introduced_at,
    introducedDayKey: row.introduced_day_key,
    familiarityFlag: row.familiarity_flag === 1,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getByItem(db: Db, profileId: string, itemKey: string): UserVocabularyRow | null {
  const row = db
    .prepare(`select ${COLUMNS} from user_vocabulary where profile_id = ? and item_key = ?`)
    .get(profileId, itemKey) as Row | undefined;
  return row === undefined ? null : toRow(row);
}

export function listUserVocabulary(db: Db, profileId: string): UserVocabularyRow[] {
  const rows = db
    .prepare(`select ${COLUMNS} from user_vocabulary where profile_id = ? order by item_key`)
    .all(profileId) as Row[];
  return rows.map(toRow);
}

export function insertUserVocabulary(db: Db, row: UserVocabularyRow): void {
  db.prepare(
    `insert into user_vocabulary (
       id, profile_id, item_key, source_entry_id, snapshot_json, introduced_at,
       introduced_day_key, familiarity_flag, notes, created_at, updated_at
     ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.id,
    row.profileId,
    row.itemKey,
    row.sourceEntryId,
    JSON.stringify(row.snapshot),
    row.introducedAt,
    row.introducedDayKey,
    Number(row.familiarityFlag),
    row.notes,
    row.createdAt,
    row.updatedAt,
  );
}

export function updateUserVocabulary(
  db: Db,
  id: string,
  patch: Partial<Pick<UserVocabularyRow, 'familiarityFlag' | 'notes' | 'introducedAt' | 'introducedDayKey'>>,
  nowIso: string,
): void {
  const assignments: string[] = [];
  const values: (string | number | null)[] = [];
  if (patch.familiarityFlag !== undefined) {
    assignments.push('familiarity_flag = ?');
    values.push(Number(patch.familiarityFlag));
  }
  if (patch.notes !== undefined) {
    assignments.push('notes = ?');
    values.push(patch.notes);
  }
  if (patch.introducedAt !== undefined) {
    assignments.push('introduced_at = ?');
    values.push(patch.introducedAt);
  }
  if (patch.introducedDayKey !== undefined) {
    assignments.push('introduced_day_key = ?');
    values.push(patch.introducedDayKey);
  }
  if (assignments.length === 0) return;
  assignments.push('updated_at = ?');
  values.push(nowIso);
  db.prepare(`update user_vocabulary set ${assignments.join(', ')} where id = ?`).run(...values, id);
}

export type DailyNewItemRow = {
  readonly id: string;
  readonly planId: string;
  readonly profileId: string;
  readonly itemKey: string;
  readonly position: number;
  readonly state: 'assigned' | 'introduced' | 'deferred' | 'familiar';
};

type DailyRow = {
  id: string;
  plan_id: string;
  profile_id: string;
  item_key: string;
  position: number;
  state: string;
};

export function getDailyNewItems(db: Db, planId: string): DailyNewItemRow[] {
  const rows = db
    .prepare('select id, plan_id, profile_id, item_key, position, state from daily_new_items where plan_id = ? order by position')
    .all(planId) as DailyRow[];
  return rows.map((row) => ({
    id: row.id,
    planId: row.plan_id,
    profileId: row.profile_id,
    itemKey: row.item_key,
    position: row.position,
    state: row.state as DailyNewItemRow['state'],
  }));
}

export function insertDailyNewItems(db: Db, rows: readonly DailyNewItemRow[]): void {
  const statement = db.prepare(
    `insert into daily_new_items (id, plan_id, profile_id, item_key, position, state, created_at)
     values (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const row of rows) {
    statement.run(row.id, row.planId, row.profileId, row.itemKey, row.position, row.state, new Date().toISOString());
  }
}

export function setDailyNewItemState(
  db: Db,
  planId: string,
  itemKey: string,
  state: DailyNewItemRow['state'],
): void {
  db.prepare('update daily_new_items set state = ? where plan_id = ? and item_key = ?').run(
    state,
    planId,
    itemKey,
  );
}

export function countIntroducedOnDay(db: Db, profileId: string, dayKey: string): number {
  return (
    db
      .prepare(
        'select count(*) c from user_vocabulary where profile_id = ? and introduced_day_key = ?',
      )
      .get(profileId, dayKey) as { c: number }
  ).c;
}

export function countReviewsOnDay(db: Db, profileId: string, dayKey: string): number {
  return (
    db
      .prepare(`select count(*) c from review_logs
       where profile_id = ? and day_key = ? and undo_of is null
         and id not in (select undo_of from review_logs where profile_id = ? and undo_of is not null)`)
      .get(profileId, dayKey, profileId) as { c: number }
  ).c;
}

export function insertDiagnostic(
  db: Db,
  row: { readonly id: string; readonly profileId: string; readonly itemKey: string; readonly correct: boolean; readonly respondedAt: string; readonly dayKey: string },
): void {
  db.prepare(
    `insert into familiarity_diagnostics (id, profile_id, item_key, correct, responded_at, day_key)
     values (?, ?, ?, ?, ?, ?)`,
  ).run(row.id, row.profileId, row.itemKey, Number(row.correct), row.respondedAt, row.dayKey);
}
