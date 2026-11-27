# M5a Dictionary Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reproducible, legally clean offline Japanese–English dictionary and expose bounded search/detail APIs and UI from it.

**Architecture:** Python stdlib scripts download pinned permitted assets, verify SHA-256, and generate one immutable SQLite database with FTS5 indexes. Electron main opens that database read-only via `node:sqlite`, behind Zod-validated IPC. The renderer gets a small Dictionary search page and a Sources screen; no dictionary data is bundled into renderer JavaScript.

**Tech Stack:** Python 3.12 stdlib (`sqlite3`, `tarfile`, `hashlib`, `urllib`), Node 24, Electron 45 `node:sqlite`, TypeScript 6 strict, Zod 4.6.7, Vitest 5, React 19.

**Spec:** `docs/superpowers/specs/2026-11-27-m5a-dictionary-design.md` — read it with this plan.

## Global Constraints

- Never run `git add`, `commit`, or `push`; never install packages. Python used is `<repo>/.venv/bin/python`.
- Only permitted sources: JMdict Simplified `3.6.2+20261123231529` `jmdict-eng-common` and `kanjidic2-en`, both CC BY-SA 4.0. Never Kaishi, Core/Tango decks, subtitle scraping, paid data or API keys.
- `dictionary.db` is derived data licensed CC BY-SA 4.0; source data attribution and licence text must ship with the app. No claim of copyright over source data.
- No invented JLPT levels, examples, pronunciations or corpus weights. `jlpt_tags` stays empty.
- Generated `resources/dictionaries/` and `data/raw/` are gitignored; `data/manifest.json`, `data/curriculum/`, `data/fixtures/`, scripts and tests are committed.
- Strict TS, Zod schema per channel, sender check, `Result` envelope, parameterized SQL only, bounded inputs/outputs, no broad `any`.
- Dev boots without a dictionary (IPC returns `DATA_MISSING`); packaged builds fail at startup if the DB is missing, corrupt or fixture-marked.
- After any task that changes source files, run `graphify update .` (project AGENTS.md).
- Use targeted `graphify query/path/explain` for navigation; never load `graphify-out/graph.json` wholesale.

## Review Focus

| Risk | Pinning test |
|---|---|
| Fixture or unlicensed data reaches a production installer | Task 4 `test_production_guard`: validator exits non-zero for fixture-marked DB; Task 5 packaged check fails without real DB |
| Checksum mismatch or archive path traversal is accepted | Task 2 `test_rejects_bad_checksum`, `test_rejects_traversal_member` |
| Duplicate homophones/alternate spellings collapse into one result | Task 6 `dictionary.test.ts`: distinct entries stay distinct; no dedupe by reading |
| Ranking invents corpus weights or JLPT levels | Task 3 `test_frequencies_are_source_derived`; Task 4 `jlpt_tags` empty assertion |
| Packaged resource path differs from dev path | Task 5 packaged search smoke test from `file://`, plus Task 5 path unit test |

---

## File structure

| File | Responsibility |
|---|---|
| `data/manifest.json` | Pinned versions, URLs, SHA-256, licences, attribution, update procedure |
| `data/curriculum/beginner_words.json` | Original ordered starter list (rank only, no meanings/reading claims) |
| `data/fixtures/dictionary_fixture.json` | Small synthetic JMdict/KANJIDIC-shaped fixture |
| `scripts/kotoba_data.py` | Shared manifest/checksum/atomic-write helpers |
| `scripts/download_datasets.py` | Fetch/verify/extract pinned assets; `--offline`, `--fixture` |
| `scripts/build_dictionary.py` | Generate `dictionary.db` from verified sources or fixture |
| `scripts/validate_dictionary.py` | Schema/integrity/known-query/asset checks; production guard |
| `tests/python/test_pipeline.py` | stdlib `unittest` tests for all three scripts |
| `src/main/dictionary/paths.ts` | Pure dev/packaged path resolution |
| `src/main/dictionary/repository.ts` | Read-only SQL for search/detail/metadata |
| `src/main/services/dictionary.ts` | Ranking, normalization, bounded search DTOs |
| `src/shared/{contracts,schemas}.ts`, `src/main/ipc.ts`, `src/preload/preload.ts` | New channels and types |
| `src/renderer/features/dictionary/*`, `src/renderer/pages/SettingsPage.tsx`, `src/shared/nav.ts`, `src/renderer/App.tsx` | Dictionary route and Sources screen |
| `forge.config.mts`, `.github/workflows/build-windows.yml` | Extra resource and CI pipeline |
| `THIRD_PARTY_LICENSES.md`, `README.md`, `docs/PROGRESS.md`, `docs/ARCHITECTURE.md` | Attribution and honest status |

---

## Task 1 — Manifest, original starter list and fixture

**Files:** Create `data/manifest.json`, `data/curriculum/beginner_words.json`, `data/fixtures/dictionary_fixture.json`.
**Interfaces:** Consumes the pinned release metadata in the spec; produces the exact JSON shapes used by Python scripts.

