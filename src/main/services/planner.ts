/**
 * The planner: turns a profile plus its goal versions into concrete daily plans,
 * and derives the dashboard numbers from those plans.
 *
 * Rules encoded here:
 * - A day outside `[start, start + horizon)` is never scheduled and gets no target.
 * - A plan is created lazily and then frozen; goal edits only affect days that
 *   have no plan yet (plus an explicit same-day change, handled in `setGoalVersion`).
 * - Month and week figures are computed from the same stored goal versions, so
 *   "target to date" and "target for the period" never disagree.
 */

import type {
  DashboardData,
  GoalVersion,
  Horizon,
  MonthProgress,
  PlanDay,
  PlanPreview,
  Profile,
  WeekProgress,
} from '../../shared/contracts';
import {
  addDays,
  curriculumDayNumber,
  curriculumMonthNumber,
  curriculumWeekNumber,
  daysBetween,
  daysInMonth,
  endDateExclusive,
  isEligibleDay,
  listDays,
  monthKeyOf,
  monthStartKey,
  startOfWeekMonday,
  todayInZone,
  type DateKey,
} from '../../shared/date';
import { AppError } from '../../shared/errors';
import { buildAssignments, phaseForCurriculumDay, resolveGoalVersion } from '../../shared/goals';
import type { GoalInput, ProfileInput } from '../../shared/schemas';
import { transaction, type Db } from '../database/connection';
import {
  findGoalVersionOn,
  insertGoalVersion,
  listGoalVersions,
  updateGoalVersion,
} from '../database/repositories/goalVersions';
import { hasKanaAttemptOnDay } from '../database/repositories/kana';
import { deletePlan, findPlan, insertPlan, type StoredPlan } from '../database/repositories/plans';
import { getActiveProfile } from '../database/repositories/profiles';
import {
  countIntroducedOnDay,
  countReviewsOnDay,
} from '../database/repositories/vocabulary';
import { countDueCards } from '../database/repositories/reviewCards';
import {
  hasSegmentOnDay,
  sumActiveSecondsByActivity,
  sumActiveSecondsForDay,
} from '../database/repositories/study';
import { getKanaSummary } from './kana';

const TRACKING_NOTE =
  'Minutes come only from the main-process study timer. Kana counts come from stored attempts; word and review counts come from stored vocabulary and review-log rows.';

function relativeTo(dayKey: DateKey, todayKey: DateKey): PlanDay['relative'] {
  if (dayKey < todayKey) return 'past';
  if (dayKey > todayKey) return 'future';
  return 'today';
}

function unscheduledDay(
  dayKey: DateKey,
  todayKey: DateKey,
  status: PlanDay['status'],
): PlanDay {
  return {
    dayKey,
    eligible: false,
    relative: relativeTo(dayKey, todayKey),
    status,
    curriculumDay: null,
    curriculumWeek: null,
    curriculumMonth: null,
    phase: null,
    targetMinutes: 0,
    targetWords: 0,
    assignments: [],
    goalVersionId: null,
  };
}

function toPlanDay(stored: StoredPlan, todayKey: DateKey): PlanDay {
  const { plan, assignments } = stored;
  return {
    dayKey: plan.dayKey,
    eligible: true,
    relative: relativeTo(plan.dayKey, todayKey),
    status: 'scheduled',
    curriculumDay: plan.curriculumDay,
    curriculumWeek: plan.curriculumWeek,
    curriculumMonth: plan.curriculumMonth,
    phase: plan.phase,
    targetMinutes: plan.targetMinutes,
    targetWords: plan.targetWords,
    assignments: assignments.map((assignment) => ({
      activityType: assignment.activityType,
      minutes: assignment.minutes,
      words: assignment.words,
    })),
    goalVersionId: plan.goalVersionId,
  };
}

function requireActiveProfile(db: Db): Profile {
  const profile = getActiveProfile(db);
  if (profile === null) {
    throw AppError.notFound('No profile exists yet. Finish setup first.');
  }
  return profile;
}

/**
 * Returns the plan for `dayKey`, creating and storing it on first request.
 * Idempotent: repeated calls return the same stored targets.
 */
