import { useCallback, useEffect, useState } from 'react';
import { addDays, endDateExclusive, formatDayKey, todayInZone } from '../../shared/date';
import { INTEREST_LABELS } from '../../shared/enums';
import { M7Summary } from '../features/progress/M7Summary';
import { useProfile } from '../lib/profileContext';
import { useAsync } from '../lib/useAsync';

function yesNo(value: boolean): string {
  return value ? 'Yes' : 'No';
}

export function ProfilePage() {
  const { state, reload } = useProfile();
  const { profile, goals } = state;
  const horizonEnd = endDateExclusive(profile.startDate, profile.horizonMonths);
  const [effectiveDate, setEffectiveDate] = useState(() =>
    addDays(todayInZone(profile.timezone, Date.now()), 1),
  );
  const [minutes, setMinutes] = useState(goals.at(-1)?.dailyMinutes ?? 120);
  const [newWordsGoal, setNewWordsGoal] = useState(goals.at(-1)?.dailyNewWords ?? 15);
  const [goalError, setGoalError] = useState<string | null>(null);
  const [goalNotice, setGoalNotice] = useState<string | null>(null);
  const [savingGoal, setSavingGoal] = useState(false);

  useEffect(() => {
    const latest = goals.at(-1);
    if (latest !== undefined) {
      setMinutes(latest.dailyMinutes);
      setNewWordsGoal(latest.dailyNewWords);
    }
  }, [goals]);

  const saveGoal = async () => {
    setSavingGoal(true);
    setGoalError(null);
    setGoalNotice(null);
    const result = await window.kotoba.goals.set({ effectiveDate, dailyMinutes: minutes, dailyNewWords: newWordsGoal });
    setSavingGoal(false);
    if (!result.ok) {
      setGoalError(result.error.message);
      return;
    }
    await reload();
    setGoalNotice(`Goal updated from ${effectiveDate}. Earlier days were not changed.`);
  };
  const kana = useAsync(useCallback(() => window.kotoba.kana.summary(), []));
  const words = useAsync(useCallback(() => window.kotoba.learning.getSummary(), []));

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
        <h2>Change daily goal</h2>
        <p className="muted">
          A goal change takes effect on a chosen date. Past days keep their original targets.
        </p>
        <div className="field-row">
          <label className="field">
            <span>Effective date</span>
            <input type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} />
          </label>
          <label className="field">
            <span>Minutes per day</span>
            <input type="number" min={10} max={600} value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} />
          </label>
          <label className="field">
            <span>New words per day</span>
            <input type="number" min={0} max={100} value={newWordsGoal} onChange={(event) => setNewWordsGoal(Number(event.target.value))} />
          </label>
        </div>
        <p className="muted">
          Preview: from {effectiveDate}, {minutes} min · {newWordsGoal} words instead of{' '}
          {goals.at(-1)?.dailyMinutes ?? 120} min · {goals.at(-1)?.dailyNewWords ?? 15} words.
        </p>
        <div className="button-row">
          <button type="button" className="button" disabled={savingGoal} onClick={() => void saveGoal()}>
            {savingGoal ? 'Saving…' : 'Save goal change'}
          </button>
        </div>
        {goalError !== null && <p className="error">{goalError}</p>}
        {goalNotice !== null && <p className="muted">{goalNotice}</p>}
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
        <h2>Vocabulary</h2>
        {words.state.status === 'loading' && <p className="muted">Loading vocabulary metrics…</p>}
        {words.state.status === 'error' && <p className="error">{words.state.error}</p>}
        {words.state.status === 'ready' && (
          <>
            <dl className="details">
              <div>
                <dt>Introduced</dt>
                <dd>{words.state.data.introduced} unique words</dd>
              </div>
              <div>
                <dt>Familiar (self-report)</dt>
                <dd>{words.state.data.familiar}</dd>
              </div>
              <div>
                <dt>Verified recognition / learning / struggling</dt>
                <dd>
                  {words.state.data.verified} / {words.state.data.learning} /{' '}
                  {words.state.data.struggling}
                </dd>
              </div>
              <div>
                <dt>Due word reviews</dt>
                <dd>{words.state.data.due}</dd>
              </div>
              <div>
                <dt>Unhinted typed accuracy</dt>
                <dd>{(words.state.data.accuracy * 100).toFixed(1)}%</dd>
              </div>
            </dl>
            <p className="muted">
              Introduced means the first study/recall step was completed, even if that first attempt
              failed. Familiar is only your own report. Verified recognition is defined in the
              Reviews screen and requires both skills on two different days.
            </p>
          </>
        )}
      </article>

      <M7Summary />

      <article className="card card--wide">
        <h2>Progress</h2>
        <p className="muted">
          Word counts, review history and accuracy above come from stored records. Remaining zeros
          refer only to modules that do not exist yet. No probability estimate is presented as
          measured accuracy.
        </p>
      </article>
    </section>
  );
}
