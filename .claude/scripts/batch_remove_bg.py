"""
Batch background removal for img/perfumes/*.png, via the same gradient-following
flood fill from remove_bg_hero.py (local-tolerance region growing from the
border, not a single global reference color — the studio backdrop has a soft
diagonal light gradient). Outputs WebP with alpha to img/perfumes/transparent/,
same basename. Real image processing on real catalog photography, no external
AI service, no fabricated content.

Also writes a QA report (bg_removal_report.json) with a rough confidence flag
per image (bg fraction outside a plausible range = flag for manual review)
so a bad cutout doesn't ship silently.
"""
from PIL import Image, ImageFilter
import numpy as np
from scipy import ndimage
import glob, os, json, sys, time

SRC_DIR = "img/perfumes"
OUT_DIR = "img/perfumes/transparent"
WORK_SIZE = 380
OUT_SIZE = 900
TOL = 10

os.makedirs(OUT_DIR, exist_ok=True)

def remove_bg(src_path, out_path, tol=TOL):
    im_full = Image.open(src_path).convert("RGB")
    full_w, full_h = im_full.size
    im = im_full.resize((WORK_SIZE, WORK_SIZE), Image.LANCZOS)
    arr = np.array(im).astype(np.float32)
    gray = arr.mean(axis=2)

    h, w = gray.shape
    bg = np.zeros((h, w), dtype=bool)
    bg[0, :] = bg[-1, :] = bg[:, 0] = bg[:, -1] = True

    struct = np.array([[0,1,0],[1,1,1],[0,1,0]], dtype=bool)
    for _ in range(WORK_SIZE):
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

    bg_fraction = float(bg.mean())

    alpha_small = (~bg).astype(np.float32) * 255
    alpha_img = Image.fromarray(alpha_small.astype(np.uint8))
    alpha_img = alpha_img.resize((OUT_SIZE, OUT_SIZE), Image.LANCZOS)
    alpha_img = alpha_img.filter(ImageFilter.GaussianBlur(2.5))

    out_im = im_full.resize((OUT_SIZE, OUT_SIZE), Image.LANCZOS).convert("RGBA")
    out_im.putalpha(alpha_img)
    out_im.save(out_path, "WEBP", quality=90, method=5)
    return bg_fraction

def main():
    files = sorted(glob.glob(os.path.join(SRC_DIR, "*.png")))
    report = {}
    t0 = time.time()
    for i, src in enumerate(files):
        base = os.path.splitext(os.path.basename(src))[0]
        out = os.path.join(OUT_DIR, base + ".webp")
        try:
            frac = remove_bg(src, out)
            flag = "ok"
            if frac < 0.35 or frac > 0.92:
                flag = "review"  # implausible bg fraction for this catalog's framing
            report[base] = {"bg_fraction": round(frac, 3), "flag": flag}
        except Exception as e:
            report[base] = {"error": str(e), "flag": "error"}
        if (i + 1) % 20 == 0:
            elapsed = time.time() - t0
            print(f"{i+1}/{len(files)} done, {elapsed:.0f}s elapsed", file=sys.stderr)

    with open("bg_removal_report.json", "w", encoding="utf-8") as f:
        json.dump(report, f, indent=1, ensure_ascii=False)

    ok = sum(1 for v in report.values() if v.get("flag") == "ok")
    review = sum(1 for v in report.values() if v.get("flag") == "review")
    err = sum(1 for v in report.values() if v.get("flag") == "error")
    print(f"Done: {ok} ok, {review} flagged for review, {err} errors. Report: bg_removal_report.json")

if __name__ == "__main__":
    main()
