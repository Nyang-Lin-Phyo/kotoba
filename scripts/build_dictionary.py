#!/usr/bin/env python3
"""Build the immutable, read-only Kotoba dictionary database.

Usage: python scripts/build_dictionary.py --help
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from kotoba_data import DataError, load_manifest, safe_extract_tgz, verify_sha256  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
MAX_MEMBER_BYTES = 200 * 1024 * 1024
TAG_SCORES = {"news1": 5, "ichi1": 5, "spec1": 4, "spec2": 3, "gai1": 2}

SCHEMA = """
create table metadata (key text primary key, value text not null);

create table entries (
  id text primary key,
  source text not null,
  source_id text not null,
  canonical_form text not null,
  priority integer not null default 0,
  curriculum_rank integer
);
create index entries_form on entries (canonical_form);
create index entries_rank on entries (curriculum_rank, priority, id);

create table forms (
  id text primary key,
  entry_id text not null references entries (id) on delete cascade,
  text text not null,
  common integer not null check (common in (0, 1))
);
create index forms_text on forms (text);

create table readings (
  id text primary key,
  entry_id text not null references entries (id) on delete cascade,
  text text not null,
  common integer not null check (common in (0, 1))
);
create index readings_text on readings (text);

create table senses (
  id text primary key,
  entry_id text not null references entries (id) on delete cascade,
  ordinal integer not null,
  part_of_speech text not null,
  english text not null
);
create index senses_english on senses (english);

create table form_restrictions (
  reading_id text not null references readings (id) on delete cascade,
  form_id text not null references forms (id) on delete cascade,
  primary key (reading_id, form_id)
);

create table sense_restrictions (
  sense_id text not null references senses (id) on delete cascade,
  form_id text references forms (id) on delete cascade,
  reading_id text references readings (id) on delete cascade
);

create table sense_tags (
  sense_key text not null references senses (id) on delete cascade,
  tag text not null,
  primary key (sense_key, tag)
);

create table entry_kanji (
  entry_id text not null references entries (id) on delete cascade,
  literal text not null,
  primary key (entry_id, literal)
);
create index entry_kanji_literal on entry_kanji (literal);

create table kanji (
  literal text primary key,
  grade integer,
  strokes integer,
  frequency integer,
  meanings text not null default ''
);

create table kanji_readings (
  id text primary key,
  literal text not null references kanji (literal) on delete cascade,
  type text not null,
  reading text not null
);
create index kanji_readings_literal on kanji_readings (literal);

create table kana (
  character text primary key,
  reading text not null,
  script text not null,
  tier text not null
);

create table frequencies (
  entry_id text not null references entries (id) on delete cascade,
  corpus text not null,
  rank integer not null,
  score integer not null,
  primary key (entry_id, corpus)
);

create table jlpt_tags (
  entry_id text not null references entries (id) on delete cascade,
  level text not null,
  source text not null,
  version text not null,
  confidence text not null
);

create virtual table fts_entries using fts5(english, entry_id unindexed);
create virtual table fts_forms using fts5(japanese, entry_id unindexed);
"""


def _load_json(path: Path) -> dict[str, Any]:
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, json.JSONDecodeError) as exc:
        raise DataError(f"Could not read JSON source {path}: {exc}") from exc


def _source_files(source_dir: Path, manifest: dict[str, Any], fixture: bool) -> tuple[Path, Path]:
    if fixture:
        return source_dir, source_dir

    # Extract into a release-specific directory so a newer manifest can never
    # pick up JSON left over from an older pinned release.
    extracted = source_dir / "extracted" / str(manifest.get("release", "unknown"))

    for asset in manifest["assets"]:
        candidate = source_dir / asset["name"]
        if candidate.is_file() and candidate.suffixes[-2:] == [".json", ".tgz"]:
            verify_sha256(candidate, asset["sha256"])
            safe_extract_tgz(candidate, extracted, MAX_MEMBER_BYTES)

    words = next(iter(sorted(extracted.glob("jmdict-eng-common-*.json"))), None)
    kanji = next(iter(sorted(extracted.glob("kanjidic2-en-*.json"))), None)
    if words is None or kanji is None:
        raise DataError(
            "Verified JMdict/KANJIDIC2 JSON files are missing. "
            "Run download_datasets.py first."
        )
    return words, kanji


def _entries(data: dict[str, Any]) -> list[dict[str, Any]]:
    """Accept both the fixture key and jmdict-simplified's real `words` key."""
    return data.get("entries") or data.get("words") or []


def _characters(data: dict[str, Any]) -> list[dict[str, Any]]:
    return data.get("characters") or []


