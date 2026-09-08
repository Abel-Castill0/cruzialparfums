# CRUZIAL PLATFORM V2 — PROGRESS

## BRANCH

`codex/feature/cruzial-platform-v2`. `master` permanece intacto para GitHub Pages.

## HEAD

Git es la fuente de verdad del hash. Fase 4F2A (Client Media Reconciliation
Manifest) implementada y validada localmente, sin carga ni mutación de media.

## CURRENT

- V2 aislada en `apps/web`: Next.js 16, App Router y TypeScript estricto.
- **ADMIN DB = Supabase. PUBLIC STOREFRONT = `LegacyCatalogRepository`
  (temporal, sobre `assets/data.js`).** Siguen siendo dos fuentes
  deliberadamente separadas hasta un cutover explícito.
- Implementado: gateway, Home Parfums, catálogo, producto, cart drawer,
  checkout, combos/builder, Finder, mayorista, institucional, legales y 404.
- Import sigue siendo foundation editorial (sin CRUD).
- **Admin Parfums — Product CRUD: IMPLEMENTED / RUNTIME TESTED.** `/admin/parfums/productos`
  (lista paginada/filtrable/buscable), `/nuevo` (crear) y `/[id]` (editar:
  datos core, variantes + inventario por variante, categorías, destacado,
  archivar/restaurar). Todo sobre las RPCs `public.admin_*`
  (migration Fase 4a) — atómico, con audit log no falsificable y
  concurrencia optimista (`updated_at` esperado).
- **Admin Parfums — Categories CRUD: IMPLEMENTED / RUNTIME TESTED.**
  `/admin/parfums/categorias`, `/nueva` y `/[id]`: listado server-side con
  búsqueda/filtros/paginación, create/edit, jerarquía, estado, orden y
  archive/restore. RPCs atómicas auditan actor real, rechazan concurrencia
  obsoleta, ciclos/cross-unit, padre archivado y archivo con productos o hijas
  activas. `spec_schema` se preserva y no se expone como JSON arbitrario.
- **Admin Parfums — Combos CRUD: IMPLEMENTED / RUNTIME TESTED.**
  `/admin/parfums/combos`, `/nuevo` y `/[id]`: un combo es 1:1 con un producto
  Parfums existente elegible (no archivado, sin combo previo); composición
  (`combo_items`) administrada aparte del editor de producto, con selects
  nativos de producto/variante, cantidad y orden por botones ↑/↓, guardado
  como reemplazo atómico completo. Estado de verificación
  (`pending_reconfirmation` / `client_confirmed` / `unknown`) es una acción
  explícita, nunca inferida. Archive/restore no toca producto/variantes/
  composición. Integridad añadida (migration aditiva, sin editar históricas):
  auto-referencia bloqueada (un combo no puede incluir una variante de su
  propio producto), y archivar una variante/producto referenciado por un
  combo activo queda bloqueado (mismo precedente que Fase 4b con categorías)
  hasta archivar el combo primero — verificado también en vivo contra
  Product CRUD, no solo en pgTAP.
- **Admin Parfums — Wholesale: IMPLEMENTED / RUNTIME TESTED.**
  `/admin/parfums/mayorista` gestiona las tres políticas confirmadas por
  `commercial_type`, lista exclusivamente variantes `bottle` con precio base,
  precio derivado, disponibilidad/publicación y diagnóstico de clasificación.
  La DB acumula cantidades por slug estable, excluye decants, calcula dinero
  con `numeric`, audita update/enable/disable en la misma transacción y rechaza
  `expected_updated_at` obsoleto.
