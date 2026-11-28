import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { KanjiDetailDTO, PersonalKanjiDTO } from '../../../shared/contracts';
import { normalizeKanaInput } from '../../../shared/kanaAnswer';
import { useAsync } from '../../lib/useAsync';

const STATUS_LABELS = {
  encountered: 'Encountered',
  learning: 'Learning',
  verified: 'Verified recognition',
  struggling: 'Needs practice',
} as const;

function Status({ item }: { readonly item: Pick<PersonalKanjiDTO, 'status' | 'verified'> }) {
  return (
    <span className="kanji-status">
      {STATUS_LABELS[item.status]}
      {item.verified && <span className="unhinted-mark" title="Verified without hints">unhinted</span>}
    </span>
  );
}

function KanjiDetail({ literal, onReviewed }: {
  readonly literal: string;
  readonly onReviewed: () => void;
}) {
  const load = useCallback(() => window.kotoba.kanji.detail({ id: literal }), [literal]);
  const { state, reload } = useAsync(load);
  const [answer, setAnswer] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [hinted, setHinted] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    setAnswer('');
    setRevealed(false);
    setHinted(false);
    setChecked(false);
    setFeedback(null);
    startedAt.current = Date.now();
  }, [literal]);

  const submit = async (correct: boolean, hintUsed: boolean) => {
    const data = state.status === 'ready' ? state.data : null;
    setBusy(true);
    setError(null);
    const result = await window.kotoba.kanji.attempt({
      eventId: crypto.randomUUID(),
      literal,
      correct,
      hintUsed,
      responseMs: Math.min(600_000, Date.now() - startedAt.current),
      wordContext: data?.wordContext ?? literal,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setFeedback(correct ? 'Recorded as a correct recall' : 'Recorded as a missed recall');
    setChecked(true);
    onReviewed();
    reload();
  };

  const check = () => {
    const data = state.status === 'ready' ? state.data : null;
    if (data === null || data.quiz === null) return;
    const target = normalizeKanaInput(data.quiz.reading);
    const correct = target.length > 0 && normalizeKanaInput(answer) === target;
    setRevealed(true);
    void submit(correct, hinted || revealed);
  };

  if (state.status === 'loading') return <p className="muted">Loading kanji detail…</p>;
  if (state.status === 'error') {
    return <p className="error">{state.error} <button type="button" className="button button--ghost button--small" onClick={reload}>Retry</button></p>;
  }
  if (state.data === null) return <p className="muted">This character is no longer in your library.</p>;

  const detail: KanjiDetailDTO = state.data;
  const readings = detail.dictionary?.readings ?? [];

  return (
    <section className="card card--wide" aria-label={`Kanji ${literal}`}>
      <div className="kanji-head">
        <span className="kanji-glyph" lang="ja">{literal}</span>
        <div>
          <h2>{literal} in your words</h2>
          <Status item={detail} />
          <p className="muted mono">
            first seen {detail.firstDayKey} · interval {detail.intervalDays}d · {detail.reps} attempts · {detail.lapses} misses
          </p>
        </div>
      </div>

      {detail.quiz !== null ? (
        <div className="quiz-block">
          <h3>Recall the reading</h3>
          <p className="muted">Read the word containing {literal}. Type its kana or romaji, then check.</p>
          <div className="field-row">
            <label className="field">
              <span>Reading</span>
              <input
                className="quiz-input"
                lang="ja"
                value={answer}
                disabled={busy || checked}
                onChange={(event) => setAnswer(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') check(); }}
              />
            </label>
            <div className="quiz-actions">
              <button type="button" className="button" disabled={busy || checked || revealed || answer.trim().length === 0} onClick={check}>
                Check reading
              </button>
              <button type="button" className="button button--ghost" disabled={busy || checked || revealed} onClick={() => { setRevealed(true); setHinted(true); }}>
                Show answer
              </button>
            </div>
          </div>
          {revealed && (
            <p className="quiz-feedback">
              Reading: <span lang="ja" className="jp-text">{detail.quiz.reading}</span> — {detail.quiz.meaning}
              {hinted && ' (answer shown before recall)'}
            </p>
          )}
          {revealed && hinted && !checked && (
            <div className="button-row">
              <button type="button" className="button button--ghost" disabled={busy || checked} onClick={() => void submit(true, true)}>
                I recalled it after seeing the answer
              </button>
            </div>
          )}
          {feedback !== null && <p className="muted">{feedback}</p>}
        </div>
      ) : (
        <p className="muted">No introduced word uses this character yet, so there is no reading quiz available.</p>
      )}

      {error !== null && <p className="error">{error}</p>}

      <div className="kanji-columns">
        <div>
          <h3>Dictionary readings</h3>
          {readings.length === 0 ? (
            <p className="muted">Not listed in the bundled dictionary. Nothing has been invented.</p>
          ) : (
            <ul className="source-list">
              {readings.map((reading, index) => (
                <li key={`${reading.type}-${reading.reading}-${index}`}>
                  <span className="mono">{reading.type}</span> <span lang="ja" className="jp-text">{reading.reading}</span>
                </li>
              ))}
            </ul>
          )}
          {detail.dictionary !== null && (
            <p className="muted">{detail.dictionary.meanings}</p>
          )}
        </div>
        <div>
          <h3>Attempt history</h3>
          {detail.attempts.length === 0 ? (
            <p className="muted">No attempts recorded yet.</p>
          ) : (
            <ul className="source-list">
              {detail.attempts.map((attempt, index) => (
                <li key={`${attempt.dayKey}-${index}`} className="mono">
                  {attempt.dayKey} · {attempt.correct ? 'correct' : 'missed'}{attempt.hintUsed ? ' · hinted' : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <p className="muted footnote">{detail.ruleNote}</p>
    </section>
  );
}

export function KanjiPage() {
  const load = useCallback(() => window.kotoba.kanji.list(), []);
  const { state, reload } = useAsync(load);
  const [selected, setSelected] = useState<string | null>(null);

  if (state.status === 'loading') return <section className="page"><p className="muted">Loading your kanji…</p></section>;
  if (state.status === 'error') {
    return (
      <section className="page">
        <p className="error">{state.error}</p>
        <button type="button" className="button" onClick={reload}>Retry</button>
      </section>
    );
  }

  const items = state.data;
  const verified = items.filter((item) => item.verified).length;

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Kanji from your words</h1>
          <p className="muted">
            Characters appear here when a word you have introduced contains them. Recognition is checked
            separately from simply seeing a character.
          </p>
        </div>
        <p className="mono page-count">{items.length} encountered · {verified} verified</p>
      </header>

      {items.length === 0 ? (
        <article className="card card--wide">
          <h2>No kanji yet</h2>
          <p className="muted">
            Introduce a word that contains kanji and it will appear here with its source word.
          </p>
          <Link className="button" to="/vocabulary">Go to Vocabulary</Link>
        </article>
      ) : (
        <article className="card card--wide">
          <h2>Your characters</h2>
          <div className="kanji-grid">
            {items.map((item) => (
              <button
                type="button"
                key={item.literal}
                className={`kanji-cell${selected === item.literal ? ' kanji-cell--selected' : ''}`}
                aria-pressed={selected === item.literal}
                onClick={() => setSelected(item.literal)}
              >
                <span className="kanji-cell-glyph" lang="ja">{item.literal}</span>
                <span className="kanji-cell-word" lang="ja">{item.wordContext}</span>
                <Status item={item} />
              </button>
            ))}
          </div>
        </article>
      )}

      {selected !== null && <KanjiDetail literal={selected} onReviewed={reload} />}
    </section>
  );
}
