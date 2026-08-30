from PIL import Image
import os

jobs = [
    ("img/perfumes/LATTAFA - KHAMRAH CLASICO.png", "img/hero/category-arabe.jpg"),
    ("img/perfumes/Versace Eros EDT.png", "img/hero/category-designer.jpg"),
]

TARGET_W, TARGET_H = 960, 1200  # 4:5 portrait, matches .category-card aspect-ratio

for src, dst in jobs:
    im = Image.open(src).convert("RGB")
    w, h = im.size
    crop_w = int(h * TARGET_W / TARGET_H)
    if crop_w > w:
        crop_w = w
    left = (w - crop_w) // 2
    im = im.crop((left, 0, left + crop_w, h))
    im = im.resize((TARGET_W, TARGET_H), Image.LANCZOS)
    im.save(dst, "JPEG", quality=82, optimize=True)
    print(dst, os.path.getsize(dst), "bytes")
