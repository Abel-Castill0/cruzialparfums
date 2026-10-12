# PR 2 — Documentación del rediseño (`claude/design-evidence`)

Documentación del rediseño. **Ver PR #1** (`claude/apple-design-system`, el código).

Esta rama es sólo documentación: ningún archivo de `apps/`, `supabase/` ni `scripts/`.

| Contenido | Dónde |
|---|---|
| Sistema de diseño (fuente de verdad) | `DESIGN.md` (+ nota de superación en `PRODUCT.md`) |
| Auditoría, WCAG 2.2, movimiento, cierre de banderas rojas, verificación final, §9 skip link y `h3` | `docs/design-audit-2026-10-11.md` |
| Decisión A/B/C de Import y «Validación de C» | `docs/import-decision.md` |
| Diagnóstico de rendimiento y «TBT root cause» (§6) | `docs/perf-diagnosis.md` |
| Capturas antes/después a 8 anchos e Import C | `docs/screenshots/` |
| Reportes Lighthouse y datos del bundle | `docs/lighthouse/` |

**Orden de merge:** independiente; los comentarios del código del PR #1 citan `DESIGN.md`, así que conviene fusionar este PR
con o antes que el PR #1. Pesa ≈ 31 MB por las capturas e informes (ver T9 en el PR #1).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