- **Admin Parfums — Media / Cloudinary: IMPLEMENTED / RUNTIME TESTED.**
  6 RPCs de media (`admin_register_media`, `admin_update_media`,
  `admin_set_media_primary`, `admin_archive_media`, `admin_restore_media`,
  `admin_reorder_media`), todas SECURITY INVOKER con `app.assert_admin_for`,
  audit y concurrencia optimista. Single active primary per product enforced by
  partial unique index. Archivar elimina is_primary sin auto-promover; restaurar
  nunca re-primaria. Cloudinary signed upload server-side (sha1 de params +
  secret), API secret nunca en el cliente ni en NEXT_PUBLIC_*. Valida la
  respuesta de Cloudinary (folder prefix, format, size) antes de persistir;
  asset rechazado se limpia automáticamente. Admin Media manager integrado en
  el editor de producto: upload, alt text, variante asociada, principal, reorden
  ↑/↓, archivar/restaurar. Warning cuando el producto tiene media activa sin
  principal. Viewer Parfums: solo lectura. Import-only: denegado. Anónimo:
  denegado. Responsive: `repeat(auto-fill, minmax(220px, 1fr))`. 12 unit
  tests vitest + 30 pgTAP assertions nuevas. Staging `cruzial-v2-staging`
  actualizado (12 migrations). `git diff --check` limpio.
- **4F2A Media Reconciliation Manifest: IMPLEMENTED / VALIDATED.** Inventario
  determinista de 96 productos legacy no-combo y 196 PNG originales, basado
  únicamente en metadata/nombres: 156 `EXACT_MATCH`, 34 `ALIAS_CONFIRMED`, 4
  `AMBIGUOUS`, 4 `NO_MATCH` (2 archivos huérfanos + 2 productos sin archivo) y
  1 `CLIENT_ASSET_MISSING`. Excepciones explícitas: ambiguos
  `FRENCH AVENEU - LIQUID BRUN.png`, `FRENCH AVENEU -LIQUID BRUN.png`,
  y `VERSACE - EROS EDP.png` + `(2)`; productos sin match `lovely-cherry` y
  `royal-blend-sequoia`; `sceptre-malachite` permanece
  `CLIENT_ASSET_MISSING`; huérfanos `Cuarteto Oriental Vainilla Freak.png` +
  `(2)`. El detalle y las colisiones viven en
  `supabase/staging/client-media-reconciliation.json`; no se tocó ningún PNG,
  Cloudinary, `product_media`, DB ni storefront. La migración real queda
  bloqueada hasta que la reconciliación comercial legacy → Supabase entregue
  IDs de producto estables.
- **4H1A Commercial Reconciliation Manifest: IMPLEMENTED / VALIDATED.** El
  generador determinista enriquece el staging ETL existente sin un segundo
  parser de catálogo: 99 productos legacy considerados, 96 productos
  no-combo (87 `MIGRATABLE_DRAFT`, 9 con campos de provenance más fuerte),
  312 variantes y 192 relaciones de categoría. Los 312 precios permanecen
  `legacy` y draft —incluidos 24 precios de frasco—; 0 precios confirmados.
  Normaliza explícitamente
  `arab → arabic` y slugs olfativos a ASCII: 3 categorías comerciales y 8
  olfativas, sin colisiones. `bir-intense` se conserva `hidden`; producción,
  disponibilidad y publicación siguen independientes. Inventario futuro:
  `status_only`, `quantity_on_hand = null`. Los 3 combos siguen bloqueados y
  hay 0 excluidos. El aparente conflicto 23→24 quedó resuelto en 4H1B1: eran
  23 productos con frasco pero 24 precios porque `erba-pura` tiene 50/100 ml;
  ningún valor se alteró ni se promovió. 14 overrides de provenance a nivel de campo o
  categoría no promueven el `verification_status` mixto, que permanece
  conservador en `legacy`. Inspección de filas comerciales existentes en
  Supabase: `NOT_VERIFIED` (4H1A es artifact-first, sin credenciales ni
  mutación remota). Dependencia siguiente: revisión del manifiesto antes de
  4H1B; media continúa diferida a 4F2B.
