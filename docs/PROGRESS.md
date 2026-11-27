# Kotoba — Progress

## Milestone status

| # | Milestone | Status |
|---|---|---|
| M0 | Python environment and repository verification | ✅ **REACHED** 2026-11-26 |
| M1 | Electron foundation and desktop shell | ✅ **REACHED** 2026-11-26 |
| M2 | Native Windows packaging baseline | ✅ **REACHED** 2026-11-26 (verified by user on Windows) |
| M3 | Persistent profile, onboarding, dates | ✅ **REACHED** 2026-11-26 |
| M4 | Kana learning | 🔧 code complete — Windows build pending (moved to after M5 by user decision) |
| M5 | Dictionary pipeline, vocabulary, FSRS | ⬜ not started |
| M6 | Goals, calendar, statistics | ⬜ not started |
| M7 | Kanji and grammar | ⬜ not started |
| M8 | Reading, listening, speaking, immersion | ⬜ not started |
| M9 | Assessment and mature release | ⬜ not started |

A milestone is only marked REACHED when every acceptance criterion has a command and its output
recorded below. Unproven items are listed as exceptions, never assumed.


## M0 — Python environment and repository verification

Date: 2026-11-26
Status: complete (no application code yet)
Schema version: n/a (no database exists yet)

### Repository

| Check | Result |
|---|---|
| Working directory | `/home/ramsey/codeStuff/kotoba` (WSL2) |
| `git rev-parse --show-toplevel` | same path |
| Remote | `origin https://github.com/Nyang-Lin-Phyo/kotoba.git` |
| Branch | `main`, tracking `origin/main`, HEAD `c73f225` |
| Working tree before M0 | clean |
| Tracked files before M0 | `.github/workflows/build-windows.yml`, `.gitignore`, `README.md` |
| Windows folder `C:\zStuff\...` | not used as workspace |

`AGENTS.md` is present locally and intentionally **not tracked** (kept in `.gitignore` by user decision).

### Environment

| Component | Value | Result |
|---|---|---|
| OS | Ubuntu 24.04 on WSL2, kernel 6.6.87.2-microsoft-standard-WSL2 | OK |
| WSLg | 1.0.71, `DISPLAY=:0`, `WAYLAND_DISPLAY=wayland-0`; `xset q` responds; `/mnt/wslg` present | OK (X/Wayland reachable; no GUI app tested yet) |
| Python | 3.12.3, `sys.executable` = `<repo>/.venv/bin/python`, `VIRTUAL_ENV` set | OK |
| Python sqlite3 | 3.45.1, import OK | OK |
| pip | 26.3 (equal to latest on PyPI, so `--upgrade pip` is a no-op) | OK |
| venv packages | `pip` only | OK |
| Node (nvm) | v24.22.3 at `~/.nvm/versions/node/v24.22.3` | OK |
| Node (`/usr/bin/node`) | v18.19.1 | Hazard: any shell without nvm gets Node 18; `.nvmrc` added |
| npm | 11.19.1 | OK |
| git | 2.43.0 | OK |
| opencode | v2.2.6 | OK |
| Native toolchain | gcc 13.3.0, GNU Make 4.3, `python3.12-venv` installed | OK |
| Disk / network | 923 GB free; npm registry reachable (HTTP 200) | OK |

### Commands executed and actual results

```text
git rev-parse --show-toplevel        -> /home/ramsey/codeStuff/kotoba
git remote -v                        -> origin https://github.com/Nyang-Lin-Phyo/kotoba.git
git status --short --branch          -> ## main...origin/main   (clean)

.venv/bin/python --version           -> Python 3.12.3
.venv/bin/python -c "import sys, sqlite3; ..."
                                     -> /home/ramsey/codeStuff/kotoba/.venv/bin/python
                                        sqlite 3.45.1
.venv/bin/python -m pip --version    -> pip 26.3
.venv/bin/python -m pip list         -> pip 26.3  (nothing else)

node --version                       -> v24.22.3   (nvm)
npm --version                        -> 11.19.1
git --version                        -> git version 2.43.0
opencode --version                   -> opencode v2.2.6
echo $DISPLAY / $WAYLAND_DISPLAY     -> :0 / wayland-0
xset q                               -> Keyboard Control: ...  (X server responds)

.venv/bin/python -m pip install --upgrade pip
                                     -> Requirement already satisfied: pip in
                                        ./.venv/lib/python3.12/site-packages (26.3)   (exit 0, no-op)

git check-ignore .venv/bin/python    -> .venv/bin/python  (ignored)
```

