# M5a design — offline dictionary pipeline and search

Date: 2026-11-27
Status: **proposed** (awaiting approval)

## Intent and why

M4 made kana genuinely usable. M5a is the first half of the core daily-study release: it builds a
small, reproducible, legally clean Japanese–English dictionary that ships inside the Windows app and
can be searched offline. It does **not** introduce words into lessons yet (M5b) or schedule reviews
(M5c).

## Goals

- Download two pinned, permitted data assets with verified checksums and generate one immutable
  `dictionary.db` using only Python's standard library.
- Reproducible build: identical source versions produce equivalent contents and stable ids; no
  network needed with `--offline` once the cache is verified.
- Search Japanese exact/prefix forms and readings, English tokens via FTS5, and romaji input, with
  bounded results and deterministic ranking that puts common words first.
- Bundle the generated database as an Electron extra resource, open it read-only from main, and
  expose narrow typed IPC channels.
- Add a minimal **Dictionary** route: debounced search with bounded results, plus entry and kanji
  detail panels. This satisfies "dictionary route" in M5a's acceptance criteria. Sentence mining and
  word introduction stay in M8/M5b.
- Meet every licence obligation: attribution, licence text, an in-app Sources screen, share-alike
  marking on the derived database, and a documented update procedure.

## Non-goals

- No word introduction, daily 15-word lesson, personal vocabulary or FSRS (M5b/M5c).
- No sentence examples or audio from external decks.
- No community JLPT labels: there is no verified official list, so `jlpt_tags` exists but stays empty.
- No Kaishi 1.5k data or ordering. The repository has no `LICENSE` (`"license": null`) and its README
  states its content came from Core2k/Core10k/Tango decks, which `AGENTS.md` forbids copying.
- No sentence mining, no cross-linking into the lesson planner, and no clickable external links.
  Attribution texts are bundled locally instead, so no new `shell.openExternal` permission path is
  needed.
- No Windows installer run from this session — the user runs CI after the milestone is accepted.

## Constraints

- **Free and permitted.** JMdict Simplified `3.6.2+20261123231529` is EDRDG CC BY-SA 4.0; KANJIDIC2
  from the same release is CC BY-SA 4.0. Derived `dictionary.db` is therefore distributed under
  CC BY-SA 4.0. The application code remains the project's own code.
- EDRDG requires: acknowledgement of source in documentation and in-app (a Sources/About screen,
  not only a launch page), copies of licence/documentation files or links, no claim of copyright over
  the source data, and a procedure for updating to newer versions.
- No runtime network, no Python in the installed app, no paid API, no API keys.
- Strict TypeScript, Zod-validated IPC, sender-checked handlers, `Result` envelopes, parameterized
  SQL, bounded pagination.
- Runtime `node:sqlite` has FTS5 and read-only opening verified in Electron 45; Python 3.12's
  `sqlite3` 3.45.1 also has FTS5 (both verified).

## Approaches considered

| Approach | Trade-off | Decision |
|---|---|---|
| Python stdlib → SQLite with FTS5, read from main | One generated file, fast indexed search, no native addon, identical backend to M3/M4 | **Chosen** |
| Ship raw JSON and search in the renderer | Multi-megabyte renderer bundle, no indexes, slow and memory-heavy | Rejected |
| `better-sqlite3` in main | Native ABI rebuild per platform; M3 already chose `node:sqlite` for good reason | Rejected |

## Data

Pinned release: `jmdict-simplified` **3.6.2+20261123231529**.

| Asset | Compressed size | SHA-256 (from release metadata, verified locally) |
|---|---|---|
| `jmdict-eng-common-3.6.2+20261123231529.json.tgz` | 1,451,508 B | `6d2fc77c0b586c22b419d3b83fec39d98e69cbe18f1646c2bdc4c93c153605ea` |
| `kanjidic2-en-3.6.2+20261123231529.json.tgz` | 1,253,440 B | `0d3057a0e6cb80fe7df6b0d239e994cce2ea73cac8466711d9bcb04dac1180c7` |

- `jmdict-eng-common` contains 22,662 entries that already carry `news1`/`ichi1`/`spec1`/`spec2`/
  `gai1` priority markers; these are the commonness signal. Form/readings restrictions are preserved.
- `kanjidic2-en` contains 10,384 characters with grade, stroke count, frequency and on/kun readings.
- `data/curriculum/beginner_words.json` is an **original** small ordered list (greetings, particles,
  numbers, basic verbs) authored here. It supplies the curated starter rank only; every meaning and
  reading still comes from JMdict, never from the original list.
- `data/fixtures/dictionary_fixture.json` is a tiny synthetic fixture with known cases (猫/ねこ/cat,
  食べる/たべる/eat, a homograph, a restricted reading) for CI and malformed-input tests.
- `data/manifest.json` records exact version, URL, asset names, SHA-256, licence, attribution text,
  transformation notes, and the update procedure.

## Generated schema (`resources/dictionaries/dictionary.db`, read-only)

