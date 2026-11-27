/**
 * Calendar-date arithmetic for Kotoba.
 *
 * Rules that this module exists to enforce:
 * - A study day is a plain calendar date (`YYYY-MM-DD`) in the profile's own
 *   timezone. It is never a `Date` and never parsed as if it were UTC midnight.
 * - Month arithmetic is anchored to the original day and clamps at month end:
 *   Jan 31 + 1 month = Feb 28/29, but Jan 31 + 2 months = Mar 31.
 * - Weeks for *display* start on Monday; curriculum weeks are 7-day blocks
 *   counted from the profile start date. These are different things and are
 *   named differently here.
 *
 * `Temporal` is supplied by `temporal-polyfill` rather than the runtime so that
 * Electron's Node, the Chromium renderer and the Node used by Vitest all behave
 * identically. Host Node 24 does not expose `Temporal` by default; relying on
 * it would make tests pass or fail depending on the runtime.
 */

import { Temporal } from 'temporal-polyfill';

/** A calendar date with no time and no timezone, formatted `YYYY-MM-DD`. */
export type DateKey = string;

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_KEY_PATTERN = /^(\d{4})-(\d{2})$/;

/** True for a real, existing calendar date such as `2026-02-29` (leap) or `2026-05-17`. */
export function isDateKey(value: unknown): value is DateKey {
  if (typeof value !== 'string' || DATE_KEY_PATTERN.exec(value) === null) {
    return false;
  }
  try {
    // `overflow: 'reject'` makes 2026-02-30 throw instead of silently becoming Feb 28.
    Temporal.PlainDate.from(value, { overflow: 'reject' });
    return true;
  } catch {
    return false;
  }
}

export function parseDateKey(key: DateKey): Temporal.PlainDate {
  if (!isDateKey(key)) {
    throw new RangeError(`Not a calendar date: ${String(key)}`);
  }
  return Temporal.PlainDate.from(key);
}

export function formatDateKey(date: Temporal.PlainDate): DateKey {
  return date.toString();
}

/** The current calendar date in `timeZone`, from an epoch-millisecond instant. */
export function todayInZone(timeZone: string, nowMs: number): DateKey {
  return Temporal.Instant.fromEpochMilliseconds(Math.trunc(nowMs))
    .toZonedDateTimeISO(timeZone)
    .toPlainDate()
    .toString();
}

/** Validates an IANA timezone name using the platform's own ICU data. */
export function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== 'string' || timeZone.length === 0 || timeZone.length > 64) {
    return false;
  }
  try {
    // Throws `RangeError` for an unknown zone; the value itself is not needed.
    Temporal.Now.zonedDateTimeISO(timeZone);
    return true;
  } catch {
    return false;
  }
}

export function addDays(key: DateKey, days: number): DateKey {
  return parseDateKey(key).add({ days }).toString();
}

/**
 * Adds months anchored to the original day, clamping at the end of the target
 * month. Adding from the original date (not chaining) is what keeps
 * Jan 31 + 2 months on Mar 31.
 */
export function addMonthsAnchored(key: DateKey, months: number): DateKey {
  return parseDateKey(key).add({ months }).toString();
}

/** Signed number of whole days from `from` to `to`. */
export function daysBetween(from: DateKey, to: DateKey): number {
  return parseDateKey(from).until(parseDateKey(to), { largestUnit: 'day' }).days ?? 0;
}

/** Exclusive end date: start + horizon months. */
export function endDateExclusive(startKey: DateKey, horizonMonths: number): DateKey {
  return addMonthsAnchored(startKey, horizonMonths);
}

/** Number of eligible study days in `[start, endExclusive)`. */
export function eligibleDayCount(startKey: DateKey, endExclusive: DateKey): number {
  return Math.max(0, daysBetween(startKey, endExclusive));
}

export function isEligibleDay(dayKey: DateKey, startKey: DateKey, endExclusive: DateKey): boolean {
  return dayKey >= startKey && dayKey < endExclusive;
}

/** `2026-05-17` -> `2026-05`. */
export function monthKeyOf(dayKey: DateKey): string {
  if (!isDateKey(dayKey)) {
    throw new RangeError(`Not a calendar date: ${String(dayKey)}`);
  }
  return dayKey.slice(0, 7);
}

export function isMonthKey(value: unknown): value is string {
  return typeof value === 'string' && MONTH_KEY_PATTERN.exec(value) !== null;
}

export function monthStartKey(monthKey: string): DateKey {
  if (!isMonthKey(monthKey)) {
    throw new RangeError(`Not a month: ${String(monthKey)}`);
  }
  return `${monthKey}-01`;
}

export function daysInMonth(monthKey: string): number {
  if (!isMonthKey(monthKey)) {
    throw new RangeError(`Not a month: ${String(monthKey)}`);
  }
  return Temporal.PlainYearMonth.from(monthKey).daysInMonth;
}

/** The epoch-millisecond instant of local midnight for a day key in a timezone. */
export function dayStartEpochMs(dayKey: DateKey, timeZone: string): number {
  return Temporal.PlainDate.from(parseDateKey(dayKey))
    .toZonedDateTime({ timeZone, plainTime: '00:00' })
    .toInstant()
    .epochMilliseconds;
}

/** Monday-based week containing `dayKey` (ISO: Monday = 1 ... Sunday = 7). */
export function startOfWeekMonday(dayKey: DateKey): DateKey {
  const date = parseDateKey(dayKey);
  return date.subtract({ days: date.dayOfWeek - 1 }).toString();
}

/** 1-based day number from the profile start date. Zero or negative before the start. */
export function curriculumDayNumber(startKey: DateKey, dayKey: DateKey): number {
  return daysBetween(startKey, dayKey) + 1;
}

/** 1-based 7-day block counted from the start date (not a Monday-based week). */
export function curriculumWeekNumber(startKey: DateKey, dayKey: DateKey): number {
  return Math.floor((curriculumDayNumber(startKey, dayKey) - 1) / 7) + 1;
}

/**
 * 1-based curriculum month: the number of start-date anniversaries reached.
 * Month k covers `[add(start, k-1), add(start, k))`, so month-end clamping means
 * a month can be 28, 29, 30 or 31 days long.
 */
export function curriculumMonthNumber(startKey: DateKey, dayKey: DateKey): number {
  if (curriculumDayNumber(startKey, dayKey) < 1) {
    return 0;
  }
  let month = 1;
  // Bounded: horizons are capped at 120 months, the extra headroom only guards
  // against a caller passing a date far in the future.
  while (month <= 1200 && dayKey >= addMonthsAnchored(startKey, month)) {
    month += 1;
  }
  return month;
}

/** Every calendar date in `[start, endExclusive)`, ascending. */
export function listDays(startKey: DateKey, endExclusive: DateKey): DateKey[] {
  const days: DateKey[] = [];
  const total = daysBetween(startKey, endExclusive);
  for (let index = 0; index < total; index += 1) {
    days.push(addDays(startKey, index));
  }
  return days;
}

/**
 * Formats a plain date for display without ever constructing a local `Date`
 * from the string. Noon UTC keeps the formatted output on the intended day in
 * every timezone, including negative offsets.
 */
export function formatDayKey(
  dayKey: DateKey,
  locale?: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = parseDateKey(dayKey);
  const noonUtc = Date.UTC(date.year, date.month - 1, date.day, 12, 0, 0);
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...options }).format(new Date(noonUtc));
}
