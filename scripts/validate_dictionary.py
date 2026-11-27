#!/usr/bin/env python3
"""Validate a generated Kotoba dictionary database.

Usage: python scripts/validate_dictionary.py --help
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from kotoba_data import load_manifest  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]

REQUIRED_TABLES = {
    "metadata",
    "entries",
    "forms",
    "readings",
    "senses",
    "form_restrictions",
    "sense_restrictions",
    "sense_tags",
    "entry_kanji",
    "kanji",
    "kanji_readings",
    "kana",
    "frequencies",
    "jlpt_tags",
    "fts_entries",
    "fts_forms",
}


def validate(db: Path, manifest: dict[str, Any], require_production: bool = False) -> list[str]:
    """Return a list of human-readable problems; empty means valid."""
    problems: list[str] = []

    if not db.is_file():
        return [f"Dictionary database not found: {db}"]

    try:
        con = sqlite3.connect(db)
        check = con.execute("pragma integrity_check").fetchone()
        if not check or check[0] != "ok":
            problems.append("SQLite integrity_check failed")
            con.close()
            return problems
    except sqlite3.Error as exc:
        return [f"Could not open dictionary database: {exc}"]

    try:
        names = {row[0] for row in con.execute("select name from sqlite_master where type = 'table'")}
        missing = REQUIRED_TABLES - names
        if missing:
            problems.append(f"Missing tables: {', '.join(sorted(missing))}")

        indexes = {row[0] for row in con.execute("select name from sqlite_master where type = 'index'")}
        for index in ("entries_form", "forms_text", "readings_text", "senses_english"):
            if index not in indexes:
                problems.append(f"Missing index: {index}")

        if not missing:
            metadata = dict(con.execute("select key, value from metadata"))
            if metadata.get("schema_version") != "1":
                problems.append("Unsupported or missing dictionary schema version")
            if metadata.get("licence") != "CC-BY-SA-4.0":
                problems.append("Derived-database licence metadata is missing or wrong")
            expected_release = manifest.get("release")
            if expected_release and metadata.get("release") not in (expected_release, "fixture"):
                problems.append(
                    f"Database release {metadata.get('release')} does not match manifest {expected_release}"
                )
            is_fixture = metadata.get("fixture") == "true"
            if require_production and is_fixture:
                problems.append("Fixture-marked database cannot be used in a production build")
            if require_production:
                count = metadata.get("entry_count", "0")
                if not count.isdigit() or int(count) < 1000:
                    problems.append("Production database has too few entries")

            empty_senses = con.execute(
                "select count(*) from senses where trim(english) = ''"
            ).fetchone()[0]
            if empty_senses:
                problems.append(f"{empty_senses} senses have no English gloss")

            empty_readings = con.execute(
                "select count(*) from readings where trim(text) = ''"
            ).fetchone()[0]
            if empty_readings:
                problems.append(f"{empty_readings} readings are empty")

            orphan_entries = con.execute(
                "select count(*) from entries e where not exists "
                "(select 1 from senses s where s.entry_id = e.id)"
            ).fetchone()[0]
            if orphan_entries:
                problems.append(f"{orphan_entries} entries have no senses")

            corpora = {row[0] for row in con.execute("select distinct corpus from frequencies")}
            if corpora - {"jmdict-priority"}:
                problems.append("Unexpected frequency corpus; only source-derived data is allowed")

            for form, gloss in (("猫", "cat"), ("食べる", "eat")):
                found = con.execute(
                    "select 1 from entries e join senses s on s.entry_id = e.id "
                    "where e.canonical_form = ? and s.english like ? limit 1",
                    (form, f"%{gloss}%"),
                ).fetchone()
                if found is None:
                    problems.append(f"Known query failed: {form} / {gloss}")

            for reading in ("ねこ", "たべる"):
                found = con.execute(
                    "select 1 from readings where text = ? limit 1", (reading,)
                ).fetchone()
                if found is None:
                    problems.append(f"Known reading query failed: {reading}")

            try:
                fts = con.execute(
                    "select entry_id from fts_entries where fts_entries match 'cat' limit 1"
                ).fetchone()
                if fts is None:
                    problems.append("FTS5 English query returned no result for 'cat'")
            except sqlite3.Error as exc:
                problems.append(f"FTS5 query failed: {exc}")
    except sqlite3.Error as exc:
        problems.append(f"Validation query failed: {exc}")
    finally:
        con.close()

    return problems


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Validate a generated Kotoba dictionary database.")
    parser.add_argument("--db", type=Path, default=ROOT / "resources" / "dictionaries" / "dictionary.db")
    parser.add_argument("--manifest", type=Path, default=ROOT / "data" / "manifest.json")
    parser.add_argument(
        "--require-production",
        action="store_true",
        help="fail for fixture-marked or too-small databases",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        manifest = load_manifest(args.manifest)
    except Exception as exc:  # manifest errors are reported the same way as DB errors
        print(f"error: {exc}", file=sys.stderr)
        return 1

    problems = validate(args.db, manifest, require_production=args.require_production)
    for problem in problems:
        print(f"error: {problem}", file=sys.stderr)
    if problems:
        return 1
    print(f"dictionary OK: {args.db}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