- **4H1B1 Controlled Local Commercial Population: IMPLEMENTED / LOCAL RUNTIME
  TESTED.** Migration aditiva con funciones operator-only en schema `app`
  (solo `postgres`; revocadas a `public`/`anon`/`authenticated`/`service_role`)
  y CLI limitado al contenedor local derivado de `supabase/config.toml`.
  Semántica `INSERT-or-verify`, sin update/delete/upsert: primero plan completo,
  luego apply atómico bajo locks; cualquier diferencia rehúsa todo el apply.
  Reset local inició en 0/0/0/0/0; dry-run planeó 11 categorías, 96 productos,
  312 variantes, 192 relaciones y 312 inventarios. Apply local coincidió y la
  segunda pasada quedó 0 inserts / 923 unchanged / 0 conflicts. Probes reales
  protegieron un nombre humano y `tracked_quantity = 7`; ambos applies fueron
  rechazados sin overwrite. Verificación: 0 publicados, 0 precios promovidos,
  0 combos/media, `bir-intense` hidden, 3 discontinued+available; Admin ve
  corregido + normal, anon ve 0 drafts. Hosted staging **NO POBLADO**.
- **Public Parfums Order Request: IMPLEMENTED / RUNTIME TESTED.** El checkout
  revalida identidades y cantidades contra `LegacyCatalogRepository`, ignora
  snapshots comerciales del browser y persiste mediante una RPC service-only
  atómica e idempotente. El resultado queda en
  `pending_whatsapp_confirmation`; recién entonces limpia el carrito y entrega
  el handoff `/parfums/gracias/[order]` hacia el WhatsApp central.
- **Admin Parfums — Orders Inbox / Detail: IMPLEMENTED / RUNTIME TESTED.**
  `/admin/parfums/pedidos` (listado paginado 20/página, más reciente primero,
  búsqueda server-side por número de pedido/nombre/teléfono) y
  `/admin/parfums/pedidos/[id]` (referencia, cliente, entrega, líneas
  inmutables y subtotal). Solo lectura — sin RPC ni migration nueva; las
  policies `orders_admin_read` / `order_lines_admin_read` ya existentes
  (Fase 3) son la única autorización, verificadas en pgTAP con fixtures
  reales (admin y viewer Parfums leen, Import-only y anónimo quedan
  denegados). Estado único confirmado hoy (`pending_whatsapp_confirmation`)
  mapeado centralizadamente a "Pendiente por WhatsApp" — nunca se expone el
  enum crudo ni se inventa un filtro de estado sin valor real. "Contactar por
  WhatsApp" normaliza el teléfono del cliente solo cuando calza el contrato
  peruano validado (9 dígitos móvil, con o sin `51`); si no calza, se
  muestra/copia el teléfono en vez de inventar un país. Detalle nunca
  reconstruye nombres/precios desde el catálogo vivo — solo lee los
  snapshots almacenados.
- **Supabase remoto staging enlazado**: proyecto `cruzial-v2-staging`
  (`iyxidhglyqkzoziyewlc`, ACTIVE_HEALTHY, único proyecto existente — sin
  ambigüedad). Las primeras 9 migrations locales se aplicaron limpiamente sobre un
  remoto que no tenía schema de aplicación previo (`migration list` vacío
  antes del push); `db push --dry-run` coincidió exactamente con el push
  real. Tipos generados desde el proyecto enlazado (`--linked`) comparados
  contra los locales: sin drift de schema — única diferencia es un bloque de
  metadata del generador (`__InternalSupabase`/versión de PostgREST) ausente
  en la generación `--local`. Config de Auth remota NO tocada — ver
  `REMOTE_AUTH_URL_CONFIG_PENDING_PREVIEW` en BLOCKERS.
  La décima migration (Fase 4d Wholesale) pasó dry-run como único cambio,
  se aplicó al mismo staging y un segundo dry-run confirmó `upToDate: true`;
  la generación linked contiene la vista, RPCs y campos Wholesale nuevos.
