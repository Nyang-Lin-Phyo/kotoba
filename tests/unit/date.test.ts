import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonthsAnchored,
  curriculumDayNumber,
  curriculumMonthNumber,
  curriculumWeekNumber,
  daysBetween,
  daysInMonth,
  endDateExclusive,
  formatDayKey,
  isDateKey,
  isEligibleDay,
  listDays,
  monthKeyOf,
  startOfWeekMonday,
  todayInZone,
} from '../../src/shared/date';

describe('date keys', () => {
  it('accepts real calendar dates only', () => {
    expect(isDateKey('2026-05-17')).toBe(true);
    expect(isDateKey('2028-02-29')).toBe(true);
    expect(isDateKey('2026-02-29')).toBe(false);
    expect(isDateKey('2026-02-30')).toBe(false);
    expect(isDateKey('2026-13-01')).toBe(false);
    expect(isDateKey('2026-5-1')).toBe(false);
    expect(isDateKey('')).toBe(false);
    expect(isDateKey(null)).toBe(false);
  });
});

describe('month arithmetic is anchored and clamps at month end', () => {
  it('clamps Jan 31 to the end of February', () => {
    expect(addMonthsAnchored('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsAnchored('2028-01-31', 1)).toBe('2028-02-29');
  });

  it('does not chain the clamp forward', () => {
    // Adding from the original date, not from the clamped result.
    expect(addMonthsAnchored('2026-01-31', 2)).toBe('2026-03-31');
    expect(addMonthsAnchored('2028-01-31', 2)).toBe('2028-03-31');
    expect(addMonthsAnchored('2026-01-31', 3)).toBe('2026-04-30');
  });
});

describe('horizon', () => {
  it('is exclusive at the start-date anniversary', () => {
    expect(endDateExclusive('2026-05-17', 12)).toBe('2027-05-17');
    expect(daysBetween('2026-05-17', '2027-05-17')).toBe(365);
  });

  it('counts 366 eligible days across a leap day', () => {
    expect(endDateExclusive('2028-01-01', 12)).toBe('2029-01-01');
    expect(daysBetween('2028-01-01', '2029-01-01')).toBe(366);
  });

  it('excludes days before the start and on or after the end', () => {
    expect(isEligibleDay('2026-05-16', '2026-05-17', '2027-05-17')).toBe(false);
    expect(isEligibleDay('2026-05-17', '2026-05-17', '2027-05-17')).toBe(true);
    expect(isEligibleDay('2027-05-16', '2026-05-17', '2027-05-17')).toBe(true);
    expect(isEligibleDay('2027-05-17', '2026-05-17', '2027-05-17')).toBe(false);
  });
});

describe('curriculum days, weeks and months', () => {
  it('makes the start date day 1 and week 1', () => {
    expect(curriculumDayNumber('2026-05-17', '2026-05-17')).toBe(1);
    expect(curriculumWeekNumber('2026-05-17', '2026-05-17')).toBe(1);
    expect(curriculumWeekNumber('2026-05-17', '2026-05-23')).toBe(1);
    expect(curriculumWeekNumber('2026-05-17', '2026-05-24')).toBe(2);
    expect(curriculumDayNumber('2026-05-17', '2026-06-16')).toBe(31);
  });

  it('reports zero months before the start', () => {
    expect(curriculumMonthNumber('2026-05-17', '2026-05-16')).toBe(0);
  });

  it('counts start-date anniversaries, not calendar months', () => {
    expect(curriculumMonthNumber('2026-05-17', '2026-05-17')).toBe(1);
    expect(curriculumMonthNumber('2026-05-17', '2026-06-16')).toBe(1);
    expect(curriculumMonthNumber('2026-05-17', '2026-06-17')).toBe(2);
  });

  it('respects month-end clamping when counting months', () => {
    expect(curriculumMonthNumber('2026-01-31', '2026-02-27')).toBe(1);
    expect(curriculumMonthNumber('2026-01-31', '2026-02-28')).toBe(2);
    expect(curriculumMonthNumber('2026-01-31', '2026-03-30')).toBe(2);
    expect(curriculumMonthNumber('2026-01-31', '2026-03-31')).toBe(3);
  });
});

describe('display weeks start on Monday', () => {
  it('snaps to Monday, including from a Sunday', () => {
    // 2026-05-17 is a Sunday, so its Monday-based week starts on the 11th.
    expect(startOfWeekMonday('2026-05-17')).toBe('2026-05-11');
    expect(startOfWeekMonday('2026-05-18')).toBe('2026-05-18');
    expect(startOfWeekMonday('2026-05-23')).toBe('2026-05-18');
    expect(startOfWeekMonday('2026-05-24')).toBe('2026-05-18');
  });
});

describe('calendar months', () => {
  it('knows month lengths including leap years', () => {
    expect(daysInMonth('2026-02')).toBe(28);
    expect(daysInMonth('2028-02')).toBe(29);
    expect(daysInMonth('2026-04')).toBe(30);
    expect(daysInMonth('2026-12')).toBe(31);
  });

  it('derives the month key from a day key', () => {
    expect(monthKeyOf('2026-05-17')).toBe('2026-05');
  });
});

describe('timezone day keys', () => {
  it('resolves the study day in the profile timezone, not UTC', () => {
    // 04:30 UTC is still 23:30 on March 7 in New York.
    expect(todayInZone('America/New_York', Date.UTC(2026, 2, 8, 4, 30))).toBe('2026-03-07');
    expect(todayInZone('America/New_York', Date.UTC(2026, 2, 8, 5, 30))).toBe('2026-03-08');
  });

  it('is stable across a DST transition', () => {
    // US DST starts 2026-03-08 and ends 2026-11-01.
    expect(todayInZone('America/New_York', Date.UTC(2026, 2, 9, 3, 30))).toBe('2026-03-08');
    expect(todayInZone('America/New_York', Date.UTC(2026, 2, 9, 4, 30))).toBe('2026-03-09');
    expect(todayInZone('America/New_York', Date.UTC(2026, 10, 1, 3, 30))).toBe('2026-10-31');
    expect(todayInZone('America/New_York', Date.UTC(2026, 10, 1, 5, 30))).toBe('2026-11-01');
  });

  it('handles positive offsets', () => {
    expect(todayInZone('Asia/Tokyo', Date.UTC(2026, 4, 17, 15, 30))).toBe('2026-05-18');
    expect(todayInZone('Asia/Tokyo', Date.UTC(2026, 4, 17, 14, 30))).toBe('2026-05-17');
  });
});

describe('helpers', () => {
  it('adds days without timezone drift', () => {
    expect(addDays('2026-05-17', 1)).toBe('2026-05-18');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-05-17', -1)).toBe('2026-05-16');
  });

  it('lists an inclusive-start, exclusive-end range', () => {
    expect(listDays('2026-05-17', '2026-05-20')).toEqual([
      '2026-05-17',
      '2026-05-18',
      '2026-05-19',
    ]);
    expect(listDays('2026-05-17', '2026-05-17')).toEqual([]);
  });

  it('formats a plain date without shifting the day', () => {
    expect(
      formatDayKey('2026-05-17', 'en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }),
    ).toBe('05/17/2026');
    expect(formatDayKey('2026-01-01', 'en-US', { year: 'numeric', month: '2-digit', day: '2-digit' })).toBe(
      '01/01/2026',
    );
  });
});
