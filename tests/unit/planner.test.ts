import { describe, expect, it } from 'vitest';
import { previewPlan } from '../../src/main/services/planner';
import type { ProfileInput } from '../../src/shared/schemas';

function input(overrides: Partial<ProfileInput> = {}): ProfileInput {
  return {
    displayName: '',
    startDate: '2026-05-17',
    horizonMonths: 12,
    timezone: 'UTC',
    initialLevel: 'complete-beginner',
    targetJlpt: null,
    interests: ['general'],
    dailyMinutes: 120,
    dailyNewWords: 15,
    preferences: { romaji: true, furigana: true, audio: 'off' },
    ...overrides,
  };
}

describe('previewPlan — whole horizon', () => {
  it('turns a 12-month default plan into 365 days and 5,475 word introductions', () => {
    const preview = previewPlan(input());

    expect(preview.startDate).toBe('2026-05-17');
    expect(preview.endDateExclusive).toBe('2027-05-17');
    expect(preview.eligibleDays).toBe(365);
    expect(preview.curriculumWeeks).toBe(53);
    expect(preview.fullWeekMinutes).toBe(840);
    expect(preview.fullWeekWords).toBe(105);
    expect(preview.totalMinutes).toBe(43_800);
    expect(preview.totalWords).toBe(5_475);
  });

  it('counts 366 eligible days when the horizon spans a leap day', () => {
    const preview = previewPlan(
      input({ startDate: '2028-01-01', horizonMonths: 12, dailyMinutes: 60, dailyNewWords: 10 }),
    );

    expect(preview.endDateExclusive).toBe('2029-01-01');
    expect(preview.eligibleDays).toBe(366);
    expect(preview.totalMinutes).toBe(21_960);
    expect(preview.totalWords).toBe(3_660);
  });

  it('respects a non-default horizon length', () => {
    expect(previewPlan(input({ horizonMonths: 3 })).eligibleDays).toBe(92);
    expect(previewPlan(input({ horizonMonths: 1 })).eligibleDays).toBe(31);
  });
});

describe('previewPlan — partial and short months', () => {
  it('counts only the eligible days of the starting month', () => {
    const preview = previewPlan(input());
    const may = preview.months[0];

    // May 17-31 inclusive is 15 days, not the full 31-day month.
    expect(may).toEqual({ monthKey: '2026-05', days: 15, minutes: 1_800, words: 225 });
  });

  it('gives a full 31-day month 3,720 minutes and 465 words', () => {
    const preview = previewPlan(input({ startDate: '2026-07-01', horizonMonths: 1 }));

    expect(preview.eligibleDays).toBe(31);
    expect(preview.months).toEqual([
      { monthKey: '2026-07', days: 31, minutes: 3_720, words: 465 },
    ]);
  });

  it('gives February 2026 28 days and February 2028 29 days', () => {
    const short = previewPlan(input({ startDate: '2026-02-01', horizonMonths: 1 }));
    expect(short.eligibleDays).toBe(28);
    expect(short.totalWords).toBe(420);
    expect(short.totalMinutes).toBe(3_360);

    const leap = previewPlan(input({ startDate: '2028-02-01', horizonMonths: 1 }));
    expect(leap.eligibleDays).toBe(29);
    expect(leap.totalWords).toBe(435);
    expect(leap.totalMinutes).toBe(3_480);
  });
});

describe('previewPlan — month breakdown', () => {
  it('lists contiguous months whose days sum to the eligible total', () => {
    const preview = previewPlan(input());
    const daySum = preview.months.reduce((sum, month) => sum + month.days, 0);

    expect(daySum).toBe(preview.eligibleDays);
    expect(preview.months[0]?.monthKey).toBe('2026-05');
    expect(preview.months.at(-1)?.monthKey).toBe('2027-05');
    expect(preview.months).toHaveLength(13);

    // Each row is internally consistent: minutes and words are the day count
    // times the daily target, never a rounded monthly average.
    for (const month of preview.months) {
      expect(month.minutes).toBe(month.days * 120);
      expect(month.words).toBe(month.days * 15);
    }
  });

  it('handles a start date at the very end of a month', () => {
    const preview = previewPlan(input({ startDate: '2026-05-31', horizonMonths: 1 }));

    expect(preview.months[0]).toEqual({ monthKey: '2026-05', days: 1, minutes: 120, words: 15 });
    expect(preview.eligibleDays).toBe(30);
    expect(preview.months[1]?.monthKey).toBe('2026-06');
  });
});
