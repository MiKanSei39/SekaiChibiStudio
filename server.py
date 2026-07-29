"""Local server for the Project Sekai Chibi Studio.

It keeps the official Spine files in a local cache so the browser preview and
canvas exports are same-origin.  The tool is for personal local use only.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import sys
import tempfile
import threading
import time
import uuid
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from pathlib import Path
from typing import Any, Callable
from urllib.error import URLError
from urllib.request import Request, urlopen

from PIL import Image


SOURCE_ROOT = Path(__file__).resolve().parent
FROZEN = bool(getattr(sys, "frozen", False))
# PyInstaller extracts bundled read-only resources under _MEIPASS.  Keep the
# exports and GIF work directory outside that temporary package directory.
RESOURCE_ROOT = Path(getattr(sys, "_MEIPASS", SOURCE_ROOT)) if FROZEN else SOURCE_ROOT
WEB_ROOT = RESOURCE_ROOT / "web"
ASSETS = RESOURCE_ROOT / "assets"
if FROZEN:
    APP_DATA_ROOT = Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local") / "ProjectSekaiChibiStudio"
    EXPORTS = APP_DATA_ROOT / "exports"
    RUNTIME = APP_DATA_ROOT / "runtime"
else:
    EXPORTS = SOURCE_ROOT / "exports"
    RUNTIME = SOURCE_ROOT / "runtime"
PROJECT_ROOT = SOURCE_ROOT.parent
LOCAL_ATLASES = PROJECT_ROOT / "project sekai character" / "q版小人"
SOURCE_RUNTIME = PROJECT_ROOT / "tmp" / "imagegen"
SEKAI_BASE = "https://storage.sekai.best/sekai-jp-assets/area_sd/sd_main"
V2_SEKAI_BASE = "https://storage.sekai.best/sekai-jp-assets/area_sd/v2_sd_main"
CATALOG_PATH = ASSETS / "catalog" / "official_costumes.json"

MAX_GIF_SIZE = 1024
MAX_GIF_FRAMES = 120
MAX_FRAME_BYTES = 8 * 1024 * 1024
GIF_FPS_OPTIONS = (10, 15, 20, 24, 30)
GIF_JOBS: dict[str, dict] = {}
GIF_LOCK = threading.Lock()

CHARACTERS = [
    (1, "ichika", "星乃一歌", "sd_01ichika_normal", "w"),
    (2, "saki", "天马咲希", "sd_02saki_normal", "w"),
    (3, "honami", "望月穗波", "sd_03honami_normal", "w"),
    (4, "shiho", "日野森志步", "sd_04shiho_normal", "w"),
    (5, "minori", "花里实乃理", "sd_05minori_normal", "w"),
    (6, "haruka", "桐谷遥", "sd_06haruka_normal", "w"),
    (7, "airi", "桃井爱莉", "sd_07airi_normal", "w"),
    (8, "shizuku", "日野森雫", "sd_08shizuku_normal", "w"),
    (9, "kohane", "小豆泽心羽", "sd_09kohane_normal", "w"),
    (10, "an", "白石杏", "sd_10an_normal", "w"),
    (11, "akito", "东云彰人", "sd_11akito_normal", "m"),
    (12, "touya", "青柳冬弥", "sd_12touya_normal", "m"),
    (13, "tsukasa", "天马司", "sd_13tsukasa_normal", "m"),
    (14, "emu", "凤笑梦", "sd_14emu_normal", "w"),
    (15, "nene", "草薙宁宁", "sd_15nene_normal", "w"),
    (16, "rui", "神代类", "sd_16rui_normal", "m"),
    (17, "kanade", "宵崎奏", "sd_17kanade_normal", "w"),
    (18, "mafuyu", "朝比奈真冬", "sd_18mafuyu_normal", "w"),
    (19, "ena", "东云绘名", "sd_19ena_normal", "w"),
    (20, "mizuki", "晓山瑞希", "sd_20mizuki_normal", "w"),
    (21, "miku", "初音未来", "sd_21miku_normal", "w"),
    (22, "rin", "镜音铃", "sd_22rin_normal", "w"),
    (23, "len", "镜音连", "sd_23len_normal", "m"),
    (24, "luka", "巡音流歌", "sd_24luka_normal", "w"),
    (25, "meiko", "MEIKO", "sd_25meiko_normal", "w"),
    (26, "kaito", "KAITO", "sd_26kaito_normal", "m"),
]
CHARACTER_BY_ID = {item[0]: item for item in CHARACTERS}

def ensure_directories() -> None:
    for path in (EXPORTS, RUNTIME):
        path.mkdir(parents=True, exist_ok=True)
    if not FROZEN:
        for path in (ASSETS, ASSETS / "base", ASSETS / "characters", ASSETS / "catalog"):
            path.mkdir(parents=True, exist_ok=True)


def copy_if_present(source: Path, destination: Path) -> bool:
    if source.is_file() and not destination.is_file():
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
        return True
    return destination.is_file()


def download(url: str, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    request = Request(url, headers={"User-Agent": "SekaiChibiStudio/1.0 (personal local tool)"})
    try:
        with urlopen(request, timeout=35) as response:
            payload = response.read()
    except URLError as error:
        raise RuntimeError(f"无法下载官方资源：{url}\n{error}") from error
    temp = destination.with_suffix(destination.suffix + ".download")
    temp.write_bytes(payload)
    temp.replace(destination)


def ensure_runtime_files() -> None:
    # Reuse the exact Pixi 7 + Spine 4.1 runtime that has already rendered the
    # local official reference successfully.
    if FROZEN:
        required = (
            WEB_ROOT / "vendor" / "pixi-7.4.2.js",
            WEB_ROOT / "vendor" / "spine-pixi-4.1.js",
        )
        missing = [str(path) for path in required if not path.is_file()]
        if missing:
            raise RuntimeError("打包版缺少 Spine 浏览器运行时：\n" + "\n".join(missing))
        return
    copies = {
        SOURCE_RUNTIME / "pixi-7.4.2.js": WEB_ROOT / "vendor" / "pixi-7.4.2.js",
        SOURCE_RUNTIME / "sdref_render_agent2_spine41_markers.js": WEB_ROOT / "vendor" / "spine-pixi-4.1.js",
    }
    missing = []
    for source, destination in copies.items():
        if not copy_if_present(source, destination):
            missing.append(str(source))
    if missing:
        raise RuntimeError("缺少已验证的 Spine 浏览器运行时：\n" + "\n".join(missing))


def base_asset_paths(runtime_family: str = "legacy_sd_main") -> tuple[Path, Path, Path]:
    if runtime_family == "v2_sd_main":
        base = ASSETS / "base" / "v2_sd_main"
        # V2's shared base atlas has its own filename.  Character costumes
        # still use sekai_atlas.*, so mixing these names silently breaks V2.
        return base / "v2_sd_main.skel", base / "v2_sd_main.atlas.txt", base / "v2_sd_main.png"
    base = ASSETS / "base"
    return base / "sd_main.skel", base / "sd_main.atlas.txt", base / "sd_main.png"


def ensure_base_assets(runtime_family: str = "legacy_sd_main") -> None:
    skeleton, atlas, png = base_asset_paths(runtime_family)
    if runtime_family == "v2_sd_main":
        resources = {
            skeleton: (None, f"{V2_SEKAI_BASE}/v2_base_model/v2_sd_main.skel"),
            atlas: (None, f"{V2_SEKAI_BASE}/v2_base_model/v2_sd_main.atlas.txt"),
            png: (None, f"{V2_SEKAI_BASE}/v2_base_model/v2_sd_main.png"),
        }
    else:
        base = ASSETS / "base"
        resources = {
            base / "sd_main.skel": (
                SOURCE_RUNTIME / "sekai_assets" / "sd_main.skel",
                f"{SEKAI_BASE}/base_model/sd_main.skel",
            ),
            base / "sd_main.atlas.txt": (
                SOURCE_RUNTIME / "sekai_assets" / "sd_main.atlas.txt",
                f"{SEKAI_BASE}/base_model/sekai_atlas.atlas.txt",
            ),
            base / "sd_main.png": (
                SOURCE_RUNTIME / "sekai_assets" / "sd_main.png",
                f"{SEKAI_BASE}/base_model/sekai_atlas.png",
            ),
        }
    for destination, (local, remote) in resources.items():
        # V2 has no bundled local fallback. Do not redownload its shared model
        # on every costume switch once the local cache already contains it.
        if destination.is_file():
            continue
        if FROZEN:
            raise RuntimeError(f"打包版缺少官方 {runtime_family} 基础骨骼资源：{destination.name}")
        if local and copy_if_present(local, destination):
            continue
        download(remote, destination)


def character_png(character_id: int, key: str) -> Path:
    local = LOCAL_ATLASES / f"{character_id:02d}_{key}_default_chibi_atlas.png"
    if not local.is_file():
        raise RuntimeError(f"找不到本地角色图集：{local}")
    return local


def load_official_catalog() -> list[dict[str, Any]]:
    if not CATALOG_PATH.is_file():
        return []
    try:
        catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError(f"官方服装目录无法读取：{error}") from error
    entries = catalog.get("costumes", [])
    if not isinstance(entries, list):
        raise RuntimeError("官方服装目录格式不正确")
    return [entry for entry in entries if isinstance(entry, dict) and entry.get("complete")]


def fallback_costume(character_id: int) -> dict[str, Any]:
    number, key, name, bundle, sex = CHARACTER_BY_ID[character_id]
    return {
        "bundle": bundle,
        "character_id": number,
        "character_key": key,
        "character_name": name,
        "display_name": "默认服",
        "is_default": True,
        "runtime_family": "legacy_sd_main",
        "files": {},
        "source": "local-default",
    }


def costumes_for_character(character_id: int) -> list[dict[str, Any]]:
    entries = [entry for entry in load_official_catalog() if entry.get("character_id") == character_id]
    if not entries:
        return [fallback_costume(character_id)]
    return sorted(entries, key=lambda entry: (
        not bool(entry.get("is_default")),
        bool(entry.get("is_reversed")),
        str(entry.get("display_name", "")),
        str(entry.get("bundle", "")),
    ))


def make_costume_key(entry: dict[str, Any]) -> str:
    return str(entry.get("bundle", ""))


def costume_asset_urls(entry: dict[str, Any]) -> dict[str, str]:
    """Return cache URLs for a costume without combining runtime families."""
    bundle = str(entry.get("bundle", ""))
    runtime_family = str(entry.get("runtime_family") or "legacy_sd_main")
    prefix = f"{runtime_family}/" if runtime_family != "legacy_sd_main" else ""
    skeleton, _base_atlas, _base_png = base_asset_paths(runtime_family)
    return {
        "atlasUrl": f"/assets/characters/{prefix}{bundle}/sekai_atlas.atlas.txt",
        "textureUrl": f"/assets/characters/{prefix}{bundle}/sekai_atlas.png",
        "skeletonUrl": "/assets/" + str(skeleton.relative_to(ASSETS)).replace("\\", "/"),
    }


def get_costume(character_id: int, costume_key: object) -> tuple[str, dict[str, Any]]:
    costumes = costumes_for_character(character_id)
    requested = str(costume_key or "")
    if requested:
        picked = next((entry for entry in costumes if make_costume_key(entry) == requested), None)
        if picked:
            return requested, picked
        raise ValueError("未知或尚未缓存完成的官方服装")
    picked = next((entry for entry in costumes if entry.get("is_default") and not entry.get("is_reversed")), costumes[0])
    return make_costume_key(picked), picked


def costume_summary(entry: dict[str, Any]) -> dict[str, Any]:
    label = str(entry.get("display_name") or entry.get("bundle") or "官方服装")
    runtime_family = str(entry.get("runtime_family") or "legacy_sd_main")
    family_label = "新版 Q版" if runtime_family == "v2_sd_main" else "旧版 Q版"
    variant_label = " · 反向版本" if entry.get("is_reversed") else ""
    label = f"{label}（{family_label}{variant_label}）"
    note = "官方服装。"
    if entry.get("is_reversed"):
        note = "官方反向服装资源。"
    if entry.get("bundle") == "sd_21miku_band":
        note = "Leo/need 初音未来官方团体服，不是魔法未来 2019。"
    if runtime_family == "v2_sd_main":
        note = f"{note} 新版 Q版骨骼资源；不能与旧版组件混用。"
    character_id = entry.get("character_id")
    try:
        character_id = int(character_id)
    except (TypeError, ValueError):
        character_id = 0
    character = CHARACTER_BY_ID.get(character_id)
    character_key = str(entry.get("character_key") or (character[1] if character else ""))
    character_name = str(entry.get("character_name") or (character[2] if character else ""))
    return {
        "key": make_costume_key(entry),
        "label": label,
        "note": note,
        "characterId": character_id,
        "characterKey": character_key,
        "characterName": character_name,
        "runtimeFamily": runtime_family,
        "isReversed": bool(entry.get("is_reversed")),
        "bundle": str(entry.get("bundle", "")),
        # The browser parses a source costume's own atlas before allowing an
        # individual accessory swap.  These URLs keep that source in its own
        # Spine family instead of borrowing the currently worn costume atlas.
        **costume_asset_urls(entry),
    }


def ensure_character_assets(character_id: int, costume_key: object = None) -> dict:
    if character_id not in CHARACTER_BY_ID:
        raise ValueError("未知角色")
    number, key, name, _asset_bundle, sex = CHARACTER_BY_ID[character_id]
    selected_costume, costume = get_costume(number, costume_key)
    asset_bundle = str(costume["bundle"])
    runtime_family = str(costume.get("runtime_family") or "legacy_sd_main")
    destination = ASSETS / "characters" / asset_bundle if runtime_family == "legacy_sd_main" else ASSETS / "characters" / runtime_family / asset_bundle
    atlas = destination / "sekai_atlas.atlas.txt"
    png = destination / "sekai_atlas.png"
    if FROZEN:
        if not destination.is_dir():
            raise RuntimeError(f"打包版缺少官方服装目录：{asset_bundle}")
    else:
        destination.mkdir(parents=True, exist_ok=True)
    if not png.is_file():
        if FROZEN:
            raise RuntimeError(f"打包版缺少官方服装贴图：{asset_bundle}")
        if costume.get("source") == "local-default":
            shutil.copy2(character_png(number, key), png)
        else:
            base_url = V2_SEKAI_BASE if runtime_family == "v2_sd_main" else SEKAI_BASE
            download(f"{base_url}/{asset_bundle}/sekai_atlas.png", png)
    if not atlas.is_file():
        if FROZEN:
            raise RuntimeError(f"打包版缺少官方服装图集：{asset_bundle}")
        base_url = V2_SEKAI_BASE if runtime_family == "v2_sd_main" else SEKAI_BASE
        download(f"{base_url}/{asset_bundle}/sekai_atlas.atlas.txt", atlas)
    urls = costume_asset_urls(costume)
    return {
        "id": number,
        "key": key,
        "name": name,
        "bundle": asset_bundle,
        "sex": sex,
        "costumeKey": selected_costume,
        "costumeName": costume_summary(costume)["label"],
        "costumeNote": costume_summary(costume)["note"],
        "isReversed": bool(costume.get("is_reversed")),
        "runtimeFamily": runtime_family,
        "costumes": [costume_summary(entry) for entry in costumes_for_character(number)],
        # These are cached official sources only. The browser keeps the runtime
        # family, reverse-facing, and current-costume checks before any swap.
        "crossRigCostumes": [costume_summary(entry) for entry in load_official_catalog()],
        # Component candidates are derived in the browser from actual Spine
        # attachment types.  The server only exposes verified local sources.
        "components": [],
        **urls,
    }


def json_bytes(data: dict) -> bytes:
    return json.dumps(data, ensure_ascii=False).encode("utf-8")


def gif_frame(image: Image.Image, transparent: bool) -> Image.Image:
    """Convert a PNG frame to GIF-compatible color data.

    GIF has a single binary transparent palette entry. Reserving palette index
    zero keeps a transparent canvas transparent instead of baking in the UI's
    preview color.
    """
    if not transparent:
        return image.convert("RGB")
    rgba = image.convert("RGBA")
    # FASTOCTREE is materially faster for 120-frame exports while retaining
    # enough colors for this small local GIF palette.
    source = rgba.convert("RGB").quantize(colors=255, method=Image.Quantize.FASTOCTREE)
    palette = [0, 0, 0, *source.getpalette()[: 255 * 3]]
    # The quantizer uses indices 0-254. Shift those in bulk to reserve palette
    # index zero for alpha, then overwrite transparent pixels using Pillow's
    # native mask operation rather than looping over every pixel in Python.
    frame = source.point([*range(1, 256), 255])
    transparent_mask = rgba.getchannel("A").point(lambda alpha: 255 if alpha < 128 else 0)
    frame.paste(0, mask=transparent_mask)
    frame.putpalette(palette)
    frame.info["transparency"] = 0
    return frame


def gif_frame_durations(fps: int, frames: int) -> list[int]:
    """Use the GIF format's 10 ms timing grid while preserving average FPS."""
    return [
        10 * (((index + 1) * 100 // fps) - (index * 100 // fps))
        for index in range(frames)
    ]


class StudioHandler(SimpleHTTPRequestHandler):
    server_version = "SekaiChibiStudio/1.0"

    def translate_path(self, path: str) -> str:
        # The studio intentionally exposes only the web UI, local asset cache
        # and generated exports, never the surrounding project directory.
        clean = path.split("?", 1)[0].split("#", 1)[0]
        if clean.startswith("/assets/"):
            base, suffix = ASSETS, clean[len("/assets/"):]
        elif clean.startswith("/exports/"):
            base, suffix = EXPORTS, clean[len("/exports/"):]
        else:
            base, suffix = WEB_ROOT, clean.lstrip("/") or "index.html"
        candidate = (base / suffix).resolve()
        try:
            candidate.relative_to(base.resolve())
        except ValueError:
            return str(base / "__invalid_path__")
        return str(candidate)

    def log_message(self, _format: str, *args) -> None:
        # Asset and frame requests are frequent; leave the terminal quiet unless
        # the server itself needs to report an error.
        return

    def do_GET(self) -> None:
        if self.path == "/api/health":
            self.send_json({"ok": True})
            return
        super().do_GET()

    def do_POST(self) -> None:
        if self.path == "/api/character-assets":
            self.handle_character_assets()
            return
        if self.path == "/api/gif/jobs":
            self.create_gif_job()
            return
        match = re.fullmatch(r"/api/gif/jobs/([a-f0-9-]+)/finish", self.path)
        if match:
            self.finish_gif_job(match.group(1))
            return
        self.send_error(HTTPStatus.NOT_FOUND)

    def do_PUT(self) -> None:
        match = re.fullmatch(r"/api/gif/jobs/([a-f0-9-]+)/frames/(\d+)", self.path)
        if match:
            self.upload_gif_frame(match.group(1), int(match.group(2)))
            return
        self.send_error(HTTPStatus.NOT_FOUND)

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if not 0 < length <= 64 * 1024:
            raise ValueError("请求数据大小不正确")
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def send_json(self, data: dict, status: HTTPStatus = HTTPStatus.OK) -> None:
        payload = json_bytes(data)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def send_api_error(self, message: str, status: HTTPStatus = HTTPStatus.BAD_REQUEST) -> None:
        self.send_json({"ok": False, "error": message}, status)

    def handle_character_assets(self) -> None:
        try:
            data = self.read_json()
            character_id = int(data.get("characterId"))
            character = ensure_character_assets(character_id, data.get("costumeKey"))
            ensure_base_assets(character["runtimeFamily"])
            self.send_json({"ok": True, "character": character})
        except (ValueError, RuntimeError, OSError, json.JSONDecodeError) as error:
            self.send_api_error(str(error))

    def create_gif_job(self) -> None:
        try:
            data = self.read_json()
            width = int(data.get("width", 512))
            height = int(data.get("height", 512))
            fps = int(data.get("fps", 10))
            frames = int(data.get("frames", 0))
            transparent = data.get("transparent", False)
            if not (64 <= width <= MAX_GIF_SIZE and 64 <= height <= MAX_GIF_SIZE):
                raise ValueError("GIF 尺寸需在 64 到 1024 像素之间")
            if fps not in GIF_FPS_OPTIONS:
                raise ValueError("GIF 帧率仅支持 10、15、20、24 或 30 fps")
            if not (2 <= frames <= MAX_GIF_FRAMES):
                raise ValueError(f"GIF 帧数需在 2 到 {MAX_GIF_FRAMES} 之间")
            if not isinstance(transparent, bool):
                raise ValueError("GIF 透明设置不正确")
            job_id = str(uuid.uuid4())
            job_dir = Path(tempfile.mkdtemp(prefix=f"gif-{job_id}-", dir=RUNTIME))
            with GIF_LOCK:
                GIF_JOBS[job_id] = {
                    "dir": job_dir,
                    "width": width,
                    "height": height,
                    "fps": fps,
                    "frames": frames,
                    "transparent": transparent,
                    "created": time.monotonic(),
                }
            self.send_json({"ok": True, "id": job_id})
        except (ValueError, json.JSONDecodeError) as error:
            self.send_api_error(str(error))

    def get_gif_job(self, job_id: str) -> dict | None:
        with GIF_LOCK:
            return GIF_JOBS.get(job_id)

    def upload_gif_frame(self, job_id: str, index: int) -> None:
        job = self.get_gif_job(job_id)
        if job is None:
            self.send_api_error("GIF 导出任务不存在或已结束", HTTPStatus.NOT_FOUND)
            return
        if not 0 <= index < job["frames"]:
            self.send_api_error("GIF 帧编号超出范围")
            return
        length = int(self.headers.get("Content-Length", "0"))
        if not 0 < length <= MAX_FRAME_BYTES:
            self.send_api_error("GIF 单帧大小不正确")
            return
        try:
            payload = self.rfile.read(length)
            content_type = self.headers.get("Content-Type", "").split(";", 1)[0].lower()
            if content_type == "application/x-sekai-rgba":
                expected = job["width"] * job["height"] * 4
                if length != expected:
                    raise ValueError("GIF 原始帧尺寸与任务不一致")
                (job["dir"] / f"{index:04d}.rgba").write_bytes(payload)
            else:
                with Image.open(BytesIO(payload)) as image:
                    if image.size != (job["width"], job["height"]):
                        raise ValueError("GIF 单帧尺寸与任务不一致")
                    image.verify()
                (job["dir"] / f"{index:04d}.png").write_bytes(payload)
            self.send_json({"ok": True})
        except (OSError, ValueError) as error:
            self.send_api_error(f"GIF 帧无效：{error}")

    def finish_gif_job(self, job_id: str) -> None:
        with GIF_LOCK:
            job = GIF_JOBS.pop(job_id, None)
        if job is None:
            self.send_api_error("GIF 导出任务不存在或已结束", HTTPStatus.NOT_FOUND)
            return
        try:
            png_paths = [job["dir"] / f"{index:04d}.png" for index in range(job["frames"])]
            rgba_paths = [job["dir"] / f"{index:04d}.rgba" for index in range(job["frames"])]
            paths = [raw if raw.is_file() else png for raw, png in zip(rgba_paths, png_paths)]
            missing = [path.name for path in paths if not path.is_file()]
            if missing:
                raise ValueError("GIF 帧尚未上传完整")
            frames = []
            for path in paths:
                if path.suffix == ".rgba":
                    image = Image.frombytes("RGBA", (job["width"], job["height"]), path.read_bytes())
                    frames.append(gif_frame(image, job["transparent"]))
                else:
                    with Image.open(path) as image:
                        frames.append(gif_frame(image, job["transparent"]))
            filename = f"sekai-chibi-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}.gif"
            output = EXPORTS / filename
            save_args: dict[str, Any] = {
                "format": "GIF",
                "save_all": True,
                "append_images": frames[1:],
                "duration": gif_frame_durations(job["fps"], len(frames)),
                "loop": 0,
                "disposal": 2,
                "optimize": False,
            }
            if job["transparent"]:
                # Every palette frame reserves index zero for alpha. Pass it to
                # Pillow explicitly so the GIF header carries the transparency
                # flag, including after palette optimization.
                save_args["transparency"] = 0
                save_args["background"] = 0
            frames[0].save(
                output,
                **save_args,
            )
            self.send_json({"ok": True, "url": f"/exports/{filename}"})
        except (OSError, ValueError) as error:
            self.send_api_error(str(error))
        finally:
            shutil.rmtree(job["dir"], ignore_errors=True)


def main(
    port: int | None = None,
    host: str | None = None,
    on_ready: Callable[[ThreadingHTTPServer], None] | None = None,
) -> None:
    ensure_directories()
    try:
        ensure_runtime_files()
    except RuntimeError as error:
        print(error, file=sys.stderr)
        raise SystemExit(1)
    requested_port = port if port is not None else (int(sys.argv[1]) if len(sys.argv) > 1 else 8765)
    requested_host = host if host is not None else (sys.argv[2] if len(sys.argv) > 2 else "127.0.0.1")
    try:
        server = ThreadingHTTPServer((requested_host, requested_port), StudioHandler)
    except OSError as error:
        print(f"无法启动本地编辑器（{requested_host}:{requested_port}）：{error}", file=sys.stderr)
        raise SystemExit(1) from error
    actual_port = int(server.server_address[1])
    print(f"Sekai Chibi Studio: http://{requested_host}:{actual_port}/", flush=True)
    if on_ready:
        on_ready(server)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStudio stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
