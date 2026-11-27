import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '../theme';

const LABELS = { system: 'System theme', light: 'Light theme', dark: 'Dark theme' } as const;

export function TopBar() {
  const { choice, cycle } = useTheme();
  const Icon = choice === 'system' ? Monitor : choice === 'light' ? Sun : Moon;
  const today = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date());

  return (
    <header className="topbar">
      <div className="topbar-meta">
        <span className="topbar-title">Kotoba</span>
        <span className="muted">{today}</span>
      </div>
      <button
        type="button"
        className="icon-button"
        onClick={cycle}
        aria-label={LABELS[choice]}
        title={LABELS[choice]}
      >
        <Icon size={16} aria-hidden="true" />
      </button>
    </header>
  );
}
