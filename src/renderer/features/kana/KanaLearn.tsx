import { useRef, useState } from 'react';
import type { AttemptResult, KanaStatus } from '../../../shared/contracts';
import type { KanaGroup, KanaScript } from '../../../shared/kanaData';
import { buildKanaLesson, type KanaLesson } from '../../../shared/kanaLesson';
import { findKanaWord } from '../../../shared/kanaWords';

type Props = {
  readonly script: KanaScript;
  readonly groups: readonly KanaGroup[];
  readonly statuses: Readonly<Record<string, KanaStatus>>;
  readonly onAnswered: () => void;
};

export function KanaLearn({ script, groups, statuses, onAnswered }: Props) {
  const [lesson, setLesson] = useState<KanaLesson>(() =>
    buildKanaLesson({ script, groups, statuses }),
  );
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [hint, setHint] = useState(false);
  const [feedback, setFeedback] = useState<AttemptResult | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [hintedCount, setHintedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const startedAt = useRef(Date.now());

  const step = lesson.steps[index];
  const finished = index >= lesson.steps.length;

  const restart = () => {
    setLesson(buildKanaLesson({ script, groups, statuses }));
    setIndex(0);
    setAnswer('');
    setHint(false);
    setFeedback(null);
    setCorrectCount(0);
    setHintedCount(0);
    setError(null);
    startedAt.current = Date.now();
  };

  const submit = async () => {
    if (step === undefined || busy || answer.trim().length === 0) return;
    setBusy(true);
    setError(null);
    const result = await window.kotoba.kana.submitAttempt({
      kanaId: step.kanaId,
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
    if (result.data.correct && !hint) setCorrectCount((value) => value + 1);
    else if (result.data.correct && hint) setHintedCount((value) => value + 1);
  };

  const next = () => {
    setIndex((value) => value + 1);
    setAnswer('');
    setFeedback(null);
    setHint(false);
    startedAt.current = Date.now();
    if (index + 1 === lesson.steps.length) onAnswered();
  };

  if (finished) {
    return (
      <article className="card card--wide session-card">
        <p className="eyebrow">Session finished</p>
        <h2>Practice complete</h2>
        <p>
          You worked through {lesson.steps.length} characters and got {correctCount} right without
          looking at the hint.
          {hintedCount > 0 && ` ${hintedCount} more were right with the hint shown.`}
        </p>
        <p className="muted">
          This is practice, not mastery. A character is verified only after unhinted correct answers
          on two different study days.
        </p>
        <div className="button-row">
          <button type="button" className="button" onClick={restart}>
            Another lesson
          </button>
        </div>
      </article>
    );
  }

  const example = step !== null && feedback?.correct === true ? findKanaWord(step?.character ?? '') : undefined;
  const progress = lesson.steps.length === 0 ? 0 : (index / lesson.steps.length) * 100;

  return (
    <article className="card card--wide session-card">
      <header className="session-header">
        <div>
          <p className="eyebrow">
            {step?.kind === 'review' ? 'Reinforcement' : 'New character'} ·{' '}
            {script === 'hiragana' ? 'Hiragana' : 'Katakana'}
          </p>
          <h2 className="session-character">{step?.character}</h2>
          <p className="muted">
            {step?.kind === 'review'
              ? 'Seen before — type its sound again.'
              : 'Type its sound in romaji or kana.'}
          </p>
        </div>
        <div className="session-progress">
          <span>
            {index + 1} of {lesson.steps.length}
          </span>
          <div className="progress" role="presentation">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
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
        <span>Show hint (answer with a hint does not count toward mastery)</span>
      </label>
      {hint && <p className="quiz-hint">{step?.reading}</p>}

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
            {index + 1 === lesson.steps.length ? 'Finish' : 'Next character'}
          </button>
        )}
      </div>

      {feedback !== null && (
        <div className={`quiz-feedback ${feedback.correct ? 'quiz-feedback--ok' : 'quiz-feedback--bad'}`}>
          <strong>
            {feedback.correct ? 'Correct' : `Not quite — ${feedback.expected}`}
          </strong>
          {hint && <span className="muted">Hint was on, so this cannot count as verified recall.</span>}
          {example !== undefined && (
            <span className="muted">
              Small word: <span className="jp">{example.word}</span> — {example.meaning}
            </span>
          )}
        </div>
      )}
      {error !== null && <p className="error">{error}</p>}
    </article>
  );
}
