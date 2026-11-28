import { useState } from 'react';
import type { AnalysisDTO } from '../../../shared/contracts';
import { passages, type ReadingPassage } from '../../../shared/readingData';

function PassageView({ passage }: { readonly passage: ReadingPassage }) {
  const [showEnglish, setShowEnglish] = useState(false);
  const [choice, setChoice] = useState<Record<string, number>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [lookup, setLookup] = useState<AnalysisDTO | null>(null);
  const [picked, setPicked] = useState<number | null>(null);

  const lookUp = async () => {
    setBusy(true);
    const result = await window.kotoba.immersionStudy.analyze({
      text: passage.lines.map((line) => line.japanese).join('\n'),
      title: passage.title, sourceName: '', kind: 'text', persist: false,
    });
    setBusy(false);
    if (result.ok) {
      setLookup(result.data);
      setPicked(null);
    }
  };

  const answer = async (exerciseId: string) => {
    const answerIndex = choice[exerciseId];
    if (answerIndex === undefined) return;
    setBusy(true);
    const result = await window.kotoba.immersionStudy.comprehension({
      eventId: crypto.randomUUID(), skill: 'reading', materialId: passage.id,
      exerciseId, answerIndex,
    });
    setBusy(false);
    if (!result.ok) {
      setFeedback((previous) => ({ ...previous, [exerciseId]: result.error.message }));
      return;
    }
    setFeedback((previous) => ({
      ...previous,
      [exerciseId]: result.data.correct ? result.data.rationale : `Not quite. ${result.data.rationale}`,
    }));
  };

  return (
    <section className="card card--wide">
      <h2>{passage.title}</h2>
      <p className="muted mono">{passage.level} · {passage.sourceNote}</p>
      <div className="button-row">
        <button type="button" className="button button--ghost button--small" aria-pressed={showEnglish} onClick={() => setShowEnglish((value) => !value)}>
          {showEnglish ? 'Hide translation' : 'Show translation'}
        </button>
        <button type="button" className="button button--ghost button--small" disabled={busy} onClick={() => void lookUp()}>
          Look up words
        </button>
      </div>

      <div className="passage-lines" lang="ja">
        {passage.lines.map((line, index) => (
          <div className="passage-line" key={`${passage.id}-${index}`}>
            <span className="passage-kana">{line.kana}</span>
            <span className="passage-jp">{line.japanese}</span>
            {showEnglish && <span className="passage-en">{line.english}</span>}
            <span className="muted mono passage-romaji">{line.reading}</span>
          </div>
        ))}
      </div>

      {lookup !== null && (
        <div className="quiz-block">
          <h3>Look up a word</h3>
          <p className="token-line" lang="ja">
            {lookup.tokens.map((token) => (
              <button
                type="button"
                key={token.position}
                className="token"
                aria-pressed={picked === token.position}
                onClick={() => setPicked(token.position)}
              >
                {token.surface}
              </button>
            ))}
          </p>
          {picked !== null && (lookup.tokens[picked]?.candidates ?? []).length > 0 && (
            <ul className="source-list">
              {lookup.tokens[picked]?.candidates.map((entry) => (
                <li key={entry.id} lang="ja">
                  {entry.canonicalForm} — {entry.reading} — {entry.english}
                </li>
              ))}
            </ul>
          )}
          {picked !== null && (lookup.tokens[picked]?.candidates ?? []).length === 0 && (
            <p className="muted">No dictionary entry matched this token.</p>
          )}
        </div>
      )}

      <div className="quiz-block">
        <h3>New words and phrases</h3>
        <ul className="source-list">
          {passage.glosses.map((gloss) => (
            <li key={gloss.term}><span lang="ja">{gloss.term}</span> — {gloss.gloss}</li>
          ))}
        </ul>
      </div>

      <div className="quiz-block">
        <h3>Comprehension</h3>
        {passage.exercises.map((exercise) => (
          <div className="exercise" key={exercise.id}>
            <p>{exercise.prompt}</p>
            <div className="lesson-choices" role="radiogroup" aria-label={exercise.prompt}>
              {exercise.choices.map((option, index) => (
                <label className="lesson-choice" key={`${exercise.id}-${index}`}>
                  <input
                    type="radio"
                    name={`${exercise.id}-reading`}
                    checked={choice[exercise.id] === index}
                    onChange={() => setChoice((previous) => ({ ...previous, [exercise.id]: index }))}
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>
            <div className="button-row">
              <button type="button" className="button button--small" disabled={busy || choice[exercise.id] === undefined} onClick={() => void answer(exercise.id)}>
                Check answer
              </button>
            </div>
            {feedback[exercise.id] !== undefined && <p className="quiz-feedback">{feedback[exercise.id]}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

export function ReadingPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const passage = passages.find((item) => item.id === selected);

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Reading</h1>
          <p className="muted">
            Short original passages using familiar grammar, with kana support and new words glossed
            in context. Tap a line to study it; comprehension is checked with questions, not page time.
          </p>
        </div>
      </header>

      <article className="card card--wide">
        <h2>Passages</h2>
        <ul className="lesson-list">
          {passages.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={`lesson-row${selected === item.id ? ' lesson-row--selected' : ''}`}
                aria-pressed={selected === item.id}
                onClick={() => setSelected(item.id)}
              >
                <span className="mono lesson-order">{String(item.order).padStart(2, '0')}</span>
                <span className="lesson-title" lang="ja">{item.title}</span>
                <span className="lesson-status mono">{item.level}</span>
              </button>
            </li>
          ))}
        </ul>
      </article>

      {passage === undefined ? (
        <article className="card card--wide">
          <p className="muted">Choose a passage to begin.</p>
        </article>
      ) : (
        <PassageView passage={passage} />
      )}
    </section>
  );
}