def _priority(tags: list[str]) -> int:
    return min(20, sum(TAG_SCORES.get(tag, 0) for tag in tags))


def _metadata(con: sqlite3.Connection, key: str, value: Any) -> None:
    con.execute("insert into metadata (key, value) values (?, ?)", (key, str(value)))


def _insert_entries(con: sqlite3.Connection, data: dict[str, Any], ranks: dict[tuple[str, str], int]) -> None:
    japanese_text: list[tuple[str, str]] = []
    english_text: list[tuple[str, str]] = []

    for entry in _entries(data):
        source_id = str(entry["id"])
        entry_id = f"jmdict:{source_id}"
        forms = entry.get("kanji", [])
        readings = entry.get("kana", [])
        senses = entry.get("sense", [])
        if not forms and not readings:
            continue
        if not senses:
            raise DataError(f"Entry {source_id} has no senses")

        canonical = forms[0]["text"] if forms else readings[0]["text"]
        priority = max(
            [_priority(item.get("tags", [])) for item in forms + readings] + [0]
        )
        curriculum_rank = ranks.get((canonical, canonical))
        if curriculum_rank is None:
            for form in forms:
                for reading in readings:
                    found = ranks.get((form["text"], reading["text"]))
                    if found is not None:
                        curriculum_rank = found
                        break
                if curriculum_rank is not None:
                    break

        con.execute(
            "insert into entries (id, source, source_id, canonical_form, priority, curriculum_rank) "
            "values (?, 'jmdict', ?, ?, ?, ?)",
            (entry_id, source_id, canonical, priority, curriculum_rank),
        )

        form_ids: dict[str, str] = {}
        for index, form in enumerate(forms):
            form_id = f"{entry_id}:form:{index}"
            form_ids[form["text"]] = form_id
            con.execute(
                "insert into forms (id, entry_id, text, common) values (?, ?, ?, ?)",
                (form_id, entry_id, form["text"], int(bool(form.get("common")))),
            )
            for character in form["text"]:
                # Link individual kanji, not whole spellings, so the UI can
                # show meaningful character links.
                if 0x3400 <= ord(character) <= 0x9FFF:
                    con.execute(
                        "insert or ignore into entry_kanji (entry_id, literal) values (?, ?)",
                        (entry_id, character),
                    )
            japanese_text.append((form["text"], entry_id))

        reading_ids: dict[str, str] = {}
        for index, reading in enumerate(readings):
            reading_id = f"{entry_id}:reading:{index}"
            reading_ids[reading["text"]] = reading_id
            con.execute(
                "insert into readings (id, entry_id, text, common) values (?, ?, ?, ?)",
                (reading_id, entry_id, reading["text"], int(bool(reading.get("common")))),
            )
            japanese_text.append((reading["text"], entry_id))
            for form_text in reading.get("appliesToKanji", []):
                if form_text in form_ids:
                    con.execute(
                        "insert into form_restrictions (reading_id, form_id) values (?, ?)",
                        (reading_id, form_ids[form_text]),
                    )

        for index, sense in enumerate(senses):
            sense_id = f"{entry_id}:sense:{index}"
            glosses = [
                gloss["text"] for gloss in sense.get("gloss", []) if gloss.get("lang") == "eng"
            ]
            english = "; ".join(glosses)
            if not english:
                raise DataError(f"Sense {sense_id} has no English gloss")
            con.execute(
                "insert into senses (id, entry_id, ordinal, part_of_speech, english) "
                "values (?, ?, ?, ?, ?)",
                (
                    sense_id,
                    entry_id,
                    index,
                    ",".join(sense.get("partOfSpeech", [])),
                    english,
                ),
            )
            for tag in sense.get("misc", []):
                con.execute(
                    "insert or ignore into sense_tags (sense_key, tag) values (?, ?)",
                    (sense_id, tag),
                )
            english_text.append((english, entry_id))
            for form_text in sense.get("appliesToKanji", []):
                if form_text != "*" and form_text in form_ids:
                    con.execute(
                        "insert into sense_restrictions (sense_id, form_id) values (?, ?)",
                        (sense_id, form_ids[form_text]),
                    )
            for reading_text in sense.get("appliesToKana", []):
                if reading_text != "*" and reading_text in reading_ids:
                    con.execute(
                        "insert into sense_restrictions (sense_id, reading_id) values (?, ?)",
                        (sense_id, reading_ids[reading_text]),
                    )

        con.execute(
            "insert into frequencies (entry_id, corpus, rank, score) values (?, 'jmdict-priority', ?, ?)",
            (entry_id, priority, priority),
        )

    con.executemany("insert into fts_entries (english, entry_id) values (?, ?)", english_text)
    con.executemany("insert into fts_forms (japanese, entry_id) values (?, ?)", japanese_text)


