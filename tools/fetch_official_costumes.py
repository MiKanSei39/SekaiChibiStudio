#!/usr/bin/env python3
"""Cache official Project Sekai SD costume atlases with a resumable catalog.

Legacy and V2 SD assets use different shared Spine skeletons.  The cache keeps
those runtime families in separate folders and records the dependency on every
catalog entry so a renderer never combines incompatible atlases and skeletons.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as element_tree
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
CHARACTERS = ASSETS / "characters"
CATALOG = ASSETS / "catalog" / "official_costumes.json"
BASE = ASSETS / "base"
STORAGE = "https://storage.sekai.best/sekai-jp-assets"
MASTER = "https://sekai-world.github.io/sekai-master-db-diff"
LEGACY_PREFIX = "area_sd/sd_main/"
V2_PREFIX = "area_sd/v2_sd_main/"
RUNTIME_FAMILIES = {
    "legacy_sd_main": {
        "prefix": LEGACY_PREFIX,
        "base_directory": "assets/base",
        "character_directory": "assets/characters",
        "base_files": {
            "skeleton": "sd_main.skel",
            "atlas": "sd_main.atlas.txt",
            "texture": "sd_main.png",
        },
    },
    "v2_sd_main": {
        "prefix": V2_PREFIX,
        "base_directory": "assets/base/v2_sd_main",
        "character_directory": "assets/characters/v2_sd_main",
        "base_files": {
            "skeleton": "v2_sd_main.skel",
            "atlas": "v2_sd_main.atlas.txt",
            "texture": "v2_sd_main.png",
        },
    },
}
USER_AGENT = "SekaiChibiStudio/1.0 (personal local costume cache)"

FILE_NAMES = ("sekai_atlas.atlas.txt", "sekai_atlas.png")
UNIT_NAMES = {
    "light_sound": "Leo/need",
    "idol": "MORE MORE JUMP!",
    "street": "Vivid BAD SQUAD",
    "theme_park": "Wonderlands x Showtime",
    "school_refusal": "25-ji, Nightcord de.",
    "piapro": "Virtual Singer",
}
PIAPRO_OUTFITS = {
    "band": "Leo/need",
    "idol": "MORE MORE JUMP!",
    "street": "Vivid BAD SQUAD",
    "wonder": "Wonderlands x Showtime",
    "night": "Nightcord at 25:00",
    "normal": "Virtual Singer default",
}
GROUP_NAMES = {"1": "制服", "2": "私服", "3": "ユニット衣装", "4": "エイプリルフール"}


def request(url: str) -> urllib.request.Request:
    return urllib.request.Request(url, headers={"User-Agent": USER_AGENT})


def fetch_bytes(url: str, timeout: int = 45) -> bytes:
    # The public object store occasionally drops an idle response. A small
    # retry here makes discovery as resumable as individual file downloads.
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request(url), timeout=timeout) as response:
                return response.read()
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            last_error = error
            if attempt < 2:
                time.sleep(1.5 * (attempt + 1))
    assert last_error is not None
    raise last_error


def fetch_json(name: str) -> list[dict]:
    return json.loads(fetch_bytes(f"{MASTER}/{name}").decode("utf-8"))


def list_bundles(family: str) -> tuple[list[str], list[dict]]:
    config = RUNTIME_FAMILIES[family]
    prefix = config["prefix"]
    query = urllib.parse.urlencode({"prefix": prefix, "delimiter": "/"})
    payload = fetch_bytes(f"{STORAGE}/?{query}")
    root = element_tree.fromstring(payload)
    bundles: list[str] = []
    excluded: list[dict] = []
    for parent in root.iter():
        if parent.tag.rsplit("}", 1)[-1] != "CommonPrefixes":
            continue
        for node in parent:
            if node.tag.rsplit("}", 1)[-1] != "Prefix" or not node.text:
                continue
            value = node.text
            if not value.startswith(prefix) or not value.endswith("/"):
                continue
            bundle = value[len(prefix):-1]
            raw_bundle = bundle.removeprefix("v2_") if family == "v2_sd_main" else bundle
            if re.fullmatch(r"sd_\d{2}[a-z0-9]+_.+", raw_bundle):
                bundles.append(bundle)
            elif family == "v2_sd_main" and raw_bundle.startswith("sd_e_"):
                excluded.append({
                    "bundle": bundle,
                    "runtime_family": family,
                    "reason": "External collaboration character; excluded from the canonical 26 Project Sekai character catalog.",
                })
            elif family == "v2_sd_main" and bundle != "v2_base_model":
                excluded.append({
                    "bundle": bundle,
                    "runtime_family": family,
                    "reason": "NPC, staff, or non-selectable model; excluded from the canonical character catalog.",
                })
    return sorted(set(bundles)), excluded


def parse_bundle(bundle: str) -> tuple[int | None, str | None, str | None]:
    bare_bundle = bundle.removeprefix("v2_")
    match = re.fullmatch(r"sd_(\d{2})([a-z0-9]+)_(.+)", bare_bundle)
    if not match:
        return None, None, None
    return int(match.group(1)), match.group(2), match.group(3)


def make_metadata() -> dict:
    characters = {item["id"]: item for item in fetch_json("gameCharacters.json")}
    character2ds = {item["id"]: item for item in fetch_json("character2ds.json")}
    costume2ds = fetch_json("costume2ds.json")
    groups = {str(item["id"]): item["name"] for item in fetch_json("costume2dGroups.json")}
    by_spine: dict[str, list[dict]] = {}
    for costume in costume2ds:
        spine_name = costume.get("spineAssetbundleName")
        if spine_name:
            by_spine.setdefault(spine_name, []).append(costume)
    return {
        "characters": characters,
        "character2ds": character2ds,
        "costumes": by_spine,
        "groups": {**GROUP_NAMES, **groups},
    }


def character_label(character: dict | None, character_id: int | None) -> str:
    if character is None:
        return f"Unknown character {character_id or ''}".strip()
    first = character.get("firstName", "")
    given = character.get("givenName", "")
    english = " ".join(part for part in (character.get("firstNameEnglish"), character.get("givenNameEnglish")) if part)
    japanese = f"{first}{given}".strip()
    return japanese if japanese else english or f"Character {character_id}"


def choose_costume(bundle: str, metadata: dict) -> dict | None:
    """Pick a stable master-data row for bundle aliases and duplicate rows."""
    candidates = metadata["costumes"].get(bundle, [])
    if not candidates:
        return None
    character_id, _key, variant = parse_bundle(bundle)
    base_variant = variant[:-2] if variant and variant.endswith("_r") else variant
    target_unit = {
        "band": "light_sound",
        "idol": "idol",
        "street": "street",
        "wonder": "theme_park",
        "night": "school_refusal",
    }.get(base_variant)
    # Some Virtual Singer assets have duplicate historical master rows with
    # conflicting units. Use the known unit-suit suffix only to resolve that
    # specific ambiguity, never as a general replacement for master data.
    if character_id in (21, 22, 23, 24, 25, 26) and target_unit:
        matching = [
            item for item in candidates
            if (metadata["character2ds"].get(item.get("character2dId")) or {}).get("unit") == target_unit
        ]
        if matching:
            candidates = matching

    def sort_key(item: dict) -> tuple[int, int]:
        character2d = metadata["character2ds"].get(item.get("character2dId"), {})
        return (int(bool(character2d.get("isNextGrade"))), item.get("id", 0))

    return min(candidates, key=sort_key)


def describe_bundle(bundle: str, metadata: dict, family: str) -> dict:
    character_id, key, variant = parse_bundle(bundle)
    costume = choose_costume(bundle, metadata)
    character2d = metadata["character2ds"].get(costume.get("character2dId")) if costume else None
    mapped_character_id = character2d.get("characterId") if character2d else character_id
    character = metadata["characters"].get(mapped_character_id)
    is_reversed = variant.endswith("_r") if variant else False
    base_variant = variant[:-2] if is_reversed else variant
    # Reversed assets are alternate rendering variants of the same costume.
    canonical_bundle = bundle[:-2] if is_reversed else bundle
    canonical_costume = choose_costume(canonical_bundle, metadata)
    canonical_character2d = metadata["character2ds"].get(canonical_costume.get("character2dId")) if canonical_costume else None
    canonical_unit = canonical_character2d.get("unit") if canonical_character2d else None
    unit = canonical_unit or (character2d.get("unit") if character2d else character.get("unit") if character else None)
    group_id = canonical_costume.get("costume2dGroupId") if canonical_costume else costume.get("costume2dGroupId") if costume else None
    is_default = base_variant == "normal"
    if character_id in (21, 22, 23, 24, 25, 26) and base_variant in PIAPRO_OUTFITS:
        display_name = f"{PIAPRO_OUTFITS[base_variant]} {character_label(character, mapped_character_id)}"
    elif costume:
        display_name = f"{character_label(character, mapped_character_id)} {metadata['groups'].get(str(group_id), 'official costume')}"
    else:
        display_name = f"{character_label(character, mapped_character_id)} {base_variant or 'official costume'}"
    return {
        "bundle": bundle,
        "runtime_family": family,
        "character_id": mapped_character_id,
        "character_key": key,
        "character_name": character_label(character, mapped_character_id),
        "unit": unit,
        "unit_name": UNIT_NAMES.get(unit, unit),
        "variant": variant,
        "variant_base": base_variant,
        "is_reversed": is_reversed,
        "is_default": is_default,
        "display_name": display_name,
        "costume2d_id": canonical_costume.get("id") if canonical_costume else costume.get("id") if costume else None,
        "costume2d_group_id": group_id,
        "costume2d_group_name": metadata["groups"].get(str(group_id)) if group_id else None,
        "metadata_source": "master-data" if (canonical_costume or costume) else "bundle-name fallback",
    }


def validate_atlas(path: Path) -> tuple[bool, str]:
    if not path.is_file() or path.stat().st_size < 128:
        return False, "missing or too small"
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return False, "not UTF-8 atlas text"
    if "size:" not in text or "bounds:" not in text:
        return False, "missing Spine atlas markers"
    return True, "ok"


def validate_png(path: Path) -> tuple[bool, str]:
    if not path.is_file() or path.stat().st_size < 1024:
        return False, "missing or too small"
    if path.read_bytes()[:8] != b"\x89PNG\r\n\x1a\n":
        return False, "not a PNG"
    return True, "ok"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def download_file(url: str, destination: Path, validator) -> tuple[bool, str, bool]:
    valid, _ = validator(destination)
    if valid:
        return True, "cached", False
    temporary = destination.with_suffix(destination.suffix + ".part")
    try:
        payload = fetch_bytes(url)
        temporary.parent.mkdir(parents=True, exist_ok=True)
        temporary.write_bytes(payload)
        valid, message = validator(temporary)
        if not valid:
            temporary.unlink(missing_ok=True)
            return False, message, False
        temporary.replace(destination)
        return True, "downloaded", True
    except (OSError, urllib.error.URLError, urllib.error.HTTPError) as error:
        temporary.unlink(missing_ok=True)
        return False, str(error), False


def base_validator(path: Path, kind: str) -> tuple[bool, str]:
    if kind == "skeleton":
        if not path.is_file() or path.stat().st_size < 100_000:
            return False, "missing or too small skeleton"
        return True, "ok"
    return validate_atlas(path) if kind == "atlas" else validate_png(path)


def ensure_base_assets(family: str, dry_run: bool, retries: int) -> tuple[dict[str, str], list[dict], int, int, int]:
    """Download the one shared base model for a family without duplicating it."""
    config = RUNTIME_FAMILIES[family]
    base_dir = ROOT / config["base_directory"]
    prefix = f"{config['prefix']}{'base_model/' if family == 'legacy_sd_main' else 'v2_base_model/'}"
    status: dict[str, str] = {}
    failures: list[dict] = []
    downloaded = cached = failed = 0
    for kind, name in config["base_files"].items():
        destination = base_dir / name
        validator = lambda candidate, current_kind=kind: base_validator(candidate, current_kind)
        if dry_run:
            valid, message = validator(destination)
            status[kind] = "cached" if valid else message
            continue
        last = (False, "not attempted", False)
        for attempt in range(retries + 1):
            last = download_file(f"{STORAGE}/{prefix}{name}", destination, validator)
            if last[0]:
                break
            if attempt < retries:
                time.sleep(1.5 * (attempt + 1))
        ok, message, was_downloaded = last
        status[kind] = message
        if not ok:
            failed += 1
            failures.append({"runtime_family": family, "file": name, "url": f"{STORAGE}/{prefix}{name}", "error": message})
        elif was_downloaded:
            downloaded += 1
        else:
            cached += 1
    return status, failures, downloaded, cached, failed


def asset_record(bundle: str, metadata: dict, family: str, status: dict[str, str]) -> dict:
    config = RUNTIME_FAMILIES[family]
    entry = describe_bundle(bundle, metadata, family)
    folder = ROOT / config["character_directory"] / bundle
    atlas = folder / FILE_NAMES[0]
    png = folder / FILE_NAMES[1]
    atlas_ok, atlas_message = validate_atlas(atlas)
    png_ok, png_message = validate_png(png)
    entry.update({
        "storage_prefix": f"{config['prefix']}{bundle}/",
        "files": {
            "atlas": {"path": f"{config['character_directory']}/{bundle}/{FILE_NAMES[0]}", "bytes": atlas.stat().st_size if atlas_ok else 0, "sha256": sha256(atlas) if atlas_ok else None, "status": status.get("atlas", atlas_message)},
            "texture": {"path": f"{config['character_directory']}/{bundle}/{FILE_NAMES[1]}", "bytes": png.stat().st_size if png_ok else 0, "sha256": sha256(png) if png_ok else None, "status": status.get("texture", png_message)},
        },
        "complete": atlas_ok and png_ok,
        "runtime_dependencies": {
            "skeleton": f"{config['base_directory']}/{config['base_files']['skeleton']}",
            "base_atlas": f"{config['base_directory']}/{config['base_files']['atlas']}",
            "base_texture": f"{config['base_directory']}/{config['base_files']['texture']}",
            "note": "Shared Spine skeleton and animations; do not duplicate per costume.",
        },
    })
    return entry


def write_catalog(
    records: list[dict],
    failures: list[dict],
    excluded: list[dict],
    discovered_by_family: dict[str, int],
    dry_run: bool,
) -> None:
    family_statistics = {}
    for family, discovered in discovered_by_family.items():
        family_records = [record for record in records if record["runtime_family"] == family]
        family_statistics[family] = {
            "discovered": discovered,
            "complete": sum(1 for record in family_records if record["complete"]),
            "incomplete": sum(1 for record in family_records if not record["complete"]),
        }
    catalog = {
        "schema_version": 2,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": {
            "storage": STORAGE,
            "runtime_families": {
                family: config["prefix"] for family, config in RUNTIME_FAMILIES.items()
            },
            "master_data": MASTER,
        },
        "scope": "Official canonical Project Sekai character SD Spine costume atlases; legacy and V2 runtime families are isolated.",
        "runtime_families": {
            family: {
                "skeleton": f"{config['base_directory']}/{config['base_files']['skeleton']}",
                "base_atlas": f"{config['base_directory']}/{config['base_files']['atlas']}",
                "base_texture": f"{config['base_directory']}/{config['base_files']['texture']}",
                "shared_animations": "embedded in the shared skeleton",
            }
            for family, config in RUNTIME_FAMILIES.items()
        },
        "statistics": {
            "discovered": sum(discovered_by_family.values()),
            "complete": sum(1 for record in records if record["complete"]),
            "incomplete": sum(1 for record in records if not record["complete"]),
            "failures": len(failures),
            "by_runtime_family": family_statistics,
        },
        "costumes": records,
        "failures": failures,
        "excluded": excluded,
    }
    if dry_run:
        return
    CATALOG.parent.mkdir(parents=True, exist_ok=True)
    temporary = CATALOG.with_suffix(".json.part")
    temporary.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(CATALOG)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Discover and validate without downloading or writing the catalog.")
    parser.add_argument("--only", action="append", default=[], help="Only process a specific official bundle (repeatable).")
    parser.add_argument("--family", choices=tuple(RUNTIME_FAMILIES), help="Only transport one runtime family; the catalog still reports all cached families.")
    parser.add_argument("--retries", type=int, default=2, help="Retries per failed file download.")
    args = parser.parse_args()

    try:
        metadata = make_metadata()
        discovered_by_family: dict[str, list[str]] = {}
        excluded: list[dict] = []
        for family in RUNTIME_FAMILIES:
            bundles, family_excluded = list_bundles(family)
            discovered_by_family[family] = bundles
            excluded.extend(family_excluded)
    except (OSError, ValueError, urllib.error.URLError, urllib.error.HTTPError) as error:
        print(f"Discovery failed: {error}", file=sys.stderr)
        return 2
    selected_families = [args.family] if args.family else list(RUNTIME_FAMILIES)
    selected_discovered = [bundle for family in selected_families for bundle in discovered_by_family[family]]
    bundles = sorted(set(args.only)) if args.only else selected_discovered
    family_for_bundle = {
        bundle: family for family, family_bundles in discovered_by_family.items() for bundle in family_bundles
    }
    unknown = sorted(set(bundles) - set(family_for_bundle))
    if unknown:
        print("Unknown official bundle(s): " + ", ".join(unknown), file=sys.stderr)
        return 2

    processed_status: dict[str, dict[str, str]] = {}
    failures: list[dict] = []
    downloaded = cached = failed_files = 0
    for family in selected_families:
        _base_status, base_failures, base_downloaded, base_cached, base_failed = ensure_base_assets(family, args.dry_run, args.retries)
        failures.extend(base_failures)
        downloaded += base_downloaded
        cached += base_cached
        failed_files += base_failed
    for index, bundle in enumerate(bundles, start=1):
        print(f"[{index}/{len(bundles)}] {bundle}")
        family = family_for_bundle[bundle]
        config = RUNTIME_FAMILIES[family]
        folder = ROOT / config["character_directory"] / bundle
        result: dict[str, str] = {}
        for name, validator, result_key in ((FILE_NAMES[0], validate_atlas, "atlas"), (FILE_NAMES[1], validate_png, "texture")):
            destination = folder / name
            url = f"{STORAGE}/{config['prefix']}{bundle}/{name}"
            if args.dry_run:
                valid, message = validator(destination)
                result[result_key] = "cached" if valid else message
                continue
            last = (False, "not attempted", False)
            for attempt in range(args.retries + 1):
                last = download_file(url, destination, validator)
                if last[0]:
                    break
                if attempt < args.retries:
                    time.sleep(1.5 * (attempt + 1))
            ok, message, was_downloaded = last
            result[result_key] = message
            if not ok:
                failures.append({"bundle": bundle, "file": name, "url": url, "error": message})
                failed_files += 1
            elif was_downloaded:
                downloaded += 1
            else:
                cached += 1
        processed_status[bundle] = result

    # A subset run is only a transport optimization. The manifest must still
    # represent every discovered bundle already present in either cache.
    records = [
        asset_record(bundle, metadata, family, processed_status.get(bundle, {}))
        for family, family_bundles in discovered_by_family.items()
        for bundle in family_bundles
    ]
    write_catalog(
        records,
        failures,
        excluded,
        {family: len(family_bundles) for family, family_bundles in discovered_by_family.items()},
        args.dry_run,
    )
    complete = sum(1 for record in records if record["complete"])
    print(json.dumps({
        "bundles_discovered": sum(len(family_bundles) for family_bundles in discovered_by_family.values()),
        "bundles_processed": len(bundles),
        "bundles_complete": complete,
        "files_downloaded": downloaded,
        "files_cached": cached,
        "files_failed": failed_files,
        "catalog": str(CATALOG),
    }, ensure_ascii=False))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
