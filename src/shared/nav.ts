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
      { kind: 'planned', id: 'calendar', label: 'Calendar', milestone: 'M6' },
      { kind: 'planned', id: 'statistics', label: 'Statistics', milestone: 'M6' },
    ],
  },
  {
    id: 'learn',
    title: 'Learn',
    entries: [
      { kind: 'planned', id: 'hiragana', label: 'Hiragana', milestone: 'M4' },
      { kind: 'planned', id: 'katakana', label: 'Katakana', milestone: 'M4' },
      { kind: 'planned', id: 'vocabulary', label: 'Vocabulary', milestone: 'M5' },
      { kind: 'planned', id: 'kanji', label: 'Kanji', milestone: 'M7' },
      { kind: 'planned', id: 'grammar', label: 'Grammar', milestone: 'M7' },
    ],
  },
  {
    id: 'practice',
    title: 'Practice',
    entries: [
      { kind: 'planned', id: 'reviews', label: 'Reviews', milestone: 'M5' },
      { kind: 'planned', id: 'reading', label: 'Reading', milestone: 'M8' },
      { kind: 'planned', id: 'listening', label: 'Listening', milestone: 'M8' },
      { kind: 'planned', id: 'speaking', label: 'Speaking', milestone: 'M8' },
      { kind: 'planned', id: 'immersion', label: 'Immersion', milestone: 'M8' },
    ],
  },
  {
    id: 'tools',
    title: 'Tools',
    entries: [
      { kind: 'planned', id: 'dictionary', label: 'Dictionary', milestone: 'M5' },
      { kind: 'ready', id: 'settings', label: 'Settings', path: '/settings' },
    ],
  },
];
