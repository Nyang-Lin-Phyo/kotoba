import { useState } from 'react';

const STEPS = [
  {
    title: 'Learn',
    body: 'A short session gives you new characters plus a few you have seen before. Type the sound in romaji or kana. Finishing a session is practice, not mastery.',
  },
  {
    title: 'Sound chart',
    body: 'A reference of every character in teaching order with its romaji. Nothing here is scored — come back whenever you need to check a sound.',
  },
  {
    title: 'Review',
    body: 'Review is a short queue of characters that are due or were missed. It has a start and a finish screen, so you always know when you are done.',
  },
] as const;

export function KanaTutorial({ onClose }: { readonly onClose: () => void }) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];

  return (
    <div className="tutorial-backdrop" role="presentation">
      <article className="card tutorial-card" role="dialog" aria-modal="true" aria-label="Kana guide">
        <p className="eyebrow">First time here</p>
        <h2>{current.title}</h2>
        <p>{current.body}</p>
        <p className="muted">
          Hints are allowed, but an answer with a hint never counts toward verified recognition.
        </p>
        <div className="button-row">
          <button
            type="button"
            className="button button--ghost button--small"
            onClick={onClose}
          >
            Skip
          </button>
          <button
            type="button"
            className="button"
            onClick={() => (step + 1 === STEPS.length ? onClose() : setStep(step + 1))}
          >
            {step + 1 === STEPS.length ? 'Start learning' : 'Next'}
          </button>
        </div>
        <p className="muted">{step + 1} of {STEPS.length}</p>
      </article>
    </div>
  );
}
