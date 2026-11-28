import { useEffect, useState } from 'react';
import { passages, type ReadingPassage } from '../../../shared/readingData';

function useJapaneseVoices(): readonly SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<readonly SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    const update = () => {
      setVoices(
        typeof speechSynthesis === 'undefined'
          ? []
          : speechSynthesis.getVoices().filter((voice) => /^ja/i.test(voice.lang)),
      );
    };
    update();
    speechSynthesis?.addEventListener('voiceschanged', update);
    return () => speechSynthesis?.removeEventListener('voiceschanged', update);
  }, []);
  return voices;
}

function ListeningLesson({ passage, voices }: {
  readonly passage: ReadingPassage;
  readonly voices: readonly SpeechSynthesisVoice[];
}) {
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [showTranscript, setShowTranscript] = useState(true);
  const [choice, setChoice] = useState<Record<string, number>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const play = () => {
    if (voices.length === 0 || typeof speechSynthesis === 'undefined') return;
    speechSynthesis.cancel();
    setPlaying(true);
    for (const line of passage.lines) {
      const utterance = new SpeechSynthesisUtterance(line.japanese);
      utterance.lang = voices[0]?.lang ?? 'ja-JP';
      utterance.voice = voices[0] ?? null;
      utterance.rate = speed;
      utterance.onend = () => {
        if (!speechSynthesis.speaking) setPlaying(false);
      };
      speechSynthesis.speak(utterance);
    }
  };

  const stop = () => {
    speechSynthesis?.cancel();
    setPlaying(false);
  };

  const answer = async (exerciseId: string) => {
    const answerIndex = choice[exerciseId];
    if (answerIndex === undefined) return;
    setBusy(true);
    const result = await window.kotoba.immersionStudy.comprehension({
      eventId: crypto.randomUUID(), skill: 'listening', materialId: passage.id,
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
      {voices.length === 0 ? (
        <p className="muted">
          No Japanese voice is installed on this computer, so audio playback is unavailable. The
          transcript and comprehension questions still work; nothing is downloaded and no offline
          voice is promised.
        </p>
      ) : (
        <div className="field-row">
          <label className="field">
            <span>Playback speed</span>
            <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
              <option value={0.75}>0.75× slower</option>
              <option value={1}>1× normal</option>
              <option value={1.25}>1.25× faster</option>
            </select>
          </label>
          <div className="quiz-actions">
            <button type="button" className="button" disabled={playing} onClick={play}>Play passage</button>
            <button type="button" className="button button--ghost" disabled={!playing} onClick={stop}>Stop</button>
          </div>
        </div>
      )}
      <div className="button-row">
        <button type="button" className="button button--ghost button--small" aria-pressed={showTranscript} onClick={() => setShowTranscript((value) => !value)}>
          {showTranscript ? 'Hide transcript' : 'Show transcript'}
        </button>
      </div>
      {showTranscript && (
        <div className="passage-lines" lang="ja">
          {passage.lines.map((line, index) => (
            <div className="passage-line" key={`${passage.id}-${index}`}>
              <span className="passage-kana">{line.kana}</span>
              <span className="passage-jp">{line.japanese}</span>
            </div>
          ))}
        </div>
      )}

      <div className="quiz-block">
        <h3>Listening comprehension</h3>
        {passage.exercises.map((exercise) => (
          <div className="exercise" key={exercise.id}>
            <p>{exercise.prompt}</p>
            <div className="lesson-choices" role="radiogroup" aria-label={exercise.prompt}>
              {exercise.choices.map((option, index) => (
                <label className="lesson-choice" key={`${exercise.id}-${index}`}>
                  <input
                    type="radio"
                    name={`${exercise.id}-listening`}
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

export function ListeningPage() {
  const voices = useJapaneseVoices();
  const [selected, setSelected] = useState<string | null>(null);
  const passage = passages.find((item) => item.id === selected);

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Listening</h1>
          <p className="muted">
            Play an original passage with an installed Japanese voice, then answer comprehension
            questions. Playback starts only when you press play.
          </p>
        </div>
        <p className="mono page-count">{voices.length} Japanese voice{voices.length === 1 ? '' : 's'}</p>
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
        <ListeningLesson passage={passage} voices={voices} />
      )}
    </section>
  );
}
