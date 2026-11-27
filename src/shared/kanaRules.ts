/**
 * Pure kana learning rules. No database, no clock, no library state.
 *
 * Every rule here has a versioned meaning: M5 may replace the interval engine
 * with FSRS, but the mastery and metric definitions must stay testable and
 * explainable to the learner.
 */

import { addDays, daysBetween, type DateKey } from './date';

export type KanaAttemptFact = {
  readonly dayKey: DateKey;
  readonly correct: boolean;
  readonly hintUsed: boolean;
  readonly mode: 'typed' | 'choice';
};

export type KanaProgressFacts = {
  readonly correctUnhinted: number;
  readonly correctDays: number;
  readonly lastUnhintedCorrect: boolean | null;
  readonly verified: boolean;
  readonly lapses: number;
  readonly intervalTier: number;
  readonly lastAttemptCorrect: boolean | null;
  readonly failureDaysLast7: number;
  readonly dueDay: DateKey | null;
};

export type ReviewQueueItem = {
  readonly kanaId: string;
  readonly dueDay: DateKey | null;
  readonly lapses: number;
  readonly failedToday: boolean;
};

export type KanaStatus = 'unseen' | 'learning' | 'verified' | 'struggling';

/**
 * Three unhinted typed correct answers on at least two distinct study days,
 * with the most recent unhinted typed attempt correct. Hinted and choice
 * answers are practice, never evidence of recall.
 */
export function masteryFromAttempts(attempts: readonly KanaAttemptFact[]): boolean {
  const unhintedTyped = attempts.filter((item) => !item.hintUsed && item.mode === 'typed');

  if (unhintedTyped.filter((item) => item.correct).length < 3) {
    return false;
  }
  if (new Set(unhintedTyped.filter((item) => item.correct).map((item) => item.dayKey)).size < 2) {
    return false;
  }

  const latest = unhintedTyped.at(-1);
  return latest !== undefined && latest.correct;
}

export function nextIntervalDays(tier: number): number {
  if (tier <= 0) return 7;
  if (tier === 1) return 14;
  return 30;
}

export function dueDayAfterSuccess(todayKey: DateKey, tier: number): DateKey {
  return addDays(todayKey, nextIntervalDays(tier));
}

export function dueDayAfterFailure(todayKey: DateKey): DateKey {
  return addDays(todayKey, 1);
}

export function classifyKana(facts: KanaProgressFacts): KanaStatus {
  if (facts.lastAttemptCorrect === false || facts.failureDaysLast7 >= 2) {
    return 'struggling';
  }
  if (facts.verified) {
    return 'verified';
  }
  if (facts.lastAttemptCorrect === true || facts.correctUnhinted > 0) {
    return 'learning';
  }
  return 'unseen';
}

export function isKanaDue(dueDay: DateKey | null, todayKey: DateKey): boolean {
  return dueDay !== null && dueDay <= todayKey;
}

/** Failed-today items first, then most overdue, then most lapses, then id. */
export function orderReviewQueue(items: readonly ReviewQueueItem[], todayKey: DateKey): ReviewQueueItem[] {
  return items
    .filter((item) => item.failedToday || isKanaDue(item.dueDay, todayKey))
    .toSorted((left, right) => {
      if (left.failedToday !== right.failedToday) {
        return left.failedToday ? -1 : 1;
      }
      const leftOverdue = left.dueDay === null ? 0 : daysBetween(left.dueDay, todayKey);
      const rightOverdue = right.dueDay === null ? 0 : daysBetween(right.dueDay, todayKey);
      if (leftOverdue !== rightOverdue) {
        return rightOverdue - leftOverdue;
      }
      if (left.lapses !== right.lapses) {
        return right.lapses - left.lapses;
      }
      return left.kanaId.localeCompare(right.kanaId);
    });
}
