import { useRef, useState } from 'react';
import type { AttemptResult, KanaReviewItem, KanaScript } from '../../../shared/contracts';

type Props = {
  readonly script: KanaScript;
  readonly items: readonly KanaReviewItem[];
  readonly onAnswered: () => void;
};

export function KanaReviewSession({ script, items, onAnswered }: Props) {
  const [queue, setQueue] = useState(() => items.slice(0, 10));
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [hint, setHint] = useState(false);
  const [feedback, setFeedback] = useState<AttemptResult | null>(null);
  const [missed, setMissed] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const startedAt = useRef(Date.now());

  const item = queue[index];
  const finished = index >= queue.length;

  const retry = () => {
    const selected = items.filter((entry) => missed.includes(entry.kanaId)).slice(0, 10);
    setQueue(selected);
    setIndex(0);
    setAnswer('');
    setFeedback(null);
    setMissed([]);
    setError(null);
    startedAt.current = Date.now();
  };

  const submit = async () => {
    if (item === undefined || busy || answer.trim().length === 0) return;
    setBusy(true);
    setError(null);
    const result = await window.kotoba.kana.submitAttempt({
      kanaId: item.kanaId,
      mode: 'typed',
      raw: answer,
      hintUsed: hint,
      responseMs: Math.max(0, Math.min(600_000, Date.now() - startedAt.current)),
      eventId: crypto.randomUUID(),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setFeedback(result.data);
    if (!result.data.correct || hint) setMissed((values) => [...values, item.kanaId]);
  };

  const next = () => {
    setIndex((value) => value + 1);
    setAnswer('');
    setFeedback(null);
    setHint(false);
    startedAt.current = Date.now();
    if (index + 1 === queue.length) onAnswered();
  };

  if (finished) {
    return (
      <article className="card card--wide session-card">
        <p className="eyebrow">Review finished</p>
        <h2>Review complete</h2>
        <p>
          You reviewed {queue.length} character{queue.length === 1 ? '' : 's'} of{' '}
          {script === 'hiragana' ? 'hiragana' : 'katakana'}.
        </p>
        {missed.length === 0 ? (
          <p className="muted">Nothing needs another look from this session.</p>
        ) : (
          <>
          <div className="chip-row" aria-label="Characters to revisit">
            {missed.map((id) => {
              const kana = items.find((entry) => entry.kanaId === id);
              return (
                <span className="pill" key={id}>
                  <span className="jp">{kana?.character ?? id}</span> · {kana?.reading ?? ''}
                </span>
              );
            })}
          </div>
          <div className="button-row">
            <button type="button" className="button" onClick={retry}>
              Retry these characters
            </button>
          </div>
          </>
        )}
      </article>
    );
  }

  return (
    <article className="card card--wide session-card">
      <header className="session-header">
        <div>
          <p className="eyebrow">Due review · {script === 'hiragana' ? 'Hiragana' : 'Katakana'}</p>
          <h2 className="session-character">{item.character}</h2>
          <p className="muted">Type its sound without looking at the chart.</p>
        </div>
        <div className="session-progress">
          <span>
            {index + 1} of {queue.length}
          </span>
          <div className="progress" role="presentation">
            <div className="progress-fill" style={{ width: `${((index) / queue.length) * 100}%` }} />
          </div>
        </div>
      </header>

      <label className="field">
        <span>Reading</span>
        <input
          className="quiz-input"
          value={answer}
          maxLength={80}
          autoComplete="off"
          placeholder="type the reading…"
          onChange={(event) => setAnswer(event.target.value)}
          aria-label="Kana reading"
          onKeyDown={(event) => {
            if (event.key === 'Enter' && feedback === null) void submit();
          }}
        />
      </label>

      <label className="checkbox-row">
        <input type="checkbox" checked={hint} onChange={(event) => setHint(event.target.checked)} />
        <span>Show hint (hinted answers cannot be verified)</span>
      </label>
      {hint && <p className="quiz-hint">{item.reading}</p>}

      <div className="button-row">
        {feedback === null ? (
          <button
            type="button"
            className="button"
            disabled={busy || answer.trim().length === 0}
            onClick={() => void submit()}
          >
            {busy ? 'Checking…' : 'Check answer'}
          </button>
        ) : (
          <button type="button" className="button" onClick={next}>
            {index + 1 === queue.length ? 'Finish review' : 'Next character'}
          </button>
        )}
      </div>

      {feedback !== null && (
        <div className={`quiz-feedback ${feedback.correct ? 'quiz-feedback--ok' : 'quiz-feedback--bad'}`}>
          <strong>{feedback.correct ? 'Correct' : `Not quite — ${feedback.expected}`}</strong>
          {hint && <span className="muted">Hint was on, so this is only practice.</span>}
        </div>
      )}
      {error !== null && <p className="error">{error}</p>}
    </article>
  );
}
