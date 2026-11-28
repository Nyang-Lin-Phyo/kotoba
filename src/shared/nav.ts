/**
 * Sidebar model. `ready` entries are real routes; `planned` entries are rendered
 * as disabled labels with the milestone that will implement them, so the UI never
 * offers a dead button.
 */

export type NavEntry =
  | { readonly kind: 'ready'; readonly id: string; readonly label: string; readonly path: string }
  | { readonly kind: 'planned'; readonly id: string; readonly label: string; readonly milestone: string };

export type NavGroup = {
  readonly id: string;
  readonly title: string;
  readonly entries: readonly NavEntry[];
};

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    id: 'main',
    title: 'Main',
    entries: [
      { kind: 'ready', id: 'dashboard', label: 'Dashboard', path: '/' },
      { kind: 'ready', id: 'profile', label: 'My Profile', path: '/profile' },
      { kind: 'ready', id: 'calendar', label: 'Calendar', path: '/calendar' },
      { kind: 'ready', id: 'statistics', label: 'Statistics', path: '/statistics' },
    ],
  },
  {
    id: 'learn',
    title: 'Learn',
    entries: [
      { kind: 'ready', id: 'hiragana', label: 'Hiragana', path: '/hiragana' },
      { kind: 'ready', id: 'katakana', label: 'Katakana', path: '/katakana' },
      { kind: 'ready', id: 'vocabulary', label: 'Vocabulary', path: '/vocabulary' },
      { kind: 'ready', id: 'kanji', label: 'Kanji', path: '/kanji' },
      { kind: 'ready', id: 'grammar', label: 'Grammar', path: '/grammar' },
    ],
  },
  {
    id: 'practice',
    title: 'Practice',
    entries: [
      { kind: 'ready', id: 'reviews', label: 'Reviews', path: '/reviews' },
      { kind: 'ready', id: 'reading', label: 'Reading', path: '/reading' },
      { kind: 'ready', id: 'listening', label: 'Listening', path: '/listening' },
      { kind: 'ready', id: 'speaking', label: 'Speaking', path: '/speaking' },
      { kind: 'ready', id: 'immersion', label: 'Immersion', path: '/immersion' },
    ],
  },
  {
    id: 'tools',
    title: 'Tools',
    entries: [
      { kind: 'ready', id: 'dictionary', label: 'Dictionary', path: '/dictionary' },
      { kind: 'ready', id: 'settings', label: 'Settings', path: '/settings' },
    ],
  },
];
