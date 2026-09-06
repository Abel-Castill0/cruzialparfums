# CRUZIAL PLATFORM V2 — PROGRESS

## DONE
- Fase 0: baseline Git, stack, rutas, datos, media, SEO/PWA y deploy auditados.
- Tag local `pre-v2-stable-2026-09-06` creado en `5fba38f`.
- Rama `codex/feature/cruzial-platform-v2` creada; master no modificado.
- Arquitectura de carpetas, schema Supabase y roadmap propuestos.
- Reglas confirmadas, desconocidas y técnicas separadas.
- Riesgos P0/P1/P2 documentados; assets untracked preservados.
- Fase 1: Next.js 16 + TypeScript estricto aislado en `apps/web`.
- Rutas Foundation `/`, `/parfums`, `/import` y `noindex` global implementados.
- Contratos iniciales de unidad, sales mode, campañas y carritos separados creados.
- Fase 2A: export determinista de 99 registros legacy con checksum/procedencia y gate.
- `LegacyCatalogRepository` + `ProductMediaSource`; 188 assets no fueron duplicados.
- Shell Parfums anidado: announcement, header, footer, búsqueda, carrito, menú y WhatsApp.
- ProductCard y `/parfums/catalogo`: 96 fragancias, filtros, chips, quick-add y estados.
- Product detail: variantes 3/5/10 ml, frasco, cantidad, rendimiento, discontinuados y relacionados.
- SEO de producto seguro: metadata única, canonical solo con origen explícito y JSON-LD sin precios.
- Cart Parfums robusto: vacío, variantes, botella, cantidad, eliminar, total y persistencia aislada.
- Checkout: revisión editable y mensaje central de WhatsApp sin afirmar pedido confirmado.

## CURRENT
- Fase 2 Block 2 en curso; Product Detail y Cart/Checkout cerrados para continuar con Combos.

## NEXT
- Fase 2: Combos → Finder → Mayorista → institucionales.
- Mantener Preview `noindex`; validar datos comerciales antes de Supabase/cutover.

## BLOCKED
- Publicación/cutover: falta confirmar cuentas, dominio y reglas comerciales P0.
- Import: faltan catálogo, políticas y operación de campañas/pedidos.
- 23 precios de frasco y composiciones combo son solo paridad legacy, no seed verificado.
- Bootstrap/MFA/recuperación/roles admin continúan sin definición operativa.

## TESTED
- `node scripts/frontend-gate.mjs`: PASS (12 páginas; header/footer/cards/assets/ARIA/PWA).
- Browser portada: 320/390/430/768/1024/1440/1920 sin overflow horizontal.
- Browser portada: sin errores/warnings de consola.
- Catálogo: 99 total, 96 activos, 3 descontinuados, 0 IDs duplicados.
- V2: export check + lint + typecheck + 37 tests + build PASS.
- Catálogo V2: 320/360/390/768/1024/1280/1440; 1/2/3/4 columnas, sin overflow.
- Catálogo V2: precios sin wrap, alturas por fila uniformes, fondo blanco, 0 controles anidados.
- Menú/búsqueda/carrito/filtros: foco, Escape, restauración y consola validados.
- Product Detail: 320/360/390/430/768/1024/1440/1920 sin overflow; CTA ≥ 50 px.
- Producto normal, frasco, cantidad, carrito, discontinuado, 404, metadata y schema validados.
- Cart: vacío/una/múltiples, variante/frasco, cantidad/eliminar y total derivados validados.
- Checkout: mensaje codificado y 320/360/390/430/768/1024/1440/1920 sin overflow.