### Files changed in M0

- `.gitignore` — rewritten for Kotoba:
  - removed leftovers from the previous unrelated project (AWS/SAM/CDK/Terraform, `infra/*`, video-journaling archives, `dia.pdf`, IDE extras kept);
  - `data/` (too broad) replaced with `data/raw/` and `data/processed/`, so `data/manifest.json`, `data/curriculum/` and `data/fixtures/` stay committable;
  - added `out/` (Forge output), `resources/dictionaries/`, `backups/`, and SQLite transient files (`*-journal`, `*.db-wal`, `*.db-shm`, `*.sqlite-wal`, `*.sqlite-shm`, `*.sqlite3-wal`, `*.sqlite3-shm`);
  - `AGENTS.md` remains ignored (explicit user decision).
- `.nvmrc` — new, pins Node `24`.
- `docs/PROGRESS.md` — this file.
- No `requirements.txt`: the data pipeline is stdlib-only for now; a pinned file is added at M5a if a third-party dependency becomes necessary.

### Ignore verification (actual output)

Ignored: `out/`, `out/make/*`, `dist/`, `coverage/`, `.vite/`, `node_modules/*`, `.venv/bin/python`, `data/raw/*`, `data/processed/*`, `resources/dictionaries/*`, `backups/*`, `*.db`, `*.db-wal`, `*.db-shm`, `*.sqlite3-journal`, `AGENTS.md`, `.env`.
Not ignored (must be committable): `data/manifest.json`, `data/curriculum/*`, `data/fixtures/*`, `package-lock.json`, `package.json`, `docs/PROGRESS.md`, `.nvmrc`, `.env.example`.

### Known limitations / pending

- No Electron app, `package.json`, or `package-lock.json` exists yet, so `.github/workflows/build-windows.yml` (`npm ci`, `npm run make`) cannot succeed until M1. The workflow was intentionally not modified in M0.
- WSLg was verified only at the X/Wayland socket level. No graphical window has been launched, because no app exists.
- `better-sqlite3@13.2.0` publishes no prebuilt binaries for its current release and compiles from source; the SQLite backend choice (`better-sqlite3` vs built-in `node:sqlite`) stays open until the M5 smoke test.
- `ts-fsrs@6.0.1` requires Node >= 24, so the Electron version chosen in M1 must bundle Node 24 (Electron >= 40; latest stable 45.5.0 bundles Node 24.22.3).
- Nothing committed or pushed; changes are left in the working tree for user review.

### Next step

M1 — Electron foundation and desktop shell (Forge + Vite + React + TypeScript, secure preload, sidebar shell).

---

## M1 — Electron foundation and desktop shell

Date: 2026-11-26
Status: complete and verified on Linux/WSLg. **Windows packaging is not verified** (that is M2).

### What was built

| Area | Files |
|---|---|
| Build | `package.json` (exact version pins), `forge.config.mts`, `vite.main.config.mts`, `vite.preload.config.mts`, `vite.renderer.config.mts`, `vitest.config.mts`, `tsconfig.base.json`, `tsconfig.json`, `tsconfig.node.json`, `.oxlintrc.json`, `index.html` |
| Main process | `src/main/main.ts` (lifecycle, single window), `src/main/security.mts` (CSP builder, window options, sender check — pure), `src/main/ipc.ts` (`app:info` + sender validation), `src/main/env.d.ts` |
| Preload | `src/preload/preload.ts` — exposes only `window.kotoba.appInfo()` |
| Shared | `src/shared/contracts.ts`, `src/shared/nav.ts` |
| Renderer | `App.tsx` (HashRouter), `index.tsx`, `components/{Sidebar,TopBar}.tsx`, `pages/{Dashboard,Profile,Settings}Page.tsx`, `theme.ts`, `styles/global.css`, `window.d.ts` |
| Tests | `tests/unit/security.test.ts`, `tests/unit/nav.test.ts` (15 tests) |
| Docs | `README.md` (rewritten), `docs/ARCHITECTURE.md` (new) |

