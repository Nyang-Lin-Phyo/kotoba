# Third-party licences

This file records the licences of software and data bundled with or required to build Kotoba.
Dictionary and corpus data are bundled; every source version, hash and redistribution right is
recorded here and in `data/manifest.json`.

## Runtime / bundled dependencies

| Package | Version | Licence | Purpose | Source |
|---|---|---|---|---|
| WanaKana | 5.3.1 | MIT | Romaji/IME input normalization for kana quizzes | https://github.com/WaniKani/WanaKana |
| ts-fsrs | 6.0.1 | MIT | FSRS-7 spaced-repetition scheduling for word reviews | https://github.com/open-spaced-repetition/ts-fsrs |
| kuromoji | 0.1.2 | Apache-2.0 | Offline Japanese tokenization | https://github.com/takuyaa/kuromoji.js |
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

## Dictionary data (bundled in the installer)

| Source | Version | Licence | Purpose |
|---|---|---|---|
| JMdict (via `scriptin/jmdict-simplified`, `jmdict-eng-common`) | 3.6.2+20261123231529 | CC BY-SA 4.0 (EDRDG) | Japanese–English words, spellings, readings, senses, priority tags |
| KANJIDIC2 (via `scriptin/jmdict-simplified`, `kanjidic2-en`) | 3.6.2+20261123231529 | CC BY-SA 4.0 (EDRDG) | Kanji readings, meanings, grade, stroke count, frequency |

Attribution: Japanese word and kanji data from JMdict and KANJIDIC2, compiled by the Electronic
Dictionary Research and Development Group (EDRDG), used under Creative Commons Attribution-ShareAlike
Licence 4.0. JSON conversion by `scriptin/jmdict-simplified`. Kotoba claims no copyright over the
source data.

The derived database `resources/dictionaries/dictionary.db` is distributed under **CC BY-SA 4.0**.
The installer bundles `resources/notices/SOURCES.txt` and the full `CC-BY-SA-4.0.txt` legalcode, and
the app shows the same attribution on a Sources screen (Settings → Sources) rather than only at
startup. Source pages:
https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project ,
https://www.edrdg.org/wiki/index.php/KANJIDIC_Project ,
https://www.edrdg.org/edrdg/licence.html .

EDRDG requires a procedure for updating to newer data versions; the pinned versions, hashes and
update steps are recorded in `data/manifest.json`.

**Not used:** Kaishi 1.5k (no licence file; its README derives content from commercial Core/Tango
decks), Jiten, BCCWJ, Tatoeba, community JLPT lists and all flashcard media. No JLPT level is
invented: the `jlpt_tags` table exists but is empty.

## Original data

`data/curriculum/kana.json`, `data/curriculum/beginner_words.json`,
`data/curriculum/kana_words.json`, `data/curriculum/grammar_units.json`,
`data/curriculum/reading_passages.json` and
`data/fixtures/dictionary_fixture.json` are original data authored for this project. The fixture is
synthetic and must never be shipped in a packaged build.


## Offline tokenizer data

Kuromoji.js bundles mecab-ipadic-2.7.0-20070801 (Copyright 2000–2003 Nara Institute of Science
and Technology). Use, reproduction and distribution are permitted provided the copyright notice and
IPADIC/ICOT warranty paragraphs accompany the data. The installer includes
`resources/notices/IPADIC-NOTICE.txt` and `resources/notices/APACHE-2.0-kuromoji.txt`, and the
`resources/tokenizer/dict` assets are generated from the pinned npm package by
`npm run prepare:tokenizer`; they are not committed. No network access is needed at runtime.
