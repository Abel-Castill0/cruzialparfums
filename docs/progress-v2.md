# CRUZIAL PLATFORM V2 — PROGRESS

## BRANCH

`codex/feature/cruzial-platform-v2`. `master` permanece intacto para GitHub Pages.

## HEAD

Git es la fuente de verdad del hash. Fase 4a (Admin Parfums — Product CRUD)
cerrada sobre el runtime Supabase de Fase 3.

## CURRENT

- V2 aislada en `apps/web`: Next.js 16, App Router y TypeScript estricto.
- **ADMIN DB = Supabase. PUBLIC STOREFRONT = `LegacyCatalogRepository`
  (temporal, sobre `assets/data.js`).** Siguen siendo dos fuentes
  deliberadamente separadas hasta un cutover explícito — Fase 4a no tocó
  `LegacyCatalogRepository` ni ninguna página pública; reconfirmado en vivo
  (`/parfums/catalogo` sirve el fixture legacy de 95 productos sin cambios).
- Implementado: gateway, Home Parfums, catálogo, producto, cart drawer,
  checkout, combos/builder, Finder, mayorista, institucional, legales y 404.
- Import sigue siendo foundation editorial (sin CRUD).
- **Admin Parfums — Product CRUD: IMPLEMENTED.** `/admin/parfums/productos`
  (lista paginada/filtrable/buscable), `/nuevo` (crear) y `/[id]` (editar:
  datos core, variantes + inventario por variante, categorías, destacado,
  archivar/restaurar). Todo sobre las RPCs `public.admin_*`
  (migration Fase 4a) — atómico, con audit log no falsificable y
  concurrencia optimista (`updated_at` esperado).
- Supabase Foundation (Fase 3) sigue vigente: migrations versionadas, RLS,
  pgTAP, seed estructural, ETL legacy a staging. **RUNTIME TESTED: YES** —
  102/102 pgTAP (74 Fase 3 + 28 Fase 4a) en reset fresco.
- Preview y Admin permanecen `noindex,nofollow`; Production/cutover no autorizados.
- **Global Parfums Quality / Parity Gate (Fase 2.5): PASS** (heredado, sin
  regresión demostrada en este bloque). No se declara "sin bugs" — ver
  PARTIAL/BLOCKERS.

## DONE

- Foundation, Catalog, Product Detail, Cart, Checkout, Combos, Finder,
  Mayorista e Institutional cerrados por capability; no se reescriben sin
  regresión demostrada.
- Catálogo reconciliado: hidden, descontinuado independiente de disponibilidad,
  regalo solo en frasco, cantidad desde card, tamaño por línea en combos y
  mayorista con alcance de 40 unidades todavía UNKNOWN.
- Contacto operativo centralizado: WhatsApp `+51 926 390 591` y correo público
  `dominiocruzial@gmail.com`, con settings separados Parfums/Import.
- Paletas LATEST: Parfums negro/blanco con dorado no dominante; Import azul
  profundo/blanco/plata.
- Supabase Foundation escrita: 21 tablas públicas con RLS, helpers privados en
  schema `app`, aislamiento Parfums/Import también en referencias hijas,
  snapshots de pedidos, audit log append-only y estados de producto separados.
- Fase 4a Admin Parfums Product CRUD cerrada y runtime-tested: productos,
  variantes, precios, inventario `status_only`/`tracked_quantity`, featured,
  asignación/desasignación de categorías existentes y archive/restore. Las
  Server Actions revalidan sesión + rol Admin de Parfums; las RPCs resuelven
  unidad y actor, auditan dentro de la transacción y rechazan `updated_at`
  obsoleto. E2E local cubrió el flujo completo y el rechazo de un admin
  exclusivo de Import; responsive/a11y spot-check pasó en 320/390/768/1024/
  1440 sin overflow, con cards móviles, labels, teclado, foco y targets de 44px.
- Auth Admin foundation: `.env.example` sin valores, clientes browser/server
  separados, `/admin/login`, callback seguro, refresh SSR, páginas dinámicas,
  selector por membresías y ausencia de signup público. Bootstrap crea el
  usuario fuera de la app y otorga membresías mediante SQL operator-run.
- Tipos Supabase generados desde la DB local y aplicados a clientes browser,
  server y proxy; la consulta de membresías usa la relación tipada generada.
- Smoke Auth local: login renderiza, signup devuelve deshabilitado, `/admin` y
  ambas páginas de unidad redirigen sin sesión, callback no acepta destinos
  externos y las superficies Admin responden con no-cache.