Security: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`,
preload-only bridge, sender-origin validation, `will-navigate` blocked, `setWindowOpenHandler`
denies, `<webview>` blocked, all permission requests denied, Fuses enabled, CSP generated from one
function and injected at build time with a separate dev policy.

### Commands executed and actual results

```text
node -v / npm -v                     -> v24.22.3 / 11.19.1
npm install                          -> added 245 packages, 0 vulnerabilities
npm ci --dry-run                     -> up to date in 370ms (lockfile valid)
npm run lint                         -> oxlint: no findings
npm run typecheck                    -> tsc -p tsconfig.json && tsc -p tsconfig.node.json: exit 0
npm test                             -> Test Files 2 passed, Tests 15 passed
npm run package                      -> packaged x64 linux, out/Kotoba-linux-x64/Kotoba
```

Runtime evidence gathered through the Chrome DevTools protocol against the live window:

```text
dev window title            Kotoba        url  http://localhost:5173/
document.querySelector h1   Dashboard
nav items                   16 total, 13 planned (3 ready)
window.kotoba.appInfo       function
window.require / .process   undefined / undefined
appInfo()                   {"name":"Kotoba","version":"0.1.0","electron":"45.5.0",
                             "chrome":"156.0.8078.109","node":"24.22.3","platform":"linux","isDev":true}
window.open("https://…")    null, and no second page target was created
dev server binding          LISTEN 127.0.0.1:5173 only
```

Packaged (production) binary `out/Kotoba-linux-x64/Kotoba`:

```text
url          file:///…/out/Kotoba-linux-x64/resources/app.asar/.vite/renderer/main_window/index.html
CSP          … script-src 'self'; connect-src 'self'   (no unsafe-inline, no ws:)
appInfo()    {… "isDev":false}
node leaks   undefined/undefined/undefined
routing      #/profile -> h1 "My Profile", active nav "My Profile"
close        window.close() -> app exited, no listeners left on 5173/9223
```

Screenshots reviewed (rendered UI, not just process state): dashboard, settings with live version
data, and the packaged build.

### Problems found and fixed during verification

| Problem | Fix |
|---|---|
| `Cannot find module .vite/build/main.cjs` | Forge names build output after the entry basename (`[name].cjs`). Renamed `src/main/index.ts` → `src/main/main.ts` and `src/preload/index.ts` → `src/preload/preload.ts` so they produce `main.cjs` / `preload.cjs` and no longer collide on `index.cjs`. |
| Forge still pointed at the old entry paths | Updated `forge.config.mts` entries. |
| Vite warning: ESM syntax in a CJS-loaded file | Renamed `src/main/security.ts` → `security.mts`, imported with an explicit extension, enabled `allowImportingTsExtensions` (safe: TypeScript never emits). |
| oxlint: empty export specifier | Removed the redundant `export {}` from `window.d.ts`. |
| X11 screenshot was black | WSLg composites through Wayland, so `ffmpeg x11grab` on the X root captures nothing. Used the DevTools protocol instead, which also proves the DOM rendered. |

### Known limitations

- **Japanese glyphs render as tofu on this WSL machine** — `fc-list :lang=ja` returns 0 fonts.
  Windows has Yu Gothic/Meiryo so the packaged app should be fine there, but this is unverified.
  Optional local fix: `sudo apt install fonts-noto-cjk`.
- Electron 45 has **no postinstall script**; the binary downloads lazily on the first
  `npm start`. `npm ci` therefore does not pre-download it. This is expected, not a defect.
- `electron-winstaller` needs its install script approved (`allowScripts` in `package.json`), which
  matters on the Windows CI runner at M2. It is approved in this repo.
- The dev CSP allows `'unsafe-inline'` for scripts and `ws://localhost:*` for HMR. Tests fail if
  those appear in the production policy; the packaged binary was checked and does not have them.
- Only Linux packaging was exercised. `npm run make` (Squirrel/Windows) is M2 and unverified.
- No profile, database, timer or study content exists yet. Dashboard/Profile show honest
  "not implemented" states with no invented numbers.

### Next step

M2 — native Windows packaging baseline: extend the existing workflow with lint/typecheck, produce
the Squirrel installer and an unpacked artifact, and verify `npm ci` + packaging on
`windows-latest`.

---

## M2 — Native Windows packaging baseline

