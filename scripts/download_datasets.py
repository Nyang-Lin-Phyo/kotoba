#!/usr/bin/env python3
"""Download and verify the pinned dictionary assets.

Usage: python scripts/download_datasets.py --help
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from kotoba_data import DataError, download_assets, load_manifest  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Download and verify the pinned JMdict/KANJIDIC2 assets."
    )
    parser.add_argument("--manifest", type=Path, default=ROOT / "data" / "manifest.json")
    parser.add_argument("--raw-dir", type=Path, default=ROOT / "data" / "raw")
    parser.add_argument(
        "--offline",
        action="store_true",
        help="use only already-downloaded, checksum-verified files",
    )
    parser.add_argument(
        "--fixture",
        action="store_true",
        help="skip downloads; the committed fixture will be used by the builder",
    )
    parser.add_argument("--timeout", type=int, default=30, help="HTTP timeout in seconds")
    parser.add_argument("--retries", type=int, default=3, help="download attempts per asset")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.fixture:
            fixture = ROOT / "data" / "fixtures" / "dictionary_fixture.json"
            if not fixture.is_file():
                raise DataError(f"Fixture not found: {fixture}")
            print(f"Fixture mode: using {fixture}")
            return 0

        manifest = load_manifest(args.manifest)
        paths = download_assets(
            manifest,
            args.raw_dir,
            offline=args.offline,
            timeout=args.timeout,
            retries=args.retries,
        )
        for path in paths:
            print(f"verified {path.name} ({path.stat().st_size} bytes)")
        return 0
    except DataError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
