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
  const [attempts, setAttempts] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wordMode, setWordMode] = useState(false);
  const [wordAnswer, setWordAnswer] = useState('');
  const [wordResult, setWordResult] = useState<boolean | null>(null);
  const startedAt = useRef(Date.now());

  const step = lesson.steps[index];
  const finished = index >= lesson.steps.length;
  const example = step !== undefined ? findKanaWord(step.character) : undefined;

  const resetStepState = () => {
    setAnswer('');
    setFeedback(null);
    setAttempts(0);
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

  const proceedToWordOrNext = () => {
    if (example !== undefined) {
      setWordMode(true);
    } else {
      next();
    }
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
    if (result.data.correct) {
      setCorrectCount((value) => value + 1);
      proceedToWordOrNext();
    } else {
      setAttempts((value) => value + 1);
    }
  };

  const tryAgain = () => {
    setFeedback(null);
    setAnswer('');
    startedAt.current = Date.now();
  };

  const confirmRevealedAnswer = () => {
    if (step === undefined || answer.trim().length === 0) return;
    if (kanaWordCorrect(answer, step.reading)) {
      proceedToWordOrNext();
    } else {
      setAnswer('');
      setError(`Type the sound you see: ${step.reading} (${kanaRomaji(step.reading)})`);
    }
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
        <p>You worked through {lesson.steps.length} characters and got {correctCount} right.</p>
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

  const revealed = feedback !== null && !feedback.correct && attempts >= 2;
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
          <p className="muted">Type its sound in romaji or kana.</p>
        </div>
        <div className="header-actions">
          {step !== undefined && <SpeakButton text={step.reading} label="Hear character" />}
          <div className="session-progress">
            <span>{index + 1} of {lesson.steps.length}</span>
            <div className="progress" role="presentation">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
      </header>

      {!wordMode && (
        <>
          {revealed && (
            <div className="quiz-feedback quiz-feedback--bad">
              <strong>
                Answer: <span className="jp">{step?.reading}</span> ({kanaRomaji(step?.reading ?? '')})
              </strong>
              <span className="muted">Type that sound below to continue.</span>
            </div>
          )}

          {feedback === null || !feedback.correct ? (
            <label className="field">
              <span>{revealed ? 'Type the sound you see' : 'Reading'}</span>
              <input
                className="quiz-input"
                value={answer}
                maxLength={80}
                autoComplete="off"
                placeholder={revealed ? step?.reading : 'type the reading…'}
                aria-label="Kana reading"
                onChange={(event) => {
                  setAnswer(event.target.value);
                  setError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    if (revealed) confirmRevealedAnswer();
                    else void submit();
                  }
                }}
              />
            </label>
          ) : null}

          <div className="button-row">
            {revealed ? (
              <button
                type="button"
                className="button"
                disabled={answer.trim().length === 0}
                onClick={confirmRevealedAnswer}
              >
                I typed the sound
              </button>
            ) : feedback === null ? (
              <button
                type="button"
                className="button"
                disabled={busy || answer.trim().length === 0}
                onClick={() => void submit()}
              >
                {busy ? 'Checking…' : 'Check answer'}
              </button>
            ) : (
              <button type="button" className="button" onClick={tryAgain}>
                Try again
              </button>
            )}
          </div>

          {feedback !== null && !revealed && (
            <div className={`quiz-feedback ${feedback.correct ? 'quiz-feedback--ok' : 'quiz-feedback--bad'}`}>
              <strong>
                {feedback.correct ? 'Correct' : 'Not quite'} —{' '}
                <span className="jp">{feedback.expected}</span> ({kanaRomaji(feedback.expected)})
              </strong>
              {!feedback.correct && (
                <span className="muted">
                  {attempts >= 2 ? 'Next wrong answer reveals the sound.' : 'One more try — type its sound.'}
                </span>
              )}
            </div>
          )}
          {error !== null && <p className="error">{error}</p>}
        </>
      )}

      {wordMode && example !== undefined && (
        <section className="word-step">
          {feedback !== null && (
            <p className="quiz-feedback quiz-feedback--ok">
              Correct — <span className="jp">{feedback.expected}</span> ({kanaRomaji(feedback.expected)})
            </p>
          )}
          <p className="eyebrow">Now use it in a word</p>
          <p>
            <span className="jp word-step-word">{example.word}</span> — {example.meaning}
          </p>
          <p className="muted">
            Sounds like: <strong>{example.sound}</strong>. Type that reading in romaji or kana.
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
              <strong>{wordResult ? 'Correct' : `Not quite — ${example.sound}`}</strong>
              <span className="muted">
                This word step is practice; it does not change your kana verification count.
              </span>
            </div>
          )}
        </section>
      )}
    </article>
  );
}
