/**
 * Goal versions.
 *
 * Goals are effective-dated rather than overwritten, so a change made today
 * cannot retroactively rewrite what last week's daily target was.
 */

import { randomUUID } from 'node:crypto';
import type { GoalVersion } from '../../../shared/contracts';
import type { Db } from '../connection';

type GoalRow = {
  id: string;
  effective_date: string;
  daily_minutes: number;
  daily_new_words: number;
  created_at: string;
};

function toGoalVersion(row: GoalRow): GoalVersion {
  return {
    id: row.id,
    effectiveDate: row.effective_date,
    dailyMinutes: row.daily_minutes,
    dailyNewWords: row.daily_new_words,
    createdAt: row.created_at,
  };
}

/** Ascending by effective date, which is the order `resolveGoalVersion` expects. */
export function listGoalVersions(db: Db, profileId: string): GoalVersion[] {
  const rows = db
    .prepare(
      `select id, effective_date, daily_minutes, daily_new_words, created_at
       from goal_versions where profile_id = ? order by effective_date asc`,
    )
    .all(profileId) as GoalRow[];
  return rows.map(toGoalVersion);
}

export function findGoalVersionOn(
  db: Db,
  profileId: string,
  effectiveDate: string,
): GoalVersion | null {
  const row = db
    .prepare(
      `select id, effective_date, daily_minutes, daily_new_words, created_at
       from goal_versions where profile_id = ? and effective_date = ?`,
    )
    .get(profileId, effectiveDate) as GoalRow | undefined;
  return row === undefined ? null : toGoalVersion(row);
}

export function insertGoalVersion(
  db: Db,
  profileId: string,
  values: { effectiveDate: string; dailyMinutes: number; dailyNewWords: number },
  nowIso: string,
): GoalVersion {
  const id = randomUUID();
  db.prepare(
    `insert into goal_versions (
       id, profile_id, effective_date, daily_minutes, daily_new_words, created_at
     ) values (?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    profileId,
    values.effectiveDate,
    values.dailyMinutes,
    values.dailyNewWords,
    nowIso,
  );

  return {
    id,
    effectiveDate: values.effectiveDate,
    dailyMinutes: values.dailyMinutes,
    dailyNewWords: values.dailyNewWords,
    createdAt: nowIso,
  };
}

export function updateGoalVersion(
  db: Db,
  id: string,
  values: { dailyMinutes: number; dailyNewWords: number },
): void {
  db.prepare('update goal_versions set daily_minutes = ?, daily_new_words = ? where id = ?').run(
    values.dailyMinutes,
    values.dailyNewWords,
    id,
  );
}
