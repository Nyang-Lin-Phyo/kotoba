import { useCallback, useState } from 'react';
import { formatDayKey, todayInZone } from '../../../shared/date';
import {
  INITIAL_LEVELS,
  INITIAL_LEVEL_LABELS,
  INTERESTS,
  INTEREST_LABELS,
  JLPT_TARGETS,
  type InitialLevel,
  type Interest,
  type JlptTarget,
} from '../../../shared/enums';
import type { ProfileInput } from '../../../shared/schemas';
import { useAsync } from '../../lib/useAsync';

const STEPS = ['Welcome', 'Start date', 'Daily goals', 'Preferences', 'Preview'] as const;
const HORIZON_CHOICES = [3, 6, 12, 18, 24] as const;

const DETECTED_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

function initialDraft(): ProfileInput {
  return {
    displayName: '',
    startDate: todayInZone(DETECTED_TIMEZONE, Date.now()),
    horizonMonths: 12,
    timezone: DETECTED_TIMEZONE,
    initialLevel: 'complete-beginner',
    targetJlpt: null,
    interests: ['general'],
    dailyMinutes: 120,
    dailyNewWords: 15,
    preferences: { romaji: true, furigana: true, audio: 'off' },
  };
}

function numberFromInput(raw: string, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function PreviewStep({ draft }: { draft: ProfileInput }) {
  const load = useCallback(() => window.kotoba.planner.preview(draft), [draft]);
  const { state } = useAsync(load);

  if (state.status === 'loading') {
    return <p className="muted">Calculating your study dates…</p>;
  }
  if (state.status === 'error') {
    return <p className="error">{state.error}</p>;
  }

  const preview = state.data;

  return (
    <div className="stack">
      <dl className="details">
        <div>
          <dt>Day 1</dt>
          <dd>
            {formatDayKey(preview.startDate, undefined, {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </dd>
        </div>
        <div>
          <dt>Horizon ends</dt>
          <dd>
            {formatDayKey(preview.endDateExclusive, undefined, {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}{' '}
            <span className="muted">(exclusive)</span>
          </dd>
        </div>
        <div>
          <dt>Eligible study days</dt>
          <dd>{preview.eligibleDays.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Curriculum weeks</dt>
          <dd>{preview.curriculumWeeks.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Full 7-day week</dt>
          <dd>
            {preview.fullWeekMinutes.toLocaleString()} min ·{' '}
            {preview.fullWeekWords.toLocaleString()} words
          </dd>
        </div>
        <div>
          <dt>Whole horizon</dt>
          <dd>
            {preview.totalMinutes.toLocaleString()} min ·{' '}
            {preview.totalWords.toLocaleString()} words
          </dd>
        </div>
      </dl>

      <div className="table-wrap">
        <table className="table">
          <caption className="muted table-caption">
            Calendar months, counting only eligible days. Months with fewer than 31 days get
            proportionally fewer words — that is correct, not a bug.
          </caption>
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col">Study days</th>
              <th scope="col">Minutes</th>
              <th scope="col">New words</th>
            </tr>
          </thead>
          <tbody>
            {preview.months.map((month) => (
              <tr key={month.monthKey}>
                <th scope="row">{month.monthKey}</th>
                <td>{month.days}</td>
                <td>{month.minutes.toLocaleString()}</td>
                <td>{month.words.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="muted">
        Words are introductions, not mastered vocabulary. A JLPT level is a study target, never a
        promise of passing an exam.
      </p>
    </div>
  );
}

export function OnboardingWizard({ onCreated }: { onCreated: () => Promise<void> }) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<ProfileInput>(initialDraft);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (patch: Partial<ProfileInput>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const toggleInterest = (interest: Interest) => {
    setDraft((current) => ({
      ...current,
      interests: current.interests.includes(interest)
        ? current.interests.filter((value) => value !== interest)
        : [...current.interests, interest],
    }));
  };

  const isLast = step === STEPS.length - 1;
  const canAdvance = step !== 1 || draft.startDate.length === 10;

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    const result = await window.kotoba.profiles.create(draft);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    await onCreated();
  };

  return (
    <div className="boot">
      <div className="wizard">
        <header className="wizard-header">
          <span className="brand-mark boot-mark" aria-hidden="true">
            言
          </span>
          <div>
            <p className="eyebrow">First-time setup</p>
            <h1>Set up your local profile</h1>
            <p className="muted">
              Everything stays on this computer. There is no account, no email and no server.
            </p>
          </div>
        </header>

        <ol className="wizard-steps">
          {STEPS.map((label, index) => (
            <li
              key={label}
              className={
                index === step
                  ? 'wizard-step wizard-step--active'
                  : index < step
                    ? 'wizard-step wizard-step--done'
                    : 'wizard-step'
              }
            >
              <span className="wizard-step-index">{index + 1}</span>
              <span>{label}</span>
            </li>
          ))}
        </ol>

        <div className="wizard-body">
          {step === 0 && (
            <div className="stack">
              <p>
                Kotoba plans your study days, tracks what you have actually done, and keeps a
                personal library of Japanese words and characters. It starts from kana and grows
                with you.
              </p>
              <label className="field">
                <span>What should I call you?</span>
                <input
                  type="text"
                  value={draft.displayName}
                  maxLength={80}
                  placeholder="Optional"
                  onChange={(event) => update({ displayName: event.target.value })}
                />
              </label>
              <label className="field">
                <span>Where are you starting from?</span>
                <select
                  value={draft.initialLevel}
                  onChange={(event) =>
                    update({ initialLevel: event.target.value as InitialLevel })
                  }
                >
                  {INITIAL_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {INITIAL_LEVEL_LABELS[level]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {step === 1 && (
            <div className="stack">
              <label className="field">
                <span>Study start date</span>
                <input
                  type="date"
                  value={draft.startDate}
                  onChange={(event) => update({ startDate: event.target.value })}
                />
                <small className="muted">
                  This date is day 1. It can be today, a future date, or a past date — nothing is
                  marked as completed for days that have already gone by.
                </small>
              </label>
              <label className="field">
                <span>Study horizon</span>
                <select
                  value={draft.horizonMonths}
                  onChange={(event) =>
                    update({ horizonMonths: numberFromInput(event.target.value, 12) })
                  }
                >
                  {HORIZON_CHOICES.map((months) => (
                    <option key={months} value={months}>
                      {months} months
                    </option>
                  ))}
                </select>
                <small className="muted">
                  The horizon ends on the start-date anniversary. Study can continue afterwards.
                </small>
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="stack">
              <div className="field-row">
                <label className="field">
                  <span>Daily study minutes</span>
                  <input
                    type="number"
                    min={10}
                    max={600}
                    step={5}
                    value={draft.dailyMinutes}
                    onChange={(event) =>
                      update({ dailyMinutes: numberFromInput(event.target.value, 120) })
                    }
                  />
                </label>
                <label className="field">
                  <span>New words per day</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={draft.dailyNewWords}
                    onChange={(event) =>
                      update({ dailyNewWords: numberFromInput(event.target.value, 15) })
                    }
                  />
                </label>
              </div>
              <p className="muted">
                Defaults are 120 minutes and 15 new words. These are goals, not quotas: due
                reviews come first, and you can change the goal later without rewriting past days.
              </p>
            </div>
          )}

          {step === 3 && (
            <div className="stack">
              <label className="field">
                <span>Timezone</span>
                <input
                  type="text"
                  value={draft.timezone}
                  onChange={(event) => update({ timezone: event.target.value })}
                />
                <small className="muted">
                  Detected as {DETECTED_TIMEZONE}. Study days are counted in this timezone.
                </small>
              </label>

              <label className="field">
                <span>Target JLPT level (optional)</span>
                <select
                  value={draft.targetJlpt ?? ''}
                  onChange={(event) =>
                    update({
                      targetJlpt: event.target.value === '' ? null : (event.target.value as JlptTarget),
                    })
                  }
                >
                  <option value="">No target yet</option>
                  {JLPT_TARGETS.map((level) => (
                    <option key={level} value={level}>
                      {level.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>

              <fieldset className="field">
                <legend>What do you enjoy?</legend>
                <div className="chip-row">
                  {INTERESTS.map((interest) => (
                    <button
                      key={interest}
                      type="button"
                      className={
                        draft.interests.includes(interest) ? 'chip chip--on' : 'chip'
                      }
                      aria-pressed={draft.interests.includes(interest)}
                      onClick={() => toggleInterest(interest)}
                    >
                      {INTEREST_LABELS[interest]}
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="stack stack--tight">
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={draft.preferences.romaji}
                    onChange={(event) =>
                      update({
                        preferences: { ...draft.preferences, romaji: event.target.checked },
                      })
                    }
                  />
                  <span>Show romaji as a temporary hint</span>
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={draft.preferences.furigana}
                    onChange={(event) =>
                      update({ preferences: { ...draft.preferences, furigana: event.target.checked } })
                    }
                  />
                  <span>Show furigana above kanji</span>
                </label>
                <label className="field">
                  <span>Audio</span>
                  <select
                    value={draft.preferences.audio}
                    onChange={(event) =>
                      update({
                        preferences: {
                          ...draft.preferences,
                          audio: event.target.value as ProfileInput['preferences']['audio'],
                        },
                      })
                    }
                  >
                    <option value="off">Off</option>
                    <option value="system">Use the Windows Japanese voice if installed</option>
                  </select>
                  <small className="muted">
                    Audio exercises are disabled gracefully when no Japanese voice exists. Nothing
                    is downloaded at runtime.
                  </small>
                </label>
              </div>
            </div>
          )}

          {step === 4 && <PreviewStep draft={draft} />}
        </div>

        {error !== null && <p className="error">{error}</p>}

        <footer className="wizard-actions">
          <button
            type="button"
            className="button button--ghost"
            onClick={() => setStep((current) => Math.max(0, current - 1))}
            disabled={step === 0 || submitting}
          >
            Back
          </button>

          {isLast ? (
            <button
              type="button"
              className="button"
              onClick={() => void submit()}
              disabled={submitting}
            >
              {submitting ? 'Creating profile…' : 'Create profile'}
            </button>
          ) : (
            <button
              type="button"
              className="button"
              onClick={() => setStep((current) => current + 1)}
              disabled={!canAdvance}
            >
              Next
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
