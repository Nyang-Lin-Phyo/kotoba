import { useCallback } from 'react';
import { suggestReducedNewWords } from '../../shared/workloadRules';
import { Link } from 'react-router-dom';
import { formatDayKey } from '../../shared/date';
import { ACTIVITY_LABELS, PHASE_LABELS } from '../../shared/goals';
import { ExternalLogCard } from '../features/immersion/ExternalLogCard';
import { useAsync } from '../lib/useAsync';

export function DashboardPage() {
  const load = useCallback(() => window.kotoba.planner.getToday(), []);
  const { state, reload } = useAsync(load);

  if (state.status === 'loading') {
    return (
      <section className="page">
        <p className="muted">Loading today&rsquo;s plan…</p>
      </section>
    );
  }

  if (state.status === 'error') {
    return (
      <section className="page">
        <header className="page-header">
          <h1>Dashboard</h1>
        </header>
        <p className="error">{state.error}</p>
        <button type="button" className="button" onClick={reload}>
          Try again
        </button>
      </section>
    );
  }

  const { today, horizon, month, week, actual, kana, dueReviews, activeGoal, trackingNote } = state.data;

  const dayLabel = horizon.beforeStart
    ? `Starts ${formatDayKey(horizon.startDate, undefined, { month: 'long', day: 'numeric' })}`
    : horizon.completed
      ? 'Horizon complete'
      : `Day ${horizon.dayIndex ?? 0} of ${horizon.totalDays}`;

  const monthLabel = formatDayKey(`${month.monthKey}-01`, undefined, {
    month: 'long',
    year: 'numeric',
  });

  const horizonPercent =
    horizon.totalDays > 0
      ? Math.min(100, Math.round(((horizon.dayIndex ?? 0) / horizon.totalDays) * 100))
      : 0;

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">{dayLabel}</p>
          <h1>Dashboard</h1>
          <p className="muted">
            {formatDayKey(today.dayKey, undefined, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
            {today.phase === null ? '' : ` · ${PHASE_LABELS[today.phase]}`}
          </p>
        </div>
        <span className="pill">
          {today.eligible ? `Curriculum week ${today.curriculumWeek ?? 1}` : 'Not scheduled'}
        </span>
      </header>

      {!today.eligible && (
        <article className="card card--wide card--notice">
          <h2>Nothing scheduled for today</h2>
          {horizon.beforeStart ? (
            <p>
              Your plan starts on{' '}
              <strong>
                {formatDayKey(horizon.startDate, undefined, {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </strong>
              . Days before the start date are never counted as completed or missed.
            </p>
          ) : (
            <p>
              Today is past the end of your {horizon.totalDays}-day horizon. Nothing is counted as
              missed; extending the horizon arrives with the calendar work in M6.
            </p>
          )}
        </article>
      )}

      <div className="grid">
        <article className="card">
          <h2>Study time today</h2>
          <p className="stat">
            {actual.minutes}
            <span className="stat-unit"> / {today.targetMinutes} min</span>
          </p>
          <p className="muted">Measured time includes the timer and deliberate external logs; passive logs are excluded.</p>
        </article>

        <article className="card">
          <h2>New words today</h2>
          <p className="stat">
            {actual.newWords}
            <span className="stat-unit"> / {today.targetWords} words</span>
          </p>
          <p className="muted">Counted once when the first study/recall step is completed.</p>
        </article>

        <article className="card">
          <h2>Due reviews</h2>
          <p className="stat">{dueReviews}</p>
          <p className="muted">Word review cards due now; kana due is listed separately below.</p>
        </article>

        <article className="card">
          <h2>Kana recognition</h2>
          <p className="stat">
            {kana.verified}
            <span className="stat-unit"> verified</span>
          </p>
          <p className="muted" title="Struggling: last attempt failed, or two failures in seven days.">
            {kana.learning} learning · {kana.struggling} struggling · {kana.due} kana due
          </p>
        </article>
      </div>

      <article className="card card--wide">
        <h2>Next action</h2>
        <p>
          {dueReviews > 0 ? (
            <>
              <Link to="/reviews">Review {dueReviews} due word card{dueReviews === 1 ? '' : 's'}</Link>{' '}
              before adding more new words.
            </>
          ) : kana.due > 0 ? (
            <>
              <Link to="/hiragana?view=review">Review {kana.due} kana character{kana.due === 1 ? '' : 's'}</Link> that
              are due.
            </>
          ) : (
            <>
              <Link to="/hiragana">Practise hiragana</Link> or{' '}
              <Link to="/katakana">katakana</Link> to build verified recognition. Start the timer in
              the top bar so the minutes count here.
            </>
          )}
        </p>
      </article>

      {today.eligible && (
        <article className="card card--wide">
          <h2>Today&rsquo;s assignments</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Activity</th>
                  <th scope="col">Target minutes</th>
                  <th scope="col">Target words</th>
                  <th scope="col">Done</th>
                </tr>
              </thead>
              <tbody>
                {today.assignments.map((assignment) => (
                  <tr key={assignment.activityType}>
                    <th scope="row">{ACTIVITY_LABELS[assignment.activityType]}</th>
                    <td>{assignment.minutes}</td>
                    <td>{assignment.words === null ? '—' : assignment.words}</td>
                    <td>{actual.minutesByActivity[assignment.activityType] ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted">
            Targets are frozen when the day&rsquo;s plan is first created, so changing your goals
            later cannot rewrite today.
          </p>
        </article>
      )}

      <article className="card card--wide">
        <h2>This week · Monday to Sunday</h2>
        <ul className="week-strip">
          {week.days.map((day) => (
            <li
              key={day.dayKey}
              className={[
                'week-cell',
                day.isToday ? 'week-cell--today' : '',
                day.eligible ? '' : 'week-cell--off',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span className="week-day">
                {formatDayKey(day.dayKey, undefined, { weekday: 'short' })}
              </span>
              <span className="week-date">{formatDayKey(day.dayKey, undefined, { day: 'numeric' })}</span>
              <span className="week-state">
                {day.isToday ? 'Today' : day.eligible ? 'Planned' : 'Outside horizon'}
              </span>
            </li>
          ))}
        </ul>
      </article>

      <div className="grid">
        <article className="card">
          <h2>{monthLabel}</h2>
          <p className="stat">
            {month.elapsedDays}
            <span className="stat-unit"> of {month.targetDays} study days</span>
          </p>
          <p className="muted">
            Target so far: {month.minutesToDate.toLocaleString()} min ·{' '}
            {month.wordsToDate.toLocaleString()} words
          </p>
          <p className="muted">
            Whole month: {month.targetMinutes.toLocaleString()} min ·{' '}
            {month.targetWords.toLocaleString()} words
          </p>
          <p className="muted">Measured minutes today: {actual.minutes} min</p>
        </article>

        <article className="card">
          <h2>Horizon</h2>
          <p className="stat">
            {horizon.dayIndex ?? 0}
            <span className="stat-unit"> of {horizon.totalDays} days</span>
          </p>
          <div className="progress" role="presentation">
            <div className="progress-fill" style={{ width: `${horizonPercent}%` }} />
          </div>
          <p className="muted">
            Ends {formatDayKey(horizon.endDateExclusive, undefined, { month: 'short', day: 'numeric', year: 'numeric' })}{' '}
            (exclusive). {horizon.remainingDays.toLocaleString()} days remaining.
          </p>
        </article>
      </div>

      {suggestReducedNewWords(dueReviews, activeGoal.dailyMinutes, activeGoal.dailyNewWords).needed && (
        <article className="card card--wide card--notice">
          <h2>Review load is high</h2>
          <p className="muted">
            {suggestReducedNewWords(dueReviews, activeGoal.dailyMinutes, activeGoal.dailyNewWords).reason}{' '}
            Your goal has not been changed — this is only a suggestion.
          </p>
        </article>
      )}

      <ExternalLogCard />

      <p className="muted footnote">{trackingNote}</p>
    </section>
  );
}
