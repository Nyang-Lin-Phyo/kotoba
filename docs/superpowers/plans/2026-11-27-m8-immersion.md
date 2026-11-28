# M8 Implementation Plan

> Implement task-by-task with failing tests first.

**Goal:** Offline text immersion: tokenize, look up, mine, read with comprehension, optional voice/shadowing, and honest coverage.

**Architecture:** Migration v6 stores mined items, user media, cached tokens and comprehension attempts. Kuromoji runs in main; dictionary entries resolve through the existing read-only dictionary service. Renderer uses speechSynthesis/MediaRecorder only with user action.

**Tech Stack:** TS strict, React 19, Vitest, Electron dialog, node:sqlite, kuromoji 0.1.2.

**Spec:** docs/superpowers/specs/2026-11-27-m8-immersion-design.md

## Global Constraints
- No installs by the agent; user installs kuromoji and @types/kuromoji.
- No remote content in privileged windows, no OCR, no cloud, no copied media/subtitles.
- Strict TS/Zod IPC, parameterized SQL, bounded input, graphify update after source changes.
- No git commits.

## Review Focus
- No double counting between mining queue and introduced words; unknown tokens visible; coverage denominator documented; passive time excluded; graceful no-voice/no-mic states.

---

## Task 1 — Dependencies and assets
**Files:** package.json (by user install), scripts/copy_tokenizer_dict.mjs, forge.config.mts, .gitignore, resources/notices, CI.
- Verify installed versions; copy IPADIC `.dat.gz` to resources/tokenizer/dict; bundle as extraResource; add Apache-2.0 and IPADIC notices; CI copies before build; generated assets ignored.

## Task 2 — Migration and repositories
**Files:** migration 006, repositories/minedItems.ts, repositories/media.ts, repositories/comprehension.ts, tests/integration/m8Migration.test.ts.
- RED: v5→v6 preserves data; mined dedupe/idempotency; media ownership; token cache; attempts. Implement, GREEN.

## Task 3 — Pure rules and original content
**Files:** shared/coverageRules.ts, shared/subtitle.ts, data/curriculum/reading_passages.json, shared/readingData.ts, tests.
- RED→GREEN: coverage denominator/status; SRT/ASS parsers with bounds and malformed input; four reviewed passages and answer keys.

## Task 4 — Tokenizer, services and IPC
**Files:** services/tokenizer.ts, services/immersionStudy.ts, services/mediaImport.ts, contracts/schemas/ipc/preload, tests/integration/m8Services.test.ts.
- Kuromoji built from bundled dict; token → dictionary entry resolution; mine with cap/dedupe; coverage computation; native subtitle import; listening/reading attempts. RED→GREEN.

## Task 5 — Renderer and metrics
- `/immersion` paste → tokenized text → lookup → mine queue; `/reading` passages + comprehension; `/listening` voice check + transcript; `/speaking` shadowing with optional local recording. Nav routes enabled; Dashboard/Profile counts. Unslop direction: keep existing quiet design language, Japanese text as the one rich moment.

## Task 6 — Verification and docs
- CDP live checks (including network-off behaviour and voice fallback), lint/typecheck/tests/package, docs and final report.
