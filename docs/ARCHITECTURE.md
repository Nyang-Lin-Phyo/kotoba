# Kotoba architecture

Status: milestone M1 (desktop shell). Everything below describes what exists, not what is planned.

## Process model

```
main process (Node, privileged)          renderer (sandboxed, no Node)
  src/main/index.ts                        src/renderer/index.tsx
    - app lifecycle, one window              - React 19 + React Router (HashRouter)
    - window security options                - sidebar shell, dashboard/profile/settings
    - IPC handlers                           - talks to main only through window.kotoba
  src/main/security.ts
    - CSP builder, window options,
      sender-origin check (pure, tested)
  src/main/ipc.ts
    - app:info handler, validates sender
                 ▲
                 │ ipcRenderer.invoke (preload only)
  src/preload/index.ts
    - contextBridge.exposeInMainWorld('kotoba', { appInfo })
```

- `src/shared/` holds contracts and the sidebar model. It is imported by every process and must
  never import Node or Electron modules.
- Renderer has no Node access, no `ipcRenderer`, no filesystem and no database handle.

## Security posture

| Control | Setting |
|---|---|
| Context isolation | `contextIsolation: true` |
| Node in renderer | `nodeIntegration: false`, `nodeIntegrationInWorker: false` |
| Sandbox | `sandbox: true` (preload is bundled as CommonJS) |
| Web security | `webSecurity: true`, `allowRunningInsecureContent: false` |
| Preload surface | only `window.kotoba.appInfo()` |
| IPC sender check | `isTrustedSender()` — packaged `file://` or the exact Vite dev origin |
| Navigation | `will-navigate` blocked for untrusted URLs |
| New windows | `setWindowOpenHandler` always denies |
| `<webview>` | `will-attach-webview` prevented |
| Permissions | `setPermissionRequestHandler` denies everything |
| CSP | one builder in `src/main/security.ts`, injected at build time; the dev policy is relaxed for HMR and the production policy is asserted by tests |
| Packaging fuses | RunAsNode off, cookie encryption on, Node CLI/inspect off, ASAR integrity + only-load-from-ASAR |

Development relaxations exist only in the `serve` build; `tests/unit/security.test.ts` fails if
the production policy ever gains `unsafe-inline`, `unsafe-eval` or a websocket source.

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
- Main and preload are built to `.vite/build/*.cjs`; the renderer to `.vite/renderer/main_window`.
- `MAIN_WINDOW_VITE_DEV_SERVER_URL` is defined by the plugin in dev and undefined when packaged.
- `src/main/security.mts` is `.mts` so the Vite config (ESM) can import the CSP builder without
  the "ESM syntax in a file loaded as CommonJS" warning. `allowImportingTsExtensions` is on,
  which is safe because TypeScript never emits (Vite does the transpiling).
- TypeScript 6 is used for type checking only (`noEmit`); Vite does the transpiling.
- Two tsconfigs: `tsconfig.json` (renderer, DOM libs, no Node types) and `tsconfig.node.json`
  (main, preload, tests, build configs, Node types). This stops renderer code from silently
  depending on Node APIs.

## Decisions recorded

| Decision | Reason |
|---|---|
| Electron 45.5.0 | Bundles Node 24.22.3; `ts-fsrs` v6 (M5) requires Node ≥24 |
| TypeScript 6.0.3 | The version the Forge 8 template is tested against; TS 7 is a new compiler |
| oxlint only | Fast, zero-config; formatting is deferred |
| No Tailwind at M1 | Plain CSS custom properties; styling tooling is not a milestone risk |
| No Zod at M1 | No IPC payloads exist yet; validation arrives with real payloads at M3 |
| HashRouter | Deep links keep working from `file://` in the packaged app |
| SQLite backend | Undecided: `better-sqlite3` vs built-in `node:sqlite`, decided by an M5 smoke test |

## Not in this milestone

Profiles, databases, backups, timers, kana, dictionary, FSRS, kanji, grammar, media, statistics.
Sidebar entries for those carry their milestone tag and are not clickable.
