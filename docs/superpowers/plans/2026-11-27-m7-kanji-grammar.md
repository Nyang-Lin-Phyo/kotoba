# M7 Kanji and Grammar Implementation Plan

> Implement task-by-task with failing tests first.

**Goal:** Add kanji learned from the user's introduced words with recognition checks, and a small original prerequisite-ordered grammar curriculum with persisted exercises.

**Architecture:** Migration v5 stores personal kanji/grammar progress; pure rules define encounter/verified and prerequisites; services read the bundled dictionary and original curriculum JSON; renderer adds two routes.

**Tech Stack:** TS strict, React 19, Vitest, existing SQLite/IPC.

**Spec:** docs/superpowers/specs/2026-11-27-m7-kanji-grammar-design.md

## Global Constraints
- No new dependencies, no git commits, no copied curriculum, no JLPT claims.
- Strict TS/Zod IPC, parameterized SQL, bounded queries.
- graphify targeted navigation and update after source changes.

## Review Focus
- Encountered vs verified kept separate; no fake mastery; prerequisites respected; original content only; missing dictionary data shown honestly.

---

## Task 1 — Migration and repositories
**Files:** migration 005, repositories/kanjiProgress.ts, repositories/grammarProgress.ts, tests/integration/m7Migration.test.ts.
- Failing tests: v4→v5 preserves data; upsert kanji progress; attempt append; grammar progress unique per unit; profile isolation.
- Implement, GREEN.

## Task 2 — Pure rules
**Files:** src/shared/kanjiRules.ts, src/shared/grammarRules.ts, tests/unit/kanjiRules.test.ts, tests/unit/grammarRules.test.ts.
- Kanji verified rule and interval ladder; grammar prerequisite/unlock rule. RED→GREEN.

## Task 3 — Original grammar content
**Files:** data/curriculum/grammar_units.json, src/shared/grammarData.ts, tests/unit/grammarData.test.ts.
- ~6 reviewed beginner units with examples and answer keys; tests for shape, prerequisites, no cycles, answer validity.

## Task 4 — Services and IPC
**Files:** services/kanjiStudy.ts, services/grammarStudy.ts, contracts/schemas/ipc/preload, tests/integration/m7Services.test.ts.
- Kanji from introduced vocabulary with dictionary lookup; submit attempt; grammar units with progress and prerequisites. RED→GREEN.

## Task 5 — Renderer and metrics
- /kanji list + quiz, /grammar unit list + lesson/exercises, nav/routes, Dashboard/Profile counts.

## Task 6 — Verification and docs
- CDP live checks, lint/typecheck/tests, package, docs.
