import { useCallback, useEffect, useState } from 'react';
import type { LessonItem, LearningSummary, VocabularyLibraryItem } from '../../../shared/contracts';
import { useAsync } from '../../lib/useAsync';

function Summary({ summary }: { readonly summary: LearningSummary }) {
  const items = [
    ['Introduced', summary.introduced],
    ['Familiar', summary.familiar],
    ['Learning', summary.learning],
    ['Struggling', summary.struggling],
    ['Due', summary.due],
  ] as const;

  return (
    <div className="chip-row">
      {items.map(([label, value]) => (
        <span className="pill" key={label} title={`${label}: counted from stored learning records`}>
          {label}: {value}
        </span>
      ))}
    </div>
  );
}

function LessonCard({ item, onDone }: { readonly item: LessonItem; readonly onDone: () => void }) {
  const [phase, setPhase] = useState<'teach' | 'recall' | 'done'>('teach');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [diagnostic, setDiagnostic] = useState(false);

  useEffect(() => {
    setPhase(item.state === 'introduced' || item.state === 'familiar' ? 'done' : 'teach');
    setAnswer('');
  }, [item.itemKey, item.state]);

  const introduce = async () => {
    setBusy(true);
    setError(null);
    const result = await window.kotoba.learning.introduce({
      itemId: item.itemKey,
      eventId: crypto.randomUUID(),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setPhase('done');
    onDone();
  };

  const familiar = async (diagnosticCorrect: boolean) => {
    setBusy(true);
    setError(null);
    const result = await window.kotoba.learning.setFamiliar({
      itemId: item.itemKey,
      familiar: diagnosticCorrect,
      diagnosticCorrect,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    onDone();
  };

  if (phase === 'done') {
    return (
      <article className="card card--wide">
        <h2 className="jp">{item.form}</h2>
        <p className="muted">Recorded. It stays in your personal library even if you later forget it.</p>
      </article>
    );
  }

  return (
    <article className="card card--wide">
      <p className="eyebrow">Today&rsquo;s lesson</p>
      <h2 className="jp vocab-word">{item.form}</h2>
      <p className="muted">
        <span className="jp">{item.reading}</span> — {item.english}
      </p>

      {phase === 'teach' ? (
        <div className="button-row">
          <button type="button" className="button" onClick={() => setPhase('recall')}>
            I&rsquo;ve read it — test recall
          </button>
          <button
            type="button"
            className="button button--ghost"
            disabled={busy}
            onClick={() => setDiagnostic(true)}
            title="Self-report only; a one-question check decides whether it stays familiar"
          >
            I already know this
          </button>
        </div>
      ) : (
        <>
          <p>Now recall its meaning or reading without looking above.</p>
          <input
            className="quiz-input"
            value={answer}
            maxLength={80}
            onChange={(event) => setAnswer(event.target.value)}
            aria-label="Recall answer"
            placeholder="type a meaning or reading…"
          />
          <div className="button-row quiz-actions">
            <button
              type="button"
              className="button"
              disabled={busy || answer.trim().length === 0}
              onClick={() => void introduce()}
            >
              {busy ? 'Recording…' : 'Finish introduction'}
            </button>
            <span className="muted">
              A failed first recall still counts as an introduction — that is honest.
            </span>
          </div>
        </>
      )}

      {diagnostic && (
        <div className="quiz-feedback">
          <strong>Quick check: do you already know what this word means?</strong>
          <span className="muted">A wrong answer returns it to the normal lesson queue.</span>
          <div className="button-row">
            <button
              type="button"
              className="button button--small"
              disabled={busy}
              onClick={() => void familiar(true)}
            >
              Yes, I know it
            </button>
            <button
              type="button"
              className="button button--ghost button--small"
              disabled={busy}
              onClick={() => void familiar(false)}
            >
              Not yet
            </button>
          </div>
        </div>
      )}

      {error !== null && <p className="error">{error}</p>}
    </article>
  );
}

export function VocabularyPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  const lesson = useAsync(useCallback(() => window.kotoba.learning.getLesson(), []));
  const library = useAsync(
    useCallback(
      () => window.kotoba.learning.getLibrary({ text: query, offset: 0, limit: 100 }),
      [query],
    ),
  );
  const detail = useAsync(
    useCallback(
      () =>
        detailId === null
          ? Promise.resolve({ ok: true as const, data: null })
          : window.kotoba.learning.getDetail({ itemId: detailId }),
      [detailId],
    ),
  );
  const reloadLibrary = library.reload;

  useEffect(() => {
    void reloadLibrary();
  }, [lesson.state.status, reloadLibrary]);

  const reload = () => {
    void lesson.reload();
    void library.reload();
  };

  const current =
    lesson.state.status === 'ready'
      ? lesson.state.data.items.find((item) => item.itemKey === selected) ?? lesson.state.data.items[0]
      : undefined;

  const personal: readonly VocabularyLibraryItem[] =
    library.state.status === 'ready' ? library.state.data.items : [];
  const visible = personal;

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Personal library</p>
          <h1>Vocabulary</h1>
          <p className="muted">
            A small, stable set of new words each day. Words are counted once, when you finish the
            first study and recall step — not when a page is opened.
          </p>
        </div>
        {lesson.state.status === 'ready' && <Summary summary={lesson.state.data.summary} />}
      </header>

      {lesson.state.status === 'ready' && lesson.state.data.summary.due > 40 && (
        <article className="card card--wide card--notice">
          <h2>Review load is high</h2>
          <p className="muted">
            {lesson.state.data.summary.due} word cards are due. Clear some reviews before adding more
            new words — this is a suggestion, not a change to your goal.
          </p>
        </article>
      )}

      {lesson.state.status === 'error' && <p className="error">{lesson.state.error}</p>}
      {lesson.state.status === 'loading' && <p className="muted">Loading today&rsquo;s lesson…</p>}

      {current !== undefined && <LessonCard item={current} onDone={reload} />}

      {lesson.state.status === 'ready' && lesson.state.data.items.length > 1 && (
        <article className="card card--wide">
          <h2>Remaining today</h2>
          <div className="chip-row">
            {lesson.state.data.items.map((item) => (
              <button
                key={item.itemKey}
                type="button"
                className={item.itemKey === current?.itemKey ? 'chip chip--on' : 'chip'}
                onClick={() => setSelected(item.itemKey)}
              >
                <span className="jp">{item.form}</span>
              </button>
            ))}
          </div>
        </article>
      )}

      <article className="card card--wide">
        <h2>My words</h2>
        <label className="field">
          <span>Filter personal words</span>
          <input
            type="search"
            value={query}
            maxLength={80}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="spelling, reading or meaning…"
          />
        </label>
        {library.state.status === 'error' && <p className="error">{library.state.error}</p>}
        {libraryError !== null && <p className="error">{libraryError}</p>}
        {library.state.status === 'ready' && visible.length === 0 && (
          <p className="muted">No personal words yet. Finish a lesson introduction to add one.</p>
        )}
        {visible.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Word</th>
                  <th scope="col">Reading</th>
                  <th scope="col">Meaning</th>
                  <th scope="col">Status</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => (
                  <tr key={item.itemKey}>
                    <th scope="row" className="jp">{item.form}</th>
                    <td className="jp">{item.reading}</td>
                    <td>{item.english}</td>
                    <td>{item.introducedAt === null ? 'Familiar (self-report)' : 'Introduced'}</td>
                    <td>
                      <button
                        type="button"
                        className="button button--ghost button--small"
                        onClick={() => setDetailId(item.itemKey)}
                      >
                        Details
                      </button>
                      {item.introducedAt === null && (
                        <button
                          type="button"
                          className="button button--ghost button--small"
                          onClick={() =>
                            void window.kotoba.learning
                              .scheduleFamiliar({ itemId: item.itemKey, eventId: crypto.randomUUID() })
                              .then((result) => {
                                if (!result.ok) setLibraryError(result.error.message);
                              })
                          }
                        >
                          Schedule early review
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      {detail.state.status === 'ready' && detail.state.data !== null && (
        <article className="card card--wide">
          <h2>Word detail</h2>
          <h3 className="jp">{detail.state.data.form}</h3>
          <p className="muted">
            <span className="jp">{detail.state.data.reading}</span> — {detail.state.data.english}
          </p>
          <h3>Senses</h3>
          <ul>
            {detail.state.data.senses.map((sense, index) => (
              <li key={`${sense}-${index}`}>{sense}</li>
            ))}
          </ul>
          <h3>Skills</h3>
          <div className="chip-row">
            {detail.state.data.skills.map((skill) => (
              <span className="pill" key={skill.skill}>
                {skill.skill}: {skill.state} · {skill.reps} reps · {skill.lapses} lapses
              </span>
            ))}
          </div>
          <h3>History</h3>
          {detail.state.data.history.length === 0 ? (
            <p className="muted">No reviews recorded yet.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th scope="col">When</th><th scope="col">Rating</th><th scope="col">Hint</th></tr>
                </thead>
                <tbody>
                  {detail.state.data.history.slice(0, 10).map((row, index) => (
                    <tr key={`${row.reviewedAt}-${index}`}>
                      <td>{row.dayKey}</td><td>{row.rating}</td><td>{row.hintUsed ? 'yes' : 'no'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <h3>Notes</h3>
          <textarea
            className="quiz-input"
            value={notes || detail.state.data.notes}
            maxLength={4000}
            onChange={(event) => setNotes(event.target.value)}
            aria-label="Personal notes"
          />
          <div className="button-row">
            <button
              type="button"
              className="button button--small"
              onClick={() => {
                void window.kotoba.learning
                  .setNotes({ itemId: detail.state.data!.itemKey, notes })
                  .then(() => detail.reload());
              }}
            >
              Save notes
            </button>
          </div>
        </article>
      )}
      {detail.state.status === 'error' && <p className="error">{detail.state.error}</p>}
    </section>
  );
}
