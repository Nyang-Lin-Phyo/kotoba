"""Stdlib tests for the dictionary data pipeline."""

import hashlib
import io
import json
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

import download_datasets  # noqa: E402
import kotoba_data  # noqa: E402


class HelpersTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir = Path(self.tmp.name)

    def test_verify_sha256_match_and_mismatch(self):
        target = self.dir / "asset.bin"
        target.write_bytes(b"kotoba")
        digest = hashlib.sha256(b"kotoba").hexdigest()
        self.assertTrue(kotoba_data.verify_sha256(target, digest))
        with self.assertRaises(kotoba_data.DataError):
            kotoba_data.verify_sha256(target, "0" * 64)

    def test_safe_extract_rejects_path_traversal(self):
        archive = self.dir / "evil.tgz"
        with tarfile.open(archive, "w:gz") as tar:
            payload = b"escape"
            info = tarfile.TarInfo("../escape.txt")
            info.size = len(payload)
            tar.addfile(info, io.BytesIO(payload))

        destination = self.dir / "out"
        with self.assertRaises(kotoba_data.DataError):
            kotoba_data.safe_extract_tgz(archive, destination, max_bytes=1000)
        self.assertFalse((self.dir / "escape.txt").exists())

    def test_safe_extract_rejects_oversized_member(self):
        archive = self.dir / "big.tgz"
        with tarfile.open(archive, "w:gz") as tar:
            payload = b"x" * 200
            info = tarfile.TarInfo("big.json")
            info.size = len(payload)
            tar.addfile(info, io.BytesIO(payload))

        with self.assertRaises(kotoba_data.DataError):
            kotoba_data.safe_extract_tgz(archive, self.dir / "out", max_bytes=50)

    def test_offline_download_uses_verified_cache(self):
        payload = b"cached asset"
        cached = self.dir / "asset.tgz"
        cached.write_bytes(payload)
        manifest = {
            "assets": [
                {
                    "name": "asset.tgz",
                    "sha256": hashlib.sha256(payload).hexdigest(),
                    "size_bytes": len(payload),
                }
            ]
        }
        result = download_datasets.download_assets(manifest, self.dir, offline=True)
        self.assertEqual(result, [cached])

    def test_offline_download_fails_on_missing_asset(self):
        manifest = {
            "assets": [
                {"name": "missing.tgz", "sha256": "0" * 64, "size_bytes": 10}
            ]
        }
        with self.assertRaises(kotoba_data.DataError):
            download_datasets.download_assets(manifest, self.dir, offline=True)

    def test_load_manifest(self):
        manifest = kotoba_data.load_manifest(ROOT / "data" / "manifest.json")
        self.assertEqual(manifest["schema_version"], 1)
        self.assertEqual(len(manifest["assets"]), 2)


if __name__ == "__main__":
    unittest.main()


class BuilderTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir = Path(self.tmp.name)
        self.manifest = kotoba_data.load_manifest(ROOT / "data" / "manifest.json")
        self.fixture = ROOT / "data" / "fixtures" / "dictionary_fixture.json"

    def build(self, name):
        import build_dictionary

        output = self.dir / name
        return build_dictionary.build_dictionary(
            self.fixture, output, self.manifest, fixture=True
        )

    def test_fixture_build_has_metadata_and_known_queries(self):
        import sqlite3

        db = self.build("a.db")
        con = sqlite3.connect(db)
        meta = dict(con.execute("select key, value from metadata"))
        self.assertEqual(meta["schema_version"], "1")
        self.assertEqual(meta["fixture"], "true")
        self.assertEqual(meta["licence"], "CC-BY-SA-4.0")

        for form, gloss in [("猫", "cat"), ("食べる", "to eat")]:
            row = con.execute(
                "select e.id from entries e join senses s on s.entry_id = e.id "
                "where e.canonical_form = ? and s.english = ?",
                (form, gloss),
            ).fetchone()
            self.assertIsNotNone(row, f"{form}/{gloss}")
        con.close()

    def test_homographs_and_restrictions_are_preserved(self):
        import sqlite3

        db = self.build("b.db")
        con = sqlite3.connect(db)
        ids = {
            row[0]
            for row in con.execute(
                "select id from entries where canonical_form in ('橋', '箸')"
            )
        }
        self.assertEqual(len(ids), 2)
        readings = {
            row[0]
            for row in con.execute(
                "select r.text from readings r join entries e on e.id = r.entry_id "
                "where e.canonical_form in ('橋', '箸')"
            )
        }
        self.assertEqual(readings, {"はし"})

        restricted = con.execute(
            "select count(*) from sense_restrictions where reading_id is not null "
            "or form_id is not null"
        ).fetchone()[0]
        self.assertGreater(restricted, 0)
        con.close()

    def test_entry_kanji_are_individual_characters(self):
        import sqlite3

        db = self.build("kanji.db")
        con = sqlite3.connect(db)
        literals = {row[0] for row in con.execute("select literal from entry_kanji")}
        con.close()
        self.assertIn("猫", literals)
        self.assertNotIn("食べる", literals)

    def test_frequencies_are_source_derived_and_jlpt_empty(self):
        import sqlite3

        db = self.build("c.db")
        con = sqlite3.connect(db)
        corpora = {row[0] for row in con.execute("select distinct corpus from frequencies")}
        self.assertEqual(corpora, {"jmdict-priority"})
        self.assertEqual(con.execute("select count(*) from jlpt_tags").fetchone()[0], 0)
        con.close()

    def test_kana_and_stable_ids(self):
        import sqlite3

        first = self.build("d1.db")
        second = self.build("d2.db")
        con = sqlite3.connect(first)
        self.assertEqual(
            con.execute("select reading from kana where character = ?", ("か",)).fetchone()[0],
            "か",
        )
        rows = con.execute("select id, canonical_form from entries order by id").fetchall()
        con.close()
        con = sqlite3.connect(second)
        other = con.execute("select id, canonical_form from entries order by id").fetchall()
        con.close()
        self.assertEqual(rows, other)


class ValidatorTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir = Path(self.tmp.name)
        self.manifest = kotoba_data.load_manifest(ROOT / "data" / "manifest.json")
        import build_dictionary

        self.fixture_db = build_dictionary.build_dictionary(
            ROOT / "data" / "fixtures" / "dictionary_fixture.json",
            self.dir / "fixture.db",
            self.manifest,
            fixture=True,
        )

    def test_fixture_passes_without_production_guard(self):
        import validate_dictionary

        self.assertEqual(validate_dictionary.validate(self.fixture_db, self.manifest), [])

    def test_fixture_fails_production_guard(self):
        import validate_dictionary

        problems = validate_dictionary.validate(
            self.fixture_db, self.manifest, require_production=True
        )
        self.assertTrue(any("fixture" in problem.lower() for problem in problems))

    def test_missing_english_sense_is_rejected(self):
        import sqlite3
        import validate_dictionary

        db = self.dir / "bad.db"
        sqlite3.connect(self.fixture_db).backup(sqlite3.connect(db))
        con = sqlite3.connect(db)
        con.execute("update senses set english = '' where id = (select min(id) from senses)")
        con.commit()
        con.close()
        problems = validate_dictionary.validate(db, self.manifest)
        self.assertTrue(any("sense" in problem.lower() for problem in problems))

    def test_corrupt_file_is_rejected(self):
        import validate_dictionary

        db = self.dir / "garbage.db"
        db.write_bytes(b"not a sqlite database")
        problems = validate_dictionary.validate(db, self.manifest)
        self.assertTrue(problems)

    def test_known_queries_and_fts_tables(self):
        import sqlite3
        import validate_dictionary

        self.assertEqual(validate_dictionary.validate(self.fixture_db, self.manifest), [])
        con = sqlite3.connect(self.fixture_db)
        names = {
            row[0] for row in con.execute("select name from sqlite_master where type = 'table'")
        }
        self.assertIn("fts_entries", names)
        self.assertIn("fts_forms", names)
        for gloss in ("cat", "to eat"):
            self.assertIsNotNone(
                con.execute("select id from senses where english = ?", (gloss,)).fetchone()
            )
        con.close()


class ReviewFixTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir = Path(self.tmp.name)
        self.manifest = kotoba_data.load_manifest(ROOT / "data" / "manifest.json")

    def test_windows_drive_absolute_member_is_rejected(self):
        archive = self.dir / "drive.tgz"
        with tarfile.open(archive, "w:gz") as tar:
            payload = b"escape"
            info = tarfile.TarInfo("C:/Users/me/evil.json")
            info.size = len(payload)
            tar.addfile(info, io.BytesIO(payload))
        with self.assertRaises(kotoba_data.DataError):
            kotoba_data.safe_extract_tgz(archive, self.dir / "out", max_bytes=100)

    def test_checksum_failure_does_not_poison_cache(self):
        from unittest import mock

        payload = b"good"
        manifest = {
            "assets": [
                {
                    "name": "asset.tgz",
                    "sha256": hashlib.sha256(payload).hexdigest(),
                    "size_bytes": len(payload),
                    "url": "https://example.test/asset.tgz",
                }
            ]
        }
        asset = manifest["assets"][0]
        raw = self.dir / "raw"

        class Response(io.BytesIO):
            def __enter__(self):
                return self

            def __exit__(self, *args):
                self.close()

        with mock.patch("urllib.request.urlopen", return_value=Response(b"bad")):
            with self.assertRaises(kotoba_data.DataError):
                download_datasets.download_assets(manifest, raw, retries=1)
        cached = raw / asset["name"]
        self.assertFalse(cached.exists())
        self.assertFalse(cached.with_name(cached.name + ".partial").exists())

        with mock.patch("urllib.request.urlopen", return_value=Response(payload)):
            result = download_datasets.download_assets(manifest, raw, retries=1)
        self.assertEqual(result, [cached])

    def test_source_files_ignore_stale_extracted_json(self):
        import build_dictionary

        raw = self.dir / "raw"
        release = self.manifest["release"]
        expected_dir = raw / "extracted" / release
        expected_dir.mkdir(parents=True)
        (expected_dir / "jmdict-eng-common-3.6.2.json").write_text("{}", encoding="utf-8")
        (expected_dir / "kanjidic2-en-3.6.2.json").write_text("{}", encoding="utf-8")
        (raw / "jmdict-eng-common-3.5.0.json").write_text("{}", encoding="utf-8")
        (raw / "kanjidic2-en-3.5.0.json").write_text("{}", encoding="utf-8")

        words, kanji = build_dictionary._source_files(raw, self.manifest, fixture=False)
        self.assertEqual(words.parent, expected_dir)
        self.assertEqual(kanji.parent, expected_dir)


class ValidatorReleaseTest(unittest.TestCase):
    def test_release_mismatch_is_detected(self):
        import build_dictionary
        import validate_dictionary

        with tempfile.TemporaryDirectory() as tmp:
            db = build_dictionary.build_dictionary(
                ROOT / "data" / "fixtures" / "dictionary_fixture.json",
                Path(tmp) / "fixture.db",
                kotoba_data.load_manifest(ROOT / "data" / "manifest.json"),
                fixture=True,
            )
            wrong_manifest = dict(
                kotoba_data.load_manifest(ROOT / "data" / "manifest.json"), release="9.9.9"
            )
            problems = validate_dictionary.validate(db, wrong_manifest)
            self.assertTrue(any("release" in problem.lower() for problem in problems))


class SenseTagTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir = Path(self.tmp.name)
        self.manifest = kotoba_data.load_manifest(ROOT / "data" / "manifest.json")

    def build(self, name="tags.db"):
        import build_dictionary

        return build_dictionary.build_dictionary(
            ROOT / "data" / "fixtures" / "dictionary_fixture.json",
            self.dir / name, self.manifest, fixture=True
        )

    def test_sense_tags_are_stored(self):
        import sqlite3

        db = self.build()
        con = sqlite3.connect(db)
        tags = {row[0] for row in con.execute("select distinct tag from sense_tags")}
        con.close()
        self.assertIn("sl", tags)
        self.assertIn("vulg", tags)

    def test_validator_requires_sense_tags(self):
        import sqlite3
        import validate_dictionary

        db = self.build("no-tags.db")
        con = sqlite3.connect(db)
        con.execute("drop table sense_tags")
        con.commit()
        con.close()
        problems = validate_dictionary.validate(db, self.manifest)
        self.assertTrue(any("sense_tags" in problem for problem in problems))

    def test_restrictions_round_trip(self):
        import sqlite3

        db = self.build("restrictions.db")
        con = sqlite3.connect(db)
        self.assertGreater(
            con.execute("select count(*) from form_restrictions").fetchone()[0], 0
        )
        self.assertGreater(
            con.execute("select count(*) from sense_restrictions").fetchone()[0], 0
        )
        con.close()
