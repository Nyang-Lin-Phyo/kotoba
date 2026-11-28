import { useEffect, useRef, useState } from 'react';
import { passages, type ReadingPassage } from '../../../shared/readingData';

function ShadowingPractice({ passage }: { readonly passage: ReadingPassage }) {
  const [supported, setSupported] = useState(() =>
    typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia !== undefined,
  );
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);

  const cleanup = () => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    recorder.current = null;
  };

  useEffect(() => () => {
    cleanup();
    if (audioUrl !== null) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  const start = async () => {
    setError(null);
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = media;
      chunks.current = [];
      const next = new MediaRecorder(media);
      recorder.current = next;
      next.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data);
      };
      next.onstop = () => {
        const blob = new Blob(chunks.current, { type: next.mimeType || 'audio/webm' });
        if (audioUrl !== null) URL.revokeObjectURL(audioUrl);
        setAudioUrl(URL.createObjectURL(blob));
        cleanup();
      };
      next.start();
      setRecording(true);
    } catch {
      setSupported(false);
      setError('Microphone access is unavailable. You can still read aloud without recording.');
    }
  };

  const stop = () => {
    recorder.current?.stop();
    setRecording(false);
  };

  const remove = () => {
    if (audioUrl !== null) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
  };

  return (
    <section className="card card--wide">
      <h2>{passage.title}</h2>
      <p className="muted">
        Read each line aloud, then shadow the passage in your own voice. Recording is local only:
        nothing is uploaded, no pronunciation score is given, and you can delete the clip at any time.
      </p>
      <div className="passage-lines" lang="ja">
        {passage.lines.map((line, index) => (
          <div className="passage-line" key={`${passage.id}-${index}`}>
            <span className="passage-kana">{line.kana}</span>
            <span className="passage-jp">{line.japanese}</span>
          </div>
        ))}
      </div>

      {supported ? (
        <div className="button-row">
          <button type="button" className="button" disabled={recording} onClick={() => void start()}>
            Record my reading
          </button>
          <button type="button" className="button button--ghost" disabled={!recording} onClick={stop}>
            Stop recording
          </button>
        </div>
      ) : (
        <p className="muted">Recording is unavailable on this device. Read aloud without recording.</p>
      )}
      {error !== null && <p className="error">{error}</p>}
      {audioUrl !== null && (
        <div className="quiz-block">
          <h3>Your recording</h3>
          <audio controls src={audioUrl} aria-label="Your local recording" />
          <div className="button-row">
            <button type="button" className="button button--ghost button--small" onClick={remove}>
              Delete recording
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export function SpeakingPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const passage = passages.find((item) => item.id === selected);

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Speaking</h1>
          <p className="muted">
            Shadow short passages aloud. Optional local recording uses microphone permission and
            stays on this computer; there is no cloud upload or automatic scoring.
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
        <article className="card card--wide"><p className="muted">Choose a passage to begin.</p></article>
      ) : (
        <ShadowingPractice passage={passage} />
      )}
    </section>
  );
}
