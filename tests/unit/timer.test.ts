import { describe, expect, it } from 'vitest';
import {
  accumulateSegments,
  capCheckpointGap,
  elapsedForCheckpoint,
  splitSegmentAtMidnight,
} from '../../src/shared/timer';

describe('capCheckpointGap', () => {
  it('never returns more than the cap or less than zero', () => {
    expect(capCheckpointGap(120_000, 60_000)).toBe(60_000);
    expect(capCheckpointGap(2_000, 60_000)).toBe(2_000);
    expect(capCheckpointGap(-500, 60_000)).toBe(0);
  });
});

describe('accumulateSegments', () => {
  it('sums only active monotonic periods', () => {
    expect(
      accumulateSegments([
        { monotonicStartMs: 1_000, monotonicEndMs: 2_500 },
        { monotonicStartMs: 3_000, monotonicEndMs: 3_200 },
      ]),
    ).toBe(1_700);
  });

  it('ignores a period whose clock went backwards', () => {
    expect(
      accumulateSegments([
        { monotonicStartMs: 1_000, monotonicEndMs: 500 },
        { monotonicStartMs: 2_000, monotonicEndMs: 2_400 },
      ]),
    ).toBe(400);
  });
});

describe('splitSegmentAtMidnight', () => {
  it('returns one entry for a period inside a single day', () => {
    const start = Date.UTC(2026, 4, 17, 10, 0);
    const end = start + 15 * 60_000;
    expect(splitSegmentAtMidnight(start, end, 'UTC')).toEqual([
      { dayKey: '2026-05-17', ms: 15 * 60_000 },
    ]);
  });

  it('splits at local midnight with exact totals', () => {
    const start = Date.UTC(2026, 4, 17, 23, 30);
    const end = Date.UTC(2026, 4, 18, 0, 30);
    const parts = splitSegmentAtMidnight(start, end, 'UTC');

    expect(parts).toEqual([
      { dayKey: '2026-05-17', ms: 30 * 60_000 },
      { dayKey: '2026-05-18', ms: 30 * 60_000 },
    ]);
    expect(parts.reduce((sum, part) => sum + part.ms, 0)).toBe(end - start);
  });

  it('uses the profile timezone, not UTC', () => {
    // 23:30 UTC on May 17 is 08:30 on May 18 in Tokyo.
    const start = Date.UTC(2026, 4, 17, 23, 30);
    const end = start + 60 * 60_000;
    const parts = splitSegmentAtMidnight(start, end, 'Asia/Tokyo');

    expect(parts).toEqual([{ dayKey: '2026-05-18', ms: 60 * 60_000 }]);
  });
});

describe('elapsedForCheckpoint', () => {
  it('caps a long gap so suspend or idle time cannot become study time', () => {
    expect(elapsedForCheckpoint(120_000, 0, 120_000, 0, 60_000)).toBe(60_000);
    expect(elapsedForCheckpoint(2_000, 0, 2_000, 0, 60_000)).toBe(2_000);
  });

  it('uses monotonic time when the wall clock rolls backwards', () => {
    expect(elapsedForCheckpoint(3_000, 1_000, 500, 2_000, 60_000)).toBe(2_000);
  });

  it('never returns a negative duration', () => {
    expect(elapsedForCheckpoint(100, 1_000, 2_000, 1_000, 60_000)).toBe(0);
  });
});