`metadata(key, value)` — source versions, build id, schema version, licence, hash, build timestamp.
`entries(id, source, source_id, canonical_form, priority, curriculum_rank)` — stable source-prefixed
ids, never row offsets.
`forms`, `readings`, `senses`, and their restriction tables — preserve every spelling/reading/sense
combination and which combinations are allowed.
`entry_kanji(entry_id, literal)` and `kanji(literal, grade, strokes, frequency, meaning, ...)` with
`kanji_readings(kanji, type, reading)` grouped by on/kun/yomi.
`kana(character, reading, script, tier)` generated from M4's original catalogue.
`frequencies(entry_id, corpus, rank, score)` — one truthful corpus (`jmdict-priority`) per entry;
`rank` and `score` are derived from the source's own priority markers, never from invented corpus
weights.
`jlpt_tags(...)` — created but intentionally empty (no verified source).
FTS5 virtual tables for English gloss text and Japanese form/reading text.

Every write uses parameterized SQL. Invalid rows are logged and skipped only when optional; a missing
required field in a required source fails the build with a non-zero exit.

## Search behaviour

- Japanese exact and prefix match on forms and normalized readings; English token match via FTS5;
  romaji input converted with the already-installed WanaKana before lookup.
- Canonical spelling is preserved for display; normalization is search-only.
- Homophones and conjugations are not collapsed: results are distinct entries with their own senses.
- Ranking: curated beginner list first, then priority/common tags, then fewer senses / shorter form,
  then stable `source_id` tie-break. No per-corpus invented weighting.
- Bounded: default 20 results, hard maximum 100, query length capped, debounced in the renderer.
- `getEntry`, `getKanji`, `getKana` return full detail by stable id, not row offset.

## Scripts

`scripts/download_datasets.py`, `scripts/build_dictionary.py`, `scripts/validate_dictionary.py`:
`--help`, explicit paths, `--offline` (verified cache only), `--fixture` (committed fixture only),
timeouts and retries, checksum verification before processing, safe archive extraction that rejects
path traversal and oversized members, `.partial` writes renamed atomically, and non-zero exit on any
failure. Rebuilds are idempotent and never overwrite a working database on failure. Production builds
must use real pinned assets; `--fixture` produces a database marked as such and the app refuses to
start with it when packaged.

## Packaging and paths

- `forge.config.mts` adds `extraResource: ['resources/dictionaries']`.
- In development the dictionary is read from `<app.getAppPath()>/resources/dictionaries/dictionary.db`;
  an explicit `KOTOBA_DICTIONARY_PATH` override is used by tests.
- Packaged it is read from `<process.resourcesPath>/resources/dictionaries/dictionary.db` (to be
  confirmed by a real packaged run, not assumed).
- Opened with `{ readOnly: true }`; no writes, no migrations, no foreign keys to `profile.db`.
- **Dev without a generated database still boots**, so kana study keeps working before anyone runs
  the Python pipeline; dictionary calls return `DATA_MISSING`.
- **Packaged builds fail at startup** with a clear dialog when the database is missing, corrupt or
  fixture-marked — an installer must not ship without real licensed data. The fixture check lives in
  the built database's `metadata` and is checked by both the validator and the packaged startup path.

## Licence packaging

- `THIRD_PARTY_LICENSES.md` already records WanaKana and others; add EDRDG CC BY-SA 4.0 and
  KANJIDIC2 attribution, state that `dictionary.db` is CC BY-SA 4.0, and include the licence text and
  source URLs in the installed app.
- Add a read-only **Sources** screen reachable from Settings with attribution, source URLs as plain
  text, and the bundled licence notices rendered from local files (meets the "not just a launch
  page" requirement without adding external-link IPC).
- `data/manifest.json` documents the pinned versions and the update procedure: bump manifest → run
  download/build/validate → re-run CI → ship a new installer.

## Windows CI

Edit `.github/workflows/build-windows.yml` now: add `actions/setup-python@v5` with Python 3.12,
cache the downloaded assets and generated database keyed by `data/manifest.json` plus the three
script hashes, run `download_datasets.py` → `build_dictionary.py` → `validate_dictionary.py` before
`npm run make`, and fail the job if the database is absent or fixture-marked. The manual
`workflow_dispatch` trigger and minimal `contents: read` permission stay unchanged.

## Tests

- Python: fixture build produces the expected entries/forms/senses; malformed entry fails; checksum
  mismatch fails; path traversal in archive fails; idempotent rebuild produces byte-stable logical
  content; `--offline` works with verified cache.
- TypeScript: search normalization (romaji variants, kana script, homophones), ranking order, bounded
  pagination, `getEntry`/`getKanji` by stable id.
- Integration: read-only open, no cross-database foreign keys, missing/corrupt DB → `DATA_MISSING`,
  packaged resource path resolution.
- Validation script rejects a fixture-marked database for production.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Licence non-compliance | Attribution screen + bundled notices + explicit share-alike marking; user-approved sources only |
| Large data slows startup | Open read-only on demand, indexed FTS, bounded results, never load the whole dictionary into renderer |
| Generated DB omitted from installer | Forge `extraResource` plus a packaged smoke test that performs a search from `file://` |
| Fixture accidentally shipped | Production build fails when manifest/build id is fixture-marked |
| Invented JLPT levels or examples | Empty `jlpt_tags`; all glosses/reading forms come from source |