- [ ] **Step 1: Write the manifest** with `schema_version`, release tag, both asset names/URLs/sizes/SHA-256 from the spec, `licence: CC-BY-SA-4.0`, attribution text, `derived_database_licence`, `update_procedure`, and a `fixture` entry pointing at the committed fixture.
- [ ] **Step 2: Write the original beginner list** with ~40 original starter entries as `{ "rank": 1, "form": "こんにちは", "reading": "こんにちは" }`. No meanings, no external deck order.
- [ ] **Step 3: Write the fixture** with a top-level `entries` array of at least four JMdict-shaped entries (猫/ねこ/cat, 食べる/たべる/eat, one homograph pair with the same reading, one entry with a restricted reading) plus a `characters` array containing 猫.
- [ ] **Step 4: Verify** with `python3 -c "import json; [json.load(open(p)) for p in [...]]"` and `git check-ignore` on `data/raw/` only. Expected: all parse; manifest/fixture are not ignored.

## Task 2 — Download script and archive safety

**Files:** Create `scripts/kotoba_data.py`, `scripts/download_datasets.py`, `tests/python/test_pipeline.py`.
**Interfaces:**
- Consumes: manifest paths from Task 1.
- Produces: `verify_sha256(path, expected)`, `safe_extract_tgz(archive, destination, max_bytes)`, `load_manifest(path)`, `download_assets(manifest, raw_dir, offline=False, timeout=30, retries=3) -> list[Path]`.

- [ ] **Step 1: Write failing `unittest` tests** for `verify_sha256` (match/mismatch), `safe_extract_tgz` rejecting `../escape` and a member over the size cap, and `download_assets(offline=True)` succeeding from a pre-populated verified cache but failing when a file is missing.
- [ ] **Step 2: Run them** with `.venv/bin/python -m unittest discover -s tests/python -v`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement the helpers and CLI** with `--manifest`, `--raw-dir`, `--offline`, `--fixture`, `--timeout`, `--retries`; use `urllib.request` with timeout/retry, verify digest before extraction, write to `.partial` then atomic rename, and exit non-zero with a clear message on any failure.
- [ ] **Step 4: Run tests** — expected PASS.

## Task 3 — Dictionary builder

**Files:** Create `scripts/build_dictionary.py`; extend `tests/python/test_pipeline.py`.
**Interfaces:**
- Consumes: verified assets from Task 2, fixture from Task 1.
- Produces: `build_dictionary(source_dir, output, manifest, beginner_list=None, fixture=False) -> pathlib.Path` creating the schema in the spec.

- [ ] **Step 1: Write failing fixture-build tests** asserting: schema version and metadata present; 猫/ねこ/cat and 食べる/たべる/eat are findable; forms/readings/senses restrictions round-trip; two homographs remain two entries; `frequencies` rows only have `corpus='jmdict-priority'`; `jlpt_tags` is empty; `kana` contains the M4 original kana; ids are stable across two builds.
- [ ] **Step 2: Run to verify failure**, then implement the SQL schema and streaming insertion with parameterized statements, `.partial` + atomic rename, and deterministic ids from `source_id` (never row offsets).
- [ ] **Step 3: Run tests** — expected PASS.

## Task 4 — Validator and production guard

**Files:** Create `scripts/validate_dictionary.py`; extend `tests/python/test_pipeline.py`.
**Interfaces:** Consumes a generated DB and the manifest; produces `validate(db, manifest, require_production=False) -> list[str]` and a CLI with `--db`, `--manifest`, `--require-production`.

- [ ] **Step 1: Write failing tests** for: valid fixture DB passes without `require_production`; same DB fails with `require_production`; missing required sense/reading fails; `PRAGMA integrity_check` failure is detected; known queries (猫/ねこ/cat, 食べる/たべる/eat) succeed; FTS5 tables and indexes exist.
- [ ] **Step 2: Run to verify failure**, then implement validation with nonzero exit and specific error messages.
- [ ] **Step 3: Run tests** — expected PASS.
- [ ] **Step 4: Build the real database** into `resources/dictionaries/dictionary.db` using the pinned assets already downloaded to `/tmp/kotoba-m5` (copy them into ignored `data/raw/` first), then run `validate --require-production`. Expected: PASS with ~22,662 entries and ~10,384 kanji; record actual counts and DB size.

## Task 5 — Resource bundling and path resolution

**Files:** Create `src/main/dictionary/paths.ts`; modify `forge.config.mts`; extend unit/integration tests.
**Interfaces:**
- Consumes: generated DB path; produces `resolveDictionaryPath({ isPackaged, appPath, resourcesPath, env }) -> string`.

- [ ] **Step 1: Write failing path tests** for dev (`<appPath>/resources/dictionaries/dictionary.db`), packaged (`<resourcesPath>/resources/dictionaries/dictionary.db`), and `KOTOBA_DICTIONARY_PATH` override.
- [ ] **Step 2: Run to verify failure**, implement, run PASS.
- [ ] **Step 3: Add `extraResource: ['resources/dictionaries']`** to `forge.config.mts` and run `npm run package`. Verify the DB exists inside `out/Kotoba-linux-x64/resources/resources/dictionaries/`; record the actual path rather than assuming it.
- [ ] **Step 4: Run graphify update .** after source changes.

