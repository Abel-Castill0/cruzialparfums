"""
Convierte las 6 fotos nuevas de combos (subidas por el cliente el
2026-08-31) de PNG pesado a WebP -- mismo principio que
migrate_new_photos.py: SOLO resize + reencode, cero recorte/edicion de
contenido.

  img/hero/hero promo *.png   -> hero carousel (slides de combo), se
                                  queda al ancho nativo 1672 (mismo ancho
                                  que hero-crop.webp, sin upscale/downscale
                                  porque ya calza con el contenedor)
  img/set armado *.png        -> portada de card en combos.html
                                  (grid minmax(340px,1fr)), reducido a
                                  900px de ancho -- de sobra para 2x DPR
                                  a ~450px de ancho renderizado, igual de
                                  criterio que MAX_SIDE en
                                  migrate_new_photos.py

Uso: python .claude/scripts/optimize_combo_promo_photos.py
"""
import os
from PIL import Image

JOBS = [
    ("img/hero/hero promo khamrhas.png", "img/hero/promo-cuarteto.webp", None, 84),
    ("img/hero/hero promo vainilla.png", "img/hero/promo-vainilla.webp", None, 84),
    ("img/hero/hero promo tulum.png",    "img/hero/promo-tulum.webp",    None, 84),
    ("img/set armado khamrhas.png", "img/combos/set-cuarteto.webp", 900, 85),
    ("img/set armado vainilla.png", "img/combos/set-vainilla.webp", 900, 85),
    ("img/set armado tulum.png",    "img/combos/set-tulum.webp",    900, 85),
]

for src, dst, max_w, quality in JOBS:
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    im = Image.open(src).convert("RGB")
    w, h = im.size
    if max_w and w > max_w:
        scale = max_w / w
        im = im.resize((max_w, round(h * scale)), Image.LANCZOS)
    im.save(dst, "WEBP", quality=quality)
    print(f"{dst}: {im.size} — {round(os.path.getsize(dst)/1024)} KB (was {round(os.path.getsize(src)/1024)} KB)")
