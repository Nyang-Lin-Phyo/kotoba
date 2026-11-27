import { Monitor, Moon, Sun } from 'lucide-react';
import { formatDayKey, todayInZone } from '../../shared/date';
import type { ThemeChoice } from '../../shared/enums';
import { useProfile } from '../lib/profileContext';
import { useTheme } from '../theme';
import { TimerControls } from './TimerControls';

const LABELS: Record<ThemeChoice, string> = {
  system: 'System theme',
  light: 'Light theme',
  dark: 'Dark theme',
};

const NEXT: Record<ThemeChoice, ThemeChoice> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};

export function TopBar() {
  const { state } = useProfile();
  const { choice, setChoice } = useTheme();

  // The date shown is the study date in the profile's own timezone, not the
  // machine's local date, so it always matches the day the plan refers to.
  const todayKey = todayInZone(state.profile.timezone, Date.now());
  const todayLabel = formatDayKey(todayKey, undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const Icon = choice === 'system' ? Monitor : choice === 'light' ? Sun : Moon;
  const next = NEXT[choice];

  return (
    <header className="topbar">
      <div className="topbar-meta">
        <span className="topbar-title">
          {state.profile.displayName.trim() === '' ? 'Kotoba' : state.profile.displayName}
        </span>
        <span className="muted">{todayLabel}</span>
      </div>
      <TimerControls />
      <button
        type="button"
        className="icon-button"
        onClick={() => void setChoice(next)}
        aria-label={`${LABELS[choice]} — switch to ${LABELS[next]}`}
        title={`${LABELS[choice]} — switch to ${LABELS[next]}`}
      >
        <Icon size={16} aria-hidden="true" />
      </button>
    </header>
  );
}
