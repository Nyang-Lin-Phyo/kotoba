import { useEffect, useState } from 'react';

import type { KanaGroup, KanaScript } from '../../../shared/kanaData';
import { kanaRomaji } from '../../../shared/kanaRomaji';

type Props = {
  readonly script: KanaScript;
  readonly groups: readonly KanaGroup[];
};

export function KanaReference({ script, groups }: Props) {
  const [voiceAvailable, setVoiceAvailable] = useState(false);

  useEffect(() => {
    const update = () => {
      setVoiceAvailable(
        typeof speechSynthesis !== 'undefined' &&
          speechSynthesis
            .getVoices()
            .some((voice) => voice.lang.toLowerCase().startsWith('ja')),
      );
    };
    update();
    if (typeof speechSynthesis === 'undefined') return;
    speechSynthesis.addEventListener('voiceschanged', update);
    return () => speechSynthesis.removeEventListener('voiceschanged', update);
  }, []);

  const speak = (text: string) => {
    if (!voiceAvailable) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ja-JP';
    speechSynthesis.speak(utterance);
  };

  return (
    <article className="card card--wide">
      <h2>Sound chart</h2>
      <p className="muted">
        {script === 'hiragana' ? 'Hiragana' : 'Katakana'} sounds, in teaching order. This is a
        reference — nothing here is scored. Use Learn when you want to practise.
      </p>
      <div className="reference-groups">
        {groups.map((group) => (
          <section key={group.id} className="reference-group">
            <h3>{group.label}</h3>
            <div className="reference-grid">
              {group.items.map((item) => (
                <div className="reference-cell" key={item.id}>
                  <span className="jp reference-character">{item.character}</span>
                  <span className="reference-romaji">{kanaRomaji(item.reading)}</span>
                  {voiceAvailable && (
                    <button
                      type="button"
                      className="button button--ghost button--small"
                      onClick={() => speak(item.reading)}
                      aria-label={`Hear ${item.reading}`}
                    >
                      Listen
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}