- Supabase Foundation (Fase 3) sigue vigente: migrations versionadas, RLS,
  pgTAP, seed estructural, ETL legacy a staging. **RUNTIME TESTED: YES** —
  272/272 pgTAP (74 Fase 3 + 28 Fase 4a + 37 Fase 4b + 39 Fase 4c + 29
  Fase 4d + 21 Order Request + 14 Orders Inbox + 30 Media) en reset fresco.
- Preview y Admin permanecen `noindex,nofollow`; Production/cutover no autorizados.
- **Global Parfums Quality / Parity Gate (Fase 2.5): PASS** (heredado, sin
  regresión demostrada en este bloque). No se declara "sin bugs" — ver
  PARTIAL/BLOCKERS.

## DONE

- Foundation, Catalog, Product Detail, Cart, Checkout, Public Order Request,
  Combos, Finder, Mayorista e Institutional cerrados por capability; no se reescriben sin
  regresión demostrada.
- Catálogo reconciliado: hidden, descontinuado independiente de disponibilidad,
  regalo solo en frasco, cantidad desde card, tamaño por línea en combos y
  mayorista con alcance confirmado `per_commercial_type` y umbral de 40 unidades.
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
- Fase 4b Admin Parfums Categories CRUD cerrada y runtime-tested: categorías
  raíz/hija, tipo comercial/familia olfativa, slug, descripción, publicación,
  orden y archive/restore sin DELETE. La DB protege ciclos incluso concurrentes,
  relaciones de producto e hijas activas; Product editor omite archivadas para
  nuevas asignaciones y nunca elimina relaciones silenciosamente. E2E local
  cubrió el flujo completo, conflicto entre sesiones e aislamiento Import-only;
  list/new/edit pasaron 320/390/430/768/1024/1440/1920 sin overflow y con un
  solo `main`/`h1`, labels, teclado y controles principales de ~44 px.
- Fase 4c Admin Parfums Combos CRUD cerrada y runtime-tested: crear sobre un
  producto elegible, componer/reordenar/cambiar cantidad, verificación
  explícita, archive/restore preservando la composición. `ComboWorkspace`
  centraliza el `updated_at` del combo como token de concurrencia compartido
  entre el editor de verificación y el editor de composición — un bug real
  encontrado en el propio E2E (guardar uno invalidaba el token del otro
  dentro de la misma pestaña) y corregido antes de cerrar la fase. E2E local
  cubrió: crear, agregar 2 variantes, duplicado rechazado (cliente y DB),
  auto-referencia rechazada contra el runtime real, cross-unit rechazado por
  el trigger de la DB, reordenar con persistencia verificada, verificación
  explícita, bloqueo real de archivar variante/producto referenciado (con
  mensaje específico, no el genérico — otro bug real encontrado y corregido:
  `mapPostgrestError` no traducía `P2006` fuera del módulo de combos),
  archive/restore de combo sin tocar el producto, conflicto de concurrencia
  real (otra sesión simulada por SQL) rechazado sin sobrescritura, y
  aislamiento Import-only verificado navegando la app real, no solo pgTAP.
  Fixtures y usuarios de prueba (incluida una segunda pasada solo para el
  spot-check responsive) eliminados al cerrar; `audit_log` de esas pruebas
  quedó (append-only por diseño, confirmado también aquí) y se limpia con el
  próximo `db:reset`. list/nuevo/[id] pasaron 320/390/430/768/1024/1440/1920
  sin overflow, con un solo `main`/`h1` en cada uno.
- Fase 4d Admin Parfums Wholesale cerrada y runtime-tested: políticas activas
  iniciales Árabe 40/−S/5, Diseñador 40/−S/7 y Nicho 40/−S/10; cálculo
  autoritativo 39/40/41, suma entre productos del mismo tipo, separación entre
  tipos y exclusión de decants. E2E local verificó mutación, audit actor real,
  conflicto stale, filtro/listado, clasificación faltante e aislamiento del
  admin exclusivo de Import. Las nuevas superficies pasaron los siete anchos
  320/390/430/768/1024/1440/1920, labels, foco y targets principales de 44px.
