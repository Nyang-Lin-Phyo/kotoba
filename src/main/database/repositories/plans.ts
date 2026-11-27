/**
 * Daily plans and their assignment rows.
 *
 * A plan is created lazily the first time a day is requested and is then frozen:
 * the targets recorded for a day are the targets that day had. Goal changes only
 * affect days whose plan does not exist yet.
 */

import { randomUUID } from 'node:crypto';
import type { ActivityType, CurriculumPhase } from '../../../shared/goals';
import type { Db } from '../connection';

export type PlanRecord = {
  readonly id: string;
  readonly profileId: string;
  readonly dayKey: string;
  readonly goalVersionId: string | null;
  readonly curriculumDay: number;
  readonly curriculumWeek: number;
  readonly curriculumMonth: number;
  readonly phase: CurriculumPhase;
  readonly targetMinutes: number;
  readonly targetWords: number;
  readonly createdAt: string;
};

export type AssignmentRecord = {
  readonly activityType: ActivityType;
  readonly minutes: number;
  readonly words: number | null;
};

export type StoredPlan = {
  readonly plan: PlanRecord;
  readonly assignments: readonly AssignmentRecord[];
};

type PlanRow = {
  id: string;
  profile_id: string;
  day_key: string;
  goal_version_id: string | null;
  curriculum_day: number;
  curriculum_week: number;
  curriculum_month: number;
  phase: string;
  target_minutes: number;
  target_words: number;
  created_at: string;
};

type AssignmentRow = {
  activity_type: string;
  minutes: number;
  words: number | null;
};

export function findPlan(db: Db, profileId: string, dayKey: string): StoredPlan | null {
  const row = db
    .prepare(
      `select id, profile_id, day_key, goal_version_id, curriculum_day, curriculum_week,
              curriculum_month, phase, target_minutes, target_words, created_at
       from daily_plans where profile_id = ? and day_key = ?`,
    )
    .get(profileId, dayKey) as PlanRow | undefined;

  if (row === undefined) {
    return null;
  }

  const assignments = db
    .prepare(
      `select activity_type, minutes, words from daily_assignments
       where plan_id = ? order by sequence asc`,
    )
    .all(row.id) as AssignmentRow[];

  return {
    plan: {
      id: row.id,
      profileId: row.profile_id,
      dayKey: row.day_key,
      goalVersionId: row.goal_version_id,
      curriculumDay: row.curriculum_day,
      curriculumWeek: row.curriculum_week,
      curriculumMonth: row.curriculum_month,
      phase: row.phase as CurriculumPhase,
      targetMinutes: row.target_minutes,
      targetWords: row.target_words,
      createdAt: row.created_at,
    },
    assignments: assignments.map((assignment) => ({
      activityType: assignment.activity_type as ActivityType,
      minutes: assignment.minutes,
      words: assignment.words,
    })),
  };
}

export function insertPlan(
  db: Db,
  values: {
    profileId: string;
    dayKey: string;
    goalVersionId: string | null;
    curriculumDay: number;
    curriculumWeek: number;
    curriculumMonth: number;
    phase: CurriculumPhase;
    targetMinutes: number;
    targetWords: number;
    assignments: readonly AssignmentRecord[];
  },
  nowIso: string,
): PlanRecord {
  const id = randomUUID();

  db.prepare(
    `insert into daily_plans (
       id, profile_id, day_key, goal_version_id, curriculum_day, curriculum_week,
       curriculum_month, phase, target_minutes, target_words, plan_version, created_at
     ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
  ).run(
    id,
    values.profileId,
    values.dayKey,
    values.goalVersionId,
    values.curriculumDay,
    values.curriculumWeek,
    values.curriculumMonth,
    values.phase,
    values.targetMinutes,
    values.targetWords,
    nowIso,
  );

  const insertAssignment = db.prepare(
    `insert into daily_assignments (id, plan_id, activity_type, minutes, words, sequence)
     values (?, ?, ?, ?, ?, ?)`,
  );
  values.assignments.forEach((assignment, index) => {
    insertAssignment.run(
      randomUUID(),
      id,
      assignment.activityType,
      assignment.minutes,
      assignment.words,
      index,
    );
  });

  return {
    id,
    profileId: values.profileId,
    dayKey: values.dayKey,
    goalVersionId: values.goalVersionId,
    curriculumDay: values.curriculumDay,
    curriculumWeek: values.curriculumWeek,
    curriculumMonth: values.curriculumMonth,
    phase: values.phase,
    targetMinutes: values.targetMinutes,
    targetWords: values.targetWords,
    createdAt: nowIso,
  };
}

/** Deletes a day's plan; assignments go with it via `on delete cascade`. */
export function deletePlan(db: Db, profileId: string, dayKey: string): void {
  db.prepare('delete from daily_plans where profile_id = ? and day_key = ?').run(profileId, dayKey);
}