def _insert_kanji(con: sqlite3.Connection, data: dict[str, Any]) -> None:
    for character in _characters(data):
        literal = character["literal"]
        misc = character.get("misc", {})
        meanings = [
            meaning["value"]
            for group in character.get("readingMeaning", {}).get("groups", [])
            for meaning in group.get("meanings", [])
            if meaning.get("lang") in ("en", None)
        ]
        con.execute(
            "insert into kanji (literal, grade, strokes, frequency, meanings) values (?, ?, ?, ?, ?)",
            (
                literal,
                misc.get("grade"),
                (misc.get("strokeCounts") or [None])[0],
                misc.get("frequency"),
                "; ".join(meanings),
            ),
        )
        for group in character.get("readingMeaning", {}).get("groups", []):
            for index, reading in enumerate(group.get("readings", [])):
                reading_type = reading.get("type", "")
                if not reading_type.startswith("ja_"):
                    continue
                con.execute(
                    "insert into kanji_readings (id, literal, type, reading) values (?, ?, ?, ?)",
                    (
                        f"kanji:{literal}:reading:{index}",
                        literal,
                        reading_type,
                        reading.get("value", ""),
                    ),
                )


def _insert_kana(con: sqlite3.Connection) -> None:
    catalogue = _load_json(ROOT / "data" / "curriculum" / "kana.json")
    for group in catalogue["groups"]:
        for item in group["items"]:
            con.execute(
                "insert into kana (character, reading, script, tier) values (?, ?, ?, ?)",
                (item["character"], item["reading"], item["script"], item["tier"]),
            )


def build_dictionary(
    source: Path,
    output: Path,
    manifest: dict[str, Any],
    beginner_list: Path | None = None,
    fixture: bool = False,
) -> Path:
    """Build dictionary.db atomically from verified sources or the fixture."""
    words_path, kanji_path = _source_files(source, manifest, fixture)
    words = _load_json(words_path)
    kanji = _load_json(kanji_path)

    ranks: dict[tuple[str, str], int] = {}
    if beginner_list is not None and beginner_list.is_file():
        starter = _load_json(beginner_list)
        for item in starter.get("items", []):
            ranks[(item["form"], item["reading"])] = int(item["rank"])

    output.parent.mkdir(parents=True, exist_ok=True)
    partial = output.with_name(output.name + ".partial")
    if partial.exists():
        partial.unlink()

    try:
        con = sqlite3.connect(partial)
        con.execute("pragma foreign_keys = on")
        con.executescript(SCHEMA)
        _metadata(con, "schema_version", "1")
        _metadata(con, "licence", "CC-BY-SA-4.0")
        _metadata(con, "fixture", "true" if fixture else "false")
        _metadata(con, "release", manifest.get("release", "fixture"))
        _metadata(con, "attribution", manifest["source"]["attribution"])
        _metadata(con, "entry_count", len(_entries(words)))
        _metadata(con, "kanji_count", len(_characters(kanji)))

        _insert_entries(con, words, ranks)
        _insert_kanji(con, kanji)
        _insert_kana(con)

        con.commit()
        result = con.execute("pragma integrity_check").fetchone()[0]
        if result != "ok":
            raise DataError(f"Generated database failed integrity_check: {result}")
        con.close()
        os.replace(partial, output)
    except (sqlite3.Error, OSError) as exc:
        raise DataError(f"Could not build dictionary: {exc}") from exc
    finally:
        if partial.exists():
            partial.unlink()

    return output


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Build the Kotoba dictionary database.")
    parser.add_argument("--manifest", type=Path, default=ROOT / "data" / "manifest.json")
    parser.add_argument("--raw-dir", type=Path, default=ROOT / "data" / "raw")
    parser.add_argument("--output", type=Path, default=ROOT / "resources" / "dictionaries" / "dictionary.db")
    parser.add_argument("--beginner-list", type=Path, default=ROOT / "data" / "curriculum" / "beginner_words.json")
    parser.add_argument("--fixture", action="store_true", help="build from the committed fixture only")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        manifest = load_manifest(args.manifest)
        source = (
            ROOT / "data" / "fixtures" / "dictionary_fixture.json"
            if args.fixture
            else args.raw_dir
        )
        path = build_dictionary(source, args.output, manifest, args.beginner_list, args.fixture)
        print(f"wrote {path} ({path.stat().st_size} bytes)")
        return 0
    except DataError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
