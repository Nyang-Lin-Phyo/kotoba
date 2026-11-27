# M5b/M5c Vocabulary and FSRS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the offline dictionary into a stable daily vocabulary lesson with a personal library, then add FSRS reviews and honest knowledge metrics.

**Architecture:** Migration v3 adds per-profile vocabulary, saved daily item assignments, full FSRS card state and append-only review logs. Pure modules own teaching-choice, selection, queue ordering and metric rules. Services own transactions; main owns FSRS. Renderer uses typed IPC only.

**Tech Stack:** TypeScript 6 strict, Electron 45 `node:sqlite`, `ts-fsrs@6.0.1` (FSRS-7, Node ≥24), Zod 4.6.7, React 19, Vitest 5, Python 3.12 stdlib pipeline.

**Spec:** `docs/superpowers/specs/2026-11-27-m5b-m5c-vocabulary-fsrs-design.md` — read with this plan.

## Global Constraints

- Never run `git add`, `commit`, `push`, or install packages. `ts-fsrs@6.0.1` is installed by the user.
- Two separately tested phases: M5b (Tasks 1–5) then M5c (Tasks 6–7). Do not blur their tests.
- `ts-fsrs` v6 API is async: `await DefaultScheduler()`, `newCard({ now })`, `review({ card, grade, now })`, `preview({ card, now })`. Do not use deprecated top-level helpers.
- Every successful mutation commits before UI reports success; renderer never owns counters.
- Strict TS, Zod payload per channel, sender check, `Result` envelope, parameterized SQL, bounded pagination.
- Word identity is the stable dictionary entry id; two skills (`meaning`, `reading`) per item, counted once.
- Migration v1/v2 are immutable; add v3 only. Profile rows keyed by `profile_id`; no cross-database FKs.
- After any task changing source files, run `graphify update .`; use targeted graphify queries, never load the whole graph.
- No Windows installer run here; the user runs CI after acceptance.

## Review Focus

| Risk | Pinning test |
|---|---|
| Alternate spelling or repeated request counts a word twice | Task 4 integration: duplicate event + twice-requested introduction produce one item |
| Unhinted mastery counted from a hinted/choice answer | Task 3 unit: metric rules ignore hinted ratings; Task 7 integration |
| Stale card state overwrites newer review state | Task 6 integration: conflicting `scheduler_state_json` returns CONFLICT with refreshed card |
| Undo deletes history instead of recording a reversal | Task 6 integration: undo appends reversal log and restores prior state exactly |
| Teaching a reading invalid for the chosen spelling or a slang-only sense | Task 1 Python test + Task 3 unit teaching-choice test |

---

## Task 1 — Dictionary register tags and restrictions (M5a extension)

**Files:** Modify `scripts/build_dictionary.py`, `scripts/validate_dictionary.py`, `src/shared/contracts.ts`, `src/main/services/dictionary.ts`; extend `tests/python/test_pipeline.py`, `tests/integration/dictionarySearch.test.ts`; rebuild `resources/dictionaries/dictionary.db`.
**Interfaces:** Consumes M5a assets; produces `sense_tags(sense_key, tag)` in dictionary.db and `DictionaryEntry.senses[].tags`, `forms[].restrictedTo`, `readings[].appliesTo`, `senses[].appliesToForms/Readings` DTO fields.

- [ ] **Step 1: Write failing Python tests** asserting sense `misc` tags are stored (fixture gets a `vuln`/`slang` sense), restriction tables round-trip, and the validator rejects a DB missing `sense_tags`.
- [ ] **Step 2: Run to verify failure**, then extend the builder schema/insertion and validator.
- [ ] **Step 3: Run Python tests**, rebuild the real DB, run `validate --require-production`, and record new counts/size.
- [ ] **Step 4: Write a failing TS integration test** that `getEntry` exposes tags and restriction arrays; implement the DTO/repository change; run PASS.
- [ ] **Step 5: Repackage once** and confirm the larger DB is still bundled. Run `graphify update .`.

## Task 2 — Migration v3

**Files:** Create `src/main/database/migrations/003_vocabulary.ts`; modify `migrations/index.ts`; create `tests/integration/migration003.test.ts`.
**Interfaces:** Produces schema version 3 and the tables listed in the spec.

- [ ] **Step 1: Write a failing upgrade test** seeding a v2 database with a profile, goal, plan and kana progress, then upgrading. Assert: version 3, all new tables exist, old rows unchanged, backup hook called once, second migrate is a no-op, FK/cascade behaviour.
- [ ] **Step 2: Run to verify failure**, implement the immutable migration, run PASS. Record migration version in `docs/PROGRESS.md` later.

## Task 3 — Pure learning rules

**Files:** Create `src/shared/vocabularyRules.ts`, `tests/unit/vocabularyRules.test.ts`.
**Interfaces:**
- Consumes `DictionaryEntry` DTO and `DateKey`.
- Produces `chooseTeaching(entry): { form, reading, sense } | null`, `selectNewItems(assigned, introduced, familiar, goal)`, `orderReviewQueue(cards, nowMs)`, `classifyWord(facts)`, `isVerifiedRecognition(facts)`, `accuracy(facts[])`.

- [ ] **Step 1: Write failing tests** for: first common form with a compatible reading; skip when no unrestricted non-slang sense exists; fallback to first common reading; stable selection order; introduced/familiar exclusion; queue ordering (most overdue → lapses → stable id); verified requires both skills, two distinct days, latest success, ≥7-day interval; hinted/choice ratings never verify; struggling per word; accuracy window definition.
- [ ] **Step 2: Run to verify failure**, implement pure functions, run PASS.

