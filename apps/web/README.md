# Cruzial Platform V2 — Web

Aplicación Next.js aislada para la migración incremental de Cruzial. La producción
legacy permanece en la raíz del repositorio y no debe moverse durante Foundation.

## Comandos

```bash
npm run dev
npm run lint
npm run typecheck
npm run test
npm run build
npm run check
```

## Estado actual

Este README describe únicamente los límites de la fase inicial de
Foundation y está desactualizado como descripción del estado actual.
docs/current-v2.md es la fuente operativa: Supabase, autenticación, Admin
(Parfums e Import) y reglas comerciales ya están conectados; el storefront
público de Parfums sigue sirviendo desde `LegacyCatalogRepository`
(assets/data.js) hasta el gate de cutover — ver docs/current-v2.md 4K2.

- Todo el sitio lleva `noindex` hasta el gate de producción.
- El Root Directory de Vercel para Preview debe ser `apps/web`.

## Límites de Foundation (histórico)

- Las rutas `/`, `/parfums` e `/import` validan estructura y design tokens.
- No hay catálogo, Supabase, autenticación, admin ni reglas comerciales conectadas.
