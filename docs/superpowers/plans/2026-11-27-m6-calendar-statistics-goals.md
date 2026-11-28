# M6 Calendar, Statistics and Goals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task.

**Goal:** Add real Calendar and Statistics pages backed by stored activity, plus effective-dated goal editing that never rewrites history.

**Architecture:** Pure rules compute streak and completion from day facts; a repository aggregates per-day activity from source tables; services expose bounded DTOs over existing IPC; renderer adds two routes and a goal editor on Profile.

**Tech Stack:** TypeScript strict, React 19, Vitest, existing SQLite/IPC.

**Spec:** `docs/superpowers/specs/2026-11-27-m6-calendar-statistics-goals-design.md`

## Global Constraints
- No new dependencies, no git commits, no schema migration.
- No broad `any`; all IPC payloads Zod-validated; parameterized SQL.
- Dates via `src/shared/date.ts`; Monday weeks; partial months; injected clock in tests.
- graphify targeted queries; `graphify update .` after source changes.

## Review Focus
- Partial months and arbitrary dates counted correctly
- Streak excludes future days and unfinished today
- Statistics reconcile with DB records, not UI counters
- Goal edits never rewrite past targets
- Zero-data and 12+ month history views work

---

## Task 1 — Pure stats rules
**Files:** Create `src/shared/statsRules.ts`, `tests/unit/statsRules.test.ts`.
**Interfaces:** `DayFacts`, `dayComplete`, `computeStreak`, `targetToDate`.
- [ ] Write failing tests: both-goals completion; today incomplete keeps yesterday streak; future days excluded; pre-start excluded; partial month totals; zero data.
- [ ] Run RED, implement, GREEN.

## Task 2 — Daily activity repository
**Files:** Create `src/main/database/repositories/dailyActivity.ts`, `tests/integration/dailyActivity.test.ts`.
**Interfaces:** `getDailyActivity(db, profileId, from, to): Map<string, DayActivity>`.
- [ ] Write failing integration tests aggregating minutes, new words, reviews (excluding undos), kana attempts by day; parameterized range; profile isolation.
- [ ] Run RED, implement with parameterized UNION ALL queries, GREEN.

## Task 3 — Stats service and IPC
**Files:** Modify `src/shared/contracts.ts`, `src/shared/schemas.ts`, `src/main/ipc.ts`, `src/preload/preload.ts`; create `src/main/services/stats.ts`, `tests/integration/stats.test.ts`.
**Interfaces:** `planner.getCalendarDay(dayKey)`, `planner.getStats()`.
- [ ] Write failing tests for DTO shapes, bounded 12-month series, streak, definitions.
- [ ] Run RED, implement, GREEN.

## Task 4 — Calendar page
**Files:** Create `src/renderer/features/calendar/CalendarPage.tsx`; modify nav/App/CSS.
- [ ] Monday–Sunday month grid with eligible status and target/actual per day; date detail panel; error/empty states.

## Task 5 — Statistics page and goal editor
**Files:** Create `src/renderer/features/statistics/StatisticsPage.tsx`; modify `ProfilePage.tsx`, nav/App/CSS.
- [ ] Week/month/horizon charts with tooltips; goal form with effective date default tomorrow, preview, old→new, conflict handling and history table.

## Task 6 — Verification and docs
- [ ] Live CDP checks: month navigation, day detail, stats reconcile, goal edit effective tomorrow, past goals unchanged.
- [ ] Run lint/typecheck/tests with 12+ month synthetic data; update docs.
