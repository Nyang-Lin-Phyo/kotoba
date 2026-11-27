import { useRef, useState } from 'react';
import type { AttemptResult, KanaStatus } from '../../../shared/contracts';
import type { KanaGroup, KanaScript } from '../../../shared/kanaData';
import { buildKanaLesson, type KanaLesson } from '../../../shared/kanaLesson';
import { kanaRomaji } from '../../../shared/kanaRomaji';
import { findKanaWord, kanaWordCorrect } from '../../../shared/kanaWords';
import { SpeakButton } from './sound';

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
  const [feedback, setFeedback] = useState<AttemptResult | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wordMode, setWordMode] = useState(false);
  const [wordAnswer, setWordAnswer] = useState('');
  const [wordResult, setWordResult] = useState<boolean | null>(null);
  const startedAt = useRef(Date.now());

  const step = lesson.steps[index];
  const finished = index >= lesson.steps.length;
  const example = step !== undefined && feedback?.correct === true
    ? findKanaWord(step.character)
    : undefined;

  const resetStepState = () => {
    setAnswer('');
    setFeedback(null);
    setWordMode(false);
    setWordAnswer('');
    setWordResult(null);
    setError(null);
    startedAt.current = Date.now();
  };

  const restart = () => {
    setLesson(buildKanaLesson({ script, groups, statuses }));
    setIndex(0);
    setCorrectCount(0);
    resetStepState();
  };

  const submit = async () => {
    if (step === undefined || busy || answer.trim().length === 0) return;
    setBusy(true);
    setError(null);
    const result = await window.kotoba.kana.submitAttempt({
      kanaId: step.kanaId,
      mode: 'typed',
      raw: answer,
      hintUsed: false,
      responseMs: Math.max(0, Math.min(600_000, Date.now() - startedAt.current)),
      eventId: crypto.randomUUID(),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setFeedback(result.data);
    if (result.data.correct) setCorrectCount((value) => value + 1);
  };

  const checkWord = () => {
    if (example === undefined || wordAnswer.trim().length === 0) return;
    setWordResult(kanaWordCorrect(wordAnswer, example.word));
  };

  const next = () => {
    setIndex((value) => value + 1);
    resetStepState();
    if (index + 1 === lesson.steps.length) onAnswered();
  };

  if (finished) {
    return (
      <article className="card card--wide session-card">
        <p className="eyebrow">Session finished</p>
        <h2>Practice complete</h2>
        <p>
          You worked through {lesson.steps.length} characters and got {correctCount} right.
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

  const progress = lesson.steps.length === 0 ? 0 : ((index + 1) / lesson.steps.length) * 100;

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
        <div className="header-actions">
          {step !== undefined && <SpeakButton text={step.reading} label="Hear character" />}
          <div className="session-progress">
            <span>
              {index + 1} of {lesson.steps.length}
            </span>
            <div className="progress" role="presentation">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
      </header>

      {!wordMode && (
        <>
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
              <>
                {example !== undefined && (
                  <button type="button" className="button" onClick={() => setWordMode(true)}>
                    Write the small word
                  </button>
                )}
                <button type="button" className="button button--ghost" onClick={next}>
                  {index + 1 === lesson.steps.length ? 'Finish' : 'Next character'}
                </button>
              </>
            )}
          </div>

          {feedback !== null && (
            <div className={`quiz-feedback ${feedback.correct ? 'quiz-feedback--ok' : 'quiz-feedback--bad'}`}>
              <strong>
                {feedback.correct ? 'Correct' : 'Not quite'} — <span className="jp">{feedback.expected}</span>{' '}
                ({kanaRomaji(feedback.expected)})
              </strong>
              {example !== undefined && (
                <span className="muted">
                  Small word: <span className="jp">{example.word}</span> — {example.meaning}
                  <br />
                  Sounds like: <strong>{kanaRomaji(example.word)}</strong>
                </span>
              )}
            </div>
          )}
        </>
      )}

      {wordMode && example !== undefined && (
        <section className="word-step">
          <p className="eyebrow">Now use it in a word</p>
          <p>
            <span className="jp word-step-word">{example.word}</span> — {example.meaning}
          </p>
          <p className="muted">
            Sounds like: <strong>{kanaRomaji(example.word)}</strong>. Type that reading in romaji or kana.
          </p>
          <SpeakButton text={example.word} label="Hear word" />
          <label className="field">
            <span>Word reading</span>
            <input
              className="quiz-input"
              value={wordAnswer}
              maxLength={80}
              autoComplete="off"
              placeholder="e.g. kawa"
              aria-label="Word reading"
              onChange={(event) => setWordAnswer(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') checkWord();
              }}
            />
          </label>
          <div className="button-row">
            <button
              type="button"
              className="button"
              disabled={wordAnswer.trim().length === 0}
              onClick={checkWord}
            >
              Check word
            </button>
            <button type="button" className="button button--ghost" onClick={next}>
              {index + 1 === lesson.steps.length ? 'Finish' : 'Next character'}
            </button>
          </div>
          {wordResult !== null && (
            <div className={`quiz-feedback ${wordResult ? 'quiz-feedback--ok' : 'quiz-feedback--bad'}`}>
              <strong>
                {wordResult ? 'Correct' : `Not quite — ${kanaRomaji(example.word)}`}
              </strong>
              <span className="muted">
                This word step is practice; it does not change your kana verification count.
              </span>
            </div>
          )}
        </section>
      )}

      {error !== null && <p className="error">{error}</p>}
    </article>
  );
}
