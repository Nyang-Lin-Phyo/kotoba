import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { ThemeChoice } from '../shared/enums';

type ThemeContextValue = {
  readonly choice: ThemeChoice;
  readonly setChoice: (choice: ThemeChoice) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyChoice(choice: ThemeChoice): void {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const resolved = choice === 'system' ? (prefersDark ? 'dark' : 'light') : choice;
  document.documentElement.dataset.theme = resolved;
}

/**
 * Theme is an application preference, stored in the profile database through the
 * main process. It is never used to store learning data.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>('system');

  useEffect(() => {
    let cancelled = false;
    void window.kotoba.settings.get().then((result) => {
      if (!cancelled && result.ok) {
        setChoiceState(result.data.theme);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    applyChoice(choice);
    if (choice !== 'system') return;

    // Follow the OS while the user is on "system".
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyChoice('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [choice]);

  const setChoice = useCallback(async (next: ThemeChoice) => {
    setChoiceState(next);
    await window.kotoba.settings.set({ theme: next });
  }, []);

  const value = useMemo(() => ({ choice, setChoice }), [choice, setChoice]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (value === null) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }
  return value;
}
