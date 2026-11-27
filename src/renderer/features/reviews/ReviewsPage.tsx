import { useCallback, useEffect, useRef, useState } from 'react';
import type { RatingInput, ReviewQueueItem } from '../../../shared/contracts';
import { useAsync } from '../../lib/useAsync';

const RATINGS: readonly { readonly value: 1 | 2 | 3 | 4; readonly label: string }[] = [
  { value: 1, label: 'Again' },
  { value: 2, label: 'Hard' },
  { value: 3, label: 'Good' },
  { value: 4, label: 'Easy' },
];

export function ReviewsPage() {
  const queue = useAsync(
    useCallback(() => window.kotoba.reviews.getQueue(), []),
  );
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [hint, setHint] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastRatedId, setLastRatedId] = useState<string | null>(null);
  const startedAt = useRef(Date.now());

  const items: readonly ReviewQueueItem[] =
    queue.state.status === 'ready' ? queue.state.data.items : [];
  const current = items[index];

  useEffect(() => {
    setRevealed(false);
    setHint(false);
    startedAt.current = Date.now();
  }, [current?.cardId]);

  const rate = async (rating: 1 | 2 | 3 | 4) => {
    if (current === undefined || busy) return;
    setBusy(true);
    setFeedback(null);
    // The queue DTO does not expose scheduler state; fetch the exact state first.
    const card = await window.kotoba.reviews.getCard({ cardId: current.cardId });
    if (!card.ok || card.data === null) {
      setBusy(false);
      setFeedback(card.ok ? 'Card not found.' : card.error.message);
      return;
    }
    const input: RatingInput = {
      cardId: current.cardId,
      rating,
      expectedStateJson: card.data.stateJson,
      responseMs: Math.min(600_000, Date.now() - startedAt.current),
      hintUsed: hint,
      eventId: crypto.randomUUID(),
    };
    const result = await window.kotoba.reviews.submitRating(input);
    setBusy(false);
    if (!result.ok) {
      if (result.error.code === 'CONFLICT' && result.error.data !== undefined) {
        setFeedback(result.error.message + ' The refreshed card is loaded; try again.');
      } else {
        setFeedback(result.error.message);
      }
      return;
    }
    setFeedback(result.data.correct ? 'Recorded — correct.' : 'Recorded — again.');
    setLastRatedId(current.cardId);
    setIndex((value) => value + 1);
    void queue.reload();
  };

  const undo = async () => {
    const target = lastRatedId;
    if (target === null) {
      setFeedback('There is no rating in this session to undo.');
      return;
    }
    setBusy(true);
    const result = await window.kotoba.reviews.undoLast({
      cardId: target,
      eventId: crypto.randomUUID(),
    });
    setBusy(false);
    setFeedback(result.ok ? 'Last review undone; prior state restored.' : result.error.message);
    if (result.ok) setLastRatedId(null);
    void queue.reload();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
      if (event.key === ' ' && !revealed) {
        event.preventDefault();
        setRevealed(true);
      }
      if (revealed && ['1', '2', '3', '4'].includes(event.key)) {
        void rate(Number(event.key) as 1 | 2 | 3 | 4);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [revealed, busy, current, hint, lastRatedId]);

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Spaced repetition</p>
          <h1>Reviews</h1>
          <p className="muted">
            Due word cards first. Ratings are recorded atomically; undo restores the earlier state and
            keeps an audit record.
          </p>
        </div>
        {queue.state.status === 'ready' && (
          <span className="pill">
            {items.length} in this session · {queue.state.data.remaining} still due
          </span>
        )}
      </header>

      {queue.state.status === 'error' && <p className="error">{queue.state.error}</p>}
      {queue.state.status === 'loading' && <p className="muted">Loading due reviews…</p>}

      {current !== undefined && (
        <article className="card card--wide quiz">
          <p className="eyebrow">
            {current.skill === 'meaning' ? 'Meaning recall' : 'Reading recall'} · {current.lapses} lapses
          </p>
          <h2 className="jp quiz-character">{current.form}</h2>

          {!revealed ? (
            <>
              <p className="muted">
                {current.skill === 'meaning' ? 'What does this word mean?' : 'How is this read?'}
              </p>
              <div className="button-row">
                <button type="button" className="button" onClick={() => setRevealed(true)}>
                  Reveal answer
                </button>
                <span className="muted">Press Space to reveal</span>
              </div>
            </>
          ) : (
            <>
              <p className="quiz-answer">
                <span className="jp">{current.reading}</span> — {current.english}
              </p>
              <div className="chip-row">
                {RATINGS.map((rating) => (
                  <button
                    key={rating.value}
                    type="button"
                    className="button"
                    disabled={busy}
                    onClick={() => void rate(rating.value)}
                  >
                    {rating.label} ({rating.value})
                  </button>
                ))}
              </div>
              <label className="checkbox-row">
                <input type="checkbox" checked={hint} onChange={(event) => setHint(event.target.checked)} />
                <span>I used a hint (recorded, never counts as verified)</span>
              </label>
              <div className="button-row quiz-actions">
                <button
                  type="button"
                  className="button button--ghost button--small"
                  disabled={busy}
                  onClick={() => void undo()}
                >
                  Undo last rating
                </button>
                <span className="muted">Keys 1–4 rate; hints only affect the metric.</span>
              </div>
            </>
          )}

          {feedback !== null && <p className="muted">{feedback}</p>}
        </article>
      )}

      {queue.state.status === 'ready' && items.length === 0 && (
        <article className="card card--wide">
          <h2>Nothing due</h2>
          <p className="muted">
            No word review cards are due right now. Finish today&rsquo;s vocabulary lesson to add
            cards, or come back later. Kana review stays on its separate Hiragana/Katakana pages.
          </p>
        </article>
      )}
    </section>
  );
}
