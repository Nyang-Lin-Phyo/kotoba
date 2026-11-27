import { describe, expect, it } from 'vitest';
import { kanaWordCorrect } from '../../src/shared/kanaWords';

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
