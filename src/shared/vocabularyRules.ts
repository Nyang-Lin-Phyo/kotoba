/**
 * Pure rules for daily word selection, teaching choices and knowledge metrics.
 * No database, no clock, no library state.
 */

import type { DictionaryEntry } from './contracts';

export type TeachingChoice = {
  readonly form: string;
  readonly reading: string;
  readonly sense: DictionaryEntry['senses'][number];
};

/** JMdict register tags that should not be the target sense for a beginner. */
export const EXCLUDED_SENSE_TAGS: ReadonlySet<string> = new Set([
  // Actual jmdict-simplified misc codes present in the generated database.
  'sl', // slang
  'obs', // obsolete
  'vulg',
  'derog',
  'arch',
  // Older/alternate spellings kept for fixture compatibility.
  'slang',
  'obsc',
  'x',
]);

export function chooseTeaching(entry: DictionaryEntry): TeachingChoice | null {
  const commonForms = entry.forms.filter((form) => form.common);
  const form = (commonForms.length > 0 ? commonForms : entry.forms)[0];
  if (form === undefined) return null;

  const compatible = entry.readings.filter(
    (reading) => reading.appliesTo.length === 0 || reading.appliesTo.includes(form.text),
  );
  const commonReadings = compatible.filter((reading) => reading.common);
  const reading = (commonReadings.length > 0 ? commonReadings : compatible)[0];
  if (reading === undefined) return null;

  const sense = entry.senses.find(
    (candidate) =>
      (candidate.appliesToForms.length === 0 ||
        candidate.appliesToForms.includes(form.text)) &&
      (candidate.appliesToReadings.length === 0 ||
        candidate.appliesToReadings.includes(reading.text)) &&
      !candidate.tags.some((tag) => EXCLUDED_SENSE_TAGS.has(tag)),
  );
  if (sense === undefined) return null;

  return { form: form.text, reading: reading.text, sense };
}

export function selectNewItems(
  candidates: readonly string[],
  introduced: ReadonlySet<string>,
  familiar: ReadonlySet<string>,
  count: number,
): string[] {
  return [...new Set(candidates)]
    .filter((itemKey) => !introduced.has(itemKey) && !familiar.has(itemKey))
    .slice(0, Math.max(0, count));
}

export type ReviewQueueFacts = {
  readonly itemKey: string;
  readonly skill: 'meaning' | 'reading';
  readonly dueAtMs: number;
  readonly lapses: number;
};

export function orderReviewQueue<T extends ReviewQueueFacts>(items: readonly T[]): T[] {
  return [...items].toSorted((left, right) => {
    if (left.dueAtMs !== right.dueAtMs) return left.dueAtMs - right.dueAtMs;
    if (left.lapses !== right.lapses) return right.lapses - left.lapses;
    return `${left.itemKey}:${left.skill}`.localeCompare(`${right.itemKey}:${right.skill}`);
  });
}

export type SkillMetricFacts = {
  readonly distinctSuccessDays: number;
  readonly latestSuccess: boolean;
  readonly intervalDays: number;
  readonly lapses7d: number;
  readonly latestRatingAgain: boolean;
};

export const VERIFIED_MIN_DISTINCT_DAYS = 2;
export const VERIFIED_MIN_INTERVAL_DAYS = 7;

export function isVerifiedRecognition(skills: readonly SkillMetricFacts[]): boolean {
  if (skills.length !== 2) return false;
  return skills.every(
    (skill) =>
      skill.distinctSuccessDays >= VERIFIED_MIN_DISTINCT_DAYS &&
      skill.latestSuccess &&
      skill.intervalDays >= VERIFIED_MIN_INTERVAL_DAYS,
  );
}

export type WordStatus = 'unseen' | 'learning' | 'struggling' | 'verified';

export function classifyWord(skills: readonly SkillMetricFacts[]): WordStatus {
  if (skills.length === 0) return 'unseen';
  if (skills.some((skill) => skill.latestRatingAgain || skill.lapses7d >= 2)) {
    return 'struggling';
  }
  if (isVerifiedRecognition(skills)) return 'verified';
  return 'learning';
}

export function accuracyFromRatings(
  ratings: readonly { readonly correct: boolean; readonly hintUsed: boolean }[],
): number {
  const unhinted = ratings.filter((rating) => !rating.hintUsed);
  if (unhinted.length === 0) return 0;
  return unhinted.filter((rating) => rating.correct).length / unhinted.length;
}