Date: 2026-11-26
Status: **REACHED.** Verified by the user on native Windows; see below.

### What changed

| File | Change |
|---|---|
| `.github/workflows/build-windows.yml` | Added lint, typecheck and unit-test steps before packaging; kept `npm ci`, Node 24, `windows-latest`, `contents: read`, 7-day retention. Added a PowerShell smoke test that launches the packaged exe with `--remote-debugging-port`, waits for a renderer target, asserts the URL is `file://`, and kills the process. Added a second artifact upload for the unpacked app (`Kotoba-Windows-x64-unpacked`). Timeout raised to 45 minutes. |
| `forge.config.mts` | Added `packagerConfig.executableName: 'kotoba'`. |

### Bug found and fixed locally

`npm run make` failed with:

```
could not find the Electron app binary at ".../out/Kotoba-linux-x64/kotoba"
```

Electron Packager named the binary from `productName` (`Kotoba`) while makers look for the package
`name` (`kotoba`). The same mismatch would have broken Squirrel on Windows. Setting
`executableName: 'kotoba'` fixes both. This is exactly the class of failure that would otherwise
have appeared only in CI.

### Verified locally (Linux)

```text
python3 yaml.safe_load(workflow)   -> parses; 10 steps; runs-on windows-latest; timeout 45
npm run make                       -> Making a deb distributable for linux/x64: OK
out/Kotoba-linux-x64/kotoba        -> binary present with the new executableName
packaged app (remote debugging)    -> file:// URL, prod CSP without unsafe-inline,
                                      appInfo isDev:false, routing #/profile OK, no Node leaks
window.close()                     -> process exits
npm run lint / typecheck / test    -> clean / exit 0 / 15 passed
```

### Verification on Windows (by the user)

| Check | Outcome |
|---|---|
| GitHub Actions run of `Build Windows App` | Ran successfully; the workflow produced its artifacts |
| `Kotoba-Windows-x64-unpacked` downloaded and launched | App window opened and worked |
| `Kotoba-Windows-x64` (Squirrel `KotobaSetup.exe`) installed and launched | Installed app worked |

Recorded from the user's report. No CI log text or screenshot was captured into this file, so the
job duration, the PowerShell smoke-test step's output and the exact SmartScreen prompt are not
documented here. Japanese glyph rendering on Windows was not separately re-checked.

### Deferred

- App icon and publisher metadata polish (later milestone).
- SQLite backend smoke test on both platforms — done in M3 for Linux/Electron; the packaged
  Windows build is exercised again at M5 when real data ships.

---

## M3 — Persistent profile, onboarding and dates

Date: 2026-11-26
Status: **REACHED** (Linux/WSLg, Electron 45.5.0). Schema version: **1**.
Windows packaging of this milestone is **not** re-tested; see limitations.

### What was built

| Area | Files |
|---|---|
| Shared rules | `src/shared/date.ts` (Temporal plain dates, anchored month clamp, Monday weeks, curriculum days/weeks/months, timezone day keys), `src/shared/goals.ts` (phases, largest-remainder minute split, goal-version resolution), `src/shared/enums.ts`, `src/shared/errors.ts` (`AppError`, `Result`) |
| Contracts | `src/shared/contracts.ts` (channels + DTOs + `KotobaApi`), `src/shared/schemas.ts` (Zod per payload) |
| Database | `src/main/database/connection.ts` (`node:sqlite`, pragmas, `transaction`), `migrations/001_initial.ts` (immutable schema v1), `migrations/index.ts`, `migrate.ts`, `manager.ts`, `repositories/{profiles,goalVersions,plans,settings}.ts` |
| Services | `src/main/services/profile.ts` (atomic profile + first goal), `planner.ts` (`ensurePlanDay`, `getDashboard`, `previewPlan`, `setGoalVersion`), `backup.ts` (`VACUUM INTO`, validation, restore, daily snapshot), `appSettings.ts` |
| Wiring | `src/main/main.ts` (data root, single-instance lock, pre-migration backup hook, close DB on `will-quit`), `src/main/ipc.ts` (sender check + Zod + `Result` for every channel), `src/main/paths.ts`, `src/preload/preload.ts` |
| Renderer | `App.tsx` (boot → onboarding → shell), `features/onboarding/OnboardingWizard.tsx` (5 steps incl. live preview), `pages/{Dashboard,Profile,Settings}Page.tsx`, `components/TopBar.tsx`, `lib/{useAsync,profileContext}.ts`, `theme.tsx`, ~400 lines of CSS |
| Tests | `tests/unit/{date,goals,contracts,paths,planner}.test.ts`, `tests/integration/database.test.ts` |
| Docs | this file, `docs/ARCHITECTURE.md`, `README.md` |

