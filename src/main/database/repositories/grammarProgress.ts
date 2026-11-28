/** Grammar lesson progress and exercise attempts. */

import type { Db } from '../connection';

export type GrammarStatus = 'available' | 'in-progress' | 'completed';

export type GrammarProgressRow = {
  readonly profileId: string;
  readonly unitId: string;
  readonly status: GrammarStatus;
  readonly attempts: number;
  readonly correct: number;
  readonly completedAt: string | null;
  readonly updatedAt: string;
};

export function getGrammarProgress(db: Db, profileId: string, unitId: string): GrammarProgressRow | null {
  const row = db
    .prepare('select profile_id, unit_id, status, attempts, correct, completed_at, updated_at from grammar_progress where profile_id = ? and unit_id = ?')
    .get(profileId, unitId) as
    | { profile_id: string; unit_id: string; status: string; attempts: number; correct: number; completed_at: string | null; updated_at: string }
    | undefined;
  if (row === undefined) return null;
  return {
    profileId: row.profile_id,
    unitId: row.unit_id,
    status: row.status as GrammarStatus,
    attempts: row.attempts,
    correct: row.correct,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  };
}

export function listGrammarProgress(db: Db, profileId: string): GrammarProgressRow[] {
  const rows = db
    .prepare('select profile_id, unit_id, status, attempts, correct, completed_at, updated_at from grammar_progress where profile_id = ? order by unit_id')
    .all(profileId) as {
    profile_id: string; unit_id: string; status: string; attempts: number; correct: number; completed_at: string | null; updated_at: string;
  }[];
  return rows.map((row) => ({
    profileId: row.profile_id,
    unitId: row.unit_id,
    status: row.status as GrammarStatus,
    attempts: row.attempts,
    correct: row.correct,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  }));
}

export function upsertGrammarProgress(db: Db, row: GrammarProgressRow): void {
  db.prepare(
    `insert into grammar_progress (profile_id, unit_id, status, attempts, correct, completed_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?)
     on conflict (profile_id, unit_id) do update set
       status = excluded.status, attempts = excluded.attempts, correct = excluded.correct,
       completed_at = excluded.completed_at, updated_at = excluded.updated_at`,
  ).run(row.profileId, row.unitId, row.status, row.attempts, row.correct, row.completedAt, row.updatedAt);
}

export function insertGrammarAttempt(db: Db, row: {
  readonly id: string;
  readonly profileId: string;
  readonly unitId: string;
  readonly exerciseId: string;
  readonly dayKey: string;
  readonly attemptedAt: string;
  readonly correct: boolean;
  readonly answer: string;
}): void {
  db.prepare(
    `insert into grammar_attempts (id, profile_id, unit_id, exercise_id, day_key, attempted_at, correct, answer)
     values (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.id, row.profileId, row.unitId, row.exerciseId, row.dayKey,
    row.attemptedAt, Number(row.correct), row.answer,
  );
}

export type GrammarAttemptRow = {
  readonly id: string;
  readonly unitId: string;
  readonly exerciseId: string;
  readonly dayKey: string;
  readonly attemptedAt: string;
  readonly correct: boolean;
  readonly answer: string;
};

export function listGrammarAttempts(db: Db, profileId: string, unitId: string): GrammarAttemptRow[] {
  const rows = db
    .prepare(`select id, unit_id, exercise_id, day_key, attempted_at, correct, answer
              from grammar_attempts where profile_id = ? and unit_id = ?
              order by attempted_at, id`)
    .all(profileId, unitId) as {
    id: string; unit_id: string; exercise_id: string; day_key: string;
    attempted_at: string; correct: number; answer: string;
  }[];
  return rows.map((row) => ({
    id: row.id,
    unitId: row.unit_id,
    exerciseId: row.exercise_id,
    dayKey: row.day_key,
    attemptedAt: row.attempted_at,
    correct: row.correct === 1,
    answer: row.answer,
  }));
}
