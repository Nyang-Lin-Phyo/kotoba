import { useCallback, useState } from 'react';
import type { AnalysisDTO, MinedItemDTO, TokenDTO } from '../../../shared/contracts';
import { useAsync } from '../../lib/useAsync';

const FUNCTION_POS = new Set(['助詞', '助動詞', '記号', 'SPACE', '空白']);

function isFunctionToken(token: TokenDTO): boolean {
  return FUNCTION_POS.has(token.pos);
}

function tokenClass(token: TokenDTO): string {
  if (isFunctionToken(token)) return 'token';
  if (token.entryId === null) {
    return 'token token--unknown';
  }
  if (token.knownReading && token.knownMeaning) return 'token token--known';
  if (token.knownReading || token.knownMeaning) return 'token token--learning';
  return 'token token--unseen';
}

function contextSentence(text: string, surface: string): string {
  const parts = text.split(/(?<=[。！？!?\n])/u);
  const match = parts.find((part) => part.includes(surface));
  return (match ?? parts[0] ?? '').trim().slice(0, 500);
}

function statusLabel(token: TokenDTO): string {
  if (isFunctionToken(token)) return 'Not counted in coverage';
  if (token.entryId === null) return 'Unknown / unmapped';
  if (token.knownReading && token.knownMeaning) return 'Known by both skills';
  if (token.knownReading || token.knownMeaning) return 'Learning';
  return 'Unseen in your library';
}

function Coverage({ analysis }: { readonly analysis: AnalysisDTO }) {
  const { coverage } = analysis;
  const rows = [
    ['Eligible content tokens', coverage.eligible],
    ['Known by both skills', coverage.known],
    ['Learning one skill', coverage.learning],
    ['Unseen', coverage.unseen],
    ['Unmapped / unknown', coverage.unknown],
    ['Excluded particles and symbols', coverage.excludedFunctionTokens],
    ['Other POS tags', coverage.otherTokens],
  ] as const;

  return (
    <article className="card card--wide">
      <h2>Coverage</h2>
      <dl className="details">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd className="mono">{value}</dd>
          </div>
        ))}
        <div>
          <dt>Reading / meaning coverage</dt>
          <dd className="mono">
            {(coverage.readingCoverage * 100).toFixed(0)}% / {(coverage.meaningCoverage * 100).toFixed(0)}%
          </dd>
        </div>
      </dl>
      <ul className="status-key">
        <li><span className="key-line key-line--known" /> known</li>
        <li><span className="key-line key-line--learning" /> learning</li>
        <li><span className="key-line key-line--unseen" /> unseen</li>
        <li><span className="key-line key-line--unknown" /> unmapped</li>
      </ul>
      <p className="muted">{coverage.denominatorNote}</p>
      <p className="muted footnote">
        Dictionary {analysis.dictionaryRelease || 'unknown'} · tokenizer {analysis.tokenizerVersion}
      </p>
    </article>
  );
}

