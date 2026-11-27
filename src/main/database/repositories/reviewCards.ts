/** FSRS review cards. Statement-only; services own transactions. */

import type { Db } from '../connection';

export type ReviewCardRow = {
  readonly id: string;
  readonly profileId: string;
  readonly itemType: 'vocabulary' | 'kana';
  readonly itemKey: string;
  readonly skill: 'meaning' | 'reading';
  readonly schedulerVersion: string;
  readonly dueAt: string;
  readonly stateJson: string;
  readonly lastReviewAt: string | null;
  readonly reps: number;
  readonly lapses: number;
  readonly createdAt: string;
  readonly updatedAt: string;
};

type Row = {
  id: string;
  profile_id: string;
  item_type: string;
  item_key: string;
  skill: string;
  scheduler_version: string;
  due_at: string;
  scheduler_state_json: string;
  last_review_at: string | null;
  reps: number;
  lapses: number;
  created_at: string;
  updated_at: string;
};

const COLUMNS = `id, profile_id, item_type, item_key, skill, scheduler_version, due_at,
  scheduler_state_json, last_review_at, reps, lapses, created_at, updated_at`;

function toCard(row: Row): ReviewCardRow {
  return {
    id: row.id,
    profileId: row.profile_id,
    itemType: row.item_type as ReviewCardRow['itemType'],
    itemKey: row.item_key,
    skill: row.skill as ReviewCardRow['skill'],
    schedulerVersion: row.scheduler_version,
    dueAt: row.due_at,
    stateJson: row.scheduler_state_json,
    lastReviewAt: row.last_review_at,
    reps: row.reps,
    lapses: row.lapses,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function countDueCards(db: Db, profileId: string, nowMs: number): number {
  return (
    db
      .prepare(
        `select count(*) c from review_cards
         where profile_id = ? and item_type = 'vocabulary' and due_at <= ?`,
      )
      .get(profileId, new Date(nowMs).toISOString()) as { c: number }
  ).c;
}

export function insertCard(db: Db, row: ReviewCardRow): void {
  db.prepare(
    `insert into review_cards (
       id, profile_id, item_type, item_key, skill, scheduler_version, due_at,
       scheduler_state_json, last_review_at, reps, lapses, created_at, updated_at
     ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.id,
    row.profileId,
    row.itemType,
    row.itemKey,
    row.skill,
    row.schedulerVersion,
    row.dueAt,
    row.stateJson,
    row.lastReviewAt,
    row.reps,
    row.lapses,
    row.createdAt,
    row.updatedAt,
  );
}

export function getCard(db: Db, profileId: string, cardId: string): ReviewCardRow | null {
  const row = db
    .prepare(`select ${COLUMNS} from review_cards where profile_id = ? and id = ?`)
    .get(profileId, cardId) as Row | undefined;
  return row === undefined ? null : toCard(row);
}

export function getCardForSkill(
  db: Db,
  profileId: string,
  itemKey: string,
  skill: ReviewCardRow['skill'],
): ReviewCardRow | null {
  const row = db
    .prepare(
      `select ${COLUMNS} from review_cards
       where profile_id = ? and item_type = 'vocabulary' and item_key = ? and skill = ?`,
    )
    .get(profileId, itemKey, skill) as Row | undefined;
  return row === undefined ? null : toCard(row);
}

export function listCards(db: Db, profileId: string): ReviewCardRow[] {
  const rows = db
    .prepare(`select ${COLUMNS} from review_cards where profile_id = ? order by due_at, id`)
    .all(profileId) as Row[];
  return rows.map(toCard);
}

export function updateCard(
  db: Db,
  id: string,
  patch: Partial<Pick<ReviewCardRow, 'dueAt' | 'stateJson' | 'lastReviewAt' | 'reps' | 'lapses'>>,
  nowIso: string,
): void {
  const assignments: string[] = [];
  const values: (string | number | null)[] = [];
  if (patch.dueAt !== undefined) {
    assignments.push('due_at = ?');
    values.push(patch.dueAt);
  }
  if (patch.stateJson !== undefined) {
    assignments.push('scheduler_state_json = ?');
    values.push(patch.stateJson);
  }
  if (patch.lastReviewAt !== undefined) {
    assignments.push('last_review_at = ?');
    values.push(patch.lastReviewAt);
  }
  if (patch.reps !== undefined) {
    assignments.push('reps = ?');
    values.push(patch.reps);
  }
  if (patch.lapses !== undefined) {
    assignments.push('lapses = ?');
    values.push(patch.lapses);
  }
  if (assignments.length === 0) return;
  assignments.push('updated_at = ?');
  values.push(nowIso);
  db.prepare(`update review_cards set ${assignments.join(', ')} where id = ?`).run(...values, id);
}
