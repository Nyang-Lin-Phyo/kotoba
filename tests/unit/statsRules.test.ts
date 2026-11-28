import { describe, expect, it } from 'vitest';
import { computeStreak, dayComplete, targetToDate, type DayFacts } from '../../src/shared/statsRules';

function day(dayKey: string, patch: Partial<DayFacts> = {}): DayFacts {
  return {
    dayKey,
    eligible: true,
    targetMinutes: 120,
    targetWords: 15,
    minutes: 120,
    newWords: 15,
    reviews: 0,
    kanaAttempts: 0,
    ...patch,
  };
}

describe('dayComplete', () => {
  it('requires both daily goals', () => {
    expect(dayComplete(day('2026-05-17'))).toBe(true);
    expect(dayComplete(day('2026-05-17', { minutes: 119 }))).toBe(false);
    expect(dayComplete(day('2026-05-17', { newWords: 14 }))).toBe(false);
    expect(dayComplete(day('2026-05-17', { eligible: false }))).toBe(false);
  });
});

describe('computeStreak', () => {
  it('counts consecutive completed days and ignores future days', () => {
    const days = [
      day('2026-05-15'),
      day('2026-05-16'),
      day('2026-05-17'),
      day('2026-05-18', { minutes: 0, newWords: 0 }),
    ];
    expect(computeStreak(days, '2026-05-18', '2026-05-15')).toBe(3);
  });

  it('keeps yesterday streak when today is unfinished', () => {
    const days = [
      day('2026-05-15'),
      day('2026-05-16'),
      day('2026-05-17', { minutes: 20 }),
    ];
    expect(computeStreak(days, '2026-05-17', '2026-05-15')).toBe(2);
  });

  it('excludes days before start and ineligible days', () => {
    const days = [
      day('2026-05-14'),
      day('2026-05-15', { eligible: false }),
      day('2026-05-16'),
    ];
    expect(computeStreak(days, '2026-05-16', '2026-05-15')).toBe(1);
  });
});

describe('targetToDate', () => {
  it('sums eligible targets up to the given day only', () => {
    const days = [
      day('2026-05-17'),
      day('2026-05-18', { targetMinutes: 60, targetWords: 5 }),
      day('2026-05-19', { eligible: false }),
    ];
    expect(targetToDate(days, '2026-05-18')).toEqual({ minutes: 180, words: 20 });
  });
});