Dependencies added (exact pins, by the user): `zod@4.6.7`, `temporal-polyfill@1.0.8`.

Theme moved out of `localStorage` into the `app_settings` table; `src/renderer/theme.ts` was replaced
by `theme.tsx` (`ThemeProvider`), so no authoritative state lives in browser storage.

### Decisions and the evidence behind them

| Decision | Evidence |
|---|---|
| SQLite backend is `node:sqlite` (not `better-sqlite3`) | Probed inside Electron 45.5.0: SQLite 3.54.1, FTS5 create/query OK, WAL on a file DB, `foreign_keys`, `busy_timeout`, named params, transactions, `VACUUM INTO`, read-only reopen of a snapshot. No native addon → no per-platform rebuild, no MSVC on the Windows runner. |
| Dates use `temporal-polyfill`, not the runtime `Temporal` | `Temporal` is present in Electron 45 but `undefined` in host Node 24.22.3, which runs Vitest; `--harmony-temporal` is rejected in `NODE_OPTIONS`. The polyfill makes main, renderer and tests identical. |
| Multi-profile schema, single-profile UI | `profiles_single_active` is a partial unique index; a second `profiles.create` returns `CONFLICT` (verified live) instead of silently switching. |
| Dev data root is `<userData>-dev` | Startup log `[kotoba] data root (dev): /home/ramsey/.config/Kotoba-dev`; `~/.config/Kotoba/profile.db` does not exist after a full dev session. |

### Commands executed and actual results

```text
npm install --save-exact zod@4.6.7 temporal-polyfill@1.0.8   (run by the user)
    -> added 4 packages, audited 250, found 0 vulnerabilities

npm run lint
    -> oxlint: no findings (5 warnings fixed first: Array#sort/reverse -> toSorted/toReversed,
       `new Intl.DateTimeFormat` used only for validation -> Temporal.Now.zonedDateTimeISO)

npm run typecheck
    -> tsc -p tsconfig.json && tsc -p tsconfig.node.json: exit 0

npm test
    -> Test Files 8 passed (8), Tests 97 passed (97)

      28  tests/integration/database.test.ts
      19  tests/unit/date.test.ts
      12  tests/unit/contracts.test.ts
      10  tests/unit/goals.test.ts
      10  tests/unit/security.test.ts
       8  tests/unit/planner.test.ts
       5  tests/unit/nav.test.ts
       5  tests/unit/paths.test.ts

npm start -- -- --remote-debugging-port=9222
    -> DevTools listening on ws://127.0.0.1:9222/...
       [kotoba] data root (dev): /home/ramsey/.config/Kotoba-dev
```

### Runtime evidence (live window, real IPC, real SQLite)

Driven through the DevTools protocol against the running app; the first run started from a
non-existent `~/.config/Kotoba-dev`, so this was a genuine first launch.

```text
first launch          wizard rendered, .sidebar absent, 5 steps, date input = today
profiles.getActive    { ok: true, data: null }
dataRoot              root /home/ramsey/.config/Kotoba-dev, source "dev"
wizard                Next x4 -> preview step -> "Create profile" -> dashboard
dashboard             dayKey 2026-11-26, day 1, week 1, phase foundation,
                      target 120 min / 15 words, assignments sum 120,
                      rows kana 30, vocabulary 20 (+15 words), reviews 15,
                      grammar 25, listening 20, speaking 10, 7 week cells
rendered stats        "0 / 120 min", "0 / 15 words", "0", "1 of 5 study days", "1 of 365 days"
month 2026-11         targetDays 5, targetMinutes 600, targetWords 75,
                      elapsedDays 1, minutesToDate 120, wordsToDate 15
preview (2026-05-17)  365 days, 53 curriculum weeks, 5,475 words, 43,800 min,
                      13 months, first 2026-05 = 15 days/225 words,
                      last 2027-05 = 16 days/240 words
second profile        { ok: false, CONFLICT }  (no silent switch)
restore '../profile.db' { ok: false, VALIDATION, field "fileName" }
settings {theme:'neon'} { ok: false, VALIDATION, field "theme" }
preview 2026-02-30    { ok: false, VALIDATION, field "startDate" }
backups after create  1 daily snapshot (automatic, once per study day)
manual backup         2 snapshots;  rename -> restore -> name reverted, planner still readable,
                      pre-restore safety snapshot created
reload                no onboarding, dashboard shown, theme attribute "dark" (persisted)
fresh process         no onboarding, dashboard, theme "dark"
close via Browser.close  all processes gone, profile.db-wal and -shm removed (clean checkpoint)
packaged data root    ~/.config/Kotoba untouched: no profile.db was created there
```

