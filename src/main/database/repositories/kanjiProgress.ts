/** Personal kanji encounter/review state. */

import type { Db } from '../connection';

export type KanjiStatus = 'encountered' | 'learning' | 'verified';

export type UserKanjiRow = {
  readonly id: string;
  readonly profileId: string;
  readonly literal: string;
  readonly firstDayKey: string;
  readonly status: KanjiStatus;
  readonly dueDay: string | null;
  readonly intervalDays: number;
  readonly reps: number;
  readonly lapses: number;
  readonly lastAttemptDay: string | null;
  readonly updatedAt: string;
};

type Row = {
  id: string;
  profile_id: string;
  literal: string;
  first_day_key: string;
  status: string;
  due_day: string | null;
  interval_days: number;
  reps: number;
  lapses: number;
  last_attempt_day: string | null;
  updated_at: string;
};

const COLUMNS = `id, profile_id, literal, first_day_key, status, due_day, interval_days,
  reps, lapses, last_attempt_day, updated_at`;

function toRow(row: Row): UserKanjiRow {
  return {
    id: row.id,
    profileId: row.profile_id,
    literal: row.literal,
    firstDayKey: row.first_day_key,
    status: row.status as KanjiStatus,
    dueDay: row.due_day,
    intervalDays: row.interval_days,
    reps: row.reps,
    lapses: row.lapses,
    lastAttemptDay: row.last_attempt_day,
    updatedAt: row.updated_at,
  };
}

export function getKanji(db: Db, profileId: string, literal: string): UserKanjiRow | null {
  const row = db
    .prepare(`select ${COLUMNS} from user_kanji where profile_id = ? and literal = ?`)
    .get(profileId, literal) as Row | undefined;
  return row === undefined ? null : toRow(row);
}

export function listKanji(db: Db, profileId: string): UserKanjiRow[] {
  const rows = db
    .prepare(`select ${COLUMNS} from user_kanji where profile_id = ? order by literal`)
    .all(profileId) as Row[];
  return rows.map(toRow);
}

export function upsertKanji(db: Db, row: UserKanjiRow): void {
  db.prepare(
    `insert into user_kanji (${COLUMNS}) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     on conflict (profile_id, literal) do update set
       status = excluded.status, due_day = excluded.due_day,
       interval_days = excluded.interval_days, reps = excluded.reps,
       lapses = excluded.lapses, last_attempt_day = excluded.last_attempt_day,
       updated_at = excluded.updated_at`,
  ).run(
    row.id, row.profileId, row.literal, row.firstDayKey, row.status, row.dueDay,
    row.intervalDays, row.reps, row.lapses, row.lastAttemptDay, row.updatedAt,
  );
}

export function insertKanjiAttempt(db: Db, row: {
  readonly id: string;
  readonly profileId: string;
  readonly literal: string;
  readonly dayKey: string;
  readonly attemptedAt: string;
  readonly correct: boolean;
  readonly hintUsed: boolean;
  readonly responseMs: number;
  readonly wordContext: string;
}): void {
  db.prepare(
    `insert into kanji_attempts (id, profile_id, literal, day_key, attempted_at, correct,
       hint_used, response_ms, word_context) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.id, row.profileId, row.literal, row.dayKey, row.attemptedAt,
    Number(row.correct), Number(row.hintUsed), row.responseMs, row.wordContext,
  );
}

export type KanjiAttemptRow = {
  readonly id: string;
  readonly literal: string;
  readonly dayKey: string;
  readonly attemptedAt: string;
  readonly correct: boolean;
  readonly hintUsed: boolean;
  readonly responseMs: number;
  readonly wordContext: string;
};

export function listKanjiAttempts(db: Db, profileId: string, literal: string): KanjiAttemptRow[] {
  const rows = db
    .prepare(`select id, literal, day_key, attempted_at, correct, hint_used, response_ms, word_context
              from kanji_attempts where profile_id = ? and literal = ?
              order by attempted_at, id`)
    .all(profileId, literal) as {
    id: string; literal: string; day_key: string; attempted_at: string;
    correct: number; hint_used: number; response_ms: number; word_context: string;
  }[];
  return rows.map((row) => ({
    id: row.id,
    literal: row.literal,
    dayKey: row.day_key,
    attemptedAt: row.attempted_at,
    correct: row.correct === 1,
    hintUsed: row.hint_used === 1,
    responseMs: row.response_ms,
    wordContext: row.word_context,
  }));
}