## Task 6 — Read-only repository, ranking and IPC

**Files:** Create `src/main/dictionary/repository.ts`, `src/main/services/dictionary.ts`; modify `src/shared/contracts.ts`, `src/shared/schemas.ts`, `src/main/ipc.ts`, `src/preload/preload.ts`; create `tests/unit/dictionary.test.ts`, `tests/integration/dictionarySearch.test.ts`.
**Interfaces:**
- Consumes: path resolver and generated DB; produces `search(input)`, `getEntry(id)`, `getKanji(literal)`, `getKana(id)`, `getMetadata()` and channels `dictionary.*`.

- [ ] **Step 1: Define DTOs and schemas** — `DictionaryResult`, `DictionaryEntry`, `DictionaryKanji`, `DictionaryKana`, `DictionaryMetadata`; `dictionarySearchSchema` with `query` 1–80 chars, `limit` 1–100 default 20, `offset` ≥0; `dictionaryIdSchema` with stable string ids ≤64 chars.
- [ ] **Step 2: Write failing unit tests** for normalization (romaji `neko`, katakana ネコ, hiragana ねこ, 猫 all find 猫), bounded pagination, and ranking order (beginner list → priority → fewer senses → shorter form → stable id).
- [ ] **Step 3: Write failing integration tests** against the fixture DB: distinct homographs stay distinct, `getEntry` by stable id, read-only connection rejects writes, missing/corrupt DB returns `DATA_MISSING`, no cross-database foreign keys.
- [ ] **Step 4: Run to verify failure**, then implement repository + service + handlers with `openDatabaseSync(path, { readOnly: true })`, parameterized SQL, no renderer-side full dictionary load.
- [ ] **Step 5: Run tests** — expected PASS; run `graphify update .`.

## Task 7 — Dictionary route and Sources screen

**Files:** Modify `src/shared/nav.ts`, `src/renderer/App.tsx`; create `src/renderer/features/dictionary/{DictionaryPage,useDictionary}.tsx`; modify `src/renderer/pages/SettingsPage.tsx`; add CSS.
**Interfaces:** Consumes Task 6 DTOs; produces a ready `/dictionary` route and a Sources panel.

- [ ] **Step 1: Enable the Dictionary nav entry** (remove M5 badge) and add the route.
- [ ] **Step 2: Build the search page** with a debounced input (300 ms), bounded result list, loading/empty/error states, and an entry detail panel showing forms, readings, senses, POS and kanji links. Never render invented examples or audio.
- [ ] **Step 3: Add the Sources screen** from Settings: attribution text, source URLs as plain text, and licence notices read from bundled local files. No clickable external links and no new navigation permission.
- [ ] **Step 4: Run lint/typecheck/test**, then `graphify update .`.

## Task 8 — Windows CI wiring

**Files:** Modify `.github/workflows/build-windows.yml`.
**Interfaces:** Consumes Tasks 1–4 scripts and manifest.

- [ ] **Step 1: Add `actions/setup-python@v5` with Python 3.12** after Node setup.
- [ ] **Step 2: Add a cache step** keyed by `data/manifest.json` and the three script hashes, covering `data/raw/` and `resources/dictionaries/`.
- [ ] **Step 3: Add build steps** running `download_datasets.py`, `build_dictionary.py`, `validate_dictionary.py --require-production` before `npm run make`, with the real pinned assets and no `--fixture`.
- [ ] **Step 4: Verify YAML parses locally** with `python3 -c "import yaml; ..."` (PyYAML only if already available; otherwise use a simple text inspection and report that, do not install).

## Task 9 — Live verification, licences and status

**Files:** Modify `THIRD_PARTY_LICENSES.md`, `docs/PROGRESS.md`, `docs/ARCHITECTURE.md`, `README.md`.
**Interfaces:** Consumes all previous tasks.

- [ ] **Step 1: Start the dev app** with remote debugging and verify: search for 猫/ねこ/cat/neko returns the right entry; homographs are distinct; `getEntry` works; Sources screen renders attribution from local files; boot still succeeds when `KOTOBA_DICTIONARY_PATH` points at a missing file and IPC returns `DATA_MISSING`.
- [ ] **Step 2: Verify the packaged app** from `file://`: search works from the bundled resource, production CSP unchanged, no Node leaks, and the database is inside the installer package.
- [ ] **Step 3: Confirm a fixture-marked database fails the packaged startup path** using an isolated temporary data root, without touching the real dev profile.
- [ ] **Step 4: Record actual results** in `docs/PROGRESS.md` (M5a status, commands, counts, limitations, next step), `docs/ARCHITECTURE.md` (dictionary schema/paths/licensing), `README.md` (dictionary build command, data location, licence note), and `THIRD_PARTY_LICENSES.md` (EDRDG/KANJIDIC2 CC BY-SA 4.0 and share-alike statement). Do not claim Windows CI ran.
