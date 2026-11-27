import { describe, expect, it } from 'vitest';
import type { DictionaryEntry } from '../../src/shared/contracts';
import {
  accuracyFromRatings,
  chooseTeaching,
  classifyWord,
  isVerifiedRecognition,
  orderReviewQueue,
  selectNewItems,
  type SkillMetricFacts,
} from '../../src/shared/vocabularyRules';

function entry(patch: Partial<DictionaryEntry> = {}): DictionaryEntry {
  return {
    id: 'jmdict:1',
    sourceId: '1',
    canonicalForm: '猫',
    forms: [{ text: '猫', common: true }],
    readings: [{ text: 'ねこ', common: true, appliesTo: [] }],
    senses: [
      {
        partOfSpeech: 'n',
        english: 'cat',
        tags: [],
        appliesToForms: [],
        appliesToReadings: [],
      },
    ],
    kanji: ['猫'],
    priority: 5,
    curriculumRank: null,
    ...patch,
  };
}

function skill(patch: Partial<SkillMetricFacts> = {}): SkillMetricFacts {
  return {
    distinctSuccessDays: 2,
    latestSuccess: true,
    intervalDays: 10,
    lapses7d: 0,
    latestRatingAgain: false,
    ...patch,
  };
}

describe('chooseTeaching', () => {
  it('picks the common form and a reading compatible with it', () => {
    const result = chooseTeaching(
      entry({
        forms: [
          { text: '猫', common: false },
          { text: 'ネコ', common: true },
        ],
        readings: [
          { text: 'ねこ', common: false, appliesTo: ['猫'] },
          { text: 'ネコ', common: true, appliesTo: ['ネコ'] },
        ],
      }),
    );
    expect(result?.form).toBe('ネコ');
    expect(result?.reading).toBe('ネコ');
    expect(result?.sense.english).toBe('cat');
  });

  it('skips entries with only slang or vulgar senses', () => {
    expect(
      chooseTeaching(
        entry({
          senses: [
            {
              partOfSpeech: 'n',
              english: 'fool',
              tags: ['sl', 'vulg'],
              appliesToForms: [],
              appliesToReadings: [],
            },
          ],
        }),
      ),
    ).toBeNull();
  });

  it('rejects a reading restricted to a different spelling', () => {
    const result = chooseTeaching(
      entry({
        forms: [{ text: '明日', common: true }],
        readings: [
          { text: 'あす', common: true, appliesTo: ['別の形'] },
          { text: 'あした', common: true, appliesTo: [] },
        ],
      }),
    );
    expect(result?.reading).toBe('あした');
  });
});

describe('selectNewItems', () => {
  it('keeps order, excludes introduced/familiar and caps the count', () => {
    expect(
      selectNewItems(
        ['a', 'b', 'c', 'd'],
        new Set(['b']),
        new Set(['c']),
        2,
      ),
    ).toEqual(['a', 'd']);
  });

  it('does not duplicate repeated candidates', () => {
    expect(selectNewItems(['a', 'a', 'b'], new Set(), new Set(), 5)).toEqual(['a', 'b']);
  });
});

describe('review queue ordering', () => {
  it('sorts by due time, then lapses, then stable key', () => {
    const items = [
      { itemKey: 'b', skill: 'meaning' as const, dueAtMs: 200, lapses: 5 },
      { itemKey: 'a', skill: 'reading' as const, dueAtMs: 100, lapses: 1 },
      { itemKey: 'c', skill: 'meaning' as const, dueAtMs: 200, lapses: 2 },
    ];
    expect(orderReviewQueue(items).map((item) => item.itemKey)).toEqual(['a', 'b', 'c']);
  });
});

describe('knowledge metrics', () => {
  it('requires both skills for verified recognition', () => {
    expect(isVerifiedRecognition([skill(), skill()])).toBe(true);
    expect(isVerifiedRecognition([skill()])).toBe(false);
    expect(isVerifiedRecognition([skill(), skill({ distinctSuccessDays: 1 })])).toBe(false);
    expect(isVerifiedRecognition([skill(), skill({ intervalDays: 6 })])).toBe(false);
    expect(isVerifiedRecognition([skill(), skill({ latestSuccess: false })])).toBe(false);
  });

  it('classifies word state from both skills', () => {
    expect(classifyWord([])).toBe('unseen');
    expect(classifyWord([skill(), skill()])).toBe('verified');
    expect(classifyWord([skill({ distinctSuccessDays: 1 }), skill()])).toBe('learning');
    expect(classifyWord([skill(), skill({ latestRatingAgain: true })])).toBe('struggling');
    expect(classifyWord([skill(), skill({ lapses7d: 2 })])).toBe('struggling');
  });

  it('computes accuracy only from unhinted ratings', () => {
    expect(
      accuracyFromRatings([
        { correct: true, hintUsed: false },
        { correct: false, hintUsed: false },
        { correct: false, hintUsed: true },
      ]),
    ).toBe(0.5);
    expect(accuracyFromRatings([])).toBe(0);
  });
});