### Packaged build verification (Linux x64, from `file://`)

`npm run package` succeeded, then the packaged binary was launched with
`KOTOBA_DATA_ROOT=/tmp/kotoba-m3-packaged` and probed through CDP:

```text
npm run package        -> out/Kotoba-linux-x64/kotoba + resources/app.asar (544,683 bytes)
startup log            -> [kotoba] data root (env): /tmp/kotoba-m3-packaged
url                    file:///…/resources/app.asar/.vite/renderer/main_window/index.html
CSP                    script-src 'self'; connect-src 'self'  (no unsafe-inline, no ws:)
node leaks             window.require / window.process / window.ipcRenderer all undefined
first launch           wizard rendered, no sidebar
profiles.create        ok: profile id (36 chars), 1 goal, startDate 2026-05-17
planner.getToday       ok: target 120 min / 15 words, assignments sum 120
backup list            1 daily snapshot of 65,536 bytes
close via Browser.close  all processes gone, WAL/SHM checkpointed away, no log errors
```

This proves `zod` and `temporal-polyfill` are bundled into `main.cjs`, `node:sqlite` works from
inside the ASAR, and the production CSP holds. The profile was created by calling the IPC directly
in this probe, so the renderer (still showing the wizard) was not expected to re-boot — the wizard
UI itself was exercised in dev mode above.

### Problems found and fixed during verification

| Problem | Fix |
|---|---|
| `OnboardingWizard.tsx` imported `../../shared/...` | It is one directory deeper than the pages: changed to `../../../shared/...` and `../../lib/useAsync`. |
| `registerHandler<Parameters<typeof restoreBackup>[1], …>` resolved to `string`, but the schema parses `{ fileName }` | Handler is typed as `BackupRestoreInput` and reads `input.fileName`. |
| Three integration tests asserted the wrong thing (code was correct) | The "past goal" test hit the "before start date" branch first (profile now starts earlier); a same-day goal edit updates that day's version in place, so the version id is stable and the **plan** id changes; the "tomorrow" test never created today's plan, so the count is 2 only after requesting both days. |
| `pkill -f electron` makes Electron abort with "GPU process isn't usable. Goodbye." | Killing the browser process takes the GPU child with it. Close through CDP `Browser.close` (or the window) instead. Development note only. |
| Runtime probes using `document.body.innerText` missed the wizard heading | `innerText` applies CSS `text-transform`, so it read `FIRST-TIME SETUP`. Probes use `textContent`. |
| `KOTOBA_DATA_ROOT` was ignored by the real app: `resolveDataRoot` read `options.env`, but `main.ts` passes no `env` | Defaulted the option to `process.env` and added a regression test that calls the function with no `env`. Confirmed in the packaged app: `[kotoba] data root (env): /tmp/kotoba-m3-packaged`. |

### Known limitations

- **Goal editing has no UI yet.** `goals.set` is implemented and tested (effective-dated, past days
  rejected, same-day rebuild), and the Profile page shows read-only goal history. The editing screen
  is M6.
- **No arbitrary-day API yet.** Only `planner.getToday` exists, so the before-start and
  after-horizon dashboard states are covered by integration tests, not by clicking through them.
  The calendar (M6) adds day lookup.
- **The pre-migration backup path is wired but never exercised**, because schema v1 is the only
  migration. It runs when a v2 migration is added; `migrate()` idempotency is tested.
- **Backup file names use UTC** (`kotoba-YYYYMMDD-HHMMSS-reason.db`). Near midnight the file name's
  date can differ from the study-day key; observed once (study day 2026-11-26, file named
  `20261127`). Cosmetic, but worth knowing when matching a backup to a day.
