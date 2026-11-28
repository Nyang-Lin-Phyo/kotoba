# M6 slice 1 — Calendar, statistics and goal editing

Date: 2026-11-27
Status: proposed, awaiting approval.

## Scope

Implement the user-visible M6 pieces first: a Calendar with real daily logs, a Statistics page with
honest charts/tooltips, and an effective-dated goal editor that never rewrites history. The timer
segmentation and manual external-log work from AGENTS.md remains the next M6 slice.

## Decisions

- Two new ready routes: `/calendar` and `/statistics`. Goal editing lives on My Profile (with the goal history table), not a new route.
- New read-only service `src/main/services/stats.ts` + IPC:
  - `planner.getCalendarDay({ dayKey })` → eligible status, targets, actual minutes/words/reviews/kana attempts, curriculum position.
  - `planner.getStats()` → week days, month days, horizon progress, streak, phase, and per-day actual/target series bounded to a 12-month window.
- A `dailyActivity` repository aggregates by day from `session_segments`, `user_vocabulary`, `review_logs` (excluding undo reversals) and `kana_attempts`, parameterized by profile and date range. No frontend counters are authoritative.
- Calendar: Monday–Sunday month grid; eligible days within `[start, end)` only; target and actual shown per day; clicking a day opens a detail panel. Days before start/after horizon are visually outside the plan, never "missed".
- Statistics: week bars, month progress, horizon progress and a small daily-activities table. Every number has a tooltip stating its computation. `Stats` definitions are versioned as `stats-v1`.
- Streak rule (`streak-v1`): consecutive days where **both** daily targets were met. Today counts only if both are met; if today is incomplete, the streak shown is through yesterday and remains active until the day ends. Future days never count. Days before the start date cannot contribute.
- Goal editing: form on Profile with minutes and new words, effective date defaulting to tomorrow (today only when no study activity exists — `setGoalVersion` already enforces this). Preview shows old → new and explicitly states past days are unchanged. History table shows all versions.
- JSON/CSV export is deferred to the timer/log slice; it needs a privacy prompt and is optional in AGENTS.md.

## Non-goals

Timer segmentation, crash/idle handling, manual external logs and corrections, streak based on app-open, fake JLPT claims, changes to kana/vocabulary/review mechanics.

## Constraints

- Strict TS, Zod-validated IPC, sender check, `Result`, parameterized SQL, bounded queries.
- All date rules from `src/shared/date.ts`; no implicit UTC parsing; Monday weeks; leap years and partial months.
- Tests with injected clock and 12+ months of synthetic events; zero-data views must work.
- graphify targeted queries; `graphify update .` after source changes; no git commits.
