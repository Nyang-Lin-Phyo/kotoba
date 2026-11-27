# M4 design — kana learning and the study timer

Date: 2026-11-27
Status: **proposed** (awaiting approval)

## Intent and why

M3 produced a real profile, effective-dated goals, frozen daily plans and honest zero actuals. M4 is
the first milestone where the learner actually studies something. It must ship kana that works
offline, remembers attempts, reviews missed characters, and measures time without inventing it.
The user chose to defer the Windows installer until after M5, so M4 will be code-complete and tested
on Linux; its Windows check moves into M5.

## Goals

- Both scripts available offline: 46 basic hiragana + 46 basic katakana, plus a committed extended
  set (dakuten/handakuten, yōon, small っ, ん, katakana prolonged sound mark).
- A chart/group view, a quiz with typed answers, a hint toggle, keyboard navigation, and a "review
  missed" queue.
- A versioned, testable mastery rule: three **unhinted** correct answers on at least two distinct
  study days, with the latest unhinted attempt correct. Hints are logged but never count.
- A main-process study timer with start/pause/resume/stop, monotonic elapsed, checkpointed segments,
  midnight splitting, crash recovery and idle caps. No time is fabricated for flashcards or page
  opens.
- Real kana metrics and measured minutes on Dashboard and Profile. Actual new words and reviews
  stay at zero until M5.
- Data authored by this project; WanaKana MIT for input normalization only.

## Non-goals

- No FSRS in M4. The schema carries a `scheduler_version` so M5 can replace the simple intervals via
  a migration without discarding attempts.
- No kanji, grammar, vocabulary, dictionary, reading/listening/speaking or immersion modules.
- No stroke-order SVG assets (rights and quality unverified).
- No guaranteed audio: an audio exercise appears only if a Japanese voice actually exists; otherwise
  it is hidden gracefully.
- No manual immersion logs or goal-editing UI (M6).
- No Windows build in M4 (moved to M5 by user decision).

## Constraints carried from earlier milestones

- Electron 45.5.0 / Node 24.22.3, `node:sqlite`, Zod-validated IPC returning `Result`, strict TS,
  preload-only bridge, CSP unchanged.
- Migration v1 already exists and may have been applied to a real dev database. Adding v2 must be an
  append-only migration that upgrades an existing v1 file, triggers the pre-migration backup hook,
  and never rewrites existing rows.
- Theme and preferences live in SQLite; learning data must never live in `localStorage`.
- Profile day keys are `YYYY-MM-DD` in the profile's timezone; event instants are UTC ISO strings.
- Sidebar entries currently mark Hiragana/Katakana as `planned` with milestone M4.
- No installs by the agent: WanaKana must be installed by the user.

## Approaches considered

| Approach | Trade-off | Decision |
|---|---|---|
| Simple kana intervals + main-owned timer (chosen) | One extra migration in M5 to swap schedulers; M4 stays small and shippable | **Chosen by user** |
| FSRS from M4 | One scheduler for everything, but pulls M5 work forward and blocks kana on a runtime compatibility check | Rejected |
| Quizzes with no spaced review | Smallest, but fails "review of missed characters" in M4 acceptance | Rejected |

The timer has only one workable design: the main process owns the clock. A renderer timer cannot
survive suspension or be trusted as the authoritative record.

## Data

`data/curriculum/kana.json` — committed, original, no external licence. Each item has a stable id
(`h-a`, `k-a`, `h-ga`, `k-kya`, …), script, tier (`basic`/`extended`), group, character, kana reading,
and an optional original example phrase with English meaning. 46 basic characters per script plus
extended sets. Group order: vowels → k/s/t/n/h/m/y/r/w rows → ん/っ → dakuten/handakuten → yōon →
katakana prolonged mark. Katakana is available from the start but recommended after basic hiragana;
the UI labels this rather than locking it.

WanaKana 5.3.1 (MIT) normalizes typed romaji and IME kana. Accepted variants (shi/si, chi/ti, fu/hu,
small っ, yōon, long vowels) are handled by converting both sides to kana and comparing, not by a
hand-written synonym list. The exact 5.3.1 API (`toKana` and its IME option) will be verified against
the installed package before use.

## Schema v2 (migration 002, immutable)

New tables, all keyed by `profile_id` with foreign keys and cascade delete:

- `kana_progress` — `(profile_id, kana_id)`, correct-unhinted count, distinct correct days,
  first/last correct day, last attempt day, lapses, due day, `verified`, `interval_tier`,
  `scheduler_version`, `updated_at`.
- `kana_attempts` — `id` (uuid), `profile_id`, `kana_id`, `day_key`, `mode`, `answer`, `correct`,
  `hint_used`, `response_ms`, `attempted_at` (UTC ISO), `event_id` unique. Append-only.
- `study_events` — `event_id` unique, `profile_id`, `day_key`, `type`, `payload_json`, `occurred_at`.
  This is the shared append-only event log the atomic attempts/checkpoints refer to and that M6 stats
  will read.
- `study_sessions` — `id`, `profile_id`, `activity_type`, `started_at`, `ended_at`,
  `active_seconds`, `status` (`running`/`paused`/`stopped`/`interrupted`), `source`, `last_checkpoint_at`.
- `session_segments` — `id`, `session_id`, `day_key`, `started_at`, `ended_at`, `active_seconds`,
  split at local midnight; foreign key to `study_sessions`.

No `kana_items` table: the catalogue is committed JSON and is small enough to bundle. Progress is
keyed by the stable id, so editing the JSON cannot orphan an attempt.

## Rules (pure modules, unit tested)

