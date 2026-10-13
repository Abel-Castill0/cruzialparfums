"""Attempt: vertical 4:5 recomposition of hero-crop.webp using only its own pixels (moved, never painted).
usage: python recompose.py <out.png> [variant]
"""
import sys
import numpy as np
from PIL import Image, ImageFilter

SRC = "C:/dev/cruzialparfums/apps/web/public/parfums/hero/hero-crop.webp"
out_path = sys.argv[1]
variant = sys.argv[2] if len(sys.argv) > 2 else "a"
src = Image.open(SRC).convert("RGB")
W, H = 960, 1200


def crop(box):
    return src.crop(box)


def feather_mask(size, margin):
    """255 inside, soft ramp to 0 over `margin` px at every edge."""
    w, h = size
    xs = np.minimum(np.arange(w), np.arange(w)[::-1])
    ys = np.minimum(np.arange(h), np.arange(h)[::-1])
    mx = np.clip(xs / margin, 0, 1)[None, :]
    my = np.clip(ys / margin, 0, 1)[:, None]
    m = np.minimum(mx, my)
    m = m * m * (3 - 2 * m)  # smoothstep
    return Image.fromarray((m * 255).astype(np.uint8))


# 1. plate: the original's own cloud (x 300-610, y 0-240), mirrored in both axes and tiled. Nothing painted.
cloud = crop((300, 0, 610, 240))
w, h = cloud.size
block = Image.new("RGB", (w * 2, h * 2))
block.paste(cloud, (0, 0))
block.paste(cloud.transpose(Image.FLIP_LEFT_RIGHT), (w, 0))
block.paste(cloud.transpose(Image.FLIP_TOP_BOTTOM), (0, h))
block.paste(cloud.transpose(Image.ROTATE_180), (w, h))
plate = Image.new("RGB", (W, H))
for ty in range(0, H, block.height):
    for tx in range(0, W, block.width):
        plate.paste(block, (tx, ty))

canvas = plate.copy()

# 2. logo block with its own smoke (x 590-1100, y 60-650), centred near the top
logo = crop((590, 60, 1100, 650))
lm = feather_mask(logo.size, 40)
lx = (W - logo.width) // 2
ly = 70
canvas.paste(logo, (lx, ly), lm)

# 3. three bottles Tom Ford + Erba Pura + Valentino with their foliage and a slice of the ledge (x 100-580, y 230-792)
group = crop((100, 230, 580, 792))
gm = feather_mask(group.size, 30)
gx = (W - group.width) // 2
gy = H - group.height - 20
canvas.paste(group, (gx, gy), gm)

canvas.save(out_path)
print("saved", out_path, canvas.size)
