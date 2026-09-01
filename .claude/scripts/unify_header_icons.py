"""
2026-09-01: 6 paginas (404, checkout, contacto, nosotros, privacidad,
terminos) seguian con el header-actions VIEJO -- glifos Unicode (search
"a", cart "u25c8") y el SVG de WhatsApp a 15px -- mientras index/catalog/
mayorista/product ya usaban el sistema SVG a 18px. La navbar "unificada"
nunca se propago a estas 6. Reemplazo textual exacto, mismo bloque en
las 6 (verificado byte a byte antes de escribir este script).
"""
import io

OLD = '''      <div class="header-actions">
        <button class="icon-btn" data-open-search aria-label="Buscar fragancias" title="Buscar">⌕</button>
        <a class="icon-btn" href="https://wa.me/51924590921" target="_blank" rel="noopener" aria-label="WhatsApp" title="WhatsApp"><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.4 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5s.8 1.9.8 2c.1.1.1.3 0 .4-.4.8-.9 1-.7 1.4.6 1.1 1.9 2.3 2.9 2.8.4.2.6.1.9-.1.2-.3.9-1 1.1-1.4.2-.3.4-.3.7-.2l2 .9c.3.2.5.3.6.4.1.2.1.8-.1 1.4Z"/></svg></a>
        <button class="icon-btn" data-open-cart aria-label="Abrir carrito" title="Carrito">◈<span class="cart-count">0</span></button>
        <button class="mobile-toggle" data-open-menu aria-label="Abrir menú">☰</button>'''

NEW = '''      <div class="header-actions">
        <button class="icon-btn" data-open-search aria-label="Buscar fragancias" title="Buscar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </button>
        <a class="icon-btn" href="https://wa.me/51924590921" target="_blank" rel="noopener" aria-label="WhatsApp" title="WhatsApp"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.4 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5s.8 1.9.8 2c.1.1.1.3 0 .4-.4.8-.9 1-.7 1.4.6 1.1 1.9 2.3 2.9 2.8.4.2.6.1.9-.1.2-.3.9-1 1.1-1.4.2-.3.4-.3.7-.2l2 .9c.3.2.5.3.6.4.1.2.1.8-.1 1.4Z"/></svg></a>
        <button class="icon-btn" data-open-cart aria-label="Abrir carrito" title="Carrito">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
          <span class="cart-count">0</span>
        </button>
        <button class="mobile-toggle" data-open-menu aria-label="Abrir menú">☰</button>'''

FILES = ["404.html", "checkout.html", "contacto.html", "nosotros.html", "privacidad.html", "terminos.html"]

for fname in FILES:
    with io.open(fname, encoding="utf-8") as fh:
        content = fh.read()
    if OLD not in content:
        print(fname, "OLD BLOCK NOT FOUND -- SKIPPED")
        continue
    content = content.replace(OLD, NEW)
    with io.open(fname, "w", encoding="utf-8") as fh:
        fh.write(content)
    print(fname, "updated")
