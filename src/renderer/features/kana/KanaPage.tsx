import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { KanaScript } from '../../../shared/contracts';
import { KanaLearn } from './KanaLearn';
import { KanaReference } from './KanaReference';
import { KanaReviewSession } from './KanaReviewSession';
import { KanaTutorial } from './KanaTutorial';
import { useKanaCatalog, useKanaReviewQueue, useKanaSummary } from './useKana';

type Tab = 'learn' | 'reference' | 'review';

export function KanaPage({ script }: { readonly script: KanaScript }) {
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>(searchParams.get('view') === 'review' ? 'review' : 'learn');
  const catalog = useKanaCatalog();
  const summary = useKanaSummary();
  const queue = useKanaReviewQueue();
  const tutorialKey = `kotoba:kana-tutorial:${script}`;
  const [tutorialOpen, setTutorialOpen] = useState(() => localStorage.getItem(tutorialKey) === null);

  const reload = useCallback(() => {
    void summary.reload();
    void queue.reload();
  }, [summary.reload, queue.reload]);

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

  if (summary.state.status === 'error') {
    return (
      <section className="page">
        <p className="error">{summary.state.error}</p>
        <button type="button" className="button" onClick={summary.reload}>
          Try again
        </button>
      </section>
    );
  }

  if (catalog.state.status === 'loading' || summary.state.status !== 'ready') {
    return (
      <section className="page">
        <p className="muted">Loading kana…</p>
      </section>
    );
  }

  const groups = catalog.state.data.filter((group) => group.script === script);
  const stats = summary.state.data;
  const scriptIds = new Set(groups.flatMap((group) => group.items.map((item) => item.id)));
  const reviewItems =
    queue.state.status === 'ready'
      ? queue.state.data.filter((item) => scriptIds.has(item.kanaId))
      : [];

  const closeTutorial = () => {
    localStorage.setItem(tutorialKey, '1');
    setTutorialOpen(false);
  };

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">{script === 'hiragana' ? 'Hiragana ひらがな' : 'Katakana カタカナ'}</p>
          <h1>{script === 'hiragana' ? 'Hiragana' : 'Katakana'}</h1>
          <p className="muted">
            Learn new sounds, check them in the chart, or finish a short review queue.
          </p>
        </div>
        <div className="header-actions">
          <span className="pill">
            {stats.verified} verified · {stats.due} due
          </span>
          <button type="button" className="button button--ghost button--small" onClick={() => setTutorialOpen(true)}>
            Show tutorial
          </button>
        </div>
      </header>

      <div className="tab-row" role="tablist" aria-label="Kana study modes">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'learn'}
          className={tab === 'learn' ? 'tab tab--active' : 'tab'}
          onClick={() => setTab('learn')}
        >
          Learn
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'reference'}
          className={tab === 'reference' ? 'tab tab--active' : 'tab'}
          onClick={() => setTab('reference')}
        >
          Sound chart
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'review'}
          className={tab === 'review' ? 'tab tab--active' : 'tab'}
          onClick={() => setTab('review')}
        >
          Review{reviewItems.length > 0 ? ` (${reviewItems.length})` : ''}
        </button>
      </div>

      {tab === 'learn' && (
        <KanaLearn
          key={`learn-${script}`}
          script={script}
          groups={groups}
          statuses={stats.statuses}
          onAnswered={reload}
        />
      )}

      {tab === 'reference' && <KanaReference script={script} groups={groups} />}

      {tab === 'review' &&
        (queue.state.status === 'error' ? (
          <article className="card card--wide">
            <h2>Review queue unavailable</h2>
            <p className="error">{queue.state.error}</p>
            <button type="button" className="button" onClick={queue.reload}>
              Try again
            </button>
          </article>
        ) : reviewItems.length === 0 ? (
          <article className="card card--wide">
            <h2>Nothing to review</h2>
            <p className="muted">
              No characters of this script are due or missed right now. Use Learn to practise new
              ones, then come back.
            </p>
          </article>
        ) : (
          <KanaReviewSession
            key={`review-${script}`}
            script={script}
            items={reviewItems}
            onAnswered={reload}
          />
        ))}

      {tutorialOpen && <KanaTutorial onClose={closeTutorial} />}
    </section>
  );
}
