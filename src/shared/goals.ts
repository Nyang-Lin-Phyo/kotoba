/**
 * Pure planning rules: which curriculum phase a day belongs to, how the daily
 * minute budget is split, and which goal version applies to a given day.
 *
 * Everything here is a pure function of its arguments so the planner can be
 * tested with an injected clock and no database.
 */

import type { DateKey } from './date';

export const CURRICULUM_PHASES = ['foundation', 'core', 'expansion'] as const;
export type CurriculumPhase = (typeof CURRICULUM_PHASES)[number];

/** Days 1-14 are the kana foundation; the plan then widens. */
export const FOUNDATION_DAYS = 14;
/** Days 15-90 are the structured core; after that the plan leans on immersion. */
export const CORE_DAYS = 90;

export const PHASE_LABELS: Record<CurriculumPhase, string> = {
  foundation: 'Kana foundation',
  core: 'Structured core',
  expansion: 'Expansion and immersion',
};

export const ACTIVITY_TYPES = [
  'kana',
  'vocabulary',
  'reviews',
  'grammar',
  'reading',
  'listening',
  'speaking',
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  kana: 'Kana',
  vocabulary: 'Vocabulary',
  reviews: 'Reviews',
  grammar: 'Grammar',
  reading: 'Reading',
  listening: 'Listening',
  speaking: 'Speaking',
};

type WeightedActivity = { readonly activity: ActivityType; readonly weight: number };

/**
 * Relative split of the daily minute budget per phase. Weights are proportional,
 * not absolute: a 120-minute day and a 45-minute day both divide cleanly, and
 * `allocateMinutes` guarantees the parts sum to the target exactly.
 *
 * The vocabulary row also carries the separate *word count* target; minutes and
 * words are different units and are never conflated.
 */
export const PHASE_ALLOCATIONS: Record<CurriculumPhase, readonly WeightedActivity[]> = {
  foundation: [
    { activity: 'kana', weight: 30 },
    { activity: 'vocabulary', weight: 20 },
    { activity: 'reviews', weight: 15 },
    { activity: 'grammar', weight: 25 },
    { activity: 'listening', weight: 20 },
    { activity: 'speaking', weight: 10 },
  ],
  core: [
    { activity: 'vocabulary', weight: 30 },
    { activity: 'reviews', weight: 20 },
    { activity: 'grammar', weight: 25 },
    { activity: 'reading', weight: 15 },
    { activity: 'listening', weight: 20 },
    { activity: 'speaking', weight: 10 },
  ],
  expansion: [
    { activity: 'vocabulary', weight: 25 },
    { activity: 'reviews', weight: 25 },
    { activity: 'reading', weight: 25 },
    { activity: 'listening', weight: 25 },
    { activity: 'speaking', weight: 20 },
  ],
};

export function phaseForCurriculumDay(day: number): CurriculumPhase {
  if (day <= FOUNDATION_DAYS) return 'foundation';
  if (day <= CORE_DAYS) return 'core';
  return 'expansion';
}

export type MinuteAllocation = { readonly activity: ActivityType; readonly minutes: number };

/**
 * Splits `totalMinutes` across the phase's activities using the largest-remainder
 * method, so the result always sums to exactly `totalMinutes` (no lost or
 * invented minutes from rounding).
 */
export function allocateMinutes(totalMinutes: number, phase: CurriculumPhase): MinuteAllocation[] {
  const target = Math.max(0, Math.trunc(totalMinutes));
  const weights = PHASE_ALLOCATIONS[phase];
  const weightSum = weights.reduce((sum, entry) => sum + entry.weight, 0);

  const parts = weights.map((entry) => {
    const exact = (target * entry.weight) / weightSum;
    const floor = Math.floor(exact);
    return { activity: entry.activity, minutes: floor, remainder: exact - floor };
  });

  let assigned = parts.reduce((sum, part) => sum + part.minutes, 0);
  const byRemainder = parts.toSorted((left, right) => right.remainder - left.remainder);

  let cursor = 0;
  while (assigned < target && byRemainder.length > 0) {
    const winner = byRemainder[cursor % byRemainder.length];
    if (winner !== undefined) {
      winner.minutes += 1;
      assigned += 1;
    }
    cursor += 1;
  }

  return parts.map((part) => ({ activity: part.activity, minutes: part.minutes }));
}

export type PlanAssignmentDraft = {
  readonly activityType: ActivityType;
  readonly minutes: number;
  readonly words: number | null;
};

/**
 * Builds the ordered assignment rows for one day. Vocabulary carries both a
 * minute share and the new-word target; every other activity is minutes only.
 */
export function buildAssignments(
  phase: CurriculumPhase,
  totalMinutes: number,
  newWords: number,
): PlanAssignmentDraft[] {
  const words = Math.max(0, Math.trunc(newWords));
  return allocateMinutes(totalMinutes, phase).map((entry) => ({
    activityType: entry.activity,
    minutes: entry.minutes,
    words: entry.activity === 'vocabulary' ? words : null,
  }));
}

/** Anything with an effective date, e.g. a goal version row. */
export type EffectiveDated = { readonly effectiveDate: DateKey };

/**
 * The goal version in force on `dayKey`: the newest version whose effective date
 * is on or before that day. Returns `null` when the day precedes every version.
 */
export function resolveGoalVersion<T extends EffectiveDated>(
  versions: readonly T[],
  dayKey: DateKey,
): T | null {
  let found: T | null = null;
  for (const version of versions) {
    if (version.effectiveDate <= dayKey) {
      if (found === null || version.effectiveDate >= found.effectiveDate) {
        found = version;
      }
    }
  }
  return found;
}
