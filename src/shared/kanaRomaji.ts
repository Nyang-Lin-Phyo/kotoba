import { toRomaji } from 'wanakana';

const SPECIAL: Readonly<Record<string, string>> = {
  'っ': 'small tsu (double the next consonant)',
  'ッ': 'small tsu (double the next consonant)',
  'ー': 'long vowel mark',
};

/** Romaji with usable labels for characters WanaKana cannot transliterate. */
export function kanaRomaji(reading: string): string {
  return SPECIAL[reading] ?? toRomaji(reading);
}
