import { describe, expect, it } from 'vitest';
import { kanaRomaji } from '../../src/shared/kanaRomaji';

describe('kanaRomaji', () => {
  it('converts basic hiragana and katakana', () => {
    expect(kanaRomaji('か')).toBe('ka');
    expect(kanaRomaji('カ')).toBe('ka');
    expect(kanaRomaji('きゃ')).toBe('kya');
  });

  it('gives small tsu and the prolonged mark a usable label', () => {
    expect(kanaRomaji('っ')).toContain('small tsu');
    expect(kanaRomaji('ッ')).toContain('small tsu');
    expect(kanaRomaji('ー')).toContain('long vowel');
  });
});
