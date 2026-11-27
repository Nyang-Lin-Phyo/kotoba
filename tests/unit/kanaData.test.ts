import { describe, expect, it } from 'vitest';
import { findKanaItem, KANA_GROUPS } from '../../src/shared/kanaData';

const allItems = KANA_GROUPS.flatMap((group) => group.items);
const basicItems = allItems.filter((item) => item.tier === 'basic');

describe('kana catalogue', () => {
  it('has exactly 46 basic characters per script', () => {
    expect(basicItems.filter((item) => item.script === 'hiragana')).toHaveLength(46);
    expect(basicItems.filter((item) => item.script === 'katakana')).toHaveLength(46);
  });

  it('uses unique stable ids', () => {
    const ids = allItems.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('h-ka');
    expect(ids).toContain('k-ka');
  });

  it('contains only kana characters and readings', () => {
    const kanaOnly = /^[\u3041-\u30ff]+$/u;
    for (const item of allItems) {
      expect(kanaOnly.test(item.character), `${item.id} character`).toBe(true);
      expect(kanaOnly.test(item.reading), `${item.id} reading`).toBe(true);
    }
  });

  it('orders groups from vowels through rows to special and extended sets', () => {
    const hiraganaGroups = KANA_GROUPS.filter((group) => group.script === 'hiragana').map(
      (group) => group.id,
    );
    expect(hiraganaGroups).toEqual([
      'vowel',
      'k',
      's',
      't',
      'n',
      'h',
      'm',
      'y',
      'r',
      'w',
      'special',
      'dakuten',
      'handakuten',
      'yoon',
    ]);
  });

  it('tags dakuten, yoon and the prolonged mark as extended', () => {
    expect(findKanaItem('h-ga')?.tier).toBe('extended');
    expect(findKanaItem('h-kya')?.tier).toBe('extended');
    expect(findKanaItem('k-long')?.tier).toBe('extended');
    expect(findKanaItem('h-sokuon')?.tier).toBe('extended');
  });

  it('looks up known characters by stable id', () => {
    expect(findKanaItem('h-ka')?.reading).toBe('か');
    expect(findKanaItem('k-ka')?.reading).toBe('カ');
    expect(findKanaItem('does-not-exist')).toBeUndefined();
  });
});
