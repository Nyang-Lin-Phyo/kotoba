/** Sustainable-workload rules. Suggestions never change stored goals. */

export type WorkloadSuggestion = {
  readonly needed: boolean;
  readonly due: number;
  readonly reviewTarget: number;
  readonly suggestedNewWords: number;
  readonly reason: string;
};

/** Roughly five reviews per 30 minutes of study; floor at five. */
export function reviewTargetForMinutes(dailyMinutes: number): number {
  return Math.max(5, Math.floor(dailyMinutes / 6));
}

export function suggestReducedNewWords(
  due: number,
  dailyMinutes: number,
  newWords: number,
): WorkloadSuggestion {
  const reviewTarget = reviewTargetForMinutes(dailyMinutes);
  const needed = due > reviewTarget * 2;
  return {
    needed,
    due,
    reviewTarget,
    suggestedNewWords: newWords, // informational only; the goal is not edited
    reason: needed
      ? `${due} word cards are due, more than twice the ${reviewTarget}-card daily review allocation. Clear reviews before adding more new words.`
      : 'Review load is within the daily allocation.',
  };
}
