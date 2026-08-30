"""
Migra las fotos NUEVAS con fondo blanco (subidas por el cliente para
reemplazar las que el flood-fill de una ronda anterior daño) hacia
img/perfumes/webp/, redimensionadas y comprimidas para web.

NO SE TOCA EL CONTENIDO DE LA IMAGEN: nada de recorte de contenido,
nada de eliminacion de fondo, nada de flood-fill. Solo resize (el
original es 2048x2048, mucho mas grande de lo que cualquier card o
product-stage renderiza) + reencode a WebP con calidad alta. El fondo
blanco se conserva intacto -- es la fuente de verdad segun el cliente.
"""
import os
from PIL import Image

SRC_DIR = "img/perfumes"
OUT_DIR = "img/perfumes/webp"
MAX_SIDE = 1100  # de sobra para cualquier card/product-stage a 2x DPR
QUALITY = 88

# data.js referencia estos nombres (extraidos de IMG_MAP) pero el
# archivo fuente real tiene una grafia ligeramente distinta.
OVERRIDES = {
    "liquid brun": "FRENCH AVENEU - LIQUID BRUN",
    "liquid brun (2)": "FRENCH AVENEU -LIQUID BRUN",
    "JEAN PAUL GAULTIER - LE MALE ELIXIR EDT": "JEAN PAUL GAULTIER - LE MALE ELIXIR",
    "JEAN PAUL GAULTIER - LE MALE ELIXIR EDT (2)": "JEAN PAUL GAULTIER - LE MALE ELIXIR (2)",
}
# Sin foto nueva disponible -- se queda apuntando a transparent/ como fallback.
SKIP = {"MAISON ALHAMBRA - SCEPTRE MALACHITE", "MAISON ALHAMBRA - SCEPTRE MALACHITE (2)"}

def collect_names():
    import re
    with open("assets/data.js", encoding="utf-8") as f:
        src = f.read()
    return sorted(set(re.findall(r'img/perfumes/transparent/([^"\']+)\.webp', src)))

def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    names = collect_names()
    migrated, skipped, missing = [], [], []
    for name in names:
        if name in SKIP:
            skipped.append(name)
            continue
        src_name = OVERRIDES.get(name, name)
        src_path = os.path.join(SRC_DIR, src_name + ".png")
        if not os.path.exists(src_path):
            missing.append(name)
            continue
        im = Image.open(src_path).convert("RGB")
        w, h = im.size
        scale = MAX_SIDE / max(w, h)
        if scale < 1:
            im = im.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
        out_path = os.path.join(OUT_DIR, name + ".webp")
        im.save(out_path, "WEBP", quality=QUALITY)
        migrated.append(name)
    print(f"Migrated: {len(migrated)}")
    print(f"Skipped (no new photo, keep old path): {skipped}")
    print(f"Missing (unexpected): {missing}")

if __name__ == "__main__":
    main()
