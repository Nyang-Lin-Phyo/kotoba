import { useCallback, useEffect, useState } from 'react';

export type ThemeChoice = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'kotoba.theme';
const ORDER: readonly ThemeChoice[] = ['system', 'light', 'dark'];

function readStoredChoice(): ThemeChoice {
  const stored = localStorage.getItem(STORAGE_KEY);
  return ORDER.includes(stored as ThemeChoice) ? (stored as ThemeChoice) : 'system';
}

function applyChoice(choice: ThemeChoice): void {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const resolved = choice === 'system' ? (prefersDark ? 'dark' : 'light') : choice;
  document.documentElement.dataset.theme = resolved;
}

/** Theme is a UI preference only; no learning data is stored in localStorage. */
export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(readStoredChoice);

  useEffect(() => {
    applyChoice(choice);
    localStorage.setItem(STORAGE_KEY, choice);
  }, [choice]);

  const cycle = useCallback(() => {
    setChoice((current) => ORDER[(ORDER.indexOf(current) + 1) % ORDER.length] ?? 'system');
  }, []);

  return { choice, cycle };
}
