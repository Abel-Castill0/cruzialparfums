"""
Para los productos cuyo IMG_MAP sigue apuntando a fotos legacy (fondo gris,
ver docs/known-issues.md), busca en TODO el disco del proyecto -- no solo
en img/perfumes/webp/ -- algun archivo de imagen que pueda ser la foto
nueva correcta, con un nombre distinto al que el codigo espera.

No confia en git status (tracked/untracked): camina el filesystem completo
bajo img/, asi que encuentra tanto los 168 archivos nuevos sin trackear
como cualquier otra carpeta que pudiera existir.

Uso: python .claude/scripts/find_missing_photo_candidates.py
"""
import os
import re
import difflib
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
DATA_JS = ROOT / "assets" / "data.js"
IMG_EXTS = {".png", ".jpg", ".jpeg", ".webp"}

# Los 14 productos confirmados en docs/known-issues.md como legacy/gris.
MISSING_IDS = [
    "yara-pink", "eclaire", "yum-yum", "angham", "mayar",
    "hawas-elixir", "hawas-tropical", "hawas-chrome", "vulcan-feu",
    "jean-lowe-vibe", "jean-lowe-inmotel", "rayhaan-italia",
    "swy-absolutely", "adg-profondo-edp",
]


def normalize(s):
    s = s.lower()
    s = re.sub(r"\(.*?\)", " ", s)              # drop "(2)" set-photo suffix
    s = re.sub(r"[._\-]", " ", s)
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def collect_all_disk_images():
    """Every image file under img/, regardless of git tracked status."""
    files = []
    for dirpath, _, filenames in os.walk(ROOT / "img"):
        for fn in filenames:
            if Path(fn).suffix.lower() in IMG_EXTS:
                files.append(Path(dirpath) / fn)
    return files


def collect_canonical_paths():
    """Every path currently referenced in IMG_MAP -- these are already
    "claimed" by some product and shouldn't be suggested as a candidate
    for a DIFFERENT product."""
    src = DATA_JS.read_text(encoding="utf-8")
    return set(re.findall(r'img/perfumes/[^"\']+\.(?:png|webp|jpg|jpeg)', src))


def get_products():
    src = DATA_JS.read_text(encoding="utf-8")
    out = {}
    for m in re.finditer(r'P\("([\w-]+)",\s*"([^"]+)",\s*"([^"]+)"', src):
        pid, brand, name = m.groups()
        out[pid] = (brand, name)
    return out


def luma_mean(path):
    try:
        with Image.open(path) as im:
            im = im.convert("RGB")
            w, h = im.size
            inset = max(2, min(w, h) // 40)
            pts = [(inset, inset), (w - inset, inset), (inset, h - inset), (w - inset, h - inset)]
            vals = [0.2126 * im.getpixel(p)[0] + 0.7152 * im.getpixel(p)[1] + 0.0722 * im.getpixel(p)[2] for p in pts]
            return sum(vals) / len(vals)
    except Exception:
        return None


def main():
    canonical = collect_canonical_paths()
    canonical_rel_norm = {normalize(Path(p).stem) for p in canonical}
    products = get_products()
    all_images = collect_all_disk_images()

    # candidate pool: images NOT already claimed by IMG_MAP for ANY product
    pool = []
    for f in all_images:
        rel = f.relative_to(ROOT).as_posix()
        if rel in canonical:
            continue
        pool.append((f, rel, normalize(f.stem)))

    print(f"Total images on disk under img/: {len(all_images)}")
    print(f"Already claimed by IMG_MAP: {len(canonical)}")
    print(f"Unclaimed candidate pool: {len(pool)}")
    print()

    for pid in MISSING_IDS:
        brand, name = products.get(pid, ("?", pid))
        query = normalize(f"{brand} {name}")
        scored = []
        for f, rel, norm in pool:
            score = difflib.SequenceMatcher(None, query, norm).ratio()
            # bonus for exact token containment (handles "Mayar" inside a longer name)
            if query in norm or norm in query:
                score += 0.15
            scored.append((score, rel, f))
        scored.sort(key=lambda x: -x[0])
        top = scored[:3]
        print(f"[{pid}] brand+name normalized: '{query}'")
        for score, rel, f in top:
            lm = luma_mean(f)
            bgtag = "WHITE" if lm and lm >= 245 else ("GRAY/SUSPICIOUS" if lm else "?")
            print(f"    score={score:.2f}  bg_luma={lm and round(lm,1)}  [{bgtag}]  {rel}")
        print()


if __name__ == "__main__":
    main()
