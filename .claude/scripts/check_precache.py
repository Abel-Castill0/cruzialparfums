"""
Valida las rutas de STATIC_ASSETS en sw.js contra el filesystem real --
mismo motivo que check_header_parity.py: barato, dirigido, para no volver
a leer sw.js + 13 archivos a mano cada vez que algo se renombra (hero,
logos, promos...).

No inicia un navegador ni un Service Worker real: STATIC_ASSETS son
rutas relativas al scope (ver sw.js, self.registration.scope), que en
este repo estático es siempre la raíz -- así que "ruta relativa al
scope" == "ruta relativa a la raíz del repo" aquí. Verificar contra el
filesystem es equivalente a verificar contra el servidor real.

Uso: python .claude/scripts/check_precache.py
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SW = ROOT / "sw.js"

def main():
    src = SW.read_text(encoding="utf-8")
    m = re.search(r"const STATIC_ASSETS = \[(.*?)\]\.map\(toScopeURL\)", src, re.S)
    if not m:
        print("COULD NOT FIND STATIC_ASSETS -- did sw.js structure change? fix the regex.")
        return
    paths = re.findall(r'"([^"]*)"', m.group(1))

    ok, fail = [], []
    for p in paths:
        target = ROOT / (p if p else "index.html")  # "" resuelve a index.html vía el servidor
        if target.exists():
            ok.append(p or "(scope root -> index.html)")
        else:
            fail.append(p or "(scope root)")

    print(f"PRECACHE: {len(paths)}")
    print(f"OK: {len(ok)}")
    print(f"FAIL: {len(fail)}")
    if fail:
        print("\nFAIL:")
        for p in fail:
            print(f"  {p} -> not found on disk")

if __name__ == "__main__":
    main()
