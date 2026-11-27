# Kana Learning Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make onboarding scrollable and turn the kana pages into guided Learn, Sound chart, and bounded Review experiences with a first-time tutorial.

**Architecture:** Pure helpers choose lesson/review items from the existing catalogue and progress map; renderer components run sessions against existing `kana.submitAttempt`/`kana.reviewQueue` IPC. No database, IPC or dependency changes.

**Tech Stack:** React 19, TypeScript strict, Vitest 5, existing WanaKana dependency, CSS.

**Spec:** `docs/superpowers/specs/2026-11-27-kana-learning-experience-design.md`

## Global Constraints

- No new dependencies, no installs, no git add/commit/push.
- Existing kana IPC and the 3-correct/2-day mastery rule are unchanged.
- No authoritative learning state in localStorage; the tutorial "seen" flag is UI-only.
- Use targeted graphify queries; verify source before edits; run `graphify update .` after source changes.
- No copied Duolingo content: only structural inspiration and original curriculum text.

## Review Focus

| Risk | Pinning test |
|---|---|
| Short window hides the onboarding footer | CDP resize check on the preview step |
| Lesson mixes scripts or counts practice as mastery | unit test for `buildKanaLesson` |
| Review session has no finish state | CDP walk-through of a review session |
| Romaji display for katakana/long vowels is wrong | unit test for `toRomaji` wrapper |
| Tutorial reappears or blocks study forever | CDP first-visit + dismiss + reopen check |

---

## Task 1 — Wizard scroll fix

**Files:** Modify `src/renderer/styles/global.css`.
**Interfaces:** None.

- [ ] **Step 1: Inspect** `.boot` and `.wizard` rules; confirm the centered grid clips a tall child.
- [ ] **Step 2: Change layout** so `.boot` is a scrollable flex column and `.wizard` uses `margin: auto` with no fixed height; keep `.wizard-actions` in flow at the bottom.
- [ ] **Step 3: Bound the preview table** with a max-height and `overflow-y: auto` on `.table-wrap` inside the wizard only, not globally.
- [ ] **Step 4: Verify with CDP** at 1024x700 and 900x600: `Create profile` is reachable by scrolling and clickable; no horizontal overflow.

## Task 2 — Original word list and lesson builder

**Files:** Create `data/curriculum/kana_words.json`, `src/shared/kanaWords.ts`, `src/shared/kanaLesson.ts`, `tests/unit/kanaLesson.test.ts`.
**Interfaces:**
- `findKanaWord(character): KanaWord | undefined`
- `buildKanaLesson(args): { steps: readonly KanaLessonStep[]; groupId: string | null }`

- [ ] **Step 1: Write failing tests** for: 5 new + 3 review steps; review items come from earlier groups only; injected random is deterministic; no katakana when script is hiragana; word list entries are hiragana-only and include あい and ねこ.
- [ ] **Step 2: Run to verify failure**, then create the JSON and pure helpers.
- [ ] **Step 3: Run tests PASS**, run `graphify update .`.

## Task 3 — Learn tab

**Files:** Create `src/renderer/features/kana/KanaLearn.tsx`; modify `KanaPage.tsx`, `global.css`.
**Interfaces:** Consumes Task 2 builder and `kana.submitAttempt`.

- [ ] **Step 1: Add tabs** to `KanaPage` (`Learn`, `Sound chart`) and keep the existing chart available from the reference tab later.
- [ ] **Step 2: Build the session UI**: one step at a time, progress `3 of 8`, typed answer, hint toggle, immediate feedback, optional hiragana-only word example after a correct answer, and a `Practice complete` screen with correct count and next-action buttons.
- [ ] **Step 3: Wire attempts** via `window.kotoba.kana.submitAttempt` with a fresh `eventId`; refresh summary/queue after each answer without breaking the session.
- [ ] **Step 4: Run typecheck/lint/test** and `graphify update .`.

## Task 4 — Sound chart reference tab

**Files:** Create `src/renderer/features/kana/KanaReference.tsx`; modify `global.css`.
**Interfaces:** Consumes `KANA_GROUPS` and WanaKana `toRomaji`.

- [ ] **Step 1: Render grouped cards** with large character, romaji and reading; no quiz controls.
- [ ] **Step 2: Add a Listen button** only when `speechSynthesis.getVoices()` contains a Japanese voice; no autoplay.
- [ ] **Step 3: Verify typecheck/lint/test** and `graphify update .`.

## Task 5 — Bounded review session and tutorial

**Files:** Create `src/renderer/features/kana/KanaReviewSession.tsx`, `KanaTutorial.tsx`; modify `KanaPage.tsx`, `DashboardPage.tsx`, `global.css`.
**Interfaces:** Consumes `kana.reviewQueue`; Dashboard links with `?view=review`.

- [ ] **Step 1: Build review session** with at most 10 items, progress counter, finish screen (`Review complete`) listing characters to revisit and a retry button.
- [ ] **Step 2: Add tutorial overlay** with three steps (Learn, Sound chart, Review), dismissible; UI-only seen flag; `Show tutorial` button reopens it.
- [ ] **Step 3: Wire Dashboard link** to `/hiragana?view=review` and make `KanaPage` open the review tab from the query parameter.
- [ ] **Step 4: Run typecheck/lint/test** and `graphify update .`.

## Task 6 — Live verification and docs

**Files:** Modify `docs/PROGRESS.md`, `README.md`.

- [ ] **Step 1: Start dev app** with remote debugging and verify: wizard footer reachable at small size; Learn session completes with a finish screen; Sound chart shows romaji; Review session finishes; tutorial appears once and reopens.
- [ ] **Step 2: Package** and confirm the rebuilt app loads from `file://` with production CSP.
- [ ] **Step 3: Record results** with exact commands/outputs, limitations and next step. Do not claim Windows CI ran.
