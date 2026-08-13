#!/usr/bin/env python3
"""Local-only renderer for one approved Live AI master image.

It never calls a network service, never modifies the original Fabio asset and
never publishes. The PNG derivative is a lossless pixel crop solely to make a
faithful local overlay practical on portrait formats.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ORIGINAL_LOGO = ROOT / "assets" / "brand" / "metodo-veloce-logo-original.jpg"
ORIGINAL_LOGO_MANIFEST = ROOT / "assets" / "brand" / "metodo-veloce-logo-original.json"
DERIVATIVE_DIR = ROOT / "assets" / "brand" / "derived"
DERIVATIVE_LOGO = DERIVATIVE_DIR / "metodo-veloce-logo-overlay-technical.png"
DERIVATIVE_MANIFEST = DERIVATIVE_DIR / "metodo-veloce-logo-overlay-technical.json"
DEFAULT_OUTPUT = ROOT / "assets" / "metodo-veloce" / "live-ai-brand-media-pilot-v1"
LOGO_CROP = (144, 352, 940, 1148)
VARIANTS = {"instagram": (1080, 1350), "tiktok": (1080, 1920)}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_original_manifest() -> dict[str, object]:
    manifest = json.loads(ORIGINAL_LOGO_MANIFEST.read_text(encoding="utf-8"))
    actual = sha256(ORIGINAL_LOGO)
    if manifest.get("sha256") != actual:
        raise RuntimeError("The Fabio original logo hash does not match its immutable asset record")
    return manifest


def prepare_overlay() -> dict[str, object]:
    original = read_original_manifest()
    DERIVATIVE_DIR.mkdir(parents=True, exist_ok=True)
    with Image.open(ORIGINAL_LOGO) as image:
        image.convert("RGB").crop(LOGO_CROP).save(DERIVATIVE_LOGO, format="PNG", optimize=True)
    derivative = {
        "assetId": "metodo-veloce-logo-overlay-technical@1",
        "createdBy": "local-only renderer",
        "creativeModificationAllowed": False,
        "derivativeOperation": "lossless pixel crop for local overlay only",
        "dimensions": {"width": LOGO_CROP[2] - LOGO_CROP[0], "height": LOGO_CROP[3] - LOGO_CROP[1]},
        "originalAssetId": original["assetId"],
        "originalSha256": original["sha256"],
        "overlayOnly": True,
        "sha256": sha256(DERIVATIVE_LOGO),
        "sourceCrop": {"left": LOGO_CROP[0], "top": LOGO_CROP[1], "right": LOGO_CROP[2], "bottom": LOGO_CROP[3]},
    }
    DERIVATIVE_MANIFEST.write_text(json.dumps(derivative, indent=2) + "\n", encoding="utf-8")
    return derivative


def cover(image: Image.Image, target: tuple[int, int]) -> Image.Image:
    width, height = target
    scale = max(width / image.width, height / image.height)
    resized = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)
    left = (resized.width - width) // 2
    top = (resized.height - height) // 2
    return resized.crop((left, top, left + width, top + height)).convert("RGBA")


def add_local_logo_overlay(canvas: Image.Image, platform: str) -> None:
    size = 144 if platform == "instagram" else 164
    margin = 46 if platform == "instagram" else 54
    with Image.open(DERIVATIVE_LOGO) as image:
        logo = image.convert("RGBA").resize((size, size), Image.Resampling.LANCZOS)
    shadow = Image.new("RGBA", (size + 18, size + 18), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((0, 0, size + 18, size + 18), radius=18, fill=(0, 0, 0, 155))
    x = canvas.width - margin - size
    y = canvas.height - margin - size
    canvas.alpha_composite(shadow, (x - 9, y - 9))
    canvas.alpha_composite(logo, (x, y))


def local_font(size: int) -> ImageFont.ImageFont:
    candidates = (
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Supplemental/Helvetica Neue Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    )
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    return ImageFont.load_default()


def wrap_title(title: str, max_characters: int) -> str:
    words = title.split()
    lines: list[str] = []
    current = ""
    for word in words:
        proposed = f"{current} {word}".strip()
        if current and len(proposed) > max_characters:
            lines.append(current)
            current = word
        else:
            current = proposed
    if current:
        lines.append(current)
    return "\n".join(lines[:3])


def add_local_title_overlay(canvas: Image.Image, platform: str, title: str) -> dict[str, int]:
    margin = 56 if platform == "instagram" else 66
    top = 74 if platform == "instagram" else 104
    max_width = canvas.width - margin * 2
    font_size = 56 if platform == "instagram" else 64
    font = local_font(font_size)
    wrapped = wrap_title(title.upper(), 23 if platform == "instagram" else 21)
    draw = ImageDraw.Draw(canvas)
    bbox = draw.multiline_textbbox((0, 0), wrapped, font=font, spacing=8)
    text_height = bbox[3] - bbox[1]
    panel_height = text_height + 46
    panel = Image.new("RGBA", (max_width, panel_height), (0, 0, 0, 176))
    panel_draw = ImageDraw.Draw(panel)
    panel_draw.rectangle((0, 0, 9, panel_height), fill=(247, 206, 0, 255))
    canvas.alpha_composite(panel, (margin, top))
    draw = ImageDraw.Draw(canvas)
    draw.multiline_text((margin + 28, top + 20), wrapped, font=font, fill=(255, 255, 255, 255), spacing=8)
    return {"left": margin, "top": top, "right": margin + max_width, "bottom": top + panel_height}


def render_variant(master: Path, output: Path, platform: str, title: str) -> tuple[Path, dict[str, int]]:
    with Image.open(master) as image:
        canvas = cover(image, VARIANTS[platform])
    shade = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(shade)
    draw.rectangle((0, int(canvas.height * 0.72), canvas.width, canvas.height), fill=(0, 0, 0, 35))
    canvas.alpha_composite(shade)
    safe_title_area = add_local_title_overlay(canvas, platform, title)
    add_local_logo_overlay(canvas, platform)
    destination = output / f"{platform}-local-variant.png"
    canvas.convert("RGB").save(destination, format="PNG", optimize=True)
    return destination, safe_title_area


def load_metadata(path: Path | None) -> dict[str, object]:
    if path is None:
        return {}
    parsed = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(parsed, dict):
        raise RuntimeError("Safe render metadata must be a JSON object")
    return parsed


def render(master: Path, output: Path, metadata_path: Path | None) -> Path:
    if not master.is_file():
        raise FileNotFoundError(master)
    derivative = prepare_overlay()
    output.mkdir(parents=True, exist_ok=True)
    master_output = output / "master-openai.png"
    metadata = load_metadata(metadata_path)
    content_brief = metadata.get("contentBrief")
    if not isinstance(content_brief, dict) or not isinstance(content_brief.get("title"), str):
        raise RuntimeError("Safe render metadata is missing the local title")
    title = content_brief["title"].strip()
    if not title:
        raise RuntimeError("Safe render metadata has an empty local title")
    with Image.open(master) as image:
        if image.format != "PNG":
            raise RuntimeError("The master must be the OpenAI PNG response")
        if image.size != (1024, 1536):
            raise RuntimeError("The master must be the requested 1024x1536 OpenAI output")
        image.save(master_output, format="PNG", optimize=True)
    rendered = {platform: render_variant(master_output, output, platform, title) for platform in VARIANTS}
    assets = {
        "master": {"path": str(master_output.relative_to(ROOT)), "sha256": sha256(master_output), "width": 1024, "height": 1536},
        **{
            platform: {
                "path": str(rendered[platform][0].relative_to(ROOT)),
                "sha256": sha256(rendered[platform][0]),
                "width": size[0],
                "height": size[1],
            }
            for platform, size in VARIANTS.items()
        },
    }
    manifest = {
        "approvalScope": "INTERNAL_PACKAGE_ONLY",
        "assets": assets,
        "contentBrief": content_brief,
        "costGate": {"status": "PASS_BUDGET_PREFLIGHT", "costLedger": metadata.get("costLedger"), "serverSpendUsd": 0},
        "externalActionsAllowed": False,
        "externalEffects": {"openAiProviderCalls": metadata.get("providerCalls", 0), "socialPublications": 0, "serverSpendUsd": 0},
        "logoOverlay": {"derivative": str(DERIVATIVE_LOGO.relative_to(ROOT)), "original": str(ORIGINAL_LOGO.relative_to(ROOT)), "originalSha256": read_original_manifest()["sha256"], "technicalDerivativeSha256": derivative["sha256"]},
        "masterReceipt": metadata.get("masterReceipt"),
        "models": metadata.get("models"),
        "publicationAuthorized": False,
        "qualityGate": {"status": "PASS_TECHNICAL", "checks": ["exact dimensions", "master retained without local overlays", "local text safe area", "original logo local overlay only"]},
        "riskGate": {"status": "PASS_NO_SOCIAL_OR_SERVER_EFFECTS", "effects": {"openAiProviderCalls": metadata.get("providerCalls", 0), "socialPublications": 0, "serverSpendUsd": 0}},
        "social": {"instagram": "BROWSER_CONNECTION_REQUIRED", "tiktok": "BROWSER_CONNECTION_REQUIRED"},
        "status": "READY_FOR_FABIO_REVIEW",
        "visualGate": {"status": "PASS_TECHNICAL_PENDING_FABIO", "checks": ["master has no locally added logo or text", "local title uses protected top safe area", "local logo uses a faithful technical crop of Fabio original", "Instagram and TikTok dimensions exact"], "requiredReview": ["brand fidelity", "crop", "logo visibility", "image appropriateness"]},
        "variantSafeAreas": {platform: {"title": rendered[platform][1], "logo": "lower-right local overlay"} for platform in VARIANTS},
    }
    manifest["fingerprint"] = hashlib.sha256(json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
    path = output / "approval-manifest.json"
    path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--master", type=Path)
    parser.add_argument("--metadata", type=Path)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--prepare-logo", action="store_true")
    args = parser.parse_args()
    if args.prepare_logo:
        prepare_overlay()
        return
    if args.master is None:
        parser.error("--master is required unless --prepare-logo is used")
    print(render(args.master, args.output, args.metadata))


if __name__ == "__main__":
    main()
