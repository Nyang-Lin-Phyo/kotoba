import { useCallback, useEffect, useState } from 'react';
import type { DictionaryKanji } from '../../../shared/contracts';
import { useAsync } from '../../lib/useAsync';
import { useDictionaryEntry, useDictionarySearch } from './useDictionary';

export function DictionaryPage() {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [kanji, setKanji] = useState<DictionaryKanji | null>(null);
  const search = useDictionarySearch(query);
  const { entry, error: entryError } = useDictionaryEntry(selectedId);
  const metadata = useAsync(
    useCallback(() => window.kotoba.dictionary.metadata(), []),
  );

  useEffect(() => {
    setKanji(null);
  }, [selectedId]);

  const showKanji = async (literal: string) => {
    const result = await window.kotoba.dictionary.getKanji({ id: literal });
    setKanji(result.ok ? result.data : null);
  };

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Offline reference</p>
          <h1>Dictionary</h1>
          <p className="muted">
            Search Japanese spelling, reading or English meaning. Romaji and katakana are normalized
            for lookup; the original spelling is kept for display.
          </p>
        </div>
        {metadata.state.status === 'ready' && (
          <span className="pill">
            {metadata.state.data.entryCount.toLocaleString()} words ·{' '}
            {metadata.state.data.kanjiCount.toLocaleString()} kanji
          </span>
        )}
      </header>

      <article className="card card--wide">
        <label className="field">
          <span>Search</span>
          <input
            type="search"
            className="dictionary-input"
            value={query}
            maxLength={80}
            placeholder="猫, ねこ, neko, cat…"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        {search.status === 'error' && <p className="error">{search.error}</p>}
        {search.status === 'loading' && <p className="muted">Searching…</p>}
        {search.status === 'ready' && query.trim().length === 0 && (
          <p className="muted">Type at least one character to search the local dictionary.</p>
        )}
        {search.status === 'ready' && query.trim().length > 0 && search.data?.length === 0 && (
          <p className="muted">No matching entries in the bundled dictionary.</p>
        )}

        {search.status === 'ready' && search.data !== null && search.data.length > 0 && (
          <div className="dictionary-results" role="list">
            {search.data.map((result) => (
              <button
                key={result.id}
                type="button"
                role="listitem"
                className={
                  result.id === selectedId
                    ? 'dictionary-result dictionary-result--selected'
                    : 'dictionary-result'
                }
                onClick={() => setSelectedId(result.id)}
              >
                <span className="jp dictionary-word">{result.canonicalForm}</span>
                <span className="muted">{result.reading}</span>
                <span className="dictionary-gloss">{result.english}</span>
                {result.curriculumRank !== null && <span className="pill">starter {result.curriculumRank}</span>}
              </button>
            ))}
          </div>
        )}
      </article>

      {entryError !== null && <p className="error">{entryError}</p>}
      {entry !== null && (
        <article className="card card--wide">
          <h2 className="jp dictionary-detail-title">{entry.canonicalForm}</h2>
          <dl className="details">
            <div>
              <dt>Readings</dt>
              <dd className="jp">{entry.readings.map((reading) => reading.text).join(' · ')}</dd>
            </div>
            <div>
              <dt>Other spellings</dt>
              <dd className="jp">
                {entry.forms.length === 0 ? '—' : entry.forms.map((form) => form.text).join(' · ')}
              </dd>
            </div>
            <div>
              <dt>Meanings</dt>
              <dd>
                {entry.senses.map((sense) => (
                  <span key={sense.english}>
                    {sense.english}{' '}
                    {sense.partOfSpeech !== '' && (
                      <span className="muted">({sense.partOfSpeech})</span>
                    )}
                    <br />
                  </span>
                ))}
              </dd>
            </div>
          </dl>

          {entry.kanji.length > 0 && (
            <>
              <h3>Kanji in this word</h3>
              <div className="chip-row">
                {entry.kanji.map((literal) => (
                  <button
                    key={literal}
                    type="button"
                    className="chip"
                    onClick={() => void showKanji(literal)}
                  >
                    <span className="jp">{literal}</span>
                  </button>
                ))}
              </div>
              {kanji !== null && (
                <div className="kanji-detail">
                  <p>
                    <span className="jp">{kanji.literal}</span> — {kanji.meanings || 'no meaning listed'}
                  </p>
                  <p className="muted">
                    {kanji.strokes === null ? '' : `${kanji.strokes} strokes · `}
                    {kanji.grade === null ? '' : `grade ${kanji.grade} · `}
                    {kanji.readings.map((reading) => `${reading.type}: ${reading.reading}`).join(' · ')}
                  </p>
                </div>
              )}
            </>
          )}

          {metadata.state.status === 'ready' && (
            <p className="muted">
              Data: EDRDG JMdict/KANJIDIC2, CC BY-SA 4.0. See Settings → Sources for full attribution.
              No example sentences or audio are bundled.
            </p>
          )}
        </article>
      )}
    </section>
  );
}
