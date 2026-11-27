# Kotoba — Progress

## Milestone status

| # | Milestone | Status |
|---|---|---|
| M0 | Python environment and repository verification | ✅ **REACHED** 2026-11-26 |
| M1 | Electron foundation and desktop shell | ✅ **REACHED** 2026-11-26 |
| M2 | Native Windows packaging baseline | ⬜ not started |
| M3 | Persistent profile, onboarding, dates | ⬜ not started |
| M4 | Kana learning | ⬜ not started |
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
