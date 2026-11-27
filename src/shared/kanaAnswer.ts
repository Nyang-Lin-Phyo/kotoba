/**
 * Answer normalization for kana quizzes.
 *
 * Romanization is a temporary hint, not the thing being tested: WanaKana turns
 * typed romaji into kana so graders never have to maintain a synonym list for
 * shi/si, chi/ti, fu/hu, small っ or yōon. Kana typed through an IME is kept in
 * the script the learner typed, so か and カ remain different answers.
 */

import { isKana, toKana, toKatakana } from 'wanakana';
import type { KanaItem } from './kanaData';

/** Returns the kana for an answer, preserving script for kana input. */
export function normalizeKanaInput(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return '';
  }
  if (isKana(trimmed)) {
    return toKana(trimmed);
  }
  // Uppercase romaji is converted to katakana by WanaKana; lowercase it first
  // so typing "KA" still answers a hiragana prompt.
  return toKana(trimmed.toLowerCase(), { IMEMode: true });
}

export function kanaAnswerCorrect(item: KanaItem, raw: string): boolean {
  const normalized = normalizeKanaInput(raw);
  if (normalized.length === 0) {
    return false;
  }

  const typedKana = isKana(raw.trim());
  // Romaji answers for a katakana prompt are converted to katakana; kana
  // answers are compared exactly, script included.
  const compared = !typedKana && item.script === 'katakana' ? toKatakana(normalized) : normalized;

  return compared === item.reading;
}