- Fase 4F1 Media Foundation + Admin Parfums Media cerrada y runtime-tested: 6
  RPCs de media (register/update/set_primary/archive/restore/reorder), todas
  SECURITY INVOKER con app.assert_admin_for, audit y concurrencia optimista.
  Cloudinary signed upload server-side, sin SDK, sin NEXT_PUBLIC_* secret.
  Valida respuesta Cloudinary antes de persistir; asset rechazado limpiado
  automáticamente. DB persistence failure reportada explícitamente (no
  silenciada). Admin Media manager en el editor de producto: upload, alt,
  variante, principal, reorden ↑/↓, archivar/restaurar. Viewer read-only,
  import-only denegado, anónimo denegado. Responsive auto-fill grid.
  30 pgTAP assertions + 12 vitest. Staging push con dry-run limpio.
- Fase 4F2A Client Media Reconciliation Manifest cerrada: generador/check
  determinista, normalización conservadora, aliases limitados a `IMG_MAP`,
  fuzzy siempre ambiguo, colisiones auditables y 7 pruebas unitarias. El
  artefacto es staging solamente y no establece verdad comercial en Supabase.
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

- Admin Settings, Audit UI global e
  Import operativo permanecen fuera de este bloque — siguientes capabilities,
  no iniciadas.
- Media de combos (`product_media` de solo lectura) quedó explícitamente
  fuera de alcance de Fase 4c (opcional según el brief) — no es una omisión.
- Reglas comerciales de combos anidados dentro de otros combos: sin contrato
  confirmado, no se inventó ninguna regla — documentado como UNKNOWN, no
  bloqueado a nivel de schema salvo la auto-referencia (que sí es un bug de
  integridad, no una regla de negocio, y sí quedó corregido).
- Las matrices de Fase 4a/4b/4c cubrieron sus rutas; los módulos Admin
  todavía no implementados no tienen una auditoría funcional completa.

## BLOCKERS

- Cutover: dominio/cuentas definitivas y reglas comerciales P0 sin confirmar.
- Import: catálogo, operación de campañas/pedidos y políticas finales pendientes.
- Admin: creación del primer usuario, contraseña, MFA y recuperación siguen
  pendientes de decisión; el grant de membresías ya tiene ruta operator-run.
- 23 precios de frasco y composiciones combo son paridad legacy, no seed verificado.
- Reemplazo de `sceptre-malachite`: falta un asset nuevo del cliente.
- **`REMOTE_AUTH_URL_CONFIG_PENDING_PREVIEW`**: `supabase/config.toml`'s Auth
  `site_url`/`additional_redirect_urls` siguen apuntando a `localhost` — no se
  empujó config de Auth al proyecto remoto en este checkpoint porque todavía
  no existe una URL de Vercel Preview aprobada. No exponer el staging
  públicamente hasta configurar correctamente el redirect/site URL remoto.
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

- El hash final de Fase 4E2 vive en Git; los assets originales del cliente
  permanecen fuera de staging.
- `npm run check` (catálogo + lint + typecheck + test + build): PASS.
- Vitest: 34 archivos, 220 tests PASS (incluye 12 de Fase 4H1A: staging,
  provenance por campo, overrides documentados, precios legacy, status
  conservador, hidden/descontinuado independientes, categorías, conflictos,
  combos y determinismo; más 8 de Fase 4F2A: normalización, exact,
  aliases confirmados —incluido Valentino y su pareja `(2)`—, ambigüedad,
  asset ausente, colisión y orden determinista).
- `commercial:check`: PASS; el manifiesto coincide byte por byte con ETL,
  decisiones y migrations versionadas, sin timestamps variables.
- `commercial:load:verify`: PASS local; 0 inserts, 923 unchanged, 0 conflicts,
  conteos/estados exactos, smoke Admin y aislamiento anónimo.