- **Timezone is a validated text field** in the wizard, prefilled with the detected zone, not a
  dropdown of zones.
- **Profile switching is not built.** The schema supports it; the UI shows one profile and returns
  `CONFLICT` on a second create.
- **Windows was not re-tested for M3.** The database work was verified on Linux/WSLg, both in dev
  and in the packaged x64 build. The packaged Windows app must be re-checked when M5 ships real
  data, since that is the first milestone where the database matters to the user.

### Next step

M4 — kana learning: original kana data (46+46 basic plus extended), learning groups, chart, quizzes
with normalised answers, unhinted mastery rule, persisted attempts, the first real study timer, and
kana metrics wired into the dashboard and profile.

---

## M4 — Kana learning and the study timer

Date: 2026-11-27
Status: **code complete and verified on Linux**, dev and packaged. Not marked REACHED because the
Windows build was deliberately deferred to after M5 by the user. Schema version: **2**.

### What was built

| Area | Files |
|---|---|
| Data | `data/curriculum/kana.json` (original, 217 items: 46 basic per script plus dakuten/handakuten, yōon, small っ, prolonged mark), `src/shared/kanaData.ts`, `src/shared/kanaAnswer.ts` (WanaKana) |
| Rules | `src/shared/kanaRules.ts` (mastery, 7/14/30 intervals, metric definitions, queue ordering), `src/shared/timer.ts` (gap cap, monotonic accumulation, midnight split) |
| Schema | `src/main/database/migrations/002_kana.ts` — `kana_progress`, `kana_attempts`, `study_events`, `study_sessions`, `session_segments`; index updated to v2 |
| Repositories | `src/main/database/repositories/{kana,study,events}.ts` |
| Services | `src/main/services/kana.ts` (atomic attempt + event + progress, idempotent by `eventId`, summary, lesson, queue), `src/main/services/timer.ts` (main-owned, 10-second checkpoints, 60-second gap cap, recovery) |
| Planner | Today's minutes now come from session segments; same-day goal changes are refused once study activity exists |
| IPC | 11 new channels for kana and study, all with Zod payloads and `Result`, exposed through preload |
| Renderer | `src/renderer/features/kana/{KanaPage,KanaChart,KanaQuiz,useKana}.tsx`, `src/renderer/components/TimerControls.tsx`, ready Hiragana/Katakana routes, dashboard and profile metrics, timer UI in the top bar |
| Docs | `docs/superpowers/specs/2026-11-27-m4-kana-design.md`, `docs/superpowers/plans/2026-11-27-m4-kana.md`, `THIRD_PARTY_LICENSES.md`, this file, `docs/ARCHITECTURE.md`, `README.md` |

WanaKana 5.3.1 (MIT) was installed by the user and is recorded in `THIRD_PARTY_LICENSES.md`.
The kana data is authored here; no external dictionary or flashcard content is copied.

### Commands executed and actual results

```text
node -p "require('wanakana/package.json').version"  -> 5.3.1
npm run lint       -> oxlint: no findings
npm run typecheck  -> tsc -p tsconfig.json && tsc -p tsconfig.node.json: exit 0
npm test           -> Test Files 15 passed (15), Tests 153 passed (153)
npm run package    -> out/Kotoba-linux-x64/kotoba + resources/app.asar
```

Test distribution: 6 kana data, 6 normalization, 11 rules, 9 timer unit, 9 migration v2,
10 kana service, 5 timer integration, plus the 97 tests from M0–M3.

### Live upgrade of the M3 dev profile

The existing `~/.config/Kotoba-dev/profile.db` was still schema v1 with one real M3 test profile.
Launching the app upgraded it in place:

```text
before: schema version 1, 1 profile, 3 backups
after:  schema version 2, 5 new tables present, profile start_date 2026-11-26 unchanged
new backup: kotoba-20261127-090447-pre-migration.db
```

### Runtime evidence (dev window, real IPC and SQLite)

