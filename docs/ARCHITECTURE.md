# Kotoba architecture

Status: milestone **M5** (dictionary, vocabulary and FSRS reviews). Everything below describes what
exists, not what is planned.

## Process model

```
main process (Node, privileged)                 renderer (sandboxed, no Node)
  src/main/main.ts                                src/renderer/index.tsx
    - app lifecycle, single-instance lock            - React 19 + React Router (HashRouter)
    - data-root resolution, one window               - boot -> onboarding -> shell
    - DB open/migrate/close, IPC registration        - talks to main only via window.kotoba
  src/main/security.mts                             src/renderer/App.tsx
    - CSP builder, window options,                   - profiles.getActive() decides the screen
      sender-origin check (pure, tested)             - ThemeProvider applies the stored theme
  src/main/paths.ts                                src/renderer/features/onboarding/
    - data-root resolution (pure, tested)            - 5-step wizard with a live preview
  src/main/dictionary/ + services/dictionary.ts    src/renderer/features/dictionary/
    - read-only generated dictionary, search          - debounced search + entry detail
  src/main/database/                               src/renderer/pages/
    - connection, migrations, repositories           - dashboard / profile / settings
                                                      - features/kana (chart, quiz, queue)
                                                      - components/TimerControls
  src/main/services/
    - profile, planner, backup, app settings, kana, timer
  src/main/ipc.ts
    - one handler per channel: sender check,
      Zod validation, Result envelope
                 ▲
                 │ ipcRenderer.invoke (preload only)
  src/preload/preload.ts
    - contextBridge.exposeInMainWorld('kotoba', api)
```

- `src/shared/` holds contracts, Zod schemas, date rules and planning rules. It is imported by every
  process and must never import Node or Electron modules. `contracts.ts` uses `import type` from
  `schemas.ts`, so Zod is not bundled into the renderer.
- The renderer has no Node access, no `ipcRenderer`, no filesystem and no database handle.

## IPC contract

Every channel follows the same path, and there are no exceptions:

1. `isTrustedSender(event.senderFrame.url, allowedOrigins)` — packaged `file://` or the exact Vite
   dev origin. A request from anywhere else is rejected before the payload is read.
2. The payload is parsed by a Zod schema from `src/shared/schemas.ts`. Channels that take no payload
   use `z.undefined()`, so a stray payload is rejected rather than ignored.
3. The service runs. Anything expected throws `AppError` with a stable code
   (`VALIDATION`, `NOT_FOUND`, `CONFLICT`, `DB_IO`, `DATA_MISSING`).
4. The handler returns `Result<T>` — `{ ok: true, data }` or `{ ok: false, error }`. Nothing is
   thrown across the bridge, and unexpected failures are logged in main and reported as `INTERNAL`
   without a stack trace or a filesystem path.

The renderer therefore cannot choose a file path, run SQL, or act on a profile it does not own. The
one place a file name crosses the bridge (`backup.restore`) is validated twice: by the schema
(letters, digits, dot, dash, underscore only) and again in the service against the backup naming
pattern.

## Storage