- `media:check`: PASS; el manifiesto coincide byte por byte con el catálogo y
  el inventario local de nombres de archivo (sin leer contenido binario).
- Build: PASS; `/admin/parfums/pedidos` y `/pedidos/[id]` son dinámicos
  (`force-dynamic`), igual que el resto de Admin — nunca prerenderizados
  como contenido compartido.
- ETL: dos escrituras consecutivas produjeron el mismo SHA-256; `etl:check`
  PASS (96 staging, 3 blocked, 0 invalid).
- Supabase CLI: `db:reset` fresco PASS; las 13 migrations y el seed
  estructural se aplicaron desde cero (4H1B1 añadió el boundary operator-only).
- pgTAP runtime: 12 archivos, 306/306 assertions PASS (74 foundation + 28
  Product CRUD + 37 Categories CRUD + 39 Combos CRUD + 29 Wholesale + 21
  Public Order Request + 14 Admin Orders Inbox/Detail + 30 Media Mutations +
  34 Controlled Commercial Import)
  en PostgreSQL local. Tipos generados sin drift contra `public,graphql_public`.
- `git diff --check`: limpio.
- E2E navegador de Admin Orders (Fase 4E2): login Parfums admin → inbox con
  25 fixtures sintéticos (creados vía la RPC real
  `create_parfums_order_request`, nunca insert directo) → paginación 20/5
  entre página 1 y 2 verificada → búsqueda por nombre coincide exactamente 1
  fila → detalle con snapshot de líneas/subtotal correctos → enlace
  `wa.me/51999...` construido con el teléfono normalizado y mensaje de
  operador → "Copiar referencia"/"Copiar teléfono" degradan sin romper
  cuando el navegador niega el permiso de portapapeles → 1 `<main>`/1 `<h1>`
  en detalle → sin overflow horizontal en 320/375/1440 → Parfums viewer lee
  inbox y líneas → Import-only admin denegado (dashboard sin tarjeta
  Parfums, ruta y detalle directos redirigen a `/admin`) → anónimo
  redirigido a `/admin/login`. Usuarios locales descartables
  (`e2e-*@example.test`), sin PII real.
- E2E navegador de Combos: crear sobre producto elegible, agregar 2 variantes,
  duplicado/auto-referencia/cross-unit rechazados contra el runtime real,
  reordenar con persistencia verificada en DB, verificación explícita,
  bloqueo de archivar variante/producto referenciado (con mensaje correcto),
  archive/restore de combo sin tocar el producto, conflicto de concurrencia
  real rechazado, aislamiento Import-only navegando la app. Storefront
  público legacy smoke-tested en Home, catálogo, `/parfums/combos` (sin
  filtración de datos Supabase) y producto real — sin cambios.
- E2E navegador de Categories (Fase 4b, sin regresión demostrada): create/edit
  Parent+Child, búsqueda/filtro, jerarquía/ciclo preventivo, sort/status,
  relación con Product, bloqueos de archive, archive/restore y conflicto
  stale PASS.

## HISTORICAL

- El detalle de commits y checkpoints anteriores vive en Git. Las cantidades
  antiguas de tests no se conservan aquí como si fueran métricas actuales.
- Tag local `pre-v2-stable-2026-09-06` apunta al baseline `5fba38f`.

## PREVIEW

- No deploy en este bloque. Preview debe permanecer `noindex,nofollow`.

## PRODUCTION

- No deploy, merge, cutover ni cambios en `master`/GitHub Pages.

## NEXT

**Fase 4H1B1 — Controlled Local Commercial Population cerrada.** Siguiente
capability solo después de revisar el resultado local y recibir nueva
instrucción: **Fase 4H1B2 — Controlled Hosted Staging Population**. No iniciar
4H1B2, 4F2B, Settings, Import operativo, storefront Supabase cutover, config de
Auth remota ni deploy/Preview.
