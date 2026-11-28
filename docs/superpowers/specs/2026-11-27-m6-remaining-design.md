# M6 remaining work — manual logs, workload, export

Date: 2026-11-27
Status: proposed, awaiting approval.

## Intent

Finish the rest of AGENTS.md M6: manual external immersion logs with auditable corrections, a
sustainable review-workload plan, and optional JSON/CSV progress export behind a privacy prompt.
Timer segmentation, crash recovery and idle/suspend handling already exist from M4 and need only
verification, not a rewrite.

## Decisions

- Migration v4 adds `immersion_logs` (profile_id, day_key, started_at, duration_seconds, activity_type, title, notes, deliberate/passive) and append-only `immersion_corrections` (log_id, changed_at, reason, before_json, after_json). Corrections never silently overwrite history.
- `immersion.logExternal`, `immersion.correct`, `immersion.list` channels with Zod validation and bounded pagination.
- Only `deliberate = 1` logs contribute to measured daily minutes; passive exposure is displayed separately and never counted toward the 120-minute goal.
- Workload rule (`workload-v1`): when due word reviews exceed twice the configured/derived daily review allocation, Dashboard shows an honest suggestion to reduce new words; it never changes goals automatically.
- Export: pure serializers for JSON and CSV in `src/shared/export.ts`; main opens a native save dialog (renderer never supplies a path), validates extension, and writes the file. UI shows a privacy prompt with an explicit "include personal notes" checkbox, default off. No cloud upload.
- Manual-log UI lives on Dashboard as a compact card, not a new Immersion route (M8 owns the full immersion module).

## Non-goals

Timer rewrite, new FSRS features, kanji/grammar/media modules, automatic quota changes, cloud sync, app-open streaks.

## Constraints

- Strict TS, Zod IPC, sender check, `Result`, parameterized SQL, transactions for log+correction.
- No new dependencies; strict offline behavior; no data leaves the machine except the user's own export.
- graphify targeted queries; `graphify update .` after source changes; no git commits.
