import { useCallback, useEffect, useState } from 'react';
import type { CalendarDayResult, DayFactsDTO } from '../../../shared/contracts';
import { addDays, daysInMonth, formatDayKey, monthKeyOf, monthStartKey, startOfWeekMonday, todayInZone } from '../../../shared/date';
import { useProfile } from '../../lib/profileContext';

function daysBetweenKeys(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function nextMonth(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  return month === 12
    ? `${year! + 1}-01`
    : `${year}-${String(month! + 1).padStart(2, '0')}`;
}

function previousMonth(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  return month === 1
    ? `${year! - 1}-12`
    : `${year}-${String(month! - 1).padStart(2, '0')}`;
}

function monthKeys(monthKey: string) {
  const first = monthStartKey(monthKey);
  const days = Array.from({ length: daysInMonth(monthKey) }, (_, index) => addDays(first, index));
  return {
    days,
    leading: daysBetweenKeys(startOfWeekMonday(first), first),
    next: nextMonth(monthKey),
    previous: previousMonth(monthKey),
  };
}

export function CalendarPage() {
  const { state: profileState } = useProfile();
  const [monthKey, setMonthKey] = useState(() =>
    monthKeyOf(todayInZone(profileState.profile.timezone, Date.now())),
  );
  const [days, setDays] = useState<readonly CalendarDayResult[]>([]);
  const [selected, setSelected] = useState<CalendarDayResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    const keys = monthKeys(monthKey);
    void Promise.all(keys.days.map((dayKey) => window.kotoba.planner.getCalendarDay({ dayKey })))
      .then((results) => {
        const failed = results.find((result) => !result.ok);
        if (failed !== undefined && !failed.ok) {
          setError(failed.error.message);
          return;
        }
        setError(null);
        setDays(results.map((result) => (result.ok ? result.data : null)).filter((value) => value !== null));
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load calendar'));
  }, [monthKey]);

  useEffect(load, [load]);

  const keys = monthKeys(monthKey);
  const byKey = new Map(days.map((item) => [item.day.dayKey, item]));

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Real study history</p>
          <h1>Calendar</h1>
          <p className="muted">Targets come from each day&rsquo;s frozen plan; actuals come from stored events.</p>
        </div>
        <div className="button-row">
          <button type="button" className="button button--ghost button--small" onClick={() => setMonthKey(keys.previous)}>
            Previous
          </button>
          <span className="pill">{monthKey}</span>
          <button type="button" className="button button--ghost button--small" onClick={() => setMonthKey(keys.next)}>
            Next
          </button>
        </div>
      </header>

      {error !== null && <p className="error">{error}</p>}

      <article className="card card--wide">
        <div className="calendar-weekdays">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        <div className="calendar-grid">
          {Array.from({ length: keys.leading }, (_, index) => (
            <span className="calendar-cell calendar-cell--empty" key={`blank-${index}`} />
          ))}
          {keys.days.map((dayKey) => {
            const entry = byKey.get(dayKey);
            const day: DayFactsDTO | undefined = entry?.day;
            const complete =
              day !== undefined &&
              day.eligible &&
              day.minutes >= day.targetMinutes &&
              day.newWords >= day.targetWords;
            return (
              <button
                key={dayKey}
                type="button"
                className={[
                  'calendar-cell',
                  day?.eligible === false ? 'calendar-cell--off' : '',
                  complete ? 'calendar-cell--complete' : '',
                  selected?.day.dayKey === dayKey ? 'calendar-cell--selected' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => setSelected(entry ?? null)}
              >
                <span className="calendar-date">{formatDayKey(dayKey, undefined, { day: 'numeric' })}</span>
                {day !== undefined && day.eligible && (
                  <span className="calendar-actual">
                    {day.minutes}/{day.targetMinutes}m · {day.newWords}/{day.targetWords}w
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </article>

      {selected !== null && (
        <article className="card card--wide">
          <h2>
            {formatDayKey(selected.day.dayKey, undefined, {
              weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
            })}
          </h2>
          <p className="muted">
            {selected.status === 'scheduled'
              ? `Curriculum day ${selected.curriculumDay ?? '—'}${selected.phase === null ? '' : ` · ${selected.phase}`}`
              : selected.status === 'before-start'
                ? 'Before your study start date — never counted as missed.'
                : 'After your study horizon.'}
          </p>
          <div className="grid">
            <article className="card">
              <h3>Study time</h3>
              <p className="stat">
                {selected.day.minutes}
                <span className="stat-unit"> / {selected.day.targetMinutes} min</span>
              </p>
            </article>
            <article className="card">
              <h3>New words</h3>
              <p className="stat">
                {selected.day.newWords}
                <span className="stat-unit"> / {selected.day.targetWords} words</span>
              </p>
            </article>
            <article className="card">
              <h3>Reviews / kana</h3>
              <p className="stat">
                {selected.day.reviews}{' '}
                <span className="stat-unit">reviews · {selected.day.kanaAttempts} kana</span>
              </p>
            </article>
          </div>
        </article>
      )}
    </section>
  );
}