export function ensurePlanDay(
  db: Db,
  profile: Profile,
  dayKey: DateKey,
  todayKey: DateKey,
  nowMs: number,
): PlanDay {
  const start = profile.startDate;
  const end = endDateExclusive(start, profile.horizonMonths);

  if (!isEligibleDay(dayKey, start, end)) {
    return unscheduledDay(dayKey, todayKey, dayKey < start ? 'before-start' : 'after-horizon');
  }

  const existing = findPlan(db, profile.id, dayKey);
  if (existing !== null) {
    return toPlanDay(existing, todayKey);
  }

  const goals = listGoalVersions(db, profile.id);
  const goal = resolveGoalVersion(goals, dayKey);
  if (goal === null) {
    throw AppError.dataMissing(`No daily goal applies to ${dayKey}.`);
  }

  const curriculumDay = curriculumDayNumber(start, dayKey);
  const phase = phaseForCurriculumDay(curriculumDay);
  const nowIso = new Date(nowMs).toISOString();

  transaction(db, () => {
    insertPlan(
      db,
      {
        profileId: profile.id,
        dayKey,
        goalVersionId: goal.id,
        curriculumDay,
        curriculumWeek: curriculumWeekNumber(start, dayKey),
        curriculumMonth: curriculumMonthNumber(start, dayKey),
        phase,
        targetMinutes: goal.dailyMinutes,
        targetWords: goal.dailyNewWords,
        assignments: buildAssignments(phase, goal.dailyMinutes, goal.dailyNewWords),
      },
      nowIso,
    );
  });

  const created = findPlan(db, profile.id, dayKey);
  if (created === null) {
    throw AppError.dataMissing(`The plan for ${dayKey} could not be read back.`);
  }
  return toPlanDay(created, todayKey);
}

function monthProgress(
  goals: readonly GoalVersion[],
  todayKey: DateKey,
  start: DateKey,
  end: DateKey,
): MonthProgress {
  const monthKey = monthKeyOf(todayKey);
  const monthStart = monthStartKey(monthKey);
  const monthEnd = addDays(monthStart, daysInMonth(monthKey));

  const from = monthStart < start ? start : monthStart;
  const to = monthEnd > end ? end : monthEnd;

  let targetDays = 0;
  let targetMinutes = 0;
  let targetWords = 0;
  let elapsedDays = 0;
  let minutesToDate = 0;
  let wordsToDate = 0;

  for (const day of listDays(from, to)) {
    const goal = resolveGoalVersion(goals, day);
    if (goal === null) continue;

    targetDays += 1;
    targetMinutes += goal.dailyMinutes;
    targetWords += goal.dailyNewWords;

    if (day <= todayKey) {
      elapsedDays += 1;
      minutesToDate += goal.dailyMinutes;
      wordsToDate += goal.dailyNewWords;
    }
  }

  return {
    monthKey,
    targetDays,
    targetMinutes,
    targetWords,
    elapsedDays,
    minutesToDate,
    wordsToDate,
  };
}

function weekProgress(todayKey: DateKey, start: DateKey, end: DateKey): WeekProgress {
  const weekStart = startOfWeekMonday(todayKey);
  const weekEnd = addDays(weekStart, 6);
  return {
    weekStart,
    weekEnd,
    days: listDays(weekStart, addDays(weekStart, 7)).map((dayKey) => ({
      dayKey,
      isToday: dayKey === todayKey,
      eligible: isEligibleDay(dayKey, start, end),
    })),
  };
}

export function getDashboard(db: Db, nowMs: number): DashboardData {
  const profile = requireActiveProfile(db);
  const goals = listGoalVersions(db, profile.id);
  if (goals.length === 0) {
    throw AppError.dataMissing('The profile has no daily goals.');
  }

  const todayKey = todayInZone(profile.timezone, nowMs);
  const today = ensurePlanDay(db, profile, todayKey, todayKey, nowMs);

  const start = profile.startDate;
  const end = endDateExclusive(start, profile.horizonMonths);
  const totalDays = daysBetween(start, end);
  const insideHorizon = isEligibleDay(todayKey, start, end);
  const dayIndex = insideHorizon ? curriculumDayNumber(start, todayKey) : null;

  const horizon: Horizon = {
    startDate: start,
    endDateExclusive: end,
    totalDays,
    dayIndex,
    remainingDays: dayIndex === null ? 0 : Math.max(0, totalDays - dayIndex + 1),
    completed: todayKey >= end,
    beforeStart: todayKey < start,
  };

  const activeGoal = resolveGoalVersion(goals, todayKey) ?? goals[goals.length - 1]!;

  return {
    profile,
    today,
    actual: {
      minutes: Math.floor(sumActiveSecondsForDay(db, profile.id, todayKey) / 60),
      minutesByActivity: sumActiveSecondsByActivity(db, profile.id, todayKey),
      newWords: countIntroducedOnDay(db, profile.id, todayKey),
      reviewsCompleted: countReviewsOnDay(db, profile.id, todayKey),
    },
    kana: getKanaSummary(db, nowMs),
    horizon,
    month: monthProgress(goals, todayKey, start, end),
    week: weekProgress(todayKey, start, end),
    dueReviews: countDueCards(db, profile.id, nowMs),
    activeGoal,
    goals,
    trackingNote: TRACKING_NOTE,
  };
}

