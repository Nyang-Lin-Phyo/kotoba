import { describe, expect, it } from 'vitest';
import { evaluateKanji, nextKanjiIntervalDays } from '../../src/shared/kanjiRules';

type Attempt = { readonly dayKey: string; readonly correct: boolean; readonly hintUsed: boolean };

describe('nextKanjiIntervalDays', () => {
  it('uses a documented ladder and caps at 30 days', () => {
    expect([0, 1, 2, 3, 4, 10].map(nextKanjiIntervalDays)).toEqual([1, 1, 3, 7, 14, 30]);
  });
});

describe('evaluateKanji', () => {
  it('keeps encountered separate from verified', () => {
    expect(evaluateKanji([])).toMatchObject({ status: 'encountered', verified: false });
    expect(evaluateKanji([{ dayKey: '2026-05-17', correct: true, hintUsed: false }])).toMatchObject({
      status: 'learning', verified: false,
    });
  });

  it('requires two distinct unhinted days and a latest success to verify', () => {
    const verified = evaluateKanji([
      { dayKey: '2026-05-17', correct: true, hintUsed: false },
      { dayKey: '2026-05-18', correct: true, hintUsed: false },
      { dayKey: '2026-05-19', correct: true, hintUsed: false },
    ] as Attempt[]);
    expect(verified.verified).toBe(true);
    expect(verified.status).toBe('verified');
    expect(verified.intervalDays).toBeGreaterThanOrEqual(7);

    expect(
      evaluateKanji([
        { dayKey: '2026-05-17', correct: true, hintUsed: false },
        { dayKey: '2026-05-17', correct: true, hintUsed: false },
      ]).verified,
    ).toBe(false);
    expect(
      evaluateKanji([
        { dayKey: '2026-05-17', correct: true, hintUsed: false },
        { dayKey: '2026-05-18', correct: true, hintUsed: false },
        { dayKey: '2026-05-19', correct: false, hintUsed: false },
      ]).status,
    ).toBe('struggling');
  });

  it('never verifies a hinted answer', () => {
    expect(
      evaluateKanji([
        { dayKey: '2026-05-17', correct: true, hintUsed: true },
        { dayKey: '2026-05-18', correct: true, hintUsed: true },
        { dayKey: '2026-05-19', correct: true, hintUsed: true },
      ]).verified,
    ).toBe(false);
  });
});

describe('lapse recovery', () => {
  it('resets the ladder after a miss, so one later success cannot re-verify', () => {
    const seq: Attempt[] = [
      { dayKey: '2026-05-17', correct: true, hintUsed: false },
      { dayKey: '2026-05-18', correct: true, hintUsed: false },
      { dayKey: '2026-05-19', correct: true, hintUsed: false },
      { dayKey: '2026-05-20', correct: false, hintUsed: false },
    ];
    expect(evaluateKanji(seq).status).toBe('struggling');

    const afterOneSuccess = evaluateKanji([
      ...seq,
      { dayKey: '2026-05-21', correct: true, hintUsed: false },
    ]);
    expect(afterOneSuccess.verified).toBe(false);
    expect(afterOneSuccess.intervalDays).toBe(1);

    const afterThreeSuccesses = evaluateKanji([
      ...seq,
      { dayKey: '2026-05-21', correct: true, hintUsed: false },
      { dayKey: '2026-05-22', correct: true, hintUsed: false },
      { dayKey: '2026-05-23', correct: true, hintUsed: false },
    ]);
    expect(afterThreeSuccesses.verified).toBe(true);
  });

  it('does not count a hinted answer toward the unhinted streak', () => {
    const evaluation = evaluateKanji([
      { dayKey: '2026-05-17', correct: true, hintUsed: false },
      { dayKey: '2026-05-18', correct: true, hintUsed: false },
      { dayKey: '2026-05-19', correct: true, hintUsed: true },
      { dayKey: '2026-05-20', correct: true, hintUsed: false },
    ]);
    expect(evaluation.verified).toBe(false);
    expect(evaluation.intervalDays).toBe(1);
  });
});
