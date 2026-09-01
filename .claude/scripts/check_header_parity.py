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
    # Descubrimiento real, no una lista escrita a mano: cualquier .html
    # nuevo en la raiz del repo entra a la auditoria automaticamente la
    # proxima vez que esto corra.
    all_pages = sorted(ROOT.glob("*.html"))
    print(f"Discovered: {len(all_pages)} HTML files in repo root")
    for f in all_pages:
        tag = " (redirect stub, no header)" if f.name in SKIP else ""
        print(f"  {f.name}{tag}")
    print()

    ref_html = (ROOT / REFERENCE).read_text(encoding="utf-8")
    ref_block = extract_header_actions(ref_html)
    if not ref_block:
        print(f"COULD NOT EXTRACT reference block from {REFERENCE} -- fix the regex first")
        return
    ok, diverged = [], []
    checked = [f for f in all_pages if f.name != REFERENCE and f.name not in SKIP]
    for f in checked:
        html = f.read_text(encoding="utf-8")
        block = extract_header_actions(html)
        if block is None:
            diverged.append((f.name, "no header-actions block found"))
        elif block != ref_block:
            diverged.append((f.name, "differs from index.html"))
        else:
            ok.append(f.name)
    print(f"Checked against reference ({REFERENCE}): {len(checked)} pages")
    print(f"{REFERENCE:<22} PASS (reference)")
    for name in ok:
        print(f"{name:<22} PASS")
    for name, reason in diverged:
        print(f"{name:<22} DIVERGED -- {reason}")
    print(f"\n{len(ok)+1} PASS / {len(diverged)} DIVERGED / {len(all_pages)} discovered total"
          f" ({len(SKIP)} excluded: {', '.join(sorted(SKIP))})")

if __name__ == "__main__":
    main()
