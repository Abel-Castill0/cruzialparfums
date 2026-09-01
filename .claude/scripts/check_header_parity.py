"""
Guardia contra el bug real que causo esto: 6 paginas (404, checkout,
contacto, nosotros, privacidad, terminos) se quedaron con un
header-actions viejo (glifos Unicode en vez de SVG) mientras
index/catalog/mayorista/product avanzaban -- "unificado" en el nombre,
no en el markup. No reconstruye un framework de partials; solo compara
el bloque <div class="header-actions">...</div> de cada .html contra
index.html (referencia canonica) y avisa si diverge.

Uso: python .claude/scripts/check_header_parity.py
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REFERENCE = "index.html"
SKIP = {"perfumes-enteros.html"}  # stub de redirect, sin header real (ver CLAUDE.md)

def extract_header_actions(html):
    m = re.search(r'<div class="header-actions">.*?</header>', html, re.S)
    if not m:
        return None
    # Espacio en blanco entre tags no cambia el render -- normalizar para
    # no marcar como "DIVERGED" una diferencia puramente de indentación.
    return re.sub(r'>\s+<', '><', m.group(0).strip())

def main():
    ref_html = (ROOT / REFERENCE).read_text(encoding="utf-8")
    ref_block = extract_header_actions(ref_html)
    if not ref_block:
        print(f"COULD NOT EXTRACT reference block from {REFERENCE} -- fix the regex first")
        return
    ok, diverged = [], []
    for f in sorted(ROOT.glob("*.html")):
        if f.name == REFERENCE or f.name in SKIP:
            continue
        html = f.read_text(encoding="utf-8")
        block = extract_header_actions(html)
        if block is None:
            diverged.append((f.name, "no header-actions block found"))
        elif block != ref_block:
            diverged.append((f.name, "differs from index.html"))
        else:
            ok.append(f.name)
    for name in ok:
        print(f"{name:<22} PASS")
    for name, reason in diverged:
        print(f"{name:<22} DIVERGED -- {reason}")
    print(f"\n{len(ok)} PASS / {len(diverged)} DIVERGED")

if __name__ == "__main__":
    main()