- ETL legacy determinista e idempotente: 96 productos en staging, 3 combos
  bloqueados por reconfirmación, 0 inválidos; nunca escribe Postgres ni publica.
- Recovery Codex→Claude cerrada (5 bugs confirmados corregidos y verificados
  en vivo: landmark `<main>` en 4 páginas institucionales, semántica de
  diálogo del panel de filtros móvil, touch targets ~44×44px en 8 módulos,
  Combo Carousel sin `priority`/`eager` en el primer slide, legacy route
  resolver conectado al runtime vía `src/proxy.ts`).
- Gate global de Parfums cerrado en esta ejecución:
  - **Responsive**: 13 superficies × 9 anchos (320/360/390/430/768/1024/
    1280/1440/1920) sin overflow de documento, header/footer/main únicos
    consistentes — verificado por DOM (`scrollWidth`/`getBoundingClientRect`),
    no solo screenshot. Precios de Mayorista en card-layout a 320-360px
    inicialmente parecían clipped por una heurística de `scrollWidth`; la
    verificación geométrica (rects de celdas adyacentes) y una captura real
    confirmaron que es `overflow: visible` sin colisión — no era un bug.
  - **Funcional**: catálogo (búsqueda/filtro/chip, con doble input search
    header-vs-catálogo verificado), carrito (vacío/añadir/merge de misma
    variante/variantes distintas separadas/cantidad/eliminar/totales, todo
    en vivo vía UI real), checkout (mensaje de WhatsApp construido correcto
    con línea/cantidad/total/datos, sin "pedido confirmado"), Combo Builder
    (caso obligatorio A=10/B=3/C=5→cambiar solo B→10 verificado en vivo:
    A y C no cambiaron), Finder (flujo completo, gating de "Siguiente" por
    paso, Escape navega a catálogo vía `router.push`, sin lenguaje de IA),
    legacy routes (curl en vivo: 307 a destino V2 con querystring intacto,
    404 real para producto no existente, sin regresión tras el fix del 404
    dedicado de Parfums).
  - **A11y**: 16 rutas (Parfums + Import + Admin) con exactamente 1 `<main>`
    y 1 `<h1>`; 0 imágenes sin `alt` en 137 verificadas; 0 controles
    interactivos anidados (`a>a`, `button>a`, etc.) en 10 páginas
    parseadas; diálogos de Finder/filtros con `aria-modal`+
    `aria-labelledby` resolviendo a un heading real; focus trap/Escape/
    retorno de foco ya existentes confirmados sin regresión. Zoom 200%
    aproximado vía viewport angosto (no zoom real de SO — limitación de la
    herramienta, documentada, no simulada como si fuera literal).
  - **SEO**: 15 rutas con `<title>`/`<meta description>` únicos y
    `robots: noindex,nofollow` (Preview-safe); 404 de Parfums corregido
    para tener metadata propia (antes heredaba la genérica del root). Sin
    Product/Offer estructurado con precios no confirmados, sin
    canonical/sitemap de cutover.
  - **Performance**: hero de Home migrado de `priority` (deprecado en
    Next 16 — confirmado en `node_modules/next/dist/docs/`) a `preload`;
    `<link rel="preload">` del hero verificado antes y después del cambio.
    Combo Carousel ya no compite por prioridad con el hero (heredado de la
    recovery). 12 Client Components, todos genuinamente interactivos — sin
    sobre-uso de `"use client"`. No se midió Lighthouse/Web Vitals reales
    (requiere Preview desplegado); no se inventan números.
  - **Routing interno**: 137 hrefs únicos verificados (fetch real, incluye
    anclas `#hash` contra `id=` real en destino) en 12 páginas — 0 rotos,
    0 patrones legacy (`.html`, `/parfums/carrito`, `/parfums/legal/*`).
  - **Segunda auditoría**: TODO/FIXME, `console.log`/debugger, WhatsApp
    antiguo, Olva, "Más Deseados"/"HOT", rutas legacy — 0 coincidencias en
    `apps/web/src` (fuera de tests que verifican su ausencia a propósito).
    Imports muertos cubiertos por lint (`no-unused-vars`, `--max-warnings=0`).
  - **Bug encontrado y corregido durante el gate**: `src/app/parfums/
    not-found.tsx` (contenido de marca, CTAs de catálogo/inicio) era código
    muerto — Next.js siempre usa el `not-found.tsx` raíz para una URL nunca
    matcheada (documentado desde v13.3.0), así que `/parfums/no-such-route`
    caía en el 404 genérico sin header/footer/WhatsApp float. Fix:
    `src/app/parfums/[...catchall]/page.tsx` llama `notFound()` para que el
    boundary correcto (el de Parfums) se use. Verificado sin regresión en
    rutas reales (Next prioriza segmentos específicos sobre catch-all).

