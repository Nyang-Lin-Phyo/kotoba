/**
 * Pure helpers for the study timer.
 *
 * Elapsed time comes from a monotonic clock, never from wall-clock arithmetic.
 * Wall time is only used to attribute seconds to a study day, so a rollback or
 * a missed suspend event cannot create or delete study minutes.
 */

import { addDays, dayStartEpochMs, todayInZone, type DateKey } from './date';

export const CHECKPOINT_CAP_MS = 60_000;

export function capCheckpointGap(ms: number, capMs: number = CHECKPOINT_CAP_MS): number {
  return Math.max(0, Math.min(ms, capMs));
}

export type ActivePeriod = {
  readonly monotonicStartMs: number;
  readonly monotonicEndMs: number;
};

export function accumulateSegments(periods: readonly ActivePeriod[]): number {
  return periods.reduce(
    (total, period) => total + Math.max(0, period.monotonicEndMs - period.monotonicStartMs),
    0,
  );
}

export type DaySlice = { readonly dayKey: DateKey; readonly ms: number };

/** Splits a wall-clock interval at each local midnight in `timeZone`. */
export function splitSegmentAtMidnight(
  startMs: number,
  endMs: number,
  timeZone: string,
): DaySlice[] {
  if (endMs <= startMs) {
    return [];
  }

  const result: DaySlice[] = [];
  let cursor = startMs;
  let cursorDay = todayInZone(timeZone, cursor);

  // At most a few days: a single checkpoint can never span more than the cap.
  for (let guard = 0; guard < 8 && cursor < endMs; guard += 1) {
    const nextDay = addDays(cursorDay, 1);
    const midnight = dayStartEpochMs(nextDay, timeZone);

    if (midnight > cursor && midnight < endMs) {
      result.push({ dayKey: cursorDay, ms: midnight - cursor });
      cursor = midnight;
      cursorDay = nextDay;
    } else {
      result.push({ dayKey: cursorDay, ms: endMs - cursor });
      break;
    }
  }

  return result;
}

/**
 * Milliseconds earned at a checkpoint. The monotonic delta is authoritative;
 * the wall-clock pair is accepted only to keep the signature honest about the
 * two clocks, and a backwards wall clock never reduces elapsed time.
 */
export function elapsedForCheckpoint(
  monotonicNowMs: number,
  lastMonotonicMs: number,
  wallNowMs: number,
  lastWallMs: number,
  capMs: number = CHECKPOINT_CAP_MS,
): number {
  void wallNowMs;
  void lastWallMs;
  return capCheckpointGap(monotonicNowMs - lastMonotonicMs, capMs);
}
