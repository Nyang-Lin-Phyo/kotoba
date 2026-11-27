import { describe, expect, it } from 'vitest';
import { KANA_GROUPS } from '../../src/shared/kanaData';
import { buildKanaLesson } from '../../src/shared/kanaLesson';
import { findKanaWord } from '../../src/shared/kanaWords';
import type { KanaStatus } from '../../src/shared/contracts';

const hiragana = KANA_GROUPS.filter((group) => group.script === 'hiragana');
const vowels = hiragana[0]!;
const kRow = hiragana[1]!;

function statuses(): Record<string, KanaStatus> {
  const result: Record<string, KanaStatus> = {};
  for (const group of KANA_GROUPS) {
    for (const item of group.items) result[item.id] = 'learning';
  }
  return result;
}

describe('buildKanaLesson', () => {
  it('mixes five new characters with three earlier reinforcements', () => {
    const state = statuses();
    for (const item of vowels.items) state[item.id] = 'verified';
    for (const item of kRow.items) state[item.id] = 'unseen';

    const lesson = buildKanaLesson({
      script: 'hiragana',
      groups: KANA_GROUPS,
      statuses: state,
      random: () => 0.5,
    });

    const fresh = lesson.steps.filter((step) => step.kind === 'new');
    const review = lesson.steps.filter((step) => step.kind === 'review');
    expect(fresh).toHaveLength(5);
    expect(review).toHaveLength(3);
    expect(fresh.every((step) => kRow.items.some((item) => item.id === step.kanaId))).toBe(true);
    expect(review.every((step) => vowels.items.some((item) => item.id === step.kanaId))).toBe(true);
  });

  it('never repeats a character inside one lesson', () => {
    const state = statuses();
    for (const item of vowels.items) state[item.id] = 'verified';
    for (const item of kRow.items) state[item.id] = 'unseen';
    const lesson = buildKanaLesson({
      script: 'hiragana',
      groups: KANA_GROUPS,
      statuses: state,
      random: () => 0.5,
    });
    expect(new Set(lesson.steps.map((step) => step.kanaId)).size).toBe(lesson.steps.length);
  });

  it('never mixes katakana into a hiragana lesson', () => {
    const lesson = buildKanaLesson({
      script: 'hiragana',
      groups: KANA_GROUPS,
      statuses: statuses(),
      random: () => 0.1,
    });
    expect(lesson.steps.every((step) => step.kanaId.startsWith('h-'))).toBe(true);
  });

  it('is deterministic for the same random source', () => {
    const args = {
      script: 'hiragana' as const,
      groups: KANA_GROUPS,
      statuses: statuses(),
      random: () => 0.42,
    };
    expect(buildKanaLesson(args).steps).toEqual(buildKanaLesson(args).steps);
  });
});

describe('kana words', () => {
  it('ships hiragana-only examples', () => {
    expect(findKanaWord('あ')?.word).toBe('あい');
    expect(findKanaWord('ね')?.word).toBe('ねこ');
  });
});
