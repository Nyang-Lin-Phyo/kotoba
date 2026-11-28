/** Pure M6 statistics rules. No clock, no database, no UI state. */

export type DayFacts = {
  readonly dayKey: string;
  readonly eligible: boolean;
  readonly targetMinutes: number;
  readonly targetWords: number;
  readonly minutes: number;
  readonly newWords: number;
  readonly reviews: number;
  readonly kanaAttempts: number;
};

export function dayComplete(day: DayFacts): boolean {
  return (
    day.eligible &&
    day.minutes >= day.targetMinutes &&
    day.newWords >= day.targetWords
  );
}

/**
 * Consecutive days where both goals were met. Today is skipped while unfinished
 * so yesterday's streak stays visible until the day ends. Future and ineligible
 * days never count.
 */
export function computeStreak(
  days: readonly DayFacts[],
  todayKey: string,
  startKey: string,
): number {
  const relevant = days
    .filter(
      (day) => day.eligible && day.dayKey >= startKey && day.dayKey <= todayKey,
    )
    .toSorted((left, right) => left.dayKey.localeCompare(right.dayKey));

  let streak = 0;
  for (let index = relevant.length - 1; index >= 0; index -= 1) {
    const current = relevant[index] as DayFacts;
    if (current.dayKey === todayKey && !dayComplete(current)) continue;
    if (!dayComplete(current)) break;
    streak += 1;
  }
  return streak;
}

export function targetToDate(
  days: readonly DayFacts[],
  throughKey: string,
): { readonly minutes: number; readonly words: number } {
  return days
    .filter((day) => day.eligible && day.dayKey <= throughKey)
    .reduce(
      (total, day) => ({
        minutes: total.minutes + day.targetMinutes,
        words: total.words + day.targetWords,
      }),
      { minutes: 0, words: 0 },
    );
}
