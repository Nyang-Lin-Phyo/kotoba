import { useEffect, useMemo, useRef, useState } from 'react';
import type { AttemptResult, KanaItem } from '../../../shared/contracts';

/** Notes for pairs learners reliably confuse. Shown as feedback, never scored. */
const CONTRASTS: Record<string, string> = {
  'h-shi': 'シ (shi) vs ツ (tsu): the first strokes differ; ツ opens upward.',
  'h-tsu': 'ツ (tsu) vs シ (shi): ツ opens upward, シ does not.',
  'h-so': 'ソ (so) vs ン (n): ン is more rounded and heavier.',
  'h-n': 'ン (n) vs ソ (so): ン has a fuller final stroke.',
  'h-nu': 'ぬ (nu) vs め (me): め has a crossing stroke on the right.',
  'h-me': 'め (me) vs ぬ (nu): look for the extra crossing stroke.',
  'h-wa': 'わ (wa) vs ね (ne): the right-hand shapes are different.',
  'h-ne': 'ね (ne) vs わ (wa): compare the final hooked stroke.',
};

type Props = {
  readonly item: KanaItem;
  readonly choices: readonly KanaItem[];
  readonly onAnswered: () => void;
};

export function KanaQuiz({ item, choices, onAnswered }: Props) {
  const [raw, setRaw] = useState('');
  const [hint, setHint] = useState(false);
  const [mode, setMode] = useState<'typed' | 'choice'>('typed');
  const [feedback, setFeedback] = useState<AttemptResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const startedAt = useRef(Date.now());

  const options = useMemo(() => {
    const others = choices.filter((choice) => choice.id !== item.id).slice(0, 7);
    const picked = others.slice(0, 3).map((choice) => choice.reading);
    return [...new Set([item.reading, ...picked])].toSorted((a, b) => a.localeCompare(b));
  }, [choices, item]);

  useEffect(() => {
    setRaw('');
    setFeedback(null);
    setError(null);
    startedAt.current = Date.now();
  }, [item.id]);

  const hasJapaneseVoice =
    typeof speechSynthesis !== 'undefined' &&
    speechSynthesis.getVoices().some((voice) => voice.lang.toLowerCase().startsWith('ja'));

  const submit = async () => {
    if (busy || raw.trim().length === 0) return;
    setBusy(true);
    setError(null);
    const responseMs = Math.min(600_000, Math.max(0, Date.now() - startedAt.current));
    const result = await window.kotoba.kana.submitAttempt({
      kanaId: item.id,
      mode,
      raw,
      hintUsed: hint,
      responseMs,
      eventId: crypto.randomUUID(),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setFeedback(result.data);
    onAnswered();
  };

  return (
    <section className="card card--wide quiz">
      <header className="quiz-header">
        <div>
          <p className="eyebrow">{mode === 'choice' ? 'Assisted practice' : 'Recognition'}</p>
          <h2 className="quiz-character">{item.character}</h2>
          <p className="muted">
            {item.tier === 'extended' ? 'Extended character' : 'Basic character'} · type the reading
            in romaji or kana
          </p>
        </div>
        <div className="quiz-controls">
          <label className="checkbox-row">
            <input type="checkbox" checked={hint} onChange={(event) => setHint(event.target.checked)} />
            <span>Show hint</span>
          </label>
          <label className="field field--inline">
            <span>Mode</span>
            <select value={mode} onChange={(event) => setMode(event.target.value as 'typed' | 'choice')}>
              <option value="typed">Type it</option>
              <option value="choice">Multiple choice (assisted)</option>
            </select>
          </label>
          {hasJapaneseVoice && (
            <button
              type="button"
              className="button button--ghost button--small"
              onClick={() => {
                const utterance = new SpeechSynthesisUtterance(item.reading);
                utterance.lang = 'ja-JP';
                speechSynthesis.speak(utterance);
              }}
            >
              Listen
            </button>
          )}
        </div>
      </header>

      {hint && <p className="quiz-hint">Hint: {item.reading}</p>}

      {mode === 'typed' ? (
        <input
          className="quiz-input"
          type="text"
          value={raw}
          autoComplete="off"
          placeholder="reading…"
          aria-label="Kana reading"
          onChange={(event) => setRaw(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void submit();
          }}
        />
      ) : (
        <div className="chip-row" role="group" aria-label="Choose the reading">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              className={raw === option ? 'chip chip--on' : 'chip'}
              aria-pressed={raw === option}
              onClick={() => setRaw(option)}
            >
              {option}
            </button>
          ))}
        </div>
      )}

      <div className="button-row quiz-actions">
        <button type="button" className="button" onClick={() => void submit()} disabled={busy || raw.trim().length === 0}>
          {busy ? 'Checking…' : 'Check answer'}
        </button>
        <span className="muted">Press Enter to check</span>
      </div>

      {feedback !== null && (
        <div className={`quiz-feedback ${feedback.correct ? 'quiz-feedback--ok' : 'quiz-feedback--bad'}`}>
          <strong>{feedback.correct ? 'Correct' : `Not quite — ${feedback.expected}`}</strong>
          <span className="muted">
            {feedback.status === 'verified'
              ? 'Verified recognition: three unhinted correct answers across at least two days.'
              : feedback.status === 'struggling'
                ? 'Marked for review; this does not mean you failed the character permanently.'
                : feedback.status === 'learning'
                  ? 'Learning — unhinted answers on two different days are needed to verify.'
                  : 'Not studied yet.'}
          </span>
          {CONTRASTS[item.id] !== undefined && <span className="muted">{CONTRASTS[item.id]}</span>}
        </div>
      )}
      {error !== null && <p className="error">{error}</p>}

      {item.example !== undefined && (
        <p className="muted">
          Example: <span className="jp">{item.example.japanese}</span> — {item.example.english}
        </p>
      )}
    </section>
  );
}
