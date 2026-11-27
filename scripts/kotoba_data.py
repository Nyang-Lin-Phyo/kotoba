"""Shared helpers for the Kotoba dictionary data pipeline (stdlib only)."""

from __future__ import annotations

import hashlib
import io
import json
import os
import tarfile
import time
import urllib.request
from pathlib import Path, PurePosixPath, PureWindowsPath
from typing import Any


class DataError(Exception):
    """A recoverable pipeline failure with a message safe to show to a user."""


def load_manifest(path: Path) -> dict[str, Any]:
    try:
        with path.open("r", encoding="utf-8") as handle:
            manifest = json.load(handle)
    except (OSError, json.JSONDecodeError) as exc:
        raise DataError(f"Could not read manifest {path}: {exc}") from exc

    if not isinstance(manifest, dict) or "assets" not in manifest:
        raise DataError(f"Manifest {path} is missing required fields")
    return manifest


def verify_sha256(path: Path, expected: str) -> bool:
    """Return True when the file matches, otherwise raise DataError."""
    digest = hashlib.sha256()
    try:
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
    except OSError as exc:
        raise DataError(f"Could not read {path}: {exc}") from exc

    if digest.hexdigest() != expected.lower().strip():
        raise DataError(f"Checksum mismatch for {path.name}")
    return True


def _safe_member_name(name: str) -> str:
    # Reject POSIX absolute, Windows drive-absolute and UNC names. Safe on
    # every platform, including Windows CI where `C:/...` would escape.
    normalized = name.replace("\\", "/")
    windows = PureWindowsPath(normalized)
    if (
        PurePosixPath(normalized).is_absolute()
        or windows.is_absolute()
        or windows.drive
        or ".." in Path(normalized).parts
    ):
        raise DataError(f"Unsafe archive member: {name}")
    return normalized


def safe_extract_tgz(archive: Path, destination: Path, max_bytes: int) -> list[Path]:
    """Extract a tgz without trusting member names or sizes."""
    written: list[Path] = []
    try:
        with tarfile.open(archive, "r:gz") as tar:
            for member in tar.getmembers():
                name = _safe_member_name(member.name)
                if not member.isfile():
                    raise DataError(f"Unsupported archive member: {member.name}")
                if member.size > max_bytes:
                    raise DataError(f"Archive member too large: {member.name}")
                source = tar.extractfile(member)
                if source is None:
                    raise DataError(f"Could not read archive member: {member.name}")
                target = (destination / name).resolve()
                if not target.is_relative_to(destination.resolve()):
                    raise DataError(f"Unsafe archive member: {member.name}")
                target.parent.mkdir(parents=True, exist_ok=True)
                partial = target.with_name(target.name + ".partial")
                with partial.open("wb") as out:
                    while chunk := source.read(1024 * 1024):
                        out.write(chunk)
                os.replace(partial, target)
                written.append(target)
    except (OSError, tarfile.TarError) as exc:
        raise DataError(f"Could not extract {archive.name}: {exc}") from exc
    return written


def atomic_write_bytes(path: Path, payload: bytes) -> None:
    """Write bytes to a .partial file and rename on success."""
    path.parent.mkdir(parents=True, exist_ok=True)
    partial = path.with_name(path.name + ".partial")
    try:
        partial.write_bytes(payload)
        os.replace(partial, path)
    finally:
        if partial.exists():
            partial.unlink()


def download_assets(
    manifest: dict[str, Any],
    raw_dir: Path,
    offline: bool = False,
    timeout: int = 30,
    retries: int = 3,
) -> list[Path]:
    """Return verified asset paths, using only the local cache when offline."""
    raw_dir.mkdir(parents=True, exist_ok=True)
    result: list[Path] = []

    for asset in manifest["assets"]:
        name = asset["name"]
        expected = asset["sha256"]
        target = raw_dir / name

        if target.exists():
            size = asset.get("size_bytes")
            if size is not None and target.stat().st_size != size:
                raise DataError(f"Cached asset has the wrong size: {name}")
            verify_sha256(target, expected)
            result.append(target)
            continue

        if offline:
            raise DataError(f"Offline mode: missing cached asset {name}")

        url = asset.get("url")
        if not isinstance(url, str) or not url.startswith("https://"):
            raise DataError(f"Asset {name} has no safe HTTPS URL")

        attempts = max(1, retries)
        partial = target.with_name(target.name + ".partial")
        if partial.exists():
            partial.unlink()

        last_error: Exception | None = None
        for attempt in range(attempts):
            try:
                with urllib.request.urlopen(url, timeout=timeout) as response:
                    payload = response.read()
                # Verify before publishing: a bad download must never leave a
                # poisoned file that future offline runs treat as a valid cache.
                partial.write_bytes(payload)
                verify_sha256(partial, expected)
                os.replace(partial, target)
                break
            except Exception as exc:  # network errors vary by platform
                last_error = exc
                if partial.exists():
                    partial.unlink()
                if attempt + 1 < attempts:
                    time.sleep(1 + attempt)
        else:
            raise DataError(f"Could not download {name}: {last_error}")

        result.append(target)

    return result
