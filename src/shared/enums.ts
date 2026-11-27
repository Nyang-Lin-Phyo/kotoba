/**
 * Enumerations shared by the DTO layer and the validation schemas.
 *
 * Kept in their own module so `contracts.ts` and `schemas.ts` can both import
 * them without a circular dependency.
 */

export const INITIAL_LEVELS = ['complete-beginner', 'knows-kana', 'some-words', 'n5-plus'] as const;
export type InitialLevel = (typeof INITIAL_LEVELS)[number];

export const INITIAL_LEVEL_LABELS: Record<InitialLevel, string> = {
  'complete-beginner': 'Complete beginner — cannot read kana yet',
  'knows-kana': 'I know hiragana and katakana',
  'some-words': 'I know some words and phrases by sound',
  'n5-plus': 'I am at or above JLPT N5 level',
};

export const JLPT_TARGETS = ['n5', 'n4', 'n3', 'n2', 'n1'] as const;
export type JlptTarget = (typeof JLPT_TARGETS)[number];

export const INTERESTS = ['anime', 'manga', 'games', 'vtuber', 'youtube', 'general'] as const;
export type Interest = (typeof INTERESTS)[number];

export const INTEREST_LABELS: Record<Interest, string> = {
  anime: 'Anime',
  manga: 'Manga',
  games: 'Games',
  vtuber: 'VTubers',
  youtube: 'YouTube',
  general: 'General',
};

export const AUDIO_PREFERENCES = ['off', 'system'] as const;
export type AudioPreference = (typeof AUDIO_PREFERENCES)[number];

export const THEME_CHOICES = ['system', 'light', 'dark'] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];
