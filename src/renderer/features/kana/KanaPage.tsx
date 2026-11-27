import { useEffect, useState } from 'react';
import type { KanaScript } from '../../../shared/contracts';
import { KanaChart } from './KanaChart';
import { KanaQuiz } from './KanaQuiz';
import { useKanaCatalog, useKanaReviewQueue, useKanaSummary } from './useKana';

export function KanaPage({ script }: { script: KanaScript }) {
  const catalog = useKanaCatalog();
  const summary = useKanaSummary();
  const queue = useKanaReviewQueue();
  const [selectedId, setSelectedId] = useState('');

  const groups =
    catalog.state.status === 'ready'
      ? catalog.state.data.filter((group) => group.script === script)
      : [];
  const items = groups.flatMap((group) => group.items);
  const firstId = items[0]?.id;

  useEffect(() => {
    if (selectedId === '' && firstId !== undefined) setSelectedId(firstId);
  }, [firstId, selectedId]);

  if (catalog.state.status === 'error') {
    return (
      <section className="page">
        <p className="error">{catalog.state.error}</p>
        <button type="button" className="button" onClick={catalog.reload}>
          Try again
        </button>
      </section>
    );
  }

  if (catalog.state.status === 'loading' || summary.state.status !== 'ready' || selectedId === '') {
    return (
      <section className="page">
        <p className="muted">Loading kana…</p>
      </section>
    );
  }

  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  if (selected === undefined) {
    return (
      <section className="page">
        <p className="error">The kana catalogue is empty.</p>
      </section>
    );
  }

  const basicCount = items.filter((item) => item.tier === 'basic').length;
  const stats = summary.state.data;
  // The review queue spans both scripts; only offer characters from this page.
  const scriptIds = new Set(items.map((item) => item.id));
  const reviewItems = (queue.state.status === 'ready' ? queue.state.data : []).filter((item) =>
    scriptIds.has(item.kanaId),
  );
  const dueIds = new Set(reviewItems.filter((item) => !item.failedToday).map((item) => item.kanaId));

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">{script === 'hiragana' ? 'Hiragana ひらがな' : 'Katakana カタカナ'}</p>
          <h1>{script === 'hiragana' ? 'Hiragana' : 'Katakana'}</h1>
          <p className="muted">
            {basicCount} basic characters available offline. Romaji is a temporary hint: turn it
            off when you want to test recall.
          </p>
        </div>
        <span className="pill">
          {stats.verified} verified · {stats.learning} learning · {stats.due} due
        </span>
      </header>

      {reviewItems.length > 0 && (
        <article className="card card--wide card--notice">
          <h2>Review queue</h2>
          <p className="muted">
            {reviewItems.length} character{reviewItems.length === 1 ? '' : 's'} due or missed today.
            Start the timer first if this is deliberate study time.
          </p>
          <div className="chip-row">
            {reviewItems.slice(0, 12).map((item) => (
              <button
                key={item.kanaId}
                type="button"
                className={item.kanaId === selected.id ? 'chip chip--on' : 'chip'}
                onClick={() => setSelectedId(item.kanaId)}
              >
                <span className="jp">{item.character}</span> · {item.reading}
              </button>
            ))}
            {reviewItems.length === 0 && <span className="muted">Nothing is due right now.</span>}
          </div>
        </article>
      )}

      <div className="kana-layout">
        <article className="card">
          <h2>Character chart</h2>
          <KanaChart
            groups={groups}
            statuses={stats.statuses}
            dueIds={dueIds}
            selectedId={selected.id}
            onSelect={setSelectedId}
          />
        </article>

        <div className="kana-practice">
          <KanaQuiz item={selected} choices={items} onAnswered={() => {
            void summary.reload();
            void queue.reload();
          }} />
        </div>
      </div>
    </section>
  );
}
