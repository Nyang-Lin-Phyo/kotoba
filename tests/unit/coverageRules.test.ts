import { describe, expect, it } from 'vitest';
import { summarizeCoverage, type CoverageToken } from '../../src/shared/coverageRules';

const token = (pos: string, overrides: Partial<CoverageToken> = {}): CoverageToken => ({
  pos, surface: 'x', basicForm: 'x', reading: '', wordType: 'KNOWN',
  entryId: null, knownReading: false, knownMeaning: false, ...overrides,
});

describe('summarizeCoverage', () => {
  it('uses content words as the denominator and reports other tokens separately', () => {
    const result = summarizeCoverage([
      token('名詞', { entryId: 'e1', knownReading: true, knownMeaning: true }),
      token('動詞', { entryId: 'e2', knownReading: true, knownMeaning: false }),
      token('名詞', { entryId: 'e3' }),
      token('助詞'),
      token('記号'),
    ]);
    expect(result.eligible).toBe(3);
    expect(result.excludedFunctionTokens).toBe(2);
    expect(result.known).toBe(1);
    expect(result.learning).toBe(1);
    expect(result.unseen).toBe(1);
    expect(result.unknown).toBe(0);
    expect(result.readingCoverage).toBeCloseTo(2 / 3);
    expect(result.meaningCoverage).toBeCloseTo(1 / 3);
    expect(result.denominatorNote).toContain('not a comprehension percentage');
  });

  it('reports unmapped tokens and handles an empty denominator honestly', () => {
    const empty = summarizeCoverage([token('助詞')]);
    expect(empty.eligible).toBe(0);
    expect(empty.readingCoverage).toBe(0);
    const unmapped = summarizeCoverage([token('名詞', { wordType: 'UNKNOWN' })]);
    expect(unmapped.unknown).toBe(1);
  });
});
