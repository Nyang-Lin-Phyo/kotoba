import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { passages } from '../../../shared/readingData';
import { useAsync } from '../../lib/useAsync';

/** Real immersion state: queued items and the next passage, with no invented counts. */
export function M8Summary() {
  const queue = useAsync(
    useCallback(() => window.kotoba.immersionStudy.queue({ offset: 0, limit: 50 }), []),
  );
  const count = useAsync(useCallback(() => window.kotoba.immersionStudy.queueCount(), []));
  if (queue.state.status !== 'ready' || count.state.status !== 'ready') {
    return (
      <article className="card card--wide">
        <h2>Immersion</h2>
        <p className="muted">Loading queue…</p>
      </article>
    );
  }
  return (
    <article className="card card--wide">
      <h2>Immersion</h2>
      <dl className="details">
        <div>
          <dt>Words in mining queue</dt>
          <dd className="mono">{count.state.data}</dd>
        </div>
        <div>
          <dt>Reading passages available</dt>
          <dd className="mono">{passages.length}</dd>
        </div>
      </dl>
      <p className="muted">
        {queue.state.data.length > 0
          ? `Next queued word: ${queue.state.data[0]?.snapshot.canonicalForm ?? ''}`
          : 'Paste Japanese text or import a local subtitle file to begin.'}
      </p>
      <div className="button-row">
        <Link className="button button--ghost button--small" to="/immersion">Open Immersion</Link>
        <Link className="button button--ghost button--small" to="/reading">Read a passage</Link>
      </div>
    </article>
  );
}