## PARTIAL

- No se probó login con credenciales del cliente ni bootstrap production; no
  se inventaron credenciales. Auth/E2E y autorización cross-unit se probaron
  con usuarios locales descartables; RLS también se ejecutó con pgTAP.

## TODO

- Phase 4b Categories CRUD y los demás módulos Admin permanecen fuera de este
  bloque. Import operativo también sigue pendiente.
- La matriz de Fase 4a cubrió list/new/edit; los módulos Admin todavía no
  implementados no tienen una auditoría funcional completa.

## BLOCKERS

- Cutover: dominio/cuentas definitivas y reglas comerciales P0 sin confirmar.
- Import: catálogo, operación de campañas/pedidos y políticas finales pendientes.
- Admin: creación del primer usuario, contraseña, MFA y recuperación siguen
  pendientes de decisión; el grant de membresías ya tiene ruta operator-run.
- 23 precios de frasco y composiciones combo son paridad legacy, no seed verificado.
- `wholesaleThresholdScope`: 40 unidades combinadas vs. por SKU sigue UNKNOWN.
- Reemplazo de `sceptre-malachite`: falta un asset nuevo del cliente.
- **Residual P3 documentado, no bloqueante**: en `/parfums/no-such-route-xyz`
  (404), el `<title>` SSR es correcto ("Página no encontrada — Cruzial
  Parfums") pero revierte a un valor genérico compuesto unos cientos de ms
  después de la hidratación del cliente — solo en esa página con boundary
  `notFound()`; toda otra ruta mantiene su título estable post-hidratación.
  La página es `noindex` (Next lo inyecta automáticamente en `notFound()`)
  y ningún link interno apunta a una ruta inexistente, así que el impacto
  real es mínimo. No se investigó más a fondo el mecanismo exacto de
  React Server Components para este caso específico — señalado aquí en vez
  de perseguirlo sin evidencia de impacto real.
- Lighthouse/Web Vitals reales: no medidos (requieren Preview desplegado).
- Auditoría de CSS muerto: no exhaustiva (sin herramienta de coverage en
  este entorno) — riesgo bajo, no se declara "sin CSS muerto".

## TESTS — CURRENT

- Recovery de Fase 4a partió del remoto `1381b13` y preservó tres commits
  locales backend/domain/UI; el hash final vive en Git.
- `npm run check` (catálogo + lint + typecheck + test + build): PASS.
- Vitest: 24 archivos, 128 tests PASS.
- Build: PASS; `/admin`, sus unidades, login, callback y Product CRUD son
  dinámicos, no prerenderizados como contenido compartido.
- ETL: dos escrituras consecutivas produjeron el mismo SHA-256; `etl:check`
  PASS (96 staging, 3 blocked, 0 invalid).
- Supabase CLI `2.117.0`: `db:reset` fresco PASS; las 7 migrations y el seed
  estructural se aplicaron desde cero.
- pgTAP runtime: 5 archivos, 102/102 assertions PASS (74 foundation + 28
  Product CRUD) en PostgreSQL local. Tipos generados sin drift contra
  `public,graphql_public`.
- `git diff --check`: limpio.
- E2E navegador: create/edit, variante/precio, inventario, featured,
  categorías y archive/restore PASS; auditoría verificada en DB con actor real;
  admin Import-only redirigido sin datos Parfums; storefront público legacy
  smoke-tested en Home, catálogo (95 productos) y producto real.

## HISTORICAL

- El detalle de commits y checkpoints anteriores vive en Git. Las cantidades
  antiguas de tests no se conservan aquí como si fueran métricas actuales.
- Tag local `pre-v2-stable-2026-09-06` apunta al baseline `5fba38f`.

## PREVIEW

- No deploy en este bloque. Preview debe permanecer `noindex,nofollow`.

## PRODUCTION

- No deploy, merge, cutover ni cambios en `master`/GitHub Pages.

## NEXT

Gates de Parfums y runtime Supabase cerrados. **DETENER para revisión externa.**
Después de aprobación explícita: Phase 4b Categories CRUD. No iniciar Import
operativo, Cloudinary, pagos ni automatizaciones dentro de este mismo bloque.