`profile.db` is a SQLite database opened with `node:sqlite` (Electron's built-in SQLite). Pragmas on
every connection: `journal_mode = wal`, `foreign_keys = on`, `busy_timeout = 5000`,
`synchronous = normal`.

**Why `node:sqlite` instead of `better-sqlite3`.** It ships inside Electron's Node, so there is no
native addon, no ABI rebuild per platform, no MSVC toolchain on the Windows runner, and no
Linux/Windows `node_modules` mixing. Before writing the layer, the following were probed inside
Electron 45.5.0 (SQLite 3.54.1): FTS5 creation and query, WAL on a file database, `foreign_keys`,
`busy_timeout`, named parameters, transactions, `VACUUM INTO`, and reopening a snapshot read-only.
All passed. `pragma journal_mode` reports `memory` for an in-memory database, so WAL is only
asserted on file-backed ones.

Schema v1 (`src/main/database/migrations/001_initial.ts`, immutable):

| Table | Purpose | Notable constraints |
|---|---|---|
| `profiles` | one row per local learner | partial unique index `profiles_single_active` — many profiles are representable, one is active |
| `goal_versions` | effective-dated daily targets | unique `(profile_id, effective_date)`; cascade delete from `profiles` |
| `daily_plans` | one frozen plan per profile-day | unique `(profile_id, day_key)`; stores curriculum day/week/month, phase, targets |
| `daily_assignments` | ordered rows of a plan | unique `(plan_id, activity_type)`; cascade delete from `daily_plans` |
| `app_settings` | UI/housekeeping only (theme, last backup day) | never learning data |
| `schema_migrations` | applied versions | created by the migration runner |

Rules enforced in SQL as well as in TypeScript: calendar dates are `YYYY-MM-DD` text checked with
`GLOB`; `horizon_months` is 1–120; minutes and words are non-negative integers; `activity_type` and
`phase` are `CHECK`-constrained enums.

Repositories (`src/main/database/repositories/`) only issue statements. Transactions belong to
services, so a change that spans tables (profile + first goal version) commits or rolls back as a
unit. `transaction()` uses `BEGIN IMMEDIATE` and never nests.

### Migrations

`migrate()` reads `schema_migrations`, applies each pending migration in its own transaction, and
refuses to open a database newer than the build understands (rather than silently downgrading). An
upgrade of an existing database calls a `backupBeforeUpgrade` hook first; a fresh database does not,
because there is nothing to preserve.

## Dates and planning

Calendar dates are plain `YYYY-MM-DD` strings, never `Date` objects, and never parsed as UTC
midnight and re-formatted locally. All rules live in `src/shared/date.ts` and are unit tested:

- `addMonthsAnchored` adds from the **original** date, so Jan 31 + 1 month = Feb 28/29 but
  Jan 31 + 2 months = Mar 31 (the clamp is not chained).
- The horizon is `[start, start + horizonMonths)` — end date exclusive. 365 or 366 eligible days.
- Display weeks are Monday-based (`startOfWeekMonday`); curriculum weeks are 7-day blocks counted
  from the start date. They are deliberately different functions with different names.
- Curriculum months are start-date anniversaries, not calendar months.
- A study day is resolved in the profile's own IANA timezone from an epoch-millisecond instant
  (`todayInZone`), so the plan and the date shown in the UI agree across DST and offsets.

**Why `temporal-polyfill` instead of the runtime's `Temporal`.** Electron 45 does expose `Temporal`,
but host Node 24.22.3 — which runs Vitest — does not. `--harmony-temporal` works but is rejected in
`NODE_OPTIONS` and is an experimental V8 flag. Using the polyfill means the Electron main process,
the Chromium renderer and the test runner all execute the same implementation.

`src/shared/goals.ts` holds the pure planning rules: curriculum phase by day number, the
largest-remainder minute split (parts always sum to the exact target), and goal-version resolution
by effective date.

## Data roots

`src/main/paths.ts` is a pure function with three outcomes:

| Situation | Root | `source` |
|---|---|---|
| `KOTOBA_DATA_ROOT` is set | that path | `env` |
| development (`npm start`) | `<userData>-dev` | `dev` |
| packaged | Electron `userData` | `userData` |

Development therefore cannot open, migrate, or back up over a real learner's database. The resolved
root is logged at startup and shown in Settings. The `env` option defaults to `process.env`, so the
real app honours `KOTOBA_DATA_ROOT` (verified in the packaged build); passing an explicit `env` keeps
the function testable without mutating globals.

## Backups

Backups are consistent snapshots taken with `VACUUM INTO`, never a file copy: while a `-wal` file
exists, the `.db` alone is not the whole database. Each snapshot is written to a `.partial` file and
renamed into place, so an interrupted backup never looks valid.

- Names: `kotoba-YYYYMMDD-HHMMSS-<reason>.db`, reasons `daily`, `pre-migration`, `pre-restore`,
  `manual`.
- Retention: 14 daily snapshots, 5 per other reason. Pruning only ever touches files matching
  Kotoba's own naming scheme, so a user's own export is never deleted.
- One automatic daily snapshot per study day, recorded in `app_settings`.
- Restore order: validate the source (exists, is a file, `pragma integrity_check`, known schema
  version, not newer than this build) → snapshot the current database as `pre-restore` → close,
  remove `.db`/`-wal`/`-shm` → copy → reopen and migrate. A failure to reopen is reported with the
  safety backup's name rather than leaving a half-open database.

## Build system

- Electron Forge 8 with `@electron-forge/plugin-vite` and Vite 8.
- **Entry filenames determine build output names.** The plugin sets
  `build.lib.fileName: () => '[name].cjs'`, where `[name]` is the entry file's basename. So
  `src/main/main.ts` → `.vite/build/main.cjs` and `src/preload/preload.ts` →
  `.vite/build/preload.cjs`. The two entries must never share a basename or they overwrite each
  other. `package.json` `main` and the preload path in `src/main/main.ts` depend on this.
- **`packagerConfig.executableName` must be `kotoba`.** Electron Packager otherwise derives the
  binary name from `productName` (`Kotoba`), while makers look for the package `name` (`kotoba`).
  Without it `npm run make` fails with "could not find the Electron app binary".
- Only `electron` and Node builtins are external in the main bundle; runtime `dependencies` such as
  `zod` and `temporal-polyfill` are bundled into `main.cjs`. `node:sqlite` is external because
  Node 24's `builtinModules` lists it as `node:sqlite`.
- `MAIN_WINDOW_VITE_DEV_SERVER_URL` is defined by the plugin in dev and undefined when packaged.
- `src/main/security.mts` is `.mts` so the Vite config (ESM) can import the CSP builder without
  the "ESM syntax in a file loaded as CommonJS" warning. `allowImportingTsExtensions` is on,
  which is safe because TypeScript never emits (Vite does the transpiling).
- TypeScript 6 is used for type checking only (`noEmit`); Vite does the transpiling.
- Two tsconfigs: `tsconfig.json` (renderer, DOM libs, no Node types) and `tsconfig.node.json`
  (main, preload, tests, build configs, Node types). This stops renderer code from silently
  depending on Node APIs.

## Security posture

| Control | Setting |
|---|---|
| Context isolation | `contextIsolation: true` |
| Node in renderer | `nodeIntegration: false`, `nodeIntegrationInWorker: false` |
| Sandbox | `sandbox: true` (preload is bundled as CommonJS) |
| Web security | `webSecurity: true`, `allowRunningInsecureContent: false` |
| Preload surface | the typed `KotobaApi` only — no `ipcRenderer`, no paths, no SQL |
| IPC sender check | `isTrustedSender()` on every handler |
| IPC payloads | Zod schema per channel, including `z.undefined()` for no-payload channels |
| Navigation | `will-navigate` blocked for untrusted URLs |
| New windows | `setWindowOpenHandler` always denies |
| `<webview>` | `will-attach-webview` prevented |
| Permissions | `setPermissionRequestHandler` denies everything |
| CSP | one builder in `src/main/security.mts`, injected at build time; the dev policy is relaxed for HMR and the production policy is asserted by tests |
| Packaging fuses | RunAsNode off, cookie encryption on, Node CLI/inspect off, ASAR integrity + only-load-from-ASAR |

Development relaxations exist only in the `serve` build; `tests/unit/security.test.ts` fails if
the production policy ever gains `unsafe-inline`, `unsafe-eval` or a websocket source.

## Decisions recorded

| Decision | Reason |
|---|---|
| Electron 45.5.0 | Bundles Node 24.22.3; `ts-fsrs` v6 (M5) requires Node ≥24 |
| TypeScript 6.0.3 | The version the Forge 8 template is tested against; TS 7 is a new compiler |
| oxlint only | Fast, zero-config; formatting is deferred |
| No Tailwind | Plain CSS custom properties; styling tooling is not a milestone risk |
| `node:sqlite` | No native addon to rebuild per platform; FTS5, WAL and `VACUUM INTO` verified in Electron 45 |
| WanaKana 5.3.1 | MIT, offline, handles Hepburn variants and IME kana without a hand-written synonym list |
| Simple 7/14/30 kana intervals in M4 | Kana can ship before the FSRS runtime check; `scheduler_version` lets M5 migrate without losing attempts |
| Main-owned timer with capped checkpoints | A renderer timer cannot survive suspend and cannot be authoritative |
| `ts-fsrs@6.0.1` for word cards | Maintained, offline, Node ≥24 compatible; library defaults with retention 0.90, no custom algorithm |
| Two cards per word | Skill separation: being audio-familiar must not imply readability |
| `temporal-polyfill` 1.0.8 | `Temporal` exists in Electron but not in host Node, which runs the tests |
| Zod 4.6.7 | One schema per channel, parsed in main before anything touches the database |
| Multi-profile schema, single-profile UI | Adding profile switching later needs no migration; the UI still shows exactly one |
| HashRouter | Deep links keep working from `file://` in the packaged app |
| Theme in `app_settings`, not `localStorage` | Learning data and preferences stay in the database; nothing authoritative lives in browser storage |

## Kana study (M4)

`data/curriculum/kana.json` is committed original data: 46 basic characters per script plus
dakuten/handakuten, yōon, small っ and the prolonged sound mark. Ids are stable (`h-ka`, `k-ka`,
`h-kya`), because learner progress is keyed by id. `src/shared/kanaData.ts` types the catalogue and
`src/shared/kanaAnswer.ts` normalizes answers with WanaKana. Kana input keeps its script, so か and
カ are different answers; uppercase romaji is lowercased before conversion so `KA` still answers a
hiragana prompt. Choice mode and hints are recorded as practice but never count toward mastery.

Schema v2 adds `kana_progress` (counters, due day, `verified`, `interval_tier`,
`scheduler_version`), `kana_attempts` (append-only, unique `event_id`), `study_events` (shared event
log), `study_sessions` and `session_segments`. Attempt submission writes progress + attempt + event
in one `BEGIN IMMEDIATE` transaction; a repeated `eventId` returns the stored result.

**Mastery** is three unhinted typed correct answers on at least two distinct study days, with the
latest unhinted typed attempt correct. "Learning" means attempted but not verified; "struggling"
means the last attempt failed or there were two failures in seven days; "due" means `due_day <=
today`. Verified items use a 7/14/30-day ladder. M5 can replace it with FSRS via a migration
because `scheduler_version` is stored on each progress row.

## Study timer (M4)

`src/main/services/timer.ts` is the only owner of elapsed time. A monotonic clock provides deltas;
wall time is used only to attribute seconds to a profile-timezone day key through
`splitSegmentAtMidnight`. Checkpoints run every 10 seconds and write `session_segments`, capped at
60 seconds per gap so suspend or idle time cannot become study minutes. Pause finalizes a segment,
resume starts a fresh monotonic period, stop marks the session stopped. `powerMonitor.suspend`
pauses; `before-quit` stops; startup calls `recover()`, which marks any still-running session
`interrupted` and keeps only its checkpointed seconds. `TimerService.status()` is safe to call
before onboarding (it returns an inactive state), because the app checks it on quit.

Dashboard minutes are `floor(sum(session_segments.active_seconds for today) / 60)`. Nothing else
contributes minutes, and kana attempts never fabricate time.

## Dictionary (M5a)

Python stdlib scripts in `scripts/` download two pinned, permitted assets (JMdict Simplified
`jmdict-eng-common` and KANJIDIC2 `kanjidic2-en`, release `3.6.2+20261123231529`), verify SHA-256,
and generate one immutable `resources/dictionaries/dictionary.db`. The build is atomic (`.partial`
plus rename), idempotent, and refuses path traversal, oversized archive members and malformed
required data. `--offline` uses a verified cache; `--fixture` uses committed synthetic data and
marks the resulting database so a packaged build refuses it.

The database has entries, forms, readings, senses and their restriction tables, entry_kanji links to
individual characters, kanji and kanji_readings, the original kana catalogue, source-derived
`frequencies` (one `jmdict-priority` corpus), an intentionally empty `jlpt_tags` table, and FTS5
tables for English and Japanese text. Ids are source-prefixed and stable; no row offsets are used.

`src/main/dictionary/paths.ts` resolves `<appPath>/resources/dictionaries/dictionary.db` in dev and
`<resourcesPath>/dictionaries/dictionary.db` packaged (Forge flattens `extraResource`). A
`KOTOBA_DICTIONARY_PATH` override is used by tests. `src/main/services/dictionary.ts` opens the file
read-only, normalizes romaji/katakana with WanaKana, searches Japanese forms/readings and English
FTS, ranks exact matches first, then curated rank, source priority, fewer senses, shorter form and
stable id. Results are bounded (20 default, 100 maximum). Nothing is written back and no full
dictionary is loaded into the renderer.

Licensing is part of the architecture: EDRDG data is CC BY-SA 4.0, the derived database is marked
CC BY-SA 4.0, notices and the full legalcode ship in `resources/notices/`, and the in-app Sources
screen shows attribution. EDRDG's update obligation is met by the manifest's pinned versions and
documented update procedure.

## Not in this milestone

FSRS reviews, vocabulary introduction, kanji quizzes, grammar, reading, listening, speaking,
immersion, calendar, statistics, profile switching and goal editing UI. Sidebar entries for those
carry their milestone tag and are not clickable. Vocabulary and review actuals are real zeros, not
placeholders.
