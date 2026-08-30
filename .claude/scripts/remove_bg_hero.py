"""
Background removal for a single hero product photo, via gradient-following
flood fill from the border (local tolerance, not a single global reference
color) — the studio backdrop has a soft diagonal light gradient, so a
single-color threshold clips corners incorrectly. Hand-tuned for this one
image; not a generic tool. Source is real Cruzial catalog photography
(img/perfumes/), not stock or generated.
"""
from PIL import Image, ImageFilter
import sys
import numpy as np
from scipy import ndimage

src = sys.argv[1]
dst = sys.argv[2]
tol = float(sys.argv[3]) if len(sys.argv) > 3 else 10
work_size = 500

im_full = Image.open(src).convert("RGB")
full_w, full_h = im_full.size
im = im_full.resize((work_size, work_size), Image.LANCZOS)
arr = np.array(im).astype(np.float32)
gray = arr.mean(axis=2)

h, w = gray.shape
bg = np.zeros((h, w), dtype=bool)
bg[0, :] = bg[-1, :] = bg[:, 0] = bg[:, -1] = True

struct = np.array([[0,1,0],[1,1,1],[0,1,0]], dtype=bool)
for _ in range(work_size):  # upper bound; loop breaks early on convergence
    frontier = ndimage.binary_dilation(bg, structure=struct) & ~bg
    if not frontier.any():
        break
    bgf = bg.astype(np.float32)
    local_sum = ndimage.uniform_filter(gray * bgf, size=3, mode="constant")
    local_count = ndimage.uniform_filter(bgf, size=3, mode="constant")
    with np.errstate(invalid="ignore", divide="ignore"):
        local_mean = local_sum / np.maximum(local_count, 1e-6)
    accept = frontier & (np.abs(gray - local_mean) < tol) & (local_count > 0)
    if not accept.any():
        break
    bg |= accept

# Smooth mask edges, then upscale to full resolution.
alpha_small = (~bg).astype(np.float32) * 255
alpha_img = Image.fromarray(alpha_small.astype(np.uint8), mode="L")
alpha_img = alpha_img.resize((full_w, full_h), Image.LANCZOS)
alpha_img = alpha_img.filter(ImageFilter.GaussianBlur(3))

out = im_full.convert("RGBA")
out.putalpha(alpha_img)
out.save(dst, "PNG")
print(f"bg fraction: {bg.mean():.3f}, saved {dst}")