```text
boot           dashboard shown, no onboarding, timer controls and Next action present
#/hiragana     heading Hiragana, 14 groups, 108 selectable cells, quiz input present
quiz           selected か, typed "ka", feedback "Correct"; summary attempts 1,
               h-ka status "learning" (3 unhinted corrects on 2 days are required)
reload         attempt count still 1 — persisted in profile.db
timer          start -> running, 2s elapsed while running, pause -> paused,
               resume -> running, stop -> inactive
dashboard      actual.minutes 0 (3 measured seconds, correctly floored),
               kana learning 1, assignments still sum to 120
db after close 1 kana attempt, 1 study event, 1 stopped session with active_seconds 3,
               two session_segments of 2s and 1s (reconciled), no log errors
```

### Packaged build (`file://`, Linux x64)

```text
url            file:///…/resources/app.asar/.vite/renderer/main_window/index.html
CSP            script-src 'self'; connect-src 'self' — no unsafe-inline, no ws:
node leaks     window.require / window.process undefined
fresh root     first launch shows onboarding (correct)
profile create ok, 1 goal
attempt        typed "KA" -> correct: true, expected か, status learning —
               WanaKana normalization works from the ASAR bundle
summary        attempts 1, h-ka status learning
quit           no log errors after the fix below
```

### Bug found and fixed during verification

| Problem | Fix |
|---|---|
| Quitting before onboarding logged `could not stop the timer on quit: No profile exists` — `TimerService.status()` required a profile even with no active session | `status()` now returns an inactive state with no interrupted sessions when there is no profile. Regression test: "reports an inactive timer when no profile exists yet", RED → GREEN; packaged quit re-verified with no errors. |

### Whole-branch review and fix pass

A fresh reviewer read the design, plan, working-tree sources and the ledger. It confirmed the pure
rules, atomic attempt writes, migration discipline and timer design, then found one critical and
four important issues. All were fixed in one TDD pass:

| Finding | Fix and evidence |
|---|---|
| An orphaned **paused** session locked the timer forever after a crash (only `running` rows were recovered) | `recover()` now interrupts both `running` and `paused`; regression test "recovers a paused session left behind by a restart" RED → GREEN. Live: an injected paused row appeared as interrupted and a new session started successfully. |
| Due characters were invisible and the review panel was gated on `struggling` | Panel now opens whenever there are due/missed items; due characters get a dashed chart marker. Live: one due cell and the matching hiragana chip rendered. |
| Review chips could select a katakana character while on the hiragana page | The queue is filtered to the current script's item ids before rendering. |
| Dashboard showed hardcoded zeros in the assignment "Done" column and month card | `Actuals.minutesByActivity` now comes from session segments grouped by activity type. Live: `2 / 120 min` overall, Kana row Done `2`, fake "Actual so far: 0 min" line removed. |

Final checks after the pass: `npm run lint` clean, `npm run typecheck` exit 0, `npm test` **15 files /
155 tests passed**. Packaged quit re-verified with no errors. `graphify update .` was run after the
source changes.

Minor review suggestions were deliberately not applied in this pass: per-segment audit timestamps at
a midnight split, a `voiceschanged` listener for the optional audio button, and copy about a romaji
toggle that the quiz does not implement. They are recorded in the execution ledger.

### Known limitations

- **Windows installer is deferred to after M5** by user decision. M4 has Linux dev and packaged
  evidence only; the milestone table reflects that.
- No FSRS in M4. Intervals are a simple 7/14/30-day ladder with `scheduler_version = 'interval-v1'`,
  so M5 can migrate review state without losing attempts.
- Multiple-choice answers and any answer given with a hint are logged but never count toward
  verification. This is deliberate: "verified" means unhinted typed recall.
- The quiz needs no audio; a Listen button appears only when a Japanese voice is actually installed.
  There is no bundled or downloaded TTS.
- Stroke-order SVG was not added (rights and quality unverified). The chart teaches recognition.
- The kana catalogue is original and offline, but the 46-per-script split treats small っ and the
  prolonged mark as extended rather than basic; the UI labels this honestly.
- Goal editing still has no UI (M6), and the profile page keeps its read-only goal history.
- No arbitrary-day planner API yet (M6); before-start and after-horizon states remain
  integration-tested rather than clickable.

### Next step

M5 — dictionary pipeline, vocabulary and FSRS: pin and validate JMdict/KANJIDIC2, build the offline
dictionary, then add the stable 15-word daily lesson, personal vocabulary and the FSRS review
engine. The Windows installer will be built and verified by the user after M5.
