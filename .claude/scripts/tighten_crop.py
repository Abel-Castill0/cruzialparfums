"""
Recorta el margen transparente excedente alrededor de cada botella en
img/perfumes/transparent/*.webp y vuelve a centrar sobre lienzo cuadrado.

Por que: el bg-removal de la ronda 3 ya quito el fondo de estudio, pero las
fotos originales tenian relaciones de aspecto de botella muy distintas
(botellas altas y finas vs. anchas y bajas) todas renderizadas sobre el
mismo lienzo cuadrado de 900x900 sin normalizar el recorte al bounding box
real del contenido. Resultado: en tarjetas cuadradas con object-fit:cover,
una botella angosta (ej. fill_w=0.37) solo ocupa ~37% del ancho de la
tarjeta, dejando espacio vacio a los lados -- el motivo tecnico exacto de
la queja repetida "las imagenes no ocupan toda la tarjeta".

Fix: recorta cada imagen a su bounding box de contenido + margen uniforme
pequeno, luego rellena a cuadrado (centrado, transparente) antes de volver
a exportar. Con esto object-fit:cover en una tarjeta cuadrada muestra la
botella ocupando la gran mayoria del marco sin importar su forma nativa.
"""
import os
from PIL import Image

SRC_DIR = "img/perfumes/transparent"
MARGIN_FRAC = 0.06   # margen uniforme como fraccion del lado mas grande del bbox
ALPHA_THRESHOLD = 8  # ignora pixeles casi-transparentes al calcular el bbox
OUT_SIZE = 900        # lienzo cuadrado final

def alpha_bbox(im, threshold=ALPHA_THRESHOLD):
    alpha = im.split()[-1]
    # umbral binario para que restos de sombra semi-transparente no infl en el bbox
    mask = alpha.point(lambda a: 255 if a > threshold else 0)
    return mask.getbbox()

def process(path):
    im = Image.open(path).convert("RGBA")
    bbox = alpha_bbox(im)
    if not bbox:
        return None  # imagen totalmente transparente, no tocar
    l, t, r, b = bbox
    bw, bh = r - l, b - t
    side = max(bw, bh)
    margin = int(side * MARGIN_FRAC)
    cx, cy = (l + r) / 2, (t + b) / 2
    half = side / 2 + margin
    nl, nt = int(cx - half), int(cy - half)
    nr, nb = int(cx + half), int(cy + half)
    canvas_side = nr - nl
    canvas = Image.new("RGBA", (canvas_side, canvas_side), (0, 0, 0, 0))
    # recorta la región solicitada de la imagen fuente, permitiendo bordes
    # fuera de los límites originales (relleno transparente si el margen
    # cae fuera del lienzo original)
    src_crop_box = (max(nl, 0), max(nt, 0), min(nr, im.width), min(nb, im.height))
    if src_crop_box[2] <= src_crop_box[0] or src_crop_box[3] <= src_crop_box[1]:
        return None
    cropped = im.crop(src_crop_box)
    paste_x = src_crop_box[0] - nl
    paste_y = src_crop_box[1] - nt
    canvas.paste(cropped, (paste_x, paste_y), cropped)
    canvas = canvas.resize((OUT_SIZE, OUT_SIZE), Image.LANCZOS)
    return canvas, (bw / im.width, bh / im.height)

def main():
    files = [f for f in os.listdir(SRC_DIR) if f.lower().endswith(".webp")]
    report = []
    for f in sorted(files):
        path = os.path.join(SRC_DIR, f)
        result = process(path)
        if result is None:
            report.append((f, "SKIPPED_EMPTY"))
            continue
        canvas, before_fill = result
        canvas.save(path, "WEBP", quality=92)
        after_bbox = alpha_bbox(canvas)
        after_fill = ((after_bbox[2]-after_bbox[0])/OUT_SIZE, (after_bbox[3]-after_bbox[1])/OUT_SIZE) if after_bbox else (0,0)
        report.append((f, f"before_w={before_fill[0]:.2f} after_w={after_fill[0]:.2f} after_h={after_fill[1]:.2f}"))
    for f, r in report:
        print(f"{f[:50]:50} {r}")
    print(f"\nProcessed {len(files)} files.")

if __name__ == "__main__":
    main()
