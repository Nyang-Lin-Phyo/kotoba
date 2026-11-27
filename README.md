# Kotoba 言葉

An offline-first Japanese learning desktop app for Windows, built with Electron, React and
TypeScript. Lessons, spaced repetition and your learning data stay on your machine.

## Status

Milestone **M1** — desktop shell. The app opens, navigates and reads live version data from the
main process. No lessons, dictionary or review scheduling exist yet; sidebar items that are not
implemented are shown disabled with the milestone that will add them.

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
npm test                # vitest unit tests
```

## Build

```bash
npm run package         # unpacked app in out/
npm run make            # installer for the current OS (Windows: Squirrel)
```

Windows builds are produced by `.github/workflows/build-windows.yml` (manual dispatch, x64).

## Your data

Not implemented yet. From M3 on, profiles, review history and backups will live under the
Electron `userData` directory (`%APPDATA%\Kotoba` on Windows), never inside the install folder
and never in the repository.

## Licensing

Application code: see `package.json`. Dictionary, kanji and frequency data are not bundled yet;
when they are, every source, version, hash and licence will be recorded in `data/manifest.json`
and `THIRD_PARTY_LICENSES.md`, with attribution in the app.
