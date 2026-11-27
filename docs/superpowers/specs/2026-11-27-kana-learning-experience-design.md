# Kana learning experience — approved design

Date: 2026-11-27
Status: approved in conversation; implementation follows.

## Why

The installed app exposed three UX failures: the onboarding preview could not be scrolled to its
footer on a short window; the Hiragana page mixed reference, quiz and review in one ambiguous screen;
and "Review characters" merely selected a character without any session or finish state. The user
asked for Duolingo-inspired structure: learn new characters while reinforcing earlier ones, use real
hiragana-only vocabulary, and keep a separate place that teaches what each kana sounds like.

## Decisions

- Wizard: flex column with normal page scrolling and a reachable footer; preview table gets bounded scroll.
- Kana pages keep their existing routes (`/hiragana`, `/katakana`) but gain two tabs: **Learn** and **Sound chart**.
- Learn session: 5 new items from the current basic group plus 3 randomly chosen earlier items of the same script. Each step is a typing quiz using existing `kana.submitAttempt`. Hints remain optional and logged; only unhinted correct answers feed the existing 3-correct/2-day mastery rule.
- Finish state says **Practice complete**, never "mastered"; it reports how many were correct and suggests what to review.
- Sound chart is reference only: large characters, romaji via WanaKana, optional audio when a Japanese voice exists, no quiz.
- Small original hiragana-only example words (e.g. あい, いえ, ねこ) appear after answers. They are committed original curriculum data, not invented dictionary entries.
- Review becomes a bounded session: up to 10 due/missed characters of the selected script, a `2 of 7` counter, the same typing interaction, and a **Review complete** screen with what to revisit.
- First visit shows a short dismissible tutorial explaining Learn / Sound chart / Review and that hints do not count as verified. A "Show tutorial" button reopens it. The seen flag is UI-only local state, never authoritative learning data.
- Dashboard "Review N kana characters" links to the review tab with a query parameter.

## Non-goals

- No change to FSRS, word lessons, dictionary, kanji/grammar modules, or the mastery rule.
- No copying of Duolingo content, branding, audio or exercises; only structural inspiration.
- No new dependency or install.

## Constraints

- Electron 45, React 19, TypeScript strict, existing IPC and Zod validation unchanged.
- Use targeted graphify queries for navigation; verify actual source before edits; run `graphify update .` after source changes.
- No git add/commit/push. User runs CI.
