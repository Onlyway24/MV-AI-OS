#!/usr/bin/env python3
"""Render the reviewed Metodo Veloce six-slide pack for Instagram and TikTok.

The renderer deliberately keeps copy, geometry, and provenance deterministic.
It does not approve or publish anything. The current logo is an exact pixel crop
from a supplied public-post screenshot and is therefore marked UNVERIFIED until
the standalone original is supplied.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
PACK = ROOT / "assets" / "metodo-veloce" / "social-pack-five-items-v3"
LOGO = ROOT / "assets" / "brand" / "metodo-veloce-logo-extracted-reference-unverified.png"
TITLE_FONT = Path("/System/Library/Fonts/Supplemental/DIN Condensed Bold.ttf")
BODY_FONT = Path("/System/Library/Fonts/Avenir Next.ttc")
YELLOW = "#FFD400"
WHITE = "#F7F7F4"
MUTED = "#D8D4CB"

SLIDES = (
    {
        "kicker": "CHECKLIST METODO VELOCE",
        "title": "5 OGGETTI IN CASA DA CONTROLLARE",
        "body": ("Prima di vendere, verifica questi dettagli.",),
        "note": "NESSUNA VENDITA È GARANTITA",
    },
    {
        "kicker": "1 · ELETTRONICA USATA",
        "title": "CONTROLLA PRIMA DI PUBBLICARE",
        "body": ("Modello e memoria", "Batteria e blocchi account", "Cavi, accessori e difetti"),
    },
    {
        "kicker": "2 · SNEAKERS E STREETWEAR",
        "title": "I DETTAGLI CAMBIANO LA VALUTAZIONE",
        "body": ("Marca, modello e taglia", "Autenticità e stato reale", "Foto di suola, etichette e difetti"),
    },
    {
        "kicker": "3 · OROLOGI E GIOIELLI",
        "title": "SERVONO RISCONTRI, NON STIME",
        "body": ("Materiali e misure", "Punzoni e documenti", "Provenienza verificabile"),
    },
    {
        "kicker": "4–5 · CORREDO E ACCESSORI",
        "title": "NON BUTTARE SCATOLE E CERTIFICATI",
        "body": ("Confezione e accessori", "Quantità e stato reale", "Regole della piattaforma"),
    },
    {
        "kicker": "ULTIMO PASSO",
        "title": "VERIFICA PRIMA DI VENDERE",
        "body": (
            "Marca e modello",
            "Stato reale",
            "Accessori presenti",
            "Domanda osservabile",
            "Prezzi di articoli già venduti",
        ),
        "cta": "SALVA LA CHECKLIST",
        "note": "Una categoria non garantisce una vendita.",
    },
)

FORMATS = {
    "instagram": {"size": (1080, 1350), "title": 94, "body": 40, "margin": 64, "text_y": 625},
    "tiktok": {"size": (1080, 1920), "title": 108, "body": 47, "margin": 72, "text_y": 1060},
}


def font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(path), size=size)


def cover(source: Image.Image, size: tuple[int, int]) -> Image.Image:
    sw, sh = source.size
    tw, th = size
    scale = max(tw / sw, th / sh)
    resized = source.resize((round(sw * scale), round(sh * scale)), Image.Resampling.LANCZOS)
    left = (resized.width - tw) // 2
    top = (resized.height - th) // 2
    return resized.crop((left, top, left + tw, top + th))


def wrap(draw: ImageDraw.ImageDraw, value: str, face: ImageFont.FreeTypeFont, width: int) -> list[str]:
    lines: list[str] = []
    current = ""
    for word in value.split():
        candidate = f"{current} {word}".strip()
        if current and draw.textbbox((0, 0), candidate, font=face)[2] > width:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines


def fit_title(draw: ImageDraw.ImageDraw, value: str, base: int, width: int, max_lines: int = 3) -> tuple[ImageFont.FreeTypeFont, list[str]]:
    for size in range(base, 55, -2):
        face = font(TITLE_FONT, size)
        lines = wrap(draw, value, face, width)
        if len(lines) <= max_lines:
            return face, lines
    raise RuntimeError(f"Title cannot fit safely: {value}")


def gradient_overlay(size: tuple[int, int], start: float) -> Image.Image:
    w, h = size
    overlay = Image.new("RGBA", size, (0, 0, 0, 0))
    pixels = overlay.load()
    start_y = int(h * start)
    span = max(1, h - start_y)
    for y in range(start_y, h):
        alpha = int(35 + 212 * ((y - start_y) / span) ** 0.72)
        for x in range(w):
            pixels[x, y] = (2, 2, 2, min(alpha, 238))
    return overlay


def add_brand(canvas: Image.Image, margin: int, platform: str) -> None:
    logo_size = 122 if platform == "instagram" else 138
    logo = Image.open(LOGO).convert("RGBA").resize((logo_size, logo_size), Image.Resampling.LANCZOS)
    canvas.alpha_composite(logo, (margin, margin))
    draw = ImageDraw.Draw(canvas)
    label = font(BODY_FONT, 25 if platform == "instagram" else 29)
    x = margin + logo_size + 20
    draw.text((x, margin + 28), "METODO VELOCE", font=label, fill=WHITE)
    draw.text((x, margin + 63), "CHECKLIST EVIDENCE-LED", font=font(BODY_FONT, label.size - 5), fill=YELLOW)


def bullet_rows(draw: ImageDraw.ImageDraw, values: Iterable[str], x: int, y: int, width: int, size: int, numbered: bool) -> int:
    body = font(BODY_FONT, size)
    line_height = round(size * 1.38)
    for index, value in enumerate(values, start=1):
        marker = str(index) if numbered else "•"
        marker_box = draw.rounded_rectangle((x, y + 2, x + 44, y + 46), radius=22, fill=(255, 212, 0, 245))
        del marker_box
        marker_face = font(TITLE_FONT, 31)
        marker_width = draw.textbbox((0, 0), marker, font=marker_face)[2]
        draw.text((x + (44 - marker_width) / 2, y + 3), marker, font=marker_face, fill="#050505")
        lines = wrap(draw, value, body, width - 64)
        for line_index, line in enumerate(lines):
            draw.text((x + 62, y + line_index * line_height), line, font=body, fill=WHITE)
        y += max(54, len(lines) * line_height) + 12
    return y


def render_slide(platform: str, index: int, data: dict[str, object]) -> Path:
    spec = FORMATS[platform]
    width, height = spec["size"]
    background = Image.open(PACK / "backgrounds" / f"slide-{index:02}.png").convert("RGB")
    background = ImageEnhance.Contrast(background).enhance(1.05)
    canvas = cover(background, (width, height)).convert("RGBA")
    canvas.alpha_composite(gradient_overlay((width, height), 0.29 if platform == "instagram" else 0.40))
    canvas.alpha_composite(Image.new("RGBA", (width, height), (0, 0, 0, 35)))
    add_brand(canvas, int(spec["margin"]), platform)
    draw = ImageDraw.Draw(canvas)
    margin = int(spec["margin"])
    text_width = width - margin * 2
    text_y = int(spec["text_y"])

    kicker = str(data["kicker"])
    kicker_face = font(TITLE_FONT, 40 if platform == "instagram" else 46)
    kicker_box = draw.textbbox((0, 0), kicker, font=kicker_face)
    kicker_width = kicker_box[2] + 38
    draw.rounded_rectangle((margin, text_y, margin + kicker_width, text_y + 58), radius=8, fill=(5, 5, 5, 218), outline=YELLOW, width=2)
    draw.text((margin + 19, text_y + 7), kicker, font=kicker_face, fill=YELLOW)
    text_y += 76

    title_face, title_lines = fit_title(draw, str(data["title"]), int(spec["title"]), text_width)
    title_step = round(title_face.size * 0.88)
    for line in title_lines:
        draw.text((margin, text_y), line, font=title_face, fill=YELLOW, stroke_width=1, stroke_fill=(0, 0, 0, 220))
        text_y += title_step
    text_y += 18

    body_values = tuple(str(value) for value in data["body"])
    numbered = index == 6
    text_y = bullet_rows(draw, body_values, margin, text_y, text_width, int(spec["body"]), numbered)

    if "cta" in data:
        cta = str(data["cta"])
        cta_face, cta_lines = fit_title(draw, cta, 66 if platform == "instagram" else 76, text_width, 1)
        cta_y = min(text_y + 8, height - 170)
        draw.line((margin, cta_y - 14, width - margin, cta_y - 14), fill=YELLOW, width=3)
        draw.text((margin, cta_y), cta_lines[0], font=cta_face, fill=YELLOW)

    note = data.get("note")
    if note:
        note_face = font(BODY_FONT, 25 if platform == "instagram" else 29)
        note_y = height - (58 if platform == "instagram" else 86)
        draw.text((margin, note_y), str(note), font=note_face, fill=MUTED)

    output = PACK / platform / f"slide-{index:02}.png"
    canvas.convert("RGB").save(output, format="PNG", optimize=True)
    return output


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def contact_sheet(platform: str, files: list[Path]) -> Path:
    thumbs: list[Image.Image] = []
    thumb_width = 360
    for file in files:
        image = Image.open(file).convert("RGB")
        thumb_height = round(image.height * thumb_width / image.width)
        thumbs.append(image.resize((thumb_width, thumb_height), Image.Resampling.LANCZOS))
    gap = 20
    sheet = Image.new("RGB", (thumb_width * 3 + gap * 4, thumbs[0].height * 2 + gap * 3), (9, 9, 9))
    for index, image in enumerate(thumbs):
        x = gap + (index % 3) * (thumb_width + gap)
        y = gap + (index // 3) * (image.height + gap)
        sheet.paste(image, (x, y))
    output = PACK / "qa" / f"contact-sheet-{platform}.jpg"
    sheet.save(output, format="JPEG", quality=94, subsampling=0)
    return output


def main() -> None:
    if not LOGO.exists():
        raise FileNotFoundError(LOGO)
    rendered: dict[str, list[Path]] = {}
    for platform in FORMATS:
        files = [render_slide(platform, index, slide) for index, slide in enumerate(SLIDES, start=1)]
        rendered[platform] = files
        contact_sheet(platform, files)

    manifest = {
        "schemaVersion": 1,
        "packageVersion": "SOCIAL_PUBLISHING_PACK_V3_VISUAL_REVIEW",
        "topic": "5 oggetti in casa da controllare prima di vendere",
        "approvalScope": "INTERNAL_PACKAGE_ONLY",
        "externalActionsAllowed": False,
        "publicationAuthorized": False,
        "visualReview": {
            "status": "BLOCKED_ORIGINAL_LOGO_MISSING",
            "logoSource": "EXTRACTED_REFERENCE_UNVERIFIED",
            "logoRequirement": "Standalone original Metodo Veloce logo required for identity approval",
            "systemQualityScoreDoesNotReplaceHumanReview": True,
        },
        "audio": {
            "status": "NESSUN_AUDIO_SELEZIONATO",
            "safeFallback": "AUDIO_ORIGINALE_METODO_VELOCE_O_NESSUN_AUDIO",
            "currentDecision": "NO_AUDIO_UNTIL_ORIGINAL_AUDIO_RIGHTS_ARE_ATTESTED",
        },
        "captions": {
            "instagram": "Prima di mettere in vendita quello che hai in casa, controlla questi dettagli: modello, stato reale, accessori, domanda osservabile e prezzi di articoli già venduti. Non sono promesse di vendita: è una checklist per preparare un annuncio più completo. Salva il carosello e usalo prima di pubblicare.",
            "tiktok": "Non partire dal prezzo: parti dai riscontri. Questa checklist ti aiuta a controllare cinque categorie prima di creare l’annuncio. Nessuna vendita è garantita. Salvala per il prossimo oggetto che vuoi valutare.",
        },
        "hashtags": {
            "instagram": ["#metodoveloce", "#rivendita", "#usato", "#secondhanditalia", "#vendereonline", "#annuncionline"],
            "tiktok": ["#metodoveloce", "#coseincasa", "#checklistvendita", "#microbusinessitalia", "#valutazioneusato"],
        },
        "publicationWindows": {
            "status": "EXPERIMENT_ONLY_NOT_OPTIMAL",
            "independentPlatformBaselines": True,
            "singlePublicationCannotEstablishBestTime": True,
            "windows": [
                {"platform": "TIKTOK", "variant": "A", "label": "fascia serale", "localTime": "20:00–21:30"},
                {"platform": "TIKTOK", "variant": "B", "label": "fascia pranzo in un giorno differente", "localTime": "12:00–13:30"},
                {"platform": "INSTAGRAM", "variant": "A", "label": "fascia serale", "localTime": "19:00–20:30"},
                {"platform": "INSTAGRAM", "variant": "B", "label": "fascia pranzo in un giorno differente", "localTime": "12:30–14:00"},
            ],
        },
        "measurementSnapshots": ["30M", "2H", "24H", "72H", "7D"],
        "assets": {
            platform: [
                {
                    "slide": index,
                    "path": str(path.relative_to(ROOT)),
                    "sha256": sha256(path),
                    "width": FORMATS[platform]["size"][0],
                    "height": FORMATS[platform]["size"][1],
                }
                for index, path in enumerate(paths, start=1)
            ]
            for platform, paths in rendered.items()
        },
    }
    manifest["fingerprint"] = hashlib.sha256(
        json.dumps(manifest, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    manifest_path = PACK / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(manifest_path)


if __name__ == "__main__":
    main()
