import { useCallback, useMemo, useState } from 'react';
import type { GrammarUnitDTO } from '../../../shared/contracts';
import { useAsync } from '../../lib/useAsync';

const STATUS_LABELS = {
  available: 'Available',
  'in-progress': 'In progress',
  completed: 'Completed',
  locked: 'Locked',
} as const;

function GrammarLesson({ unitId, onChanged }: {
  readonly unitId: string;
  readonly onChanged: () => void;
}) {
  const load = useCallback(() => window.kotoba.grammar.detail({ id: unitId }), [unitId]);
  const { state, reload } = useAsync(load);
  const [choice, setChoice] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextExercise = useMemo(() => {
    const data = state.status === 'ready' ? state.data : null;
    if (data === null) return undefined;
    return data.unit.exercises.find(
      (exercise) => !data.correctExerciseIds.includes(exercise.id),
    );
  }, [state]);

  const check = async () => {
    if (choice === null || nextExercise === undefined) return;
    setBusy(true);
    setError(null);
    const result = await window.kotoba.grammar.attempt({
      eventId: crypto.randomUUID(),
      unitId,
      exerciseId: nextExercise.id,
      answerIndex: choice,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setFeedback(result.data.correct ? result.data.rationale : `Not quite. ${result.data.rationale}`);
    setChoice(null);
    onChanged();
    reload();
  };

  if (state.status === 'loading') return <p className="muted">Loading lesson…</p>;
  if (state.status === 'error') {
    return <p className="error">{state.error} <button type="button" className="button button--ghost button--small" onClick={reload}>Retry</button></p>;
  }
  if (state.data === null) return <p className="muted">That lesson does not exist.</p>;

  const detail = state.data;
  return (
    <section className="card card--wide" aria-label={detail.title}>
      <div className="lesson-head">
        <div>
          <h2>{detail.title}</h2>
          <p className="muted mono">unit {detail.order} · {STATUS_LABELS[detail.status]}</p>
        </div>
      </div>

      <div className="lesson-explanation">
        <h3>How it works</h3>
        <p>{detail.unit.explanation}</p>
      </div>

      <div className="lesson-examples">
        <h3>Examples</h3>
        <ul className="source-list">
          {detail.unit.examples.map((example, index) => (
            <li key={`${example.japanese}-${index}`}>
              <span lang="ja" className="jp-text lesson-jp">{example.japanese}</span>
              <span className="muted"> — {example.reading}</span>
              <span> — {example.english}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="quiz-block">
        <h3>Exercises</h3>
        {nextExercise === undefined ? (
          <p className="quiz-feedback">All exercises in this unit answered correctly.</p>
        ) : (
          <>
            <p>{nextExercise.prompt}</p>
            <div className="lesson-choices" role="radiogroup" aria-label={nextExercise.prompt}>
              {nextExercise.choices.map((option, index) => (
                <label className="lesson-choice" key={`${index}-${option}`}>
                  <input
                    type="radio"
                    name={`${unitId}-${nextExercise.id}`}
                    checked={choice === index}
                    disabled={busy}
                    onChange={() => { setChoice(index); setFeedback(null); }}
                  />
                  <span lang="ja">{option}</span>
                </label>
              ))}
            </div>
            <div className="button-row">
              <button type="button" className="button" disabled={busy || choice === null} onClick={() => void check()}>
                Check answer
              </button>
            </div>
            {feedback !== null && <p className="quiz-feedback">{feedback}</p>}
          </>
        )}
        {error !== null && <p className="error">{error}</p>}
      </div>
      <p className="muted footnote">{detail.unit.sourceNote}</p>
    </section>
  );
}

export function GrammarPage() {
  const load = useCallback(() => window.kotoba.grammar.list(), []);
  const { state, reload } = useAsync(load);
  const [selected, setSelected] = useState<string | null>(null);

  if (state.status === 'loading') return <section className="page"><p className="muted">Loading lessons…</p></section>;
  if (state.status === 'error') {
    return (
      <section className="page">
        <p className="error">{state.error}</p>
        <button type="button" className="button" onClick={reload}>Retry</button>
      </section>
    );
  }

  const units = state.data;
  const completed = units.filter((unit) => unit.status === 'completed').length;

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Grammar lessons</h1>
          <p className="muted">
            Original beginner units in a fixed order. A unit opens when its prerequisites are complete.
            These are learning labels, not JLPT level claims.
          </p>
        </div>
        <p className="mono page-count">{completed} of {units.length} complete</p>
      </header>

      <article className="card card--wide">
        <h2>Units</h2>
        <ul className="lesson-list">
          {units.map((unit: GrammarUnitDTO) => {
            const prereqs = unit.prerequisites
              .map((id) => units.find((item) => item.id === id)?.title ?? id)
              .join(', ');
            return (
              <li key={unit.id}>
                <button
                  type="button"
                  className={`lesson-row${selected === unit.id ? ' lesson-row--selected' : ''}`}
                  disabled={!unit.unlocked}
                  aria-pressed={selected === unit.id}
                  onClick={() => setSelected(unit.id)}
                >
                  <span className="mono lesson-order">{String(unit.order).padStart(2, '0')}</span>
                  <span className="lesson-title">{unit.title}</span>
                  <span className="lesson-status">
                    {STATUS_LABELS[unit.status]}
                    {unit.correctExerciseIds.length > 0 && (
                      <span className="mono"> · {unit.correctExerciseIds.length} answers</span>
                    )}
                  </span>
                </button>
                {!unit.unlocked && <p className="muted lesson-lock">Requires: {prereqs}</p>}
              </li>
            );
          })}
        </ul>
      </article>

      {selected !== null && <GrammarLesson unitId={selected} onChanged={reload} />}
    </section>
  );
}
