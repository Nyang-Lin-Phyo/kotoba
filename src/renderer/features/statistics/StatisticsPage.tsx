import { useCallback } from 'react';
import type { DayFactsDTO } from '../../../shared/contracts';
import { formatDayKey } from '../../../shared/date';
import { useAsync } from '../../lib/useAsync';

function DayBar({ day, label }: { readonly day: DayFactsDTO; readonly label: string }) {
  const ratio = day.targetMinutes === 0 ? 0 : Math.min(100, (day.minutes / day.targetMinutes) * 100);
  return (
    <div className="stat-bar" title={`${label}: ${day.minutes}/${day.targetMinutes} min, ${day.newWords}/${day.targetWords} words`}>
      <span className="stat-bar-label">{label}</span>
      <div className="stat-bar-track">
        <div className="stat-bar-fill" style={{ width: `${ratio}%` }} />
      </div>
      <span className="stat-bar-value">{day.minutes}m</span>
    </div>
  );
}

export function StatisticsPage() {
  const stats = useAsync(useCallback(() => window.kotoba.planner.getStats(), []));

  if (stats.state.status === 'loading') return <section className="page"><p className="muted">Loading statistics…</p></section>;
  if (stats.state.status === 'error') {
    return (
      <section className="page">
        <p className="error">{stats.state.error}</p>
        <button type="button" className="button" onClick={stats.reload}>Try again</button>
      </section>
    );
  }

  const data = stats.state.data;

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Computed from stored records</p>
          <h1>Statistics</h1>
          <p className="muted">
            Targets are frozen per day. Actual figures come from sessions, introductions and review logs — never from page opens.
          </p>
        </div>
        <span className="pill" title={data.definitions.streak}>Streak: {data.streak} days</span>
      </header>

      <div className="grid">
        <article className="card">
          <h2>Target to date</h2>
          <p className="stat">
            {data.toDate.actualMinutes}
            <span className="stat-unit"> / {data.toDate.targetMinutes} min</span>
          </p>
          <p className="muted">
            {data.toDate.actualWords} / {data.toDate.targetWords} words introduced
          </p>
        </article>
        <article className="card">
          <h2>Curriculum</h2>
          <p className="stat">{data.phase}</p>
          <p className="muted">
            Horizon day {data.horizon.dayIndex ?? 0} of {data.horizon.totalDays} ·{' '}
            {data.horizon.remainingDays} days remaining
          </p>
        </article>
        <article className="card">
          <h2>Review accuracy</h2>
          <p className="muted" title={data.definitions.accuracy}>
            {data.definitions.accuracy}
          </p>
        </article>
      </div>

      <article className="card card--wide">
        <h2>This week</h2>
        <p className="muted" title={data.definitions.streak}>
          Week starting {formatDayKey(data.week.weekStart, undefined, { month: 'short', day: 'numeric' })}
        </p>
        <div className="stat-bars">
          {data.week.days.map((day) => (
            <DayBar
              key={day.dayKey}
              day={day}
              label={formatDayKey(day.dayKey, undefined, { weekday: 'short' }) ?? day.dayKey}
            />
          ))}
        </div>
      </article>

      <article className="card card--wide">
        <h2>{data.month.monthKey}</h2>
        <div className="stat-bars">
          {data.month.days.map((day) => (
            <DayBar
              key={day.dayKey}
              day={day}
              label={formatDayKey(day.dayKey, undefined, { day: 'numeric' }) ?? day.dayKey}
            />
          ))}
        </div>
      </article>

      <article className="card card--wide">
        <h2>How these numbers work</h2>
        <dl className="details">
          <div><dt>Streak</dt><dd>{data.definitions.streak}</dd></div>
          <div><dt>Accuracy</dt><dd>{data.definitions.accuracy}</dd></div>
          <div><dt>Verified recognition</dt><dd>{data.definitions.verifiedRecognition}</dd></div>
        </dl>
      </article>
    </section>
  );
}
