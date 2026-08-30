from PIL import Image
import os

jobs = [
    ("img/perfumes/Xerjoff Erba Pura.png", "img/hero/tile-erba-pura.jpg"),
    ("img/perfumes/AFNAN - 9PM NIGHT OUT.png", "img/hero/tile-9pm-night-out.jpg"),
]

TARGET_W, TARGET_H = 960, 1280  # 3:4 portrait, matches .hero-img aspect-ratio

for src, dst in jobs:
    im = Image.open(src).convert("RGB")
    w, h = im.size
    # crop centered to 3:4 from the square source (keep full height, trim width)
    crop_w = int(h * TARGET_W / TARGET_H)
    if crop_w > w:
        crop_w = w
    left = (w - crop_w) // 2
    im = im.crop((left, 0, left + crop_w, h))
    im = im.resize((TARGET_W, TARGET_H), Image.LANCZOS)
    im.save(dst, "JPEG", quality=82, optimize=True)
    print(dst, os.path.getsize(dst), "bytes")
