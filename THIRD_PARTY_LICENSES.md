# Third-party licences

This file records the licences of software and data bundled with or required to build Kotoba.
Dictionary and corpus data are not bundled yet; when they are, every source version, hash and
redistribution right will be listed here and in `data/manifest.json`.

## Runtime / bundled dependencies

| Package | Version | Licence | Purpose | Source |
|---|---|---|---|---|
| WanaKana | 5.3.1 | MIT | Romaji/IME input normalization for kana quizzes | https://github.com/WaniKani/WanaKana |
| React | 19.3.1 | MIT | Renderer UI | https://react.dev/ |
| React DOM | 19.3.1 | MIT | Renderer DOM binding | https://react.dev/ |
| React Router | 7.18.7 | MIT | Hash routing that works from `file://` | https://reactrouter.com/ |
| lucide-react | 1.81.0 | ISC | Sidebar and UI icons | https://lucide.dev/ |
| electron-squirrel-startup | 1.0.1 | Apache-2.0 | Windows installer event handling | https://github.com/mongodb-js/electron-squirrel-startup |

## Development / build dependencies

Electron (MIT), Electron Forge and its makers/plugins (MIT), Vite (MIT), TypeScript (Apache-2.0),
oxlint (MIT), Vitest (MIT), Zod (MIT), temporal-polyfill (MIT) and the supporting
npm packages are used only to build and test. Their full licence texts are in each package's
`node_modules` directory; none of these packages need to be installed by an end user.

## Data

`data/curriculum/kana.json` is original data authored for this project. It contains kana characters
and short original example phrases only; no external dictionary, subtitle, flashcard or textbook
content is copied.
