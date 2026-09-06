# Cruzial Platform V2

Migración del sitio estático de Cruzial Parfums a la Plataforma Cruzial V2
(una sola app Next.js; Parfums primero, Import y Admin después).

## Goal

Una plataforma que migre el storefront Parfums con parity visual y de datos
respecto al sitio legacy, sin inventar información comercial. Postgres/Supabase
llega después del cutover confirmado; hoy la fuente canónica de producto es
`assets/data.js` vía el adapter legacy.

## Workflow actual (Fase 2)

- Rama: `codex/feature/cruzial-platform-v2`. `master` queda intacto (GitHub Pages).
- V2 aislada en `apps/web` (Next.js 16 + TypeScript estricto, App Router).
- Capacidades ya cerradas (NO reauditar sin regresión demostrada): Foundation,
  Catalog, Product Detail, Cart, Checkout, Combos, Finder, Mayorista,
  Institutional (Nosotros / Contacto / Privacidad / Términos / 404).
- Orden restante: gate global de parity de Parfums → luego Import/Admin/Supabase.

## Comandos importantes

```bash
cd apps/web
npm run dev            # desarrollo local (HTTP, nunca file://)
npm run check          # catalog:check + eslint + typecheck + vitest + build
npm run test           # vitest run
npm run catalog:check  # verifica fixture generado contra assets/data.js
```

Para verificar visualmente: crear build (`npm run build`) + `next start`, y
probar en `http://localhost:3000` a 320/390/430/768/1024/1440/1920.

## Restricciones de arquitectura

- Un solo `root layout` (`src/app/layout.tsx`). Shells anidados: `parfums/layout.tsx`.
- Storefronts usan Contexto Server Component + queries del dominio; los
  componentes no hablan con Supabase directo.
- Dos carritos separados (Parfums / Import); nunca mezclar.
- Preview permanece `noindex,nofollow` (ver `lib/seo/indexing-policy`); no activar
  index/canonical de producción sin aprobación de cutover.

## Safety de datos de negocio (crítico)

- ZERO inventado: precios, descuentos, bestsellers, testimonios, stock,
  disponibilidad, garantías, claims de autenticidad, tiempos de respuesta.
- Si no hay fuente (cliente, `assets/data.js`, lista de precios oficial): omitir,
  marcar "Consultar", o redactar como editorial — nunca como dato.
- `assets/data.js` es la fuente canónica de producto. `README.md` es descriptivo,
  nunca autoritativo. Cuando discrepen, gana `data.js`.
- Provenance: clasificar `OFFICIAL_PDF | CLIENT_CONFIRMED | DERIVED_VALIDATED |
  MARKETING_COPY | UNKNOWN`. `UNKNOWN` no se publica como hecho.
- Claims confirmados y pendientes viven en `docs/client-decisions.md`.

## Reglas de parity legacy

- Precios/estado legacy se muestran con `verificationStatus: "legacy"`; no son
  seed comercial verificado ni se aprueban solos para Supabase.
- WhatsApp central se reutiliza (builders en `domains/whatsapp`); no duplicar
  números ni plantillas. Enviar no confirma un pedido.

## Git safety

- Stage explícito (nunca `git add -A`); revisar `git diff --cached` antes de commit.
- Un commit por capability lógica. NO push / NO deploy sin autorización explícita.
- Prohibido salvo indicación: `reset --hard`, `checkout -- .`, `clean`, `stash`,
  `rebase`, `merge`, `push`.

## Client asset safety

- `img/perfumes/*.png` (raíz) son originales del cliente, untracked. NO add, mover,
  renombrar, borrar, optimizar ni reprocesar (sin background-removal).
- Desplegado: `img/perfumes/webp/*.webp` (1100px / WebP 88) vía `IMG_MAP` de `data.js`.

## Testing gate

- Antes de commit corre `npm run check`. Tests específicos por capability (Vitest).
- No debilitar tests para que pasen. Sin build step, verificar en navegador.

## Contrato responsive

- 320/390/430/768/1024/1440/1920 sin overflow horizontal; móvil = cards/listas
  legibles, desktop = tabla/grilla; nunca table desktop comprimida en móvil.

## Contrato accesibilidad

- Elementos nativos (button/a/form) para interacción; focus-visible, teclado,
  Escape, retorno de foco en dialogs/menú; labels; alt; reduced-motion.

## Eficiencia de contexto

- Buscar antes de leer (`rg`, `git status`, `git diff`, tests específicos).
- No releer lo documentado; agrupar consultas. Apuntar a docs para detalle.

## No producción sin autorización

No `push`, no `deploy`, no activar index/canonical, no cutover, sin instrucción
explícita del negocio.

## Docs de referencia

- `docs/progress-v2.md` — estado y avance.
- `docs/client-decisions.md` — reglas CONFIRMED / UNKNOWN / DECIDED.
- `docs/architecture-v2.md` — estructura, dominios, media, SEO.
- `docs/quality-requirements.md` — (pendiente) criterios de calidad.
- `docs/known-issues.md` — incidentes y aprendizaje.