# Unslop audit — M7 kanji and grammar screens

Screen family: new `/kanji` and `/grammar` routes inside the existing app shell.

## Audit of the existing design language

- `src/renderer/styles/global.css`: one tinted neutral ramp (`#0e1013` → `#e8eaf0`), one blue accent, three text roles, hairline borders. No hue gradients, glows, gradient text, blobs or colored shadows. Pass.
- `src/renderer/components/Sidebar.tsx`: lucide line icons at 16px, one icon column, sentence-case labels, muted milestone badges that say "planned", no emoji. Pass.
- Existing pages use the shared `.card`, `.page`, `.table` classes. No greeting headlines, exclamation marks or hype copy found. Pass.
- Two small refinements worth making while adding the new screens: keep Japanese examples in `--font-jp` at a larger size than UI text, and use quiet mono text for counts/status instead of pills.

Verdict: no meaningful slop in the shell. This is "keep the brand, polish mode", not a redesign.

## Direction

- **Product.** Kotoba builds Japanese literacy offline; these screens turn a learner's own words into kanji recognition practice and sequence original grammar lessons.
- **Character.** calm, exact, a little warm — a study desk, not a dashboard.
- **World.** Paper dictionary and index cards: ink, hairline rules, a blue pencil accent.
- **Moments.** One per screen: the large kanji cell with its source word, and the grammar example sentence set in Japanese type. No generated images.
- **Signature.** A small "unhinted" marker beside verified items, consistent everywhere status is shown.

All spacing on the existing 4px scale, existing radius values, no new dependencies.
