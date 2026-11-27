/**
 * Builds a short guided kana session: a few characters from the current group
 * plus reinforcement from elsewhere in the same script.
 */

import type { KanaStatus } from './contracts';
import type { KanaGroup, KanaScript } from './kanaData';

export type KanaLessonStep = {
  readonly kanaId: string;
  readonly character: string;
  readonly reading: string;
  readonly kind: 'new' | 'review';
};

export type KanaLesson = {
  readonly groupId: string | null;
  readonly steps: readonly KanaLessonStep[];
};

export type BuildKanaLessonArgs = {
  readonly script: KanaScript;
  readonly groups: readonly KanaGroup[];
  readonly statuses: Readonly<Record<string, KanaStatus>>;
  readonly newCount?: number;
  readonly reviewCount?: number;
  readonly random?: () => number;
};

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    const right = result[swap];
    if (right !== undefined) {
      result[swap] = result[index] as T;
      result[index] = right;
    }
  }
  return result;
}

function stepFor(item: { id: string; character: string; reading: string }, kind: 'new' | 'review'): KanaLessonStep {
  return { kanaId: item.id, character: item.character, reading: item.reading, kind };
}

export function buildKanaLesson(args: BuildKanaLessonArgs): KanaLesson {
  const scriptGroups = args.groups.filter((group) => group.script === args.script);
  const newCount = args.newCount ?? 5;
  const reviewCount = args.reviewCount ?? 3;
  const random = args.random ?? Math.random;

  const currentIndex = scriptGroups.findIndex(
    (group) =>
      group.tier === 'basic' &&
      group.items.some((item) => args.statuses[item.id] === 'unseen'),
  );
  const current = scriptGroups[currentIndex] ?? scriptGroups[0];

  const newCandidates = (current?.items ?? []).filter(
    (item) =>
      item.tier === 'basic' &&
      (args.statuses[item.id] === 'unseen' || args.statuses[item.id] === 'learning'),
  );
  const freshItems = shuffle(newCandidates, random).slice(0, newCount);
  const freshIds = new Set(freshItems.map((item) => item.id));
  const earlierGroups = scriptGroups.slice(0, Math.max(0, currentIndex));
  const reviewCandidates = earlierGroups
    .flatMap((group) => group.items)
    .filter(
      (item) =>
        item.tier === 'basic' &&
        !freshIds.has(item.id) &&
        ['learning', 'struggling', 'verified'].includes(args.statuses[item.id] ?? 'unseen'),
    );

  const fresh = freshItems.map((item) => stepFor(item, 'new'));
  const reinforcement = shuffle(reviewCandidates, random)
    .slice(0, reviewCount)
    .map((item) => stepFor(item, 'review'));

  const steps: KanaLessonStep[] = [];
  const max = Math.max(fresh.length, reinforcement.length);
  for (let index = 0; index < max; index += 1) {
    if (fresh[index] !== undefined) steps.push(fresh[index] as KanaLessonStep);
    if (reinforcement[index] !== undefined) steps.push(reinforcement[index] as KanaLessonStep);
  }

  return { groupId: current?.id ?? null, steps };
}
