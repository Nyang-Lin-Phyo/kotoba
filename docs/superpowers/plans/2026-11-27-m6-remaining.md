# M6 Remaining Work Implementation Plan

> For agentic workers: implement task-by-task with failing tests first.

**Goal:** Finish manual external logs with corrections, workload guidance and opt-in JSON/CSV export.

**Architecture:** Migration v4 stores logs and append-only corrections; pure rules decide deliberate minutes and workload suggestions; services own transactions; main opens the native save dialog for exports.

**Tech Stack:** TS strict, React 19, Electron dialog, Vitest, existing SQLite.

**Spec:** docs/superpowers/specs/2026-11-27-m6-remaining-design.md

## Global Constraints
- No new deps, no git commits, strict TS/Zod/IPC, parameterized SQL.
- No silent corrections; passive logs never count toward the 120-minute goal.
- graphify targeted navigation; graphify update after source changes.

## Review Focus
- Undo/correction history preserved; deliberate-only minutes; no arbitrary path writes; privacy opt-in; workload never edits goals.

---

## Task 1 — Migration and repositories
**Files:** `src/main/database/migrations/004_immersion.ts`, `repositories/immersion.ts`, `tests/integration/immersion.test.ts`.
- Write failing tests: upgrade v3→v4 preserves data; insert/list logs; correction appends audit row and updates log in one transaction; profile isolation.
- Implement migration + repository, GREEN.

## Task 2 — Pure rules and serializers
**Files:** `src/shared/workloadRules.ts`, `src/shared/export.ts`, `tests/unit/workloadRules.test.ts`, `tests/unit/export.test.ts`.
- Tests: due threshold suggestion; JSON valid; CSV escaped; notes excluded by default.
- Implement, GREEN.

## Task 3 — Services and IPC
**Files:** `src/main/services/immersion.ts`, `src/main/services/progressExport.ts`, contracts/schemas/ipc/preload, `tests/integration/immersionService.test.ts`.
- Tests: manual log writes day-key; passive excluded from daily minutes; correction atomic; export payload validation.
- Implement; export uses `dialog.showSaveDialog` with fixed extension allowlist.

## Task 4 — Renderer
- Dashboard: manual log card (duration, activity, title, notes, deliberate/passive), recent logs with correction action, workload suggestion.
- Settings: export card with format, notes opt-in, privacy prompt.

## Task 5 — Verification and docs
- CDP live checks, lint/typecheck/tests, package, docs.

