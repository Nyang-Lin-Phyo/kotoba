import { describe, expect, it } from 'vitest';
import {
  backupRestoreSchema,
  goalInputSchema,
  profileInputSchema,
} from '../../src/shared/schemas';

const valid = {
  displayName: 'Ramsey',
  startDate: '2026-05-17',
  horizonMonths: 12,
  timezone: 'UTC',
  initialLevel: 'complete-beginner' as const,
  targetJlpt: 'n5' as const,
  interests: ['anime' as const],
  dailyMinutes: 120,
  dailyNewWords: 15,
  preferences: { romaji: true, furigana: true, audio: 'off' as const },
};

describe('profile input validation', () => {
  it('accepts a well-formed profile', () => {
    expect(profileInputSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts a profile with no JLPT target and no name', () => {
    expect(
      profileInputSchema.safeParse({ ...valid, targetJlpt: null, displayName: '' }).success,
    ).toBe(true);
  });

  it('trims the display name', () => {
    const parsed = profileInputSchema.safeParse({ ...valid, displayName: '  Ramsey  ' });
    expect(parsed.success && parsed.data.displayName).toBe('Ramsey');
  });

  it('rejects impossible or malformed dates', () => {
    for (const startDate of ['2026-02-30', '2026-13-01', '17/05/2026', '2026-5-1', '']) {
      expect(profileInputSchema.safeParse({ ...valid, startDate }).success, startDate).toBe(false);
    }
  });

  it('rejects an unknown timezone', () => {
    expect(profileInputSchema.safeParse({ ...valid, timezone: 'Mars/Olympus' }).success).toBe(
      false,
    );
  });

  it('rejects out-of-range goals', () => {
    expect(profileInputSchema.safeParse({ ...valid, dailyMinutes: 5 }).success).toBe(false);
    expect(profileInputSchema.safeParse({ ...valid, dailyMinutes: 601 }).success).toBe(false);
    expect(profileInputSchema.safeParse({ ...valid, dailyNewWords: 101 }).success).toBe(false);
    expect(profileInputSchema.safeParse({ ...valid, horizonMonths: 0 }).success).toBe(false);
    expect(profileInputSchema.safeParse({ ...valid, horizonMonths: 121 }).success).toBe(false);
  });

  it('rejects fractional goals', () => {
    expect(profileInputSchema.safeParse({ ...valid, dailyMinutes: 120.5 }).success).toBe(false);
  });

  it('rejects unknown interests and levels', () => {
    expect(profileInputSchema.safeParse({ ...valid, interests: ['cooking'] }).success).toBe(false);
    expect(profileInputSchema.safeParse({ ...valid, initialLevel: 'expert' }).success).toBe(false);
    expect(profileInputSchema.safeParse({ ...valid, targetJlpt: 'n0' }).success).toBe(false);
  });
});

describe('goal input validation', () => {
  it('accepts a valid change', () => {
    expect(
      goalInputSchema.safeParse({ effectiveDate: '2026-06-01', dailyMinutes: 90, dailyNewWords: 10 })
        .success,
    ).toBe(true);
  });

  it('rejects a malformed date', () => {
    expect(
      goalInputSchema.safeParse({ effectiveDate: '2026-6-1', dailyMinutes: 90, dailyNewWords: 10 })
        .success,
    ).toBe(false);
  });
});

describe('backup name validation', () => {
  it('accepts a name the app generates', () => {
    expect(backupRestoreSchema.safeParse({ fileName: 'kotoba-20260517-120000-manual.db' }).success).toBe(
      true,
    );
  });

  it('rejects path traversal, separators and empty names', () => {
    for (const fileName of ['../profile.db', '..\\profile.db', '/etc/passwd', 'a/b.db', '']) {
      expect(backupRestoreSchema.safeParse({ fileName }).success, fileName).toBe(false);
    }
  });
});
