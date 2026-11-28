/** Pure rules for personal kanji state. Version: kanji-interval-v1. */

export type KanjiAttemptFact = {
  readonly dayKey: string;
  readonly correct: boolean;
  readonly hintUsed: boolean;
};

export type KanjiEvaluation = {
  readonly status: 'encountered' | 'learning' | 'verified' | 'struggling';
  readonly verified: boolean;
  readonly intervalDays: number;
  readonly distinctSuccessDays: number;
  readonly successCount: number;
};

/** 1, 1, 3, 7, 14, then 30 days — deliberately explicit, not a random algorithm. */
export function nextKanjiIntervalDays(streak: number): number {
  if (streak >= 5) return 30;
  if (streak === 4) return 14;
  if (streak === 3) return 7;
  if (streak === 2) return 3;
  return 1;
}

/**
 * Verification is based on the current unhinted streak, not lifetime successes.
 * A miss or a hinted answer resets the streak to one day, so a learner cannot
 * regain "verified recognition" with a single answer after a lapse.
 */
export function evaluateKanji(attempts: readonly KanjiAttemptFact[]): KanjiEvaluation {
  let streak = 0;
  let streakDays = new Set<string>();
  for (const attempt of attempts) {
    if (attempt.correct && !attempt.hintUsed) {
      streak += 1;
      streakDays.add(attempt.dayKey);
    } else {
      streak = 0;
      streakDays = new Set<string>();
    }
  }

  const latest = attempts.at(-1);
  const intervalDays = nextKanjiIntervalDays(streak);
  const missed = latest !== undefined && !latest.correct;
  const verified =
    !missed &&
    latest !== undefined &&
    latest.correct &&
    !latest.hintUsed &&
    streakDays.size >= 2 &&
    intervalDays >= 7;

  return {
    status: missed ? 'struggling' : verified ? 'verified' : attempts.length > 0 ? 'learning' : 'encountered',
    verified,
    intervalDays,
    distinctSuccessDays: streakDays.size,
    successCount: streak,
  };
}
