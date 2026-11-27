import { useEffect, useState } from 'react';

/** Tracks Japanese voices; Chromium often populates them only after voiceschanged. */
export function useJapaneseVoice(): boolean {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    const update = () => {
      setAvailable(
        typeof speechSynthesis !== 'undefined' &&
          speechSynthesis.getVoices().some((voice) => voice.lang.toLowerCase().startsWith('ja')),
      );
    };
    update();
    if (typeof speechSynthesis === 'undefined') return;
    speechSynthesis.addEventListener('voiceschanged', update);
    return () => speechSynthesis.removeEventListener('voiceschanged', update);
  }, []);

  return available;
}

export function SpeakButton({
  text,
  label,
}: {
  readonly text: string;
  readonly label: string;
}) {
  const available = useJapaneseVoice();
  if (!available) return null;

  return (
    <button
      type="button"
      className="button button--ghost button--small"
      onClick={() => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ja-JP';
        speechSynthesis.speak(utterance);
      }}
    >
      {label}
    </button>
  );
}
