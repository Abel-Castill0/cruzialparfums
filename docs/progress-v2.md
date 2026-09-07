# CRUZIAL PLATFORM V2 — PROGRESS

## BRANCH

`codex/feature/cruzial-platform-v2`. `master` permanece intacto para GitHub Pages.

## HEAD

Git es la fuente de verdad del hash. Recovery de Fase 3 inició en `f82e637`
(schema/RLS + pgTAP ya versionados, dos commits locales por delante del remoto).

## CURRENT

- V2 aislada en `apps/web`: Next.js 16, App Router y TypeScript estricto.
- Fuente canónica temporal: `assets/data.js` mediante
  `LegacyCatalogRepository`; fixture solo para paridad legacy, nunca seed
  comercial automático.
- Implementado: gateway, Home Parfums, catálogo, producto, cart drawer,
  checkout, combos/builder, Finder, mayorista, institucional, legales y 404
  (404 de Parfums ahora realmente alcanzable — ver DONE).
- Home Parfums usa negro/blanco y conserva hero, trust, discovery, combos,
  Finder, educación, autenticidad, mayorista, FAQ y CTA. FeaturedPerfumeRail
  existe pero no renderiza productos hasta recibir curación real.
- Import sigue siendo foundation editorial. Admin ya tiene login sin signup,
  sesión SSR y autorización por membresía/unidad; no tiene CRUD todavía.
- Supabase Foundation existe como migrations versionadas, RLS, pgTAP, seed
  estructural, provisioning manual y ETL legacy a staging `draft`/`legacy`.
  **RUNTIME TESTED: YES** — Docker Linux + PostgreSQL local, reset fresco y
  pgTAP 74/74 verificados el 2026-09-07.
- Preview y Admin permanecen `noindex,nofollow`; Production/cutover no autorizados.
- **Global Parfums Quality / Parity Gate: PASS** (alcance verificado abajo;
  ningún P0/P1 abierto conocido). No se declara "sin bugs" — ver PARTIAL/
  BLOCKERS para lo no cubierto y los residuales P2/P3 documentados.

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
  se inventaron credenciales. Autorización RLS por usuario/unidad sí fue
  ejecutada con fixtures transaccionales pgTAP locales.

## TODO

- Admin CRUD e Import operativo permanecen fuera de este bloque.
- Matriz responsive/funcional de Import y Admin (este gate cubrió Parfums
  a fondo; Import/Admin solo se verificaron a nivel estructural básico:
  título único, `<main>`/`<h1>` únicos, 0 imágenes sin alt, consola limpia).

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

- Recovery de Fase 3 partió de `f82e637`; el hash final vive en Git.
- `npm run check` (catálogo + lint + typecheck + test + build): PASS.
- Vitest: 23 archivos, 103 tests PASS; focalizados Phase 3: 4 archivos,
  21 tests PASS.
- Build: 21 entradas de ruta PASS; `/admin`, sus unidades, login y callback
  aparecen dinámicas (`ƒ`), no prerenderizadas.
- ETL: dos escrituras consecutivas produjeron el mismo SHA-256; `etl:check`
  PASS (96 staging, 3 blocked, 0 invalid).
- Supabase CLI `2.117.0`: dos `db:reset` frescos PASS; las 6 migrations y el
  seed estructural se aplicaron desde cero en ambos.
- pgTAP runtime: 4 archivos, 74/74 assertions PASS en PostgreSQL local.
- `git diff --check`: limpio.
- Consola del navegador: 0 errores en las 16 rutas verificadas (Parfums,
  Import, Admin, 404) tras reiniciar el dev server para descartar cache
  stale de Turbopack (un proceso `node` huérfano en el puerto 3000 causó
  falsos positivos de CSS desactualizado al inicio de este bloque — no era
  un bug de la app, confirmado y documentado en el reporte de recovery).

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
Después de aprobación explícita: Admin CRUD por capability; no iniciar Import
operativo, Cloudinary, pagos ni automatizaciones dentro de este mismo bloque.
