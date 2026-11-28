import { useCallback } from 'react';
import { todayInZone } from '../../../shared/date';
import { Link } from 'react-router-dom';
import { useAsync } from '../../lib/useAsync';
import { useProfile } from '../../lib/profileContext';

/** Shared, real counts for kanji discovered from words and original grammar units. */
export function M7Summary() {
  const { state: profileState } = useProfile();
  const kanji = useAsync(useCallback(() => window.kotoba.kanji.list(), []));
  const grammar = useAsync(useCallback(() => window.kotoba.grammar.list(), []));

  if (kanji.state.status === 'error' || grammar.state.status === 'error') {
    const message = kanji.state.status === 'error' ? kanji.state.error : grammar.state.error;
    return (
      <article className="card card--wide">
        <h2>Kanji and grammar</h2>
        <p className="error">{message}</p>
        <button type="button" className="button button--ghost button--small" onClick={() => { kanji.reload(); grammar.reload(); }}>
          Retry
        </button>
      </article>
    );
  }

  if (kanji.state.status !== 'ready' || grammar.state.status !== 'ready') {
    return (
      <article className="card card--wide">
        <h2>Kanji and grammar</h2>
        <p className="muted">Loading progress…</p>
      </article>
    );
  }

  const characters = kanji.state.data;
  const units = grammar.state.data;
  const verified = characters.filter((item) => item.verified).length;
  const complete = units.filter((unit) => unit.status === 'completed').length;
  const nextUnit = units.find((unit) => unit.status === 'available' || unit.status === 'in-progress');
  const today = todayInZone(profileState.profile.timezone, Date.now());
  const nextKanji = characters
    .filter((item) => item.dueDay !== null && item.dueDay <= today && !item.verified)
    .toSorted((a, b) => (a.dueDay ?? '').localeCompare(b.dueDay ?? ''))[0];

  return (
    <article className="card card--wide">
      <h2>Kanji and grammar</h2>
      <dl className="details">
        <div>
          <dt>Kanji encountered / verified recognition</dt>
          <dd className="mono">{characters.length} / {verified}</dd>
        </div>
        <div>
          <dt>Grammar units complete</dt>
          <dd className="mono">{complete} of {units.length}</dd>
        </div>
      </dl>
      <p className="muted">
        {nextKanji === undefined
          ? 'No kanji review is due right now.'
          : `Next kanji due: ${nextKanji.literal} from ${nextKanji.wordContext}.`}{' '}
        {nextUnit === undefined
          ? 'Every available grammar unit is complete.'
          : `Next lesson: ${nextUnit.title}.`}
      </p>
      <div className="button-row">
        <Link className="button button--ghost button--small" to="/kanji">Open Kanji</Link>
        <Link className="button button--ghost button--small" to="/grammar">Open Grammar</Link>
      </div>
    </article>
  );
}
