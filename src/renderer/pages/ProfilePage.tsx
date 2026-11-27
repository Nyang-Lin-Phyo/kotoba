import { useCallback } from 'react';
import { endDateExclusive, formatDayKey } from '../../shared/date';
import { INTEREST_LABELS } from '../../shared/enums';
import { useProfile } from '../lib/profileContext';
import { useAsync } from '../lib/useAsync';

function yesNo(value: boolean): string {
  return value ? 'Yes' : 'No';
}

export function ProfilePage() {
  const { state } = useProfile();
  const { profile, goals } = state;
  const horizonEnd = endDateExclusive(profile.startDate, profile.horizonMonths);
  const kana = useAsync(useCallback(() => window.kotoba.kana.summary(), []));

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Local profile</p>
          <h1>{profile.displayName.trim() === '' ? 'My Profile' : profile.displayName}</h1>
          <p className="muted">
            Stored only in this computer&rsquo;s profile database. Nothing here is uploaded.
          </p>
        </div>
        <span className="pill">{profile.timezone}</span>
      </header>

      <article className="card card--wide">
        <h2>Plan</h2>
        <dl className="details">
          <div>
            <dt>Day 1</dt>
            <dd>
              {formatDayKey(profile.startDate, undefined, {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </dd>
          </div>
          <div>
            <dt>Horizon</dt>
            <dd>{profile.horizonMonths} months</dd>
          </div>
          <div>
            <dt>Ends (exclusive)</dt>
            <dd>
              {formatDayKey(horizonEnd, undefined, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </dd>
          </div>
          <div>
            <dt>Starting level</dt>
            <dd>{profile.initialLevel}</dd>
          </div>
          <div>
            <dt>Target JLPT</dt>
            <dd>{profile.targetJlpt === null ? 'Not set' : profile.targetJlpt.toUpperCase()}</dd>
          </div>
          <div>
            <dt>Interests</dt>
            <dd>
              {profile.interests.length === 0
                ? 'Not set'
                : profile.interests.map((interest) => INTEREST_LABELS[interest]).join(', ')}
            </dd>
          </div>
        </dl>
      </article>

      <article className="card card--wide">
        <h2>Preferences</h2>
        <dl className="details">
          <div>
            <dt>Romaji hints</dt>
            <dd>{yesNo(profile.preferences.romaji)}</dd>
          </div>
          <div>
            <dt>Furigana</dt>
            <dd>{yesNo(profile.preferences.furigana)}</dd>
          </div>
          <div>
            <dt>Audio</dt>
            <dd>{profile.preferences.audio === 'off' ? 'Off' : 'System Japanese voice'}</dd>
          </div>
        </dl>
      </article>

      <article className="card card--wide">
        <h2>Goal history</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Effective from</th>
                <th scope="col">Minutes per day</th>
                <th scope="col">New words per day</th>
              </tr>
            </thead>
            <tbody>
              {goals.map((goal) => (
                <tr key={goal.id}>
                  <th scope="row">
                    {formatDayKey(goal.effectiveDate, undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </th>
                  <td>{goal.dailyMinutes}</td>
                  <td>{goal.dailyNewWords}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted">
          Goals are versioned by effective date. Changing them later adds a row here instead of
          editing history; the editing screen arrives with the calendar work in M6.
        </p>
      </article>

      <article className="card card--wide">
        <h2>Kana progress</h2>
        {kana.state.status === 'loading' && <p className="muted">Loading kana progress…</p>}
        {kana.state.status === 'error' && <p className="error">{kana.state.error}</p>}
        {kana.state.status === 'ready' && (
          <>
            <dl className="details">
              <div>
                <dt>Attempts</dt>
                <dd>{kana.state.data.attempts}</dd>
              </div>
              <div>
                <dt>Unhinted typed accuracy</dt>
                <dd>
                  {(kana.state.data.accuracy * 100).toFixed(1)}% of unhinted typed attempts were
                  correct
                </dd>
              </div>
              <div>
                <dt>Verified recognition</dt>
                <dd>
                  {kana.state.data.perScript.hiragana.verified} hiragana ·{' '}
                  {kana.state.data.perScript.katakana.verified} katakana
                </dd>
              </div>
              <div>
                <dt>Learning / struggling / due</dt>
                <dd>
                  {kana.state.data.learning} / {kana.state.data.struggling} / {kana.state.data.due}
                </dd>
              </div>
            </dl>
            <p className="muted">
              Verified means three unhinted typed correct answers on at least two different study
              days, with the latest unhinted attempt correct. Struggling means the last attempt
              failed or there were two failures in seven days. Hints and multiple choice are logged
              as practice but never count as verification.
            </p>
          </>
        )}
      </article>

      <article className="card card--wide">
        <h2>Progress</h2>
        <p className="muted">
          Introduced words, verified vocabulary and review accuracy are zero because the dictionary
          and review engine arrive in M5. Kana figures above and measured minutes on the dashboard
          come from real stored records.
        </p>
      </article>
    </section>
  );
}
