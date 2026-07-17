#!/usr/bin/env python3
"""Deterministic local renderer for the Metodo Veloce review package."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps


EXPECTED_ORIGINAL_LOGO_SHA = "9a622429e00fdef35e3dfd7472cf945b3a74834018bfd5a57a7c8a3aab97f121"
EXPECTED_OVERLAY_SHA = "3f4f433853dc467e03eb56b5451928e6cb908f8187b123ccce542e841737f681"
FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
FONT_BLACK = "/System/Library/Fonts/Supplemental/Arial Black.ttf"
YELLOW = (255, 207, 0, 255)
WHITE = (248, 248, 246, 255)
BLACK = (6, 7, 8, 255)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size=size)


def cover(source: Image.Image, size: tuple[int, int], focus_y: float) -> Image.Image:
    source = ImageOps.exif_transpose(source).convert("RGB")
    target_ratio = size[0] / size[1]
    source_ratio = source.width / source.height
    if source_ratio > target_ratio:
        crop_width = round(source.height * target_ratio)
        left = round((source.width - crop_width) / 2)
        box = (left, 0, left + crop_width, source.height)
    else:
        crop_height = round(source.width / target_ratio)
        top = round((source.height - crop_height) * focus_y)
        box = (0, top, source.width, top + crop_height)
    return source.crop(box).resize(size, Image.Resampling.LANCZOS)


def darken(image: Image.Image, strength: float) -> Image.Image:
    base = ImageEnhance.Contrast(image).enhance(1.06).convert("RGBA")
    shade = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(shade)
    height = base.height
    for y in range(height):
        top_weight = max(0.0, 1.0 - y / (height * 0.58))
        bottom_weight = max(0.0, (y - height * 0.64) / (height * 0.36))
        alpha = int(255 * min(0.9, strength * (0.25 + top_weight + bottom_weight)))
        draw.line((0, y, base.width, y), fill=(0, 0, 0, alpha))
    return Image.alpha_composite(base, shade)


def logo_tile(overlay: Image.Image, size: int) -> Image.Image:
    tile = ImageOps.fit(overlay.convert("RGB"), (size, size), method=Image.Resampling.LANCZOS).convert("RGBA")
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=round(size * 0.16), fill=255)
    tile.putalpha(mask)
    return tile


def draw_pill(canvas: Image.Image, box: tuple[int, int, int, int], text: str, text_font: ImageFont.FreeTypeFont) -> None:
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle(box, radius=(box[3] - box[1]) // 2, fill=YELLOW)
    bounds = draw.textbbox((0, 0), text, font=text_font)
    x = box[0] + (box[2] - box[0] - (bounds[2] - bounds[0])) // 2
    y = box[1] + (box[3] - box[1] - (bounds[3] - bounds[1])) // 2 - bounds[1]
    draw.text((x, y), text, font=text_font, fill=BLACK)


def render_instagram(master: Image.Image, overlay: Image.Image) -> tuple[Image.Image, dict[str, object]]:
    canvas = darken(cover(master, (1080, 1350), 0.47), 0.53)
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((64, 68, 450, 130), radius=31, fill=YELLOW)
    draw.text((91, 78), "METODO VELOCE", font=font(FONT_BOLD, 34), fill=BLACK)
    draw.text((66, 176), "5 OGGETTI", font=font(FONT_BLACK, 99), fill=WHITE, stroke_width=1, stroke_fill=BLACK)
    draw.text((66, 278), "IN CASA", font=font(FONT_BLACK, 99), fill=YELLOW, stroke_width=1, stroke_fill=BLACK)
    draw.text((70, 392), "CHE PUOI VENDERE SUBITO", font=font(FONT_BOLD, 39), fill=WHITE)
    draw.line((70, 454, 320, 454), fill=YELLOW, width=10)
    tile = logo_tile(overlay, 196)
    canvas.alpha_composite(tile, (66, 1080))
    draw_pill(canvas, (292, 1152, 1004, 1234), "SALVA LA CHECKLIST", font(FONT_BLACK, 39))
    draw.text((294, 1252), "VALUTA PRIMA DI PUBBLICARE", font=font(FONT_BOLD, 27), fill=WHITE)
    return canvas.convert("RGB"), {
        "layout": "INSTAGRAM_NATIVE_4X5_V1",
        "safeZone": {"left": 64, "right": 76, "top": 68, "bottom": 64},
        "headline": "5 OGGETTI IN CASA — CHE PUOI VENDERE SUBITO",
        "cta": "SALVA LA CHECKLIST — VALUTA PRIMA DI PUBBLICARE",
    }


def render_tiktok(master: Image.Image, overlay: Image.Image) -> tuple[Image.Image, dict[str, object]]:
    canvas = darken(cover(master, (1080, 1920), 0.5), 0.44)
    draw = ImageDraw.Draw(canvas)
    draw.polygon(((0, 0), (1080, 0), (1080, 235), (0, 355)), fill=(6, 7, 8, 238))
    draw.polygon(((0, 355), (1080, 235), (1080, 255), (0, 375)), fill=YELLOW)
    tile = logo_tile(overlay, 156)
    canvas.alpha_composite(tile, (72, 80))
    draw.text((266, 91), "METODO VELOCE", font=font(FONT_BOLD, 42), fill=WHITE)
    draw.text((266, 146), "CHECKLIST CASA", font=font(FONT_BOLD, 31), fill=YELLOW)
    draw.text((66, 386), "5 OGGETTI", font=font(FONT_BLACK, 104), fill=WHITE, stroke_width=1, stroke_fill=BLACK)
    draw.text((66, 494), "CHE PUOI", font=font(FONT_BLACK, 98), fill=YELLOW, stroke_width=1, stroke_fill=BLACK)
    draw.text((66, 596), "VENDERE SUBITO", font=font(FONT_BLACK, 76), fill=WHITE, stroke_width=1, stroke_fill=BLACK)
    draw.line((70, 694, 355, 694), fill=YELLOW, width=11)
    draw_pill(canvas, (72, 1518, 870, 1622), "SALVA LA CHECKLIST", font(FONT_BLACK, 43))
    draw.rounded_rectangle((72, 1645, 870, 1726), radius=18, fill=(6, 7, 8, 226), outline=(255, 255, 255, 80), width=2)
    draw.text((101, 1667), "VALUTA PRIMA DI PUBBLICARE", font=font(FONT_BOLD, 29), fill=WHITE)
    return canvas.convert("RGB"), {
        "layout": "TIKTOK_NATIVE_9X16_V1",
        "safeZone": {"left": 66, "right": 210, "top": 80, "bottom": 194},
        "headline": "5 OGGETTI — CHE PUOI VENDERE SUBITO",
        "cta": "SALVA LA CHECKLIST — VALUTA PRIMA DI PUBBLICARE",
    }


def preview(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    return image.resize(size, Image.Resampling.LANCZOS)


def contact_sheet(instagram: Image.Image, tiktok: Image.Image) -> Image.Image:
    sheet = Image.new("RGB", (1800, 1160), (13, 14, 16))
    draw = ImageDraw.Draw(sheet)
    draw.text((80, 42), "METODO VELOCE — MEDIA FACTORY REVIEW", font=font(FONT_BLACK, 44), fill=WHITE)
    draw.text((80, 100), "INTERNAL PACKAGE ONLY • PUBLICATION LOCKED", font=font(FONT_BOLD, 25), fill=YELLOW)
    ig = preview(instagram, (720, 900))
    tt = preview(tiktok, (506, 900))
    sheet.paste(ig, (80, 180))
    sheet.paste(tt, (920, 180))
    draw.text((80, 1090), "INSTAGRAM 1080×1350", font=font(FONT_BOLD, 26), fill=WHITE)
    draw.text((920, 1090), "TIKTOK 1080×1920", font=font(FONT_BOLD, 26), fill=WHITE)
    return sheet


def asset_record(path: Path, width: int, height: int, role: str) -> dict[str, object]:
    return {"path": str(path), "sha256": sha256(path), "width": width, "height": height, "role": role}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--master", required=True, type=Path)
    parser.add_argument("--logo-original", required=True, type=Path)
    parser.add_argument("--logo-overlay", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    arguments = parser.parse_args()

    original_sha = sha256(arguments.logo_original)
    overlay_sha = sha256(arguments.logo_overlay)
    if original_sha != EXPECTED_ORIGINAL_LOGO_SHA or overlay_sha != EXPECTED_OVERLAY_SHA:
        raise SystemExit("Brand asset integrity check failed")
    master = Image.open(arguments.master)
    if master.size != (1024, 1536):
        raise SystemExit("Master dimensions are invalid")
    master.verify()
    master = Image.open(arguments.master).convert("RGB")
    overlay = Image.open(arguments.logo_overlay).convert("RGB")

    arguments.output.mkdir(parents=True, exist_ok=True)
    instagram, instagram_meta = render_instagram(master, overlay)
    tiktok, tiktok_meta = render_tiktok(master, overlay)
    instagram_path = arguments.output / "instagram-1080x1350.png"
    tiktok_path = arguments.output / "tiktok-1080x1920.png"
    instagram_preview_path = arguments.output / "preview-instagram.jpg"
    tiktok_preview_path = arguments.output / "preview-tiktok.jpg"
    contact_path = arguments.output / "contact-sheet.jpg"
    instagram.save(instagram_path, format="PNG", compress_level=9)
    tiktok.save(tiktok_path, format="PNG", compress_level=9)
    preview(instagram, (432, 540)).save(instagram_preview_path, format="JPEG", quality=90, optimize=True)
    preview(tiktok, (360, 640)).save(tiktok_preview_path, format="JPEG", quality=90, optimize=True)
    contact_sheet(instagram, tiktok).save(contact_path, format="JPEG", quality=92, optimize=True)

    assets = {
        "instagram": asset_record(instagram_path, 1080, 1350, "INSTAGRAM_NATIVE_VARIANT"),
        "tiktok": asset_record(tiktok_path, 1080, 1920, "TIKTOK_NATIVE_VARIANT"),
        "instagramPreview": asset_record(instagram_preview_path, 432, 540, "INSTAGRAM_PREVIEW"),
        "tiktokPreview": asset_record(tiktok_preview_path, 360, 640, "TIKTOK_PREVIEW"),
        "contactSheet": asset_record(contact_path, 1800, 1160, "CONTACT_SHEET"),
    }
    content_fingerprint = hashlib.sha256(json.dumps(assets, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    manifest = {
        "contractVersion": "1",
        "package": "MEDIA_FACTORY_QUALITY_CLOSURE_V1",
        "status": "RENDERED_PENDING_VISUAL_GATE",
        "approvalScope": "INTERNAL_PACKAGE_ONLY",
        "publication": "LOCKED",
        "master": {"path": str(arguments.master), "sha256": sha256(arguments.master), "width": 1024, "height": 1536},
        "brand": {
            "originalPath": str(arguments.logo_original),
            "originalSha256": original_sha,
            "overlayPath": str(arguments.logo_overlay),
            "overlaySha256": overlay_sha,
            "overlayProvenance": "FAITHFUL_TECHNICAL_CROP_FROM_REGISTERED_ORIGINAL",
            "appliedBy": "LOCAL_RENDERER_ONLY",
            "includedInModelPrompt": False,
        },
        "layouts": {"instagram": instagram_meta, "tiktok": tiktok_meta},
        "assets": assets,
        "contentFingerprint": content_fingerprint,
        "provenanceChain": [sha256(arguments.master), original_sha, overlay_sha, content_fingerprint],
    }
    manifest_path = arguments.output / "variants-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"contentFingerprint": content_fingerprint, "manifest": str(manifest_path), "status": manifest["status"]}))


if __name__ == "__main__":
    main()
