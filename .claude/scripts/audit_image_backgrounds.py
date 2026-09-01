"""
Clasifica el fondo de TODAS las fotos de producto referenciadas en
assets/data.js (IMG_MAP), sin pasar las imagenes por el contexto de Claude.

Analiza esquinas + bordes (donde vive el fondo, no la botella) y calcula
luminancia media + varianza. Clasifica en:
  WHITE       - fondo blanco limpio (correcto, el estandar del proyecto)
  NEAR_WHITE  - blanco ligeramente fuera de rango, normalmente aceptable
  GRAY        - fondo gris/degradado (el bug reportado en Yara Pink / Mayar)
  DARK        - fondo oscuro (fuera de lugar en catalog cards)
  SUSPICIOUS  - alta varianza en el fondo (degradado, textura, o mezcla)

Uso: python .claude/scripts/audit_image_backgrounds.py
Solo imprime lo que NO es WHITE/NEAR_WHITE, para no gastar tokens en 190 fotos.
"""
import re
import statistics
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
DATA_JS = ROOT / "assets" / "data.js"

WHITE_LUMA_MIN = 245
NEAR_WHITE_LUMA_MIN = 235
GRAY_VARIANCE_MAX = 12  # stdev of corner lumas above this = degradado/textura


def collect_image_paths():
    src = DATA_JS.read_text(encoding="utf-8")
    paths = sorted(set(re.findall(r'img/perfumes/[^"\']+\.(?:png|webp|jpg|jpeg)', src)))
    return paths


def luma(px):
    r, g, b = px[0], px[1], px[2]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def sample_background(im):
    im = im.convert("RGB")
    w, h = im.size
    # corners + edge midpoints, inset slightly to dodge anti-aliasing/border artifacts
    inset = max(2, min(w, h) // 40)
    pts = [
        (inset, inset), (w - inset, inset), (inset, h - inset), (w - inset, h - inset),
        (w // 2, inset), (w // 2, h - inset), (inset, h // 2), (w - inset, h // 2),
    ]
    lumas = [luma(im.getpixel(p)) for p in pts]
    return lumas


def classify(lumas):
    mean_luma = statistics.mean(lumas)
    stdev = statistics.pstdev(lumas)
    if stdev > GRAY_VARIANCE_MAX:
        return "SUSPICIOUS", mean_luma, stdev
    if mean_luma >= WHITE_LUMA_MIN:
        return "WHITE", mean_luma, stdev
    if mean_luma >= NEAR_WHITE_LUMA_MIN:
        return "NEAR_WHITE", mean_luma, stdev
    if mean_luma < 80:
        return "DARK", mean_luma, stdev
    return "GRAY", mean_luma, stdev


def main():
    rel_paths = collect_image_paths()
    results = {"WHITE": 0, "NEAR_WHITE": 0, "GRAY": 0, "DARK": 0, "SUSPICIOUS": 0, "MISSING": 0}
    flagged = []
    for rel in rel_paths:
        abs_path = ROOT / rel
        if not abs_path.exists():
            results["MISSING"] += 1
            flagged.append((rel, "MISSING", None, None))
            continue
        try:
            with Image.open(abs_path) as im:
                lumas = sample_background(im)
        except Exception as e:
            flagged.append((rel, f"ERROR:{e}", None, None))
            continue
        label, mean_luma, stdev = classify(lumas)
        results[label] += 1
        if label not in ("WHITE", "NEAR_WHITE"):
            flagged.append((rel, label, round(mean_luma, 1), round(stdev, 1)))

    print(f"Total referenced images: {len(rel_paths)}")
    for k, v in results.items():
        print(f"  {k}: {v}")
    print()
    print(f"Flagged for visual inspection ({len(flagged)}):")
    for rel, label, mean_luma, stdev in flagged:
        print(f"  [{label}] mean_luma={mean_luma} stdev={stdev}  {rel}")


if __name__ == "__main__":
    main()
