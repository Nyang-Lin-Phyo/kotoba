import type { KanaGroup, KanaScript } from '../../../shared/kanaData';
import { kanaRomaji } from '../../../shared/kanaRomaji';
import { useJapaneseVoice } from './sound';

type Props = {
  readonly script: KanaScript;
  readonly groups: readonly KanaGroup[];
};

export function KanaReference({ script, groups }: Props) {
  const voiceAvailable = useJapaneseVoice();

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
        {script === 'hiragana' ? 'Hiragana' : 'Katakana'} sounds, in teaching order. Nothing here is
        scored — use Learn when you want to practise.
      </p>
      {!voiceAvailable && (
        <p className="card--notice">
          No Japanese voice is installed on this computer, so there is no real audio to play. The
          romaji under each character is its sound guide; the app never invents or downloads audio.
          To enable Listen buttons: Windows Settings → Time &amp; language → Language &amp; region →
          Japanese → Speech, then restart Kotoba.
        </p>
      )}
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
