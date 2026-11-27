# Kotoba 言葉

An offline-first Japanese learning desktop app for Windows, built with Electron, React and
TypeScript. Lessons, spaced repetition and your learning data stay on your machine.

## Status

Milestone **M4** — kana learning and the study timer. First launch runs a setup wizard (name, start
date, horizon, daily goals, timezone, preferences) and previews the resulting dates and totals before
anything is written. The profile, its effective-dated goals and each day's frozen plan live in a
local SQLite database, with automatic daily backups and a restore path in Settings.

Hiragana and Katakana are now usable: an offline character chart, typed or multiple-choice quizzes
with a hint toggle, a review queue for missed characters, and a main-process study timer in the top
bar. Verified kana recognition means three unhinted typed correct answers on at least two study days.
Measured minutes come only from the timer — flashcards never fabricate time.

The dictionary, vocabulary and spaced-repetition reviews arrive in M5; those sidebar items remain
disabled with their milestone label. The Windows build is deliberately deferred until after M5.

See [`docs/PROGRESS.md`](docs/PROGRESS.md) for what is actually done and verified.

## Requirements

- **Node.js 24** (the repo pins it in `.nvmrc`; `nvm use` picks it up). Node 18 or 20 is not
  supported by the Electron 45 toolchain.
- npm 11+
- Python 3.12 with a local `.venv` — only needed later, for the dictionary data pipeline.

## Setup

```bash
cd ~/codeStuff/kotoba
nvm use                 # Node 24
npm install             # creates node_modules and package-lock.json
```

## Run

```bash
npm start               # launches the desktop app (Electron + Vite dev server)
```

The dev server binds to loopback only. There is no browser URL to open; the window is the app.

## Checks

```bash
npm run lint            # oxlint
npm run typecheck       # tsc for renderer, then for main/preload/tests
npm test                # vitest: 153 unit + SQLite integration tests
```

The integration tests create their own temporary data directories; they never touch a real profile.

## Build

```bash
npm run package         # unpacked app in out/
npm run make            # installer for the current OS (Windows: Squirrel)
```

Windows builds are produced by `.github/workflows/build-windows.yml` (manual dispatch, x64).

## Your data

Everything is local. There is no account, no email and no server.

| What | Where |
|---|---|
| Installed app | Electron `userData` — `%APPDATA%\Kotoba` on Windows, `~/.config/Kotoba` on Linux |
| Profile database | `<userData>/profile.db` (SQLite, WAL mode) |
| Automatic and manual backups | `<userData>/backups/kotoba-YYYYMMDD-HHMMSS-<reason>.db` |
| Development (`npm start`) | `<userData>-dev`, so it can never open or migrate your real profile |
| Tests / CI | `KOTOBA_DATA_ROOT` pointed at a throwaway directory |

Backups are consistent snapshots taken with SQLite's `VACUUM INTO`, not file copies. The newest 14
daily snapshots plus a few safety snapshots are kept. Create one any time in **Settings → Backups**;
restoring always snapshots the current database first, so a restore can itself be undone.

Uninstalling the app does **not** delete this folder. Backups on the same disk do not protect against
disk failure — copy the `backups` folder elsewhere if the data matters.

Never commit a real `profile.db`; `.gitignore` already excludes `*.db` and the WAL sidecars.

## Studying kana

Open **Hiragana** or **Katakana** from the sidebar. Pick a character in the chart, type its reading
in romaji or kana, and press Enter. Turn the hint off when you want the answer to count toward
verified recognition. Multiple choice is available but is always labelled assisted.

Start the timer in the top bar before a study session and stop it when you finish. Time is
checkpointed in the main process; a crash or sleep cannot turn into study minutes. Minutes appear on
the Dashboard once at least 60 seconds have been measured.

## Licensing

See [`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md) for bundled dependency licences, including
WanaKana (MIT) used for answer normalization. Dictionary, kanji and frequency data are not bundled
yet; when they are, every source, version, hash and licence will be recorded in `data/manifest.json`,
with attribution in the app.
