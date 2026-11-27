import {
  BarChart3,
  BookMarked,
  BookOpen,
  Calendar,
  Compass,
  GraduationCap,
  Headphones,
  Languages,
  LayoutDashboard,
  ListChecks,
  Mic,
  PenLine,
  Search,
  Settings,
  Type,
  User,
  type LucideIcon,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { NAV_GROUPS, type NavEntry } from '../../shared/nav';

const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  profile: User,
  calendar: Calendar,
  statistics: BarChart3,
  hiragana: Type,
  katakana: Languages,
  vocabulary: BookOpen,
  kanji: PenLine,
  grammar: GraduationCap,
  reviews: ListChecks,
  reading: BookMarked,
  listening: Headphones,
  speaking: Mic,
  immersion: Compass,
  dictionary: Search,
  settings: Settings,
};

function Entry({ entry }: { entry: NavEntry }) {
  const Icon = ICONS[entry.id] ?? Search;

  if (entry.kind === 'planned') {
    return (
      <li className="nav-item nav-item--planned" aria-disabled="true">
        <Icon size={16} aria-hidden="true" />
        <span className="nav-label">{entry.label}</span>
        <span className="nav-badge" title={`Planned for milestone ${entry.milestone}`}>
          {entry.milestone}
        </span>
      </li>
    );
  }

  return (
    <li>
      <NavLink
        to={entry.path}
        end={entry.path === '/'}
        className={({ isActive }) => (isActive ? 'nav-item nav-item--active' : 'nav-item')}
      >
        <Icon size={16} aria-hidden="true" />
        <span className="nav-label">{entry.label}</span>
      </NavLink>
    </li>
  );
}

export function Sidebar() {
  return (
    <nav className="sidebar" aria-label="Main navigation">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          言
        </span>
        <span className="brand-text">
          <strong>Kotoba</strong>
          <small>言葉</small>
        </span>
      </div>

      {NAV_GROUPS.map((group) => (
        <div className="nav-group" key={group.id}>
          <h2 className="nav-group-title">{group.title}</h2>
          <ul className="nav-list">
            {group.entries.map((entry) => (
              <Entry key={entry.id} entry={entry} />
            ))}
          </ul>
        </div>
      ))}

      <p className="sidebar-footnote">
        Greyed items are planned modules, not working features.
      </p>
    </nav>
  );
}
