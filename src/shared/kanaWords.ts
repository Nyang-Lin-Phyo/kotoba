/** Original hiragana-only curriculum examples used during guided practice. */

import words from '../../data/curriculum/kana_words.json';
import { normalizeKanaInput } from './kanaAnswer';

export type KanaWord = {
  readonly character: string;
  readonly word: string;
  readonly meaning: string;
  readonly sound: string;
};

export const KANA_WORDS: readonly KanaWord[] = words.words;

const BY_CHARACTER = new Map(KANA_WORDS.map((item) => [item.character, item]));

export function findKanaWord(character: string): KanaWord | undefined {
  return BY_CHARACTER.get(character);
}

/** Accepts the example word typed in kana or romaji. */
export function kanaWordCorrect(raw: string, word: string): boolean {
  const answer = normalizeKanaInput(raw.trim().toLowerCase());
  return answer.length > 0 && answer === normalizeKanaInput(word);
}