export function ImmersionPage() {
  const queue = useAsync(useCallback(() => window.kotoba.immersionStudy.queue({ offset: 0, limit: 50 }), []));
  const [text, setText] = useState('');
  const [title, setTitle] = useState('Pasted text');
  const [analysis, setAnalysis] = useState<AnalysisDTO | null>(null);
  const [selected, setSelected] = useState<TokenDTO | null>(null);
  const [candidate, setCandidate] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const analyze = async () => {
    setBusy(true);
    setNotice(null);
    const result = await window.kotoba.immersionStudy.analyze({
      text, title, sourceName: '', kind: 'paste',
    });
    setBusy(false);
    if (!result.ok) {
      setNotice(result.error.message);
      return;
    }
    setAnalysis(result.data);
    setSelected(null);
  };

  const importFile = async () => {
    setBusy(true);
    setNotice(null);
    const result = await window.kotoba.immersionStudy.importFile();
    setBusy(false);
    if (!result.ok) {
      setNotice(result.error.message);
      return;
    }
    if (result.data === null) {
      setNotice('Import cancelled.');
      return;
    }
    setAnalysis(result.data);
    setSelected(null);
    if (result.data.mediaId === '') setNotice('Preview only — nothing was saved yet.');
  };

  const savePreview = async () => {
    if (analysis === null) return;
    setBusy(true);
    setNotice(null);
    const result = await window.kotoba.immersionStudy.analyze({
      text: analysis.sourceText, title: analysis.title, sourceName: '', kind: analysis.kind,
    });
    setBusy(false);
    if (!result.ok) {
      setNotice(result.error.message);
      return;
    }
    setAnalysis(result.data);
    setNotice('Imported text saved to your local library.');
  };

  const mine = async () => {
    if (selected === null || selected.entryId === null) return;
    const choice = selected.candidates[candidate];
    if (choice === undefined) return;
    setBusy(true);
    setNotice(null);
    const result = await window.kotoba.immersionStudy.mine({
      eventId: crypto.randomUUID(),
      entryId: choice.id,
      reading: choice.reading || selected.basicForm,
      sentence: contextSentence(analysis?.sourceText ?? '', selected.surface),
      sourceTitle: analysis?.title ?? '',
      sourceType: analysis?.kind === 'subtitle' || analysis?.kind === 'text' ? 'subtitle' : 'paste',
    });
    setBusy(false);
    if (!result.ok) {
      setNotice(result.error.message);
      return;
    }
    setNotice(result.data.mined
      ? `Added ${choice.canonicalForm} to the mining queue`
      : result.data.capReached
        ? 'Daily mining cap reached; queued words remain untouched'
        : 'Already in your queue — nothing was added twice');
    queue.reload();
  };

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Immersion</h1>
          <p className="muted">
            Paste Japanese text or import a local subtitle file. Tokenization is offline and
            approximate; tap a word to look it up and add it to your mining queue.
          </p>
        </div>
      </header>

      <article className="card card--wide">
        <h2>Text to study</h2>
        <label className="field">
          <span>Title</span>
          <input type="text" maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="field">
          <span>Japanese text</span>
          <textarea
            className="immersion-input"
            lang="ja"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="猫が すきです。"
          />
        </label>
        <div className="button-row">
          <button type="button" className="button" disabled={busy || text.trim().length === 0} onClick={() => void analyze()}>
            Analyze text
          </button>
          <button type="button" className="button button--ghost" disabled={busy} onClick={() => void importFile()}>
            Import file
          </button>
        </div>
        {notice !== null && <p className="muted">{notice}</p>}
      </article>

      {analysis !== null && (
        <>
          <article className="card card--wide">
            <h2>{analysis.title}</h2>
            <p className="token-line" lang="ja">
              {analysis.tokens.map((token) => (
                <button
                  type="button"
                  key={token.position}
                  className={tokenClass(token)}
                  title={statusLabel(token)}
                  aria-pressed={selected?.position === token.position}
                  onClick={() => { setSelected(token); setCandidate(0); }}
                >
                  {token.surface}
                </button>
              ))}
            </p>
            <p className="muted footnote">{analysis.tokens.length} tokens from the offline tokenizer</p>
            {analysis.mediaId === '' && (
              <div className="button-row">
                <button type="button" className="button" disabled={busy} onClick={() => void savePreview()}>
                  Save this import
                </button>
              </div>
            )}

            {selected !== null && (
              <div className="quiz-block">
                <h3>{selected.basicForm || selected.surface}</h3>
                <p className="muted">{statusLabel(selected)} · {selected.pos}</p>
                {selected.candidates.length === 0 ? (
                  <p className="muted">No dictionary entry matched this token. Nothing has been invented.</p>
                ) : (
                  <>
                    <ul className="candidate-list">
                      {selected.candidates.map((entry, index) => (
                        <li key={entry.id}>
                          <label className="lesson-choice">
                            <input
                              type="radio"
                              name="mine-candidate"
                              checked={candidate === index}
                              onChange={() => setCandidate(index)}
                            />
                            <span lang="ja">{entry.canonicalForm}</span>
                            <span className="muted"> {entry.reading} — {entry.english}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                    <div className="button-row">
                      <button type="button" className="button" disabled={busy} onClick={() => void mine()}>
                        Add to mining queue
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </article>

          <Coverage analysis={analysis} />
        </>
      )}

      <article className="card card--wide">
        <h2>Mining queue</h2>
        {queue.state.status === 'loading' && <p className="muted">Loading queue…</p>}
        {queue.state.status === 'error' && (
          <p className="error">{queue.state.error} <button type="button" className="button button--ghost button--small" onClick={queue.reload}>Retry</button></p>
        )}
        {queue.state.status === 'ready' && queue.state.data.length === 0 && (
          <p className="muted">Nothing queued yet. Mined items never double-count as introduced words.</p>
        )}
        {queue.state.status === 'ready' && queue.state.data.length > 0 && (
          <ul className="source-list">
            {queue.state.data.map((item: MinedItemDTO) => (
              <li key={item.id}>
                <span lang="ja">{item.snapshot.canonicalForm}</span>
                <span className="muted"> — {item.sentence} · {item.sourceTitle}</span>{' '}
                <button
                  type="button"
                  className="button button--ghost button--small"
                  disabled={busy}
                  onClick={() => {
                    void window.kotoba.immersionStudy.dismiss({ id: item.id }).then((result) => {
                      if (result.ok) queue.reload();
                      else setNotice(result.error.message);
                    });
                  }}
                >
                  Dismiss
                </button>
              </li>
            ))}
          </ul>
        )}
      </article>
    </section>
  );
}