/**
 * Computes the dates and totals an onboarding choice would produce, without
 * writing anything. This is what the wizard previews before the user commits.
 */
export function previewPlan(input: ProfileInput): PlanPreview {
  const start = input.startDate;
  const end = endDateExclusive(start, input.horizonMonths);
  const eligibleDays = Math.max(0, daysBetween(start, end));

  const months: { monthKey: string; days: number; minutes: number; words: number }[] = [];
  if (eligibleDays > 0) {
    const lastMonth = monthKeyOf(addDays(end, -1));
    let monthKey = monthKeyOf(start);
    let guard = 0;

    while (monthKey <= lastMonth && guard < 1200) {
      guard += 1;
      const monthStart = monthStartKey(monthKey);
      const monthEnd = addDays(monthStart, daysInMonth(monthKey));
      const from = monthStart < start ? start : monthStart;
      const to = monthEnd > end ? end : monthEnd;
      const days = Math.max(0, daysBetween(from, to));

      months.push({
        monthKey,
        days,
        minutes: days * input.dailyMinutes,
        words: days * input.dailyNewWords,
      });

      monthKey = monthKeyOf(monthEnd);
    }
  }

  return {
    startDate: start,
    endDateExclusive: end,
    eligibleDays,
    curriculumWeeks: Math.ceil(eligibleDays / 7),
    fullWeekMinutes: 7 * input.dailyMinutes,
    fullWeekWords: 7 * input.dailyNewWords,
    totalMinutes: eligibleDays * input.dailyMinutes,
    totalWords: eligibleDays * input.dailyNewWords,
    months,
  };
}

/**
 * Records a new goal version.
 *
 * Past days are rejected outright, so history cannot be rewritten. A change
 * taking effect today also rebuilds today's plan, but only before any study
 * activity has happened today — otherwise the recorded day would disagree with
 * the target the learner actually worked toward.
 */
export function setGoalVersion(db: Db, input: GoalInput, nowMs: number): GoalVersion[] {
  const profile = requireActiveProfile(db);
  const nowIso = new Date(nowMs).toISOString();
  const todayKey = todayInZone(profile.timezone, nowMs);

  if (input.effectiveDate < profile.startDate) {
    throw AppError.validation(
      'A goal change cannot take effect before the study start date.',
      'effectiveDate',
    );
  }
  if (input.effectiveDate < todayKey) {
    throw AppError.conflict(
      'Goals cannot be changed for a day that has already passed. Choose today or later.',
      'effectiveDate',
    );
  }

  transaction(db, () => {
    if (
      input.effectiveDate === todayKey &&
      (hasKanaAttemptOnDay(db, profile.id, todayKey) || hasSegmentOnDay(db, profile.id, todayKey))
    ) {
      throw AppError.conflict(
        'Today already has study activity. Goals can only be changed from tomorrow onward.',
        'effectiveDate',
      );
    }

    const existing = findGoalVersionOn(db, profile.id, input.effectiveDate);
    if (existing === null) {
      insertGoalVersion(
        db,
        profile.id,
        {
          effectiveDate: input.effectiveDate,
          dailyMinutes: input.dailyMinutes,
          dailyNewWords: input.dailyNewWords,
        },
        nowIso,
      );
    } else {
      updateGoalVersion(db, existing.id, {
        dailyMinutes: input.dailyMinutes,
        dailyNewWords: input.dailyNewWords,
      });
    }

    if (input.effectiveDate === todayKey) {
      deletePlan(db, profile.id, todayKey);
    }
  });

  return listGoalVersions(db, profile.id);
}
