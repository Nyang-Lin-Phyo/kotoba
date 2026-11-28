/** Transparent coverage rules. Coverage is not comprehension. */

export type CoverageToken = {
  readonly pos: string;
  readonly surface: string;
  readonly basicForm: string;
  readonly reading: string;
  readonly wordType: string;
  readonly entryId: string | null;
  readonly knownReading: boolean;
  readonly knownMeaning: boolean;
};

export type CoverageSummary = {
  readonly eligible: number;
  readonly excludedFunctionTokens: number;
  readonly otherTokens: number;
  readonly known: number;
  readonly learning: number;
  readonly unseen: number;
  readonly unknown: number;
  readonly readingCoverage: number;
  readonly meaningCoverage: number;
  readonly denominatorNote: string;
};

/** Kuromoji POS tags counted in the denominator. Others are reported separately. */
const CONTENT_POS = new Set(['名詞', '動詞', '形容詞', '副詞', '連体詞']);
const FUNCTION_POS = new Set(['助詞', '助動詞', '記号', '感動詞', 'FIELD', 'SPACE']);

export const COVERAGE_NOTE =
  'Eligible tokens are content words (nouns, verbs, adjectives, adverbs and determiners) ' +
  'that Kuromoji identified; particles and punctuation are shown separately. A token is known ' +
  'only when both its reading and meaning skills are marked known. Unmapped tokens are counted ' +
  'as unknown, never guessed. This is vocabulary coverage, not a comprehension percentage.';

export function summarizeCoverage(tokens: readonly CoverageToken[]): CoverageSummary {
  const eligible = tokens.filter((token) => CONTENT_POS.has(token.pos));
  const excludedFunctionTokens = tokens.filter((token) => FUNCTION_POS.has(token.pos)).length;
  const otherTokens = tokens.filter(
    (token) => !CONTENT_POS.has(token.pos) && !FUNCTION_POS.has(token.pos),
  ).length;
  let known = 0;
  let learning = 0;
  let unseen = 0;
  let unknown = 0;
  let readingKnown = 0;
  let meaningKnown = 0;

  for (const token of eligible) {
    if (token.entryId === null || token.wordType === 'UNKNOWN') {
      unknown += 1;
      continue;
    }
    if (token.knownReading) readingKnown += 1;
    if (token.knownMeaning) meaningKnown += 1;
    if (token.knownReading && token.knownMeaning) known += 1;
    else if (token.knownReading || token.knownMeaning) learning += 1;
    else unseen += 1;
  }

  const total = eligible.length;
  return {
    eligible: total,
    excludedFunctionTokens,
    otherTokens,
    known,
    learning,
    unseen,
    unknown,
    readingCoverage: total === 0 ? 0 : readingKnown / total,
    meaningCoverage: total === 0 ? 0 : meaningKnown / total,
    denominatorNote: COVERAGE_NOTE,
  };
}
