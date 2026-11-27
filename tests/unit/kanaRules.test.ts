import { describe, expect, it } from 'vitest';
import {
  classifyKana,
  dueDayAfterFailure,
  dueDayAfterSuccess,
  isKanaDue,
  masteryFromAttempts,
  nextIntervalDays,
  orderReviewQueue,
  type KanaAttemptFact,
  type KanaProgressFacts,
  type ReviewQueueItem,
} from '../../src/shared/kanaRules';

function attempt(
  dayKey: string,
  correct: boolean,
  hintUsed = false,
  mode: 'typed' | 'choice' = 'typed',
): KanaAttemptFact {
  return { dayKey, correct, hintUsed, mode };
}

function facts(patch: Partial<KanaProgressFacts> = {}): KanaProgressFacts {
  return {
    correctUnhinted: 0,
    correctDays: 0,
    lastUnhintedCorrect: null,
    verified: false,
    lapses: 0,
    intervalTier: 0,
    lastAttemptCorrect: null,
    failureDaysLast7: 0,
    dueDay: null,
    ...patch,
  };
}

describe('masteryFromAttempts', () => {
  it('needs three unhinted correct answers', () => {
    expect(
      masteryFromAttempts([
        attempt('2026-05-17', true),
        attempt('2026-05-18', true),
      ]),
    ).toBe(false);
  });

  it('needs answers on at least two distinct days', () => {
    expect(
      masteryFromAttempts([
        attempt('2026-05-17', true),
        attempt('2026-05-17', true),
        attempt('2026-05-17', true),
      ]),
    ).toBe(false);
  });

  it('never counts hinted or choice answers toward mastery', () => {
    expect(
      masteryFromAttempts([
        attempt('2026-05-17', true, true),
        attempt('2026-05-18', true),
        attempt('2026-05-19', true),
      ]),
    ).toBe(false);
    expect(
      masteryFromAttempts([
        attempt('2026-05-17', true, false, 'choice'),
        attempt('2026-05-18', true, false, 'choice'),
        attempt('2026-05-19', true, false, 'choice'),
      ]),
    ).toBe(false);
  });

  it('is cleared by a later failed unhinted attempt', () => {
    expect(
      masteryFromAttempts([
        attempt('2026-05-17', true),
        attempt('2026-05-18', true),
        attempt('2026-05-19', true),
        attempt('2026-05-20', false),
      ]),
    ).toBe(false);
  });

  it('verifies three unhinted typed corrects across two days', () => {
    expect(
      masteryFromAttempts([
        attempt('2026-05-17', true),
        attempt('2026-05-17', true),
        attempt('2026-05-18', true),
      ]),
    ).toBe(true);
  });
});

describe('review intervals', () => {
  it('expands 7 -> 14 -> 30 and caps at 30', () => {
    expect([0, 1, 2, 5].map(nextIntervalDays)).toEqual([7, 14, 30, 30]);
  });

  it('computes due dates across month end and a leap day', () => {
    expect(dueDayAfterSuccess('2026-01-31', 0)).toBe('2026-02-07');
    expect(dueDayAfterSuccess('2028-02-20', 1)).toBe('2028-03-05');
    expect(dueDayAfterFailure('2026-05-17')).toBe('2026-05-18');
  });
});

describe('classifyKana', () => {
  it('separates unseen, learning, verified and struggling', () => {
    expect(classifyKana(facts())).toBe('unseen');
    expect(classifyKana(facts({ lastAttemptCorrect: true }))).toBe('learning');
    expect(classifyKana(facts({ verified: true }))).toBe('verified');
    expect(classifyKana(facts({ lastAttemptCorrect: false }))).toBe('struggling');
    expect(classifyKana(facts({ failureDaysLast7: 2, lastAttemptCorrect: true }))).toBe(
      'struggling',
    );
  });

  it('treats struggling as more urgent than verified', () => {
    expect(
      classifyKana(facts({ verified: true, lastAttemptCorrect: false, failureDaysLast7: 2 })),
    ).toBe('struggling');
  });
});

describe('isKanaDue', () => {
  it('is due on and after the due day, never before', () => {
    expect(isKanaDue('2026-05-17', '2026-05-16')).toBe(false);
    expect(isKanaDue('2026-05-17', '2026-05-17')).toBe(true);
    expect(isKanaDue('2026-05-17', '2026-05-18')).toBe(true);
    expect(isKanaDue(null, '2026-05-18')).toBe(false);
  });
});

describe('orderReviewQueue', () => {
  const items: ReviewQueueItem[] = [
    { kanaId: 'h-ku', dueDay: '2026-05-15', lapses: 1, failedToday: false },
    { kanaId: 'h-ka', dueDay: '2026-05-16', lapses: 5, failedToday: false },
    { kanaId: 'h-sa', dueDay: '2026-05-14', lapses: 5, failedToday: false },
    { kanaId: 'h-a', dueDay: null, lapses: 0, failedToday: true },
    { kanaId: 'h-i', dueDay: '2026-06-01', lapses: 0, failedToday: false },
  ];

  it('orders by most overdue, then lapses, then stable id', () => {
    expect(orderReviewQueue(items, '2026-05-17').map((item) => item.kanaId)).toEqual([
      'h-a',
      'h-sa',
      'h-ku',
      'h-ka',
    ]);
  });
});