## Task 4 — Repositories and learning service (M5b)

**Files:** Create `src/main/database/repositories/{vocabulary,reviewCards}.ts`, `src/main/services/learning.ts`; extend `tests/integration/learning.test.ts` (new).
**Interfaces:**
- Consumes Task 3 rules, dictionary service, `transaction`.
- Produces `getLesson()`, `introduceWord({ itemId, eventId })`, `setFamiliar(...)`, `scheduleFamiliar(...)`, `getLibrary(...)`, `getSummary()`.

- [ ] **Step 1: Write failing integration tests** with a temporary DB and a stub dictionary entry: lesson stable across reload; 15 slots respect goal; introduction creates one item + two cards + one event; duplicate event id and second introduction are no-ops/CONFLICT; familiar item excluded and not introduced; diagnostic false clears the flag; library search reflects only personal items; profile isolation; summary counts reconcile.
- [ ] **Step 2: Run to verify failure**, implement repositories/services with atomic transactions and snapshots.
- [ ] **Step 3: Run tests** PASS; `graphify update .`.

## Task 5 — M5b IPC and renderer

**Files:** Modify `src/shared/{contracts,schemas}.ts`, `src/main/ipc.ts`, `src/preload/preload.ts`, `src/shared/nav.ts`, `src/renderer/App.tsx`, Dashboard/Profile pages, CSS; create `src/renderer/features/vocabulary/*`.
**Interfaces:** Consumes Task 4 service; produces ready `/vocabulary` route and real new-word/due metrics.

- [ ] **Step 1: Define DTOs/schemas** for lesson, library query, familiar input and summary; add all `learning.*` channels with bounded limits.
- [ ] **Step 2: Build the Vocabulary page**: today's lesson with teaching step then recall step, introduce button enabled only after recall attempted; searchable personal library; detail with two skill cards, snapshot, notes, history; familiar flag with the one-question diagnostic and opt-in early review.
- [ ] **Step 3: Wire Dashboard/Profile**: real introduced/new-word count, due count from word cards only, separate kana due number, next action, metric tooltips; keep honest zeros for unimplemented modules.
- [ ] **Step 4: Run lint/typecheck/test**, live CDP check that a lesson is stable across reload and introduction counts once, `graphify update .`.

## Task 6 — FSRS review service (M5c)

**Files:** Create `src/main/services/reviews.ts`; extend `src/shared/{contracts,schemas}.ts`, `src/main/ipc.ts`, `src/preload/preload.ts`; create `tests/unit/fsrsRules.test.ts`, `tests/integration/reviews.test.ts`.
**Interfaces:** Consumes reviewCards repository and `ts-fsrs`; produces `getQueue`, `getCard`, `submitRating`, `undoLast`.

- [ ] **Step 1: Write failing deterministic unit tests** with an injected `now`: new card creation, all four ratings, due date and interval from a pinned card, `desiredRetention` bounds, card JSON round-trip (dates revive), and no rescheduling of existing cards on config change.
- [ ] **Step 2: Write failing integration tests**: rating writes card + log + event atomically; duplicate event id idempotent; stale state returns CONFLICT with refreshed card; undo restores prior state and appends a reversal; Again requeues per scheduler; session limit; profile isolation.
- [ ] **Step 3: Run to verify failure**, implement with `await DefaultScheduler({ desiredRetention: 0.90, enableFuzz: false, enableShortTerm: true })` and injected clock; never mutate stored card objects in place.
- [ ] **Step 4: Run tests** PASS; `graphify update .`.

## Task 7 — M5c IPC and renderer

**Files:** Modify `src/shared/nav.ts`, `src/renderer/App.tsx`, TopBar/Settings, CSS; create `src/renderer/features/reviews/*`.
**Interfaces:** Consumes Task 6 DTOs; produces ready `/reviews` route.

- [ ] **Step 1: Add `reviews.*` channels** with schemas for rating, event id, response time and hint flag; expose through preload.
- [ ] **Step 2: Build the Reviews page**: queue progress, prompt → reveal → Again/Hard/Good/Easy, keyboard shortcuts, response timing, hint logging, undo, empty/error states, 20-card session cap with honest remaining-due display. No autoplay audio.
- [ ] **Step 3: Add per-profile desired retention** (0.80–0.95) to preferences UI with an explanation that existing cards are not rescheduled.
- [ ] **Step 4: Wire Dashboard due/reviewsCompleted actuals** from real logs; run lint/typecheck/test; `graphify update .`.

## Task 8 — Live verification and documentation

**Files:** Modify `docs/PROGRESS.md`, `docs/ARCHITECTURE.md`, `README.md`, `THIRD_PARTY_LICENSES.md` if needed.
**Interfaces:** Consumes all previous tasks.

- [ ] **Step 1: Start the dev app** with remote debugging: introduce a word through the lesson, verify one count and two cards in `profile.db`, reload and confirm stability, rate a review, undo, and confirm Dashboard/Profile numbers reconcile.
- [ ] **Step 2: Verify migration v3 live** on the existing dev profile: pre-migration backup, profile/goals/kana state intact.
- [ ] **Step 3: Package** and confirm the rebuilt dictionary and app load from `file://` with production CSP and no Node leaks.
- [ ] **Step 4: Record results** with exact commands/outputs, phase statuses, schema version, limitations and next step. Do not claim Windows CI ran.
