import { describe, expect, it } from 'vitest';
import { normalizeSearchQuery, rankResults } from '../../src/main/services/dictionary';

type Row = {
  readonly id: string;
  readonly canonicalForm: string;
  readonly reading: string;
  readonly english: string;
  readonly priority: number;
  readonly curriculumRank: number | null;
  readonly senseCount: number;
  readonly formLength: number;
  readonly exactMatch: boolean;
};

function row(patch: Partial<Row> = {}): Row {
  return {
    id: 'jmdict:1',
    canonicalForm: '猫',
    reading: 'ねこ',
    english: 'cat',
    priority: 0,
    curriculumRank: null,
    senseCount: 1,
    formLength: 1,
    exactMatch: false,
    ...patch,
  };
}

describe('normalizeSearchQuery', () => {
  it('normalizes romaji and katakana to hiragana for kana lookup', () => {
    expect(normalizeSearchQuery('neko')).toBe('ねこ');
    expect(normalizeSearchQuery('ネコ')).toBe('ねこ');
    expect(normalizeSearchQuery('ねこ')).toBe('ねこ');
    expect(normalizeSearchQuery('shi')).toBe('し');
    expect(normalizeSearchQuery('si')).toBe('し');
  });

  it('leaves kanji untouched and normalizes katakana apart from trimming', () => {
    expect(normalizeSearchQuery(' 猫 ')).toBe('猫');
    // English is searched through FTS using the original query; the kana
    // normalizer only feeds the Japanese lookup.
    expect(normalizeSearchQuery('cat')).toBe('かt');
  });
});

describe('rankResults', () => {
  it('puts the curated beginner list first', () => {
    const rows = [
      row({ id: 'a', curriculumRank: null, priority: 20 }),
      row({ id: 'b', curriculumRank: 5, priority: 0 }),
    ];
    expect(rankResults(rows).map((item) => item.id)).toEqual(['b', 'a']);
  });

  it('ranks an exact match above a higher-priority prefix match', () => {
    const rows = [
      row({ id: 'a', priority: 20, exactMatch: false }),
      row({ id: 'b', priority: 0, exactMatch: true }),
    ];
    expect(rankResults(rows).map((item) => item.id)).toEqual(['b', 'a']);
  });

  it('then uses priority, fewer senses, shorter form and stable id', () => {
    const rows = [
      row({ id: 'a', priority: 1, senseCount: 1, formLength: 2 }),
      row({ id: 'b', priority: 2, senseCount: 5, formLength: 1 }),
      row({ id: 'c', priority: 2, senseCount: 1, formLength: 3 }),
      row({ id: 'd', priority: 2, senseCount: 1, formLength: 2 }),
    ];
    expect(rankResults(rows).map((item) => item.id)).toEqual(['d', 'c', 'b', 'a']);
  });
});
