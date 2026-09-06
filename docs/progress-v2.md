# CRUZIAL PLATFORM V2 — PROGRESS

## DONE
- Fase 0: baseline Git, stack, rutas, datos, media, SEO/PWA y deploy auditados.
- Tag local `pre-v2-stable-2026-09-06` creado en `5fba38f`.
- Rama `codex/feature/cruzial-platform-v2` creada; master no modificado.
- Arquitectura de carpetas, schema Supabase y roadmap propuestos.
- Reglas confirmadas, desconocidas y técnicas separadas.
- Riesgos P0/P1/P2 documentados; assets untracked preservados.

## CURRENT
- Fase 1: scaffold Next.js aislado en `apps/web`.
- Preparar gates reproducibles: lint, typecheck, tests y build.

## NEXT
- Cerrar Foundation sin conectar servicios ni inventar datos.
- Fase 2: inventario visual y migración Parfums con paridad.
- Solicitar decisiones P0 antes de publicar datos en Supabase/Preview público.

## BLOCKED
- Publicación/cutover: falta confirmar cuentas, dominio y reglas comerciales P0.
- Import: faltan catálogo, políticas y operación de campañas/pedidos.
- 23 precios de frasco requieren validación antes de migrar como públicos.

## TESTED
- `node scripts/frontend-gate.mjs`: PASS (12 páginas; header/footer/cards/assets/ARIA/PWA).
- Browser portada: 320/390/430/768/1024/1440/1920 sin overflow horizontal.
- Browser portada: sin errores/warnings de consola.
- Catálogo: 99 total, 96 activos, 3 descontinuados, 0 IDs duplicados.
