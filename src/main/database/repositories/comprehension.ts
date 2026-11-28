/** Reading and listening comprehension answers. */

import type { Db } from '../connection';

export type ComprehensionSkill = 'reading' | 'listening';

export type ComprehensionAttemptRow = {
  readonly id: string;
  readonly profileId: string;
  readonly skill: ComprehensionSkill;
  readonly materialId: string;
  readonly exerciseId: string;
  readonly dayKey: string;
  readonly attemptedAt: string;
  readonly correct: boolean;
  readonly answer: string;
};

export function insertComprehensionAttempt(db: Db, row: ComprehensionAttemptRow): void {
  db.prepare(
    `insert into comprehension_attempts (id, profile_id, skill, material_id, exercise_id,
       day_key, attempted_at, correct, answer) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.id, row.profileId, row.skill, row.materialId, row.exerciseId, row.dayKey,
    row.attemptedAt, Number(row.correct), row.answer,
  );
}

export function listComprehensionAttempts(
  db: Db,
  profileId: string,
  skill: ComprehensionSkill,
  materialId: string,
): ComprehensionAttemptRow[] {
  const rows = db
    .prepare(`select id, profile_id, skill, material_id, exercise_id, day_key, attempted_at,
       correct, answer from comprehension_attempts
       where profile_id = ? and skill = ? and material_id = ? order by attempted_at, id`)
    .all(profileId, skill, materialId) as {
    id: string; profile_id: string; skill: string; material_id: string; exercise_id: string;
    day_key: string; attempted_at: string; correct: number; answer: string;
  }[];
  return rows.map((row) => ({
    id: row.id,
    profileId: row.profile_id,
    skill: row.skill as ComprehensionSkill,
    materialId: row.material_id,
    exerciseId: row.exercise_id,
    dayKey: row.day_key,
    attemptedAt: row.attempted_at,
    correct: row.correct === 1,
    answer: row.answer,
  }));
}
