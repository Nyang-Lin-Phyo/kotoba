import { describe, expect, it } from 'vitest';
import { KANA_WORDS, findKanaWord, kanaWordCorrect } from '../../src/shared/kanaWords';

describe('kanaWordCorrect', () => {
  it('accepts the word in kana or romaji', () => {
    expect(kanaWordCorrect('かわ', 'かわ')).toBe(true);
    expect(kanaWordCorrect('kawa', 'かわ')).toBe(true);
  });

  it('rejects a different word', () => {
    expect(kanaWordCorrect('ka', 'かわ')).toBe(false);
    expect(kanaWordCorrect('', 'かわ')).toBe(false);
  });
});

describe('word sounds', () => {
  it('shows each symbol sound separately for かわ', () => {
    expect(findKanaWord('か')?.sound).toBe('ka-wa');
  });

  it('has a syllable sound for every word', () => {
    for (const word of KANA_WORDS) {
      expect(word.sound.length, word.word).toBeGreaterThan(0);
      if (word.word.length > 1) expect(word.sound).toContain('-');
    }
  });
});
