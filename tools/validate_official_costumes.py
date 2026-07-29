#!/usr/bin/env python3
"""Validate the complete local official Project Sekai SD costume cache.

The check is deliberately offline: production download functions are replaced
with an error so a missing file can never be silently repaired from the network.
"""

from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import server  # noqa: E402


CATALOG_PATH = ROOT / "assets" / "catalog" / "official_costumes.json"
CHARACTERS_PATH = ROOT / "assets" / "characters"
EXPECTED_CHARACTER_IDS = set(range(1, 27))


def fail(message: str) -> None:
    raise AssertionError(message)


def local_path_from_url(url: str) -> Path:
    if not url.startswith("/assets/"):
        fail(f"unexpected asset URL: {url}")
    return ROOT / "assets" / url.removeprefix("/assets/")


def assert_atlas(path: Path) -> None:
    if not path.is_file() or path.stat().st_size < 128:
        fail(f"missing or too-small atlas: {path}")
    text = path.read_text(encoding="utf-8")
    if "size:" not in text or "bounds:" not in text:
        fail(f"invalid Spine atlas: {path}")


def assert_png(path: Path) -> None:
    if not path.is_file() or path.stat().st_size < 1024:
        fail(f"missing or too-small PNG: {path}")
    if path.read_bytes()[:8] != b"\x89PNG\r\n\x1a\n":
        fail(f"invalid PNG signature: {path}")


def no_download(_url: str, _destination: Path) -> None:
    fail("validation attempted a network download; the cache is incomplete")


def main() -> int:
    try:
        catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
        costumes = catalog.get("costumes")
        if not isinstance(costumes, list):
            fail("catalog has no costume list")
        complete = [entry for entry in costumes if entry.get("complete")]
        if len(complete) != len(costumes):
            fail("catalog includes incomplete costume records")
        if {entry.get("character_id") for entry in costumes} != EXPECTED_CHARACTER_IDS:
            fail("catalog must include exactly the 26 official character IDs")

        seen_keys: set[tuple[str, str]] = set()
        family_counts: Counter[str] = Counter()
        for entry in costumes:
            family = str(entry.get("runtime_family"))
            bundle = str(entry.get("bundle"))
            key = (family, bundle)
            if key in seen_keys:
                fail(f"duplicate costume record: {family}/{bundle}")
            seen_keys.add(key)
            family_counts[family] += 1
            folder = CHARACTERS_PATH / (family if family != "legacy_sd_main" else "") / bundle
            assert_atlas(folder / "sekai_atlas.atlas.txt")
            assert_png(folder / "sekai_atlas.png")

        if set(family_counts) != {"legacy_sd_main", "v2_sd_main"}:
            fail(f"unexpected runtime families: {sorted(family_counts)}")

        original_download = server.download
        server.download = no_download
        try:
            for family in sorted(family_counts):
                server.ensure_base_assets(family)
            for entry in costumes:
                character_id = int(entry["character_id"])
                bundle = str(entry["bundle"])
                resource = server.ensure_character_assets(character_id, bundle)
                if resource["costumeKey"] != bundle:
                    fail(f"wrong selected costume for {bundle}")
                if resource["runtimeFamily"] != entry["runtime_family"]:
                    fail(f"wrong runtime family for {bundle}")
                if not local_path_from_url(resource["atlasUrl"]).is_file():
                    fail(f"server atlas URL not locally resolvable for {bundle}")
                if not local_path_from_url(resource["textureUrl"]).is_file():
                    fail(f"server texture URL not locally resolvable for {bundle}")
                if not local_path_from_url(resource["skeletonUrl"]).is_file():
                    fail(f"server skeleton URL not locally resolvable for {bundle}")
        finally:
            server.download = original_download

        print(json.dumps({
            "ok": True,
            "costumes": len(costumes),
            "characters": len(EXPECTED_CHARACTER_IDS),
            "runtime_families": dict(sorted(family_counts.items())),
            "network": "not used",
        }, ensure_ascii=False))
        return 0
    except (AssertionError, OSError, ValueError, json.JSONDecodeError) as error:
        print(f"Validation failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
