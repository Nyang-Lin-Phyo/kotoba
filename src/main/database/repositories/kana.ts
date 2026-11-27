/** Kana progress and attempt rows. Statement-only; services own the transaction. */

import type { KanaAttemptFact } from '../../../shared/kanaRules';
import type { Db } from '../connection';

export type KanaProgressRow = {
  readonly profileId: string;
  readonly kanaId: string;
  readonly correctUnhinted: number;
  readonly correctDays: number;
  readonly firstCorrectDay: string | null;
  readonly lastCorrectDay: string | null;
  readonly lastAttemptDay: string | null;
  readonly lastAttemptCorrect: boolean | null;
  readonly lapses: number;
  readonly dueDay: string | null;
  readonly verified: boolean;
  readonly intervalTier: number;
  readonly schedulerVersion: string;
  readonly updatedAt: string;
};

export type KanaAttemptRow = {
  readonly id: string;
  readonly profileId: string;
  readonly kanaId: string;
  readonly dayKey: string;
  readonly mode: 'typed' | 'choice';
  readonly raw: string;
  readonly correct: boolean;
  readonly hintUsed: boolean;
  readonly responseMs: number;
  readonly attemptedAt: string;
  readonly eventId: string;
};

type ProgressDbRow = {
  profile_id: string;
  kana_id: string;
  correct_unhinted: number;
  correct_days: number;
  first_correct_day: string | null;
  last_correct_day: string | null;
  last_attempt_day: string | null;
  last_attempt_correct: number | null;
  lapses: number;
  due_day: string | null;
  verified: number;
  interval_tier: number;
  scheduler_version: string;
  updated_at: string;
};

type AttemptDbRow = {
  day_key: string;
  correct: number;
  hint_used: number;
  mode: string;
};

function toProgress(row: ProgressDbRow): KanaProgressRow {
  return {
    profileId: row.profile_id,
    kanaId: row.kana_id,
    correctUnhinted: row.correct_unhinted,
    correctDays: row.correct_days,
    firstCorrectDay: row.first_correct_day,
    lastCorrectDay: row.last_correct_day,
    lastAttemptDay: row.last_attempt_day,
    lastAttemptCorrect: row.last_attempt_correct === null ? null : row.last_attempt_correct === 1,
    lapses: row.lapses,
    dueDay: row.due_day,
    verified: row.verified === 1,
    intervalTier: row.interval_tier,
    schedulerVersion: row.scheduler_version,
    updatedAt: row.updated_at,
  };
}

const PROGRESS_COLUMNS = `profile_id, kana_id, correct_unhinted, correct_days, first_correct_day,
  last_correct_day, last_attempt_day, last_attempt_correct, lapses, due_day, verified,
  interval_tier, scheduler_version, updated_at`;

export function getKanaProgress(db: Db, profileId: string, kanaId: string): KanaProgressRow | null {
  const row = db
    .prepare(`select ${PROGRESS_COLUMNS} from kana_progress where profile_id = ? and kana_id = ?`)
    .get(profileId, kanaId) as ProgressDbRow | undefined;
  return row === undefined ? null : toProgress(row);
}

export function listKanaProgress(db: Db, profileId: string): KanaProgressRow[] {
  const rows = db
    .prepare(`select ${PROGRESS_COLUMNS} from kana_progress where profile_id = ? order by kana_id`)
    .all(profileId) as ProgressDbRow[];
  return rows.map(toProgress);
}

export function upsertKanaProgress(db: Db, row: KanaProgressRow): void {
  db.prepare(
    `insert into kana_progress (
       profile_id, kana_id, correct_unhinted, correct_days, first_correct_day,
       last_correct_day, last_attempt_day, last_attempt_correct, lapses, due_day,
       verified, interval_tier, scheduler_version, updated_at
     ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     on conflict (profile_id, kana_id) do update set
       correct_unhinted = excluded.correct_unhinted,
       correct_days = excluded.correct_days,
       first_correct_day = excluded.first_correct_day,
       last_correct_day = excluded.last_correct_day,
       last_attempt_day = excluded.last_attempt_day,
       last_attempt_correct = excluded.last_attempt_correct,
       lapses = excluded.lapses,
       due_day = excluded.due_day,
       verified = excluded.verified,
       interval_tier = excluded.interval_tier,
       scheduler_version = excluded.scheduler_version,
       updated_at = excluded.updated_at`,
  ).run(
    row.profileId,
    row.kanaId,
    row.correctUnhinted,
    row.correctDays,
    row.firstCorrectDay,
    row.lastCorrectDay,
    row.lastAttemptDay,
    row.lastAttemptCorrect === null ? null : Number(row.lastAttemptCorrect),
    row.lapses,
    row.dueDay,
    Number(row.verified),
    row.intervalTier,
    row.schedulerVersion,
    row.updatedAt,
  );
}

export function insertKanaAttempt(db: Db, row: KanaAttemptRow): void {
  db.prepare(
    `insert into kana_attempts (
       id, profile_id, kana_id, day_key, mode, raw, correct, hint_used,
       response_ms, attempted_at, event_id
     ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.id,
    row.profileId,
    row.kanaId,
    row.dayKey,
    row.mode,
    row.raw,
    Number(row.correct),
    Number(row.hintUsed),
    row.responseMs,
    row.attemptedAt,
    row.eventId,
  );
}

/** Qualifying facts for the mastery rule, in attempt order. */
export function listKanaAttemptFacts(
  db: Db,
  profileId: string,
  kanaId: string,
): KanaAttemptFact[] {
  const rows = db
    .prepare(
      `select day_key, correct, hint_used, mode from kana_attempts
       where profile_id = ? and kana_id = ? order by attempted_at asc, id asc`,
    )
    .all(profileId, kanaId) as AttemptDbRow[];

  return rows.map((row) => ({
    dayKey: row.day_key,
    correct: row.correct === 1,
    hintUsed: row.hint_used === 1,
    mode: row.mode as 'typed' | 'choice',
  }));
}

export function hasKanaAttemptOnDay(db: Db, profileId: string, dayKey: string): boolean {
  const row = db
    .prepare('select 1 from kana_attempts where profile_id = ? and day_key = ? limit 1')
    .get(profileId, dayKey);
  return row !== undefined;
}

export function countKanaAttempts(db: Db, profileId: string): number {
  return (
    db.prepare('select count(*) c from kana_attempts where profile_id = ?').get(profileId) as {
      c: number;
    }
  ).c;
}

export function countUnhintedTypedCorrect(db: Db, profileId: string): number {
  return (
    db
      .prepare(
        `select count(*) c from kana_attempts
         where profile_id = ? and mode = 'typed' and hint_used = 0 and correct = 1`,
      )
      .get(profileId) as { c: number }
  ).c;
}

export function countUnhintedTyped(db: Db, profileId: string): number {
  return (
    db
      .prepare('select count(*) c from kana_attempts where profile_id = ? and mode = ? and hint_used = 0')
      .get(profileId, 'typed') as { c: number }
  ).c;
}

/** Failure days in the last seven calendar days, inclusive of `todayKey`. */
export function countRecentFailureDays(
  db: Db,
  profileId: string,
  kanaId: string,
  todayKey: string,
  sinceKey: string,
): number {
  const row = db
    .prepare(
      `select count(distinct day_key) as total from kana_attempts
       where profile_id = ? and kana_id = ? and correct = 0 and day_key between ? and ?`,
    )
    .get(profileId, kanaId, sinceKey, todayKey) as { total: number };
  return row.total;
}
