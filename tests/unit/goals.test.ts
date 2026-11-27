import { describe, expect, it } from 'vitest';
import {
  allocateMinutes,
  buildAssignments,
  phaseForCurriculumDay,
  resolveGoalVersion,
} from '../../src/shared/goals';

describe('curriculum phases', () => {
  it('switches from foundation to core at day 15 and to expansion at day 91', () => {
    expect(phaseForCurriculumDay(1)).toBe('foundation');
    expect(phaseForCurriculumDay(14)).toBe('foundation');
    expect(phaseForCurriculumDay(15)).toBe('core');
    expect(phaseForCurriculumDay(90)).toBe('core');
    expect(phaseForCurriculumDay(91)).toBe('expansion');
  });
});

describe('minute allocation', () => {
  it('splits a 120-minute foundation day as documented', () => {
    expect(allocateMinutes(120, 'foundation')).toEqual([
      { activity: 'kana', minutes: 30 },
      { activity: 'vocabulary', minutes: 20 },
      { activity: 'reviews', minutes: 15 },
      { activity: 'grammar', minutes: 25 },
      { activity: 'listening', minutes: 20 },
      { activity: 'speaking', minutes: 10 },
    ]);
  });

  it('always sums to the exact target, with no lost or invented minutes', () => {
    const phases = ['foundation', 'core', 'expansion'] as const;
    for (const phase of phases) {
      for (const total of [0, 1, 7, 10, 45, 60, 90, 120, 180, 240, 600]) {
        const sum = allocateMinutes(total, phase).reduce((acc, part) => acc + part.minutes, 0);
        expect(sum, `${phase} at ${total} minutes`).toBe(total);
      }
    }
  });

  it('never produces a negative share', () => {
    for (const part of allocateMinutes(45, 'core')) {
      expect(part.minutes).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('assignments', () => {
  it('carries the new-word target only on the vocabulary row', () => {
    const rows = buildAssignments('foundation', 120, 15);
    expect(rows).toHaveLength(6);

    const vocabulary = rows.find((row) => row.activityType === 'vocabulary');
    expect(vocabulary?.words).toBe(15);

    const others = rows.filter((row) => row.activityType !== 'vocabulary');
    expect(others.every((row) => row.words === null)).toBe(true);
  });

  it('keeps the minute shares summing to the day target', () => {
    const rows = buildAssignments('core', 90, 12);
    expect(rows.reduce((sum, row) => sum + row.minutes, 0)).toBe(90);
  });

  it('treats zero new words as zero rather than as missing', () => {
    const vocabulary = buildAssignments('expansion', 60, 0).find(
      (row) => row.activityType === 'vocabulary',
    );
    expect(vocabulary?.words).toBe(0);
  });
});

describe('goal version resolution', () => {
  const versions = [
    { id: 'a', effectiveDate: '2026-05-17', dailyMinutes: 120, dailyNewWords: 15 },
    { id: 'b', effectiveDate: '2026-06-01', dailyMinutes: 90, dailyNewWords: 10 },
    { id: 'c', effectiveDate: '2026-07-01', dailyMinutes: 60, dailyNewWords: 5 },
  ];

  it('picks the newest version in force on that day', () => {
    expect(resolveGoalVersion(versions, '2026-05-16')).toBeNull();
    expect(resolveGoalVersion(versions, '2026-05-17')?.id).toBe('a');
    expect(resolveGoalVersion(versions, '2026-05-31')?.id).toBe('a');
    expect(resolveGoalVersion(versions, '2026-06-01')?.id).toBe('b');
    expect(resolveGoalVersion(versions, '2026-12-31')?.id).toBe('c');
  });

  it('does not depend on the order rows come back in', () => {
    expect(resolveGoalVersion(versions.toReversed(), '2026-06-15')?.id).toBe('b');
  });

  it('returns null when no version has taken effect yet', () => {
    expect(resolveGoalVersion([], '2026-05-17')).toBeNull();
  });
});
