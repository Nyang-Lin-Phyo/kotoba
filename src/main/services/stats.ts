/** Read-only calendar and statistics derived from stored source records. */

import type { CalendarDayResult, DayFactsDTO, StatsResult } from '../../shared/contracts';
import {
  addDays,
  curriculumDayNumber,
  curriculumWeekNumber,
  endDateExclusive,
  isDateKey,
  daysBetween,
  isEligibleDay,
  listDays,
  monthKeyOf,
  startOfWeekMonday,
  todayInZone,
  type DateKey,
} from '../../shared/date';
import { AppError } from '../../shared/errors';
import { phaseForCurriculumDay, resolveGoalVersion } from '../../shared/goals';
import { computeStreak, targetToDate, type DayFacts } from '../../shared/statsRules';
import type { Db } from '../database/connection';
import { getDailyActivity } from '../database/repositories/dailyActivity';
import { listGoalVersions } from '../database/repositories/goalVersions';
import { getActiveProfile } from '../database/repositories/profiles';

const MAX_HISTORY_DAYS = 365;

function requireProfile(db: Db) {
  const profile = getActiveProfile(db);
  if (profile === null) throw AppError.notFound('No profile exists yet.');
  return profile;
}

function buildFacts(
  db: Db,
  profileId: string,
  start: DateKey,
  end: DateKey,
  from: DateKey,
  to: DateKey,
): DayFacts[] {
  const goals = listGoalVersions(db, profileId);
  const plans = new Map(
    (
      db
        .prepare('select day_key, target_minutes, target_words from daily_plans where profile_id = ? and day_key >= ? and day_key < ?')
        .all(profileId, from, to) as { day_key: string; target_minutes: number; target_words: number }[]
    ).map((row) => [row.day_key, row]),
  );
  const activity = getDailyActivity(db, profileId, from, to);

  return listDays(from, to).map((dayKey) => {
    const eligible = isEligibleDay(dayKey, start, end);
    const goal = resolveGoalVersion(goals, dayKey);
    const plan = plans.get(dayKey);
    const actual = activity.get(dayKey);
    return {
      dayKey,
      eligible,
      targetMinutes: eligible ? (plan?.target_minutes ?? goal?.dailyMinutes ?? 0) : 0,
      targetWords: eligible ? (plan?.target_words ?? goal?.dailyNewWords ?? 0) : 0,
      minutes: actual?.minutes ?? 0,
      newWords: actual?.newWords ?? 0,
      reviews: actual?.reviews ?? 0,
      kanaAttempts: actual?.kanaAttempts ?? 0,
    };
  });
}

export function getCalendarDay(
  db: Db,
  dayKey: DateKey,
): CalendarDayResult {
  if (!isDateKey(dayKey)) throw AppError.validation('Expected a calendar date.', 'dayKey');
  const profile = requireProfile(db);
  const start = profile.startDate;
  const end = endDateExclusive(start, profile.horizonMonths);
  const facts = buildFacts(db, profile.id, start, end, dayKey, addDays(dayKey, 1))[0];
  if (facts === undefined) throw AppError.dataMissing('No data for that day.');

  const dayNumber = facts.eligible ? curriculumDayNumber(start, dayKey) : null;

  return {
    day: facts as DayFactsDTO,
    curriculumDay: dayNumber,
    curriculumWeek:
      dayNumber === null || dayNumber < 1 ? null : curriculumWeekNumber(start, dayKey),
    phase:
      dayNumber === null || dayNumber < 1 ? null : phaseForCurriculumDay(dayNumber),
    status: dayKey < start ? 'before-start' : dayKey >= end ? 'after-horizon' : 'scheduled',
  };
}

export function getStats(db: Db, nowMs: number = Date.now()): StatsResult {
  const profile = requireProfile(db);
  const todayKey = todayInZone(profile.timezone, nowMs);
  const start = profile.startDate;
  const end = endDateExclusive(start, profile.horizonMonths);
  const windowStart = addDays(todayKey, -MAX_HISTORY_DAYS) > start ? addDays(todayKey, -MAX_HISTORY_DAYS) : start;
  // listDays is end-exclusive, so pass tomorrow to include today's plan/activity.
  const facts = buildFacts(db, profile.id, start, end, windowStart, addDays(todayKey, 1));

  const weekStart = startOfWeekMonday(todayKey);
  const weekDays = facts.filter((day) => day.dayKey >= weekStart && day.dayKey <= todayKey);
  const monthKey = monthKeyOf(todayKey);
  const monthDays = facts.filter((day) => monthKeyOf(day.dayKey) === monthKey);
  const dayIndex = isEligibleDay(todayKey, start, end) ? curriculumDayNumber(start, todayKey) : null;
  const curriculumDay = dayIndex ?? 1;

  // Full-horizon targets, not just the bounded chart window.
  const allPlans = new Map(
    (
      db
        .prepare('select day_key, target_minutes, target_words from daily_plans where profile_id = ? and day_key >= ? and day_key < ?')
        .all(profile.id, start, todayKey) as { day_key: string; target_minutes: number; target_words: number }[]
    ).map((row) => [row.day_key, row]),
  );
  const allGoals = listGoalVersions(db, profile.id);
  const cumulativeDays = listDays(start, addDays(todayKey, 1)).map((dayKey) => {
    const goal = resolveGoalVersion(allGoals, dayKey);
    const plan = allPlans.get(dayKey);
    return {
      dayKey,
      eligible: true,
      targetMinutes: plan?.target_minutes ?? goal?.dailyMinutes ?? 0,
      targetWords: plan?.target_words ?? goal?.dailyNewWords ?? 0,
      minutes: 0,
      newWords: 0,
      reviews: 0,
      kanaAttempts: 0,
    };
  });
  const totals = targetToDate(cumulativeDays, todayKey);
  const fullActivity = getDailyActivity(db, profile.id, start, addDays(todayKey, 1));

  return {
    version: 'stats-v1',
    week: { weekStart, days: weekDays },
    month: { monthKey, days: monthDays },
    horizon: {
      totalDays: daysBetween(start, end),
      dayIndex,
      remainingDays: dayIndex === null ? 0 : Math.max(0, daysBetween(start, end) - dayIndex),
      completed: todayKey >= end,
      beforeStart: todayKey < start,
    },
    streak: computeStreak(facts, todayKey, start),
    toDate: {
      targetMinutes: totals.minutes,
      targetWords: totals.words,
      actualMinutes: [...fullActivity.values()].reduce((sum, day) => sum + day.minutes, 0),
      actualWords: [...fullActivity.values()].reduce((sum, day) => sum + day.newWords, 0),
    },
    phase: phaseForCurriculumDay(curriculumDay),
    definitions: {
      streak: 'Consecutive days where both daily minutes and new-word goals were met. Future days never count; an unfinished today leaves yesterday’s streak visible.',
      accuracy: 'Correct unhinted ratings divided by unhinted ratings in the displayed window.',
      verifiedRecognition: 'Both meaning and reading skills: two successful unhinted recalls on two dates, latest successful, interval at least 7 days.',
    },
  };
}

/** All eligible days up to today, for exports rather than bounded charts. */
export function getFullHistoryDays(db: Db, nowMs: number = Date.now()): DayFactsDTO[] {
  const profile = requireProfile(db);
  const start = profile.startDate;
  const end = endDateExclusive(start, profile.horizonMonths);
  const todayKey = todayInZone(profile.timezone, nowMs);
  const to = todayKey >= end ? addDays(end, 1) : addDays(todayKey, 1);
  return buildFacts(db, profile.id, start, end, start, to) as DayFactsDTO[];
}
