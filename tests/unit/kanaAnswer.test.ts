import { describe, expect, it } from 'vitest';
import { kanaAnswerCorrect } from '../../src/shared/kanaAnswer';
import { findKanaItem } from '../../src/shared/kanaData';

function correct(id: string, answer: string): boolean {
  const item = findKanaItem(id);
  if (item === undefined) throw new Error(`No kana item with id ${id}`);
  return kanaAnswerCorrect(item, answer);
}

describe('kana answer normalization', () => {
  it('accepts the exact kana character', () => {
    expect(correct('h-ka', 'か')).toBe(true);
    expect(correct('k-ka', 'カ')).toBe(true);
  });

  it('accepts romaji including common Hepburn variants', () => {
    expect(correct('h-ka', 'ka')).toBe(true);
    expect(correct('h-shi', 'shi')).toBe(true);
    expect(correct('h-shi', 'si')).toBe(true);
    expect(correct('h-chi', 'chi')).toBe(true);
    expect(correct('h-chi', 'ti')).toBe(true);
    expect(correct('h-fu', 'fu')).toBe(true);
    expect(correct('h-fu', 'hu')).toBe(true);
  });

  it('accepts IME-typed kana, uppercase romaji and surrounding whitespace', () => {
    expect(correct('h-shi', 'し')).toBe(true);
    expect(correct('h-ka', 'KA')).toBe(true);
    expect(correct('h-ka', '  ka  ')).toBe(true);
  });

  it('accepts yoon and small tsu', () => {
    expect(correct('h-kya', 'きゃ')).toBe(true);
    expect(correct('h-kya', 'kya')).toBe(true);
    expect(correct('h-sokuon', 'っ')).toBe(true);
  });

  it('accepts romaji for katakana items without conflating scripts', () => {
    expect(correct('k-ka', 'ka')).toBe(true);
    expect(correct('k-ka', 'か')).toBe(false);
    expect(correct('h-ka', 'カ')).toBe(false);
  });

  it('rejects a different character and an empty answer', () => {
    expect(correct('h-ka', 'き')).toBe(false);
    expect(correct('h-ka', '')).toBe(false);
  });
});
