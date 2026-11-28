# M7 — Kanji from vocabulary and original grammar units

Date: 2026-11-27
Status: proposed, awaiting approval.

## Intent

Give the learner their first real kanji and grammar study: kanji drawn from words they have already
introduced (not an isolated kanji list), with recognition checks that keep "encountered" separate
from "verified"; plus a small, original, prerequisite-ordered grammar curriculum with exercises and
persisted progress.

## Decisions

- Kanji data comes from the bundled dictionary's `kanji`, `kanji_readings` and `entry_kanji` tables. No new dictionary source, no stroke-order SVGs in this build (optional in AGENTS.md).
- Migration v5 adds `user_kanji` (profile, literal, encounter day, status, due day, interval, reps, lapses), `kanji_attempts`, `grammar_progress` and `grammar_attempts`. Kanji scheduling uses a documented simple interval ladder (`kanji-interval-v1`), not FSRS; FSRS remains for word cards.
- Kanji "encountered" = appears in an introduced word. "Verified recognition" = two unhinted correct answers on two different study days, latest correct, interval ≥7 days. Unknown readings/meanings are displayed honestly as "not listed in the bundled dictionary".
- Grammar content is an original committed JSON file with about six beginner units, each with prerequisites, explanation, examples (Japanese, reading, English), and multiple-choice exercises with answer keys and rationales. No copied textbook content; source notes name it as original.
- Prerequisites gate unit availability; completing exercises persists progress. No JLPT claims.
- Two new routes: `/kanji`, `/grammar`. Dashboard/Profile show real counts and next actions.

## Non-goals

Stroke animation, KanjiVG, sentence mining, reading/listening/speaking modules (M8), copying commercial curricula, JLPT level claims, FSRS for kanji.

## Constraints

- Strict TS, Zod IPC, sender checks, `Result`, parameterized SQL, bounded queries.
- Japanese content must be checked for correctness; original material only, with attribution stating origin.
- graphify targeted navigation; `graphify update .` after source changes; no git commits.