**Mastery** — `verified` becomes true when `correct_unhinted >= 3`, `correct_days >= 2`, and the most
recent unhinted attempt was correct. A hinted answer is logged with `hint_used = 1` and changes no
mastery counter. A failure sets `verified = false`, increments `lapses`, resets `interval_tier` to 0,
and sets `due_day = today + 1`. Verified items use intervals of 7, 14, then 30 days from
`interval_tier` (incremented on each fresh verification, capped at 2), recorded with
`scheduler_version = 'interval-v1'`.

**Choice mode and hints** — multiple-choice answers are treated as assisted: logged, usable for
practice, but never counted toward mastery. A wrong answer always counts as a failure and clears
`verified`, even when a hint was shown. These are explicit rules so mastery means unhinted recall.

**Learning and struggling** — `verified` is the mastery flag above. `learning` means at least one
attempt exists and the item is not verified. `struggling` means the most recent attempt failed **or**
there were at least two failures in the last seven study days. Both are computed from stored records
and shown with an explanatory tooltip. `due` items have `due_day <= today`. The review queue contains
all due items plus anything failed today, ordered by most overdue, then lapses, then stable id;
manual re-drill of a not-due character is available from the chart.

**Goal-edit guard** — `setGoalVersion` refuses a change effective today when today already has a kana
attempt or a session segment, returning `CONFLICT` ("Today already has study activity"). This closes
the prerequisite recorded in `planner.ts`; past days were already rejected.

**Live upgrade** — the `~/.config/Kotoba-dev` profile was created by this project's own M3 runtime
verification, not by a learner, so upgrading it with a pre-migration backup is authorized. The
installed `userData` profile is never touched from this environment.

**Timer** — one active session per profile. In-memory state holds the monotonic start of the current
running period, accumulated milliseconds, activity type and last checkpoint wall-clock time. A
10-second interval checkpoints to SQLite: it computes elapsed from `performance.now()` (monotonic),
splits the segment when the profile's day key changes, caps a single gap longer than 60 seconds to
60 seconds (missed suspend / idle) and records the event. Pause finalizes the current segment;
resume starts a new period; stop finalizes and sets `ended_at`. `before-quit` and `powerMonitor`
`suspend` checkpoint and pause. On startup any `running` session becomes `interrupted` and keeps only
time up to its last checkpoint; Dashboard shows a recovery banner that the learner can acknowledge.
Clock rollback cannot reduce accumulated time because elapsed comes from the monotonic clock.

Measured minutes on Dashboard are the sum of `session_segments.active_seconds` for today's day key.
Nothing else contributes minutes. Kana attempts and new-word counts remain separate.

## IPC added

`kana.getCatalog`, `kana.getLesson`, `kana.submitAttempt`, `kana.getReviewQueue`, `kana.getSummary`,
`study.start({ activityType })`, `study.pause`, `study.resume`, `study.stop`, `study.getStatus`,
`study.acknowledgeInterrupted`, and `planner.getToday` extended with kana summary and today's
measured minutes. `activityType` is one of the existing bounded `ACTIVITY_TYPES` (default `kana`)
and TopBar offers a selector; minutes reconcile to the matching assignment row where one exists. Every channel gets a Zod schema, sender check and `Result` envelope. Attempt
submission writes progress + attempt + event in one `BEGIN IMMEDIATE` transaction; duplicate
`event_id` returns the existing result instead of double-counting.

## Renderer

Two ready routes `/hiragana` and `/katakana` render the same `KanaPage` with a script prop; the
sidebar badges change from M4 to no badge. The page shows a group chart with per-character progress,
a quiz panel (character → typed reading, optional choice mode, optional audio when a Japanese voice
exists), a hint toggle that is off by default for scoring, immediate feedback with the contrast set
(シ/ツ, ソ/ン, ぬ/め, わ/ね), and a "Review missed" queue. Enter submits, Tab navigates, focus rings
stay visible, no sound autoplays. TopBar gets compact timer controls and a live elapsed display.
Dashboard shows real minutes, kana verified/learning/struggling/due and a next-action link; Profile
shows kana attempt counts and labelled accuracy. Failure and empty states are real.

## Tests

- Unit: kana data integrity (46 per script, unique ids, valid readings, ordered groups); answer
  normalization variants; mastery rule edge cases including choice/hint scoring; interval tier and
  due-day computation including reset after a lapse; learning/struggling/due definitions; goal-edit
  guard; timer pure helpers (segment split, idle cap, crash cap, pause/resume accumulation, clock
  rollback).
- Integration: v1→v2 migration on a seeded real database with the backup hook; atomic attempt +
  `study_events` write and duplicate event id; profile isolation; full session lifecycle with
  segments and minute reconciliation; interrupted session adds no time; goal change with and without
  today's activity.
- Live: walk the quiz via DevTools protocol, confirm attempts persist, timer survives reload and
  closes cleanly, dashboard minutes reconcile with the database.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| WanaKana not installed | User installs `wanakana@5.3.1`; agent never installs |
| Migration breaks existing v1 dev profile | Upgrade a seeded v1 DB in integration tests; live upgrade check on the existing dev root |
| Suspend event absent under WSLg | 60-second idle cap plus checkpoint cap; crash recovery keeps only checkpointed time |
| Audio unavailable | Hide the audio exercise; never fail the quiz because TTS is missing |
| Timer double-counts across reload | Only one active session per profile; main owns status; renderer reads, never writes time |

## What is left to the builder

Exact component file names, the 10-second checkpoint constant's placement, CSS class names, and the
specific error-message wording are builder decisions. The mastery rule, intervals, idle cap, schema
and channel names above are fixed by this design.
