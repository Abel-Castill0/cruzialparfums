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

## Límites de Foundation

- Las rutas `/`, `/parfums` e `/import` validan estructura y design tokens.
- No hay catálogo, Supabase, autenticación, admin ni reglas comerciales conectadas.
- Todo el sitio lleva `noindex` hasta el gate de producción.
- El Root Directory de Vercel para Preview debe ser `apps/web`.
