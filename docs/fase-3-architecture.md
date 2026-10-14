# Fase 3 — Arquitectura de producto: admin, BD y reglas comerciales (2026-10-14)

Auditoría del estado actual (código en `master` `f30e4a5`, esquema de las 85 migraciones aplicado en el stack local) frente a las
solicitudes funcionales del cliente, y propuesta de arquitectura para cuatro bloques. **Este documento no implementa nada**: no hay
migraciones, ni código de aplicación, ni cambios de datos.

> **Aviso sobre las «15 solicitudes».** El listado literal de las 15+ solicitudes funcionales **no estaba en el hilo de trabajo** (solo
> las cuatro áreas nombradas en el encargo y los 23 puntos visuales). Para poder mapear sin inventar, §3 reconstruye 15 solicitudes
> **inferidas** de esas fuentes y de los briefs anteriores (marcadas «inferida»). **Hay que cotejarlas con la lista real del cliente**
> y corregir la tabla; la arquitectura de §4 no depende de que las 15 sean exactamente éstas, sí de los cuatro bloques.

## 1. Admin: qué existe

Acceso: Supabase Auth + MFA; `admin_memberships` con roles `admin` (5) y `viewer` (1); toda escritura pasa por **RPC `security definer`**
(`admin_*`) que validan unidad de negocio, escriben `audit_log` y, donde aplica, exigen `expected_updated_at` (control de concurrencia).
Cada editor tiene su esquema tipado en `domains/admin-parfums/*-schema.ts` (validación de formulario) y el mismo contrato se
re-valida en la BD (`app.validate_*` triggers). **No existe ningún editor genérico de JSON, a propósito.**

### 1.1 Admin Parfums (`/admin/parfums/…`)

| Editor | Qué edita | Tablas / RPC | Observaciones |
|---|---|---|---|
| Productos (`productos`, `nuevo`, `[id]`) | slug, nombre, marca, descripciones, género, concentración, modo de venta, estado de producción/publicación, destacado (rank y ventana), variantes (decant/bottle, ml, precio, SKU), inventario, fotos | `products`, `product_variants`, `inventory`, `product_media`; RPC `admin_create_product`, `admin_archive_product`, `admin_restore_product`, `admin_archive_variant`, `admin_register_media`, `admin_reorder_media`, `admin_set_media_primary`, … | Variantes `bottle` **ya** se pueden crear y publicar. **No hay campo de notas ni de etiqueta**: `specs.notes` y `specs.tag` solo se leen (`product-presentation.ts`), vienen de la carga ETL. |
| Categorías | tipo comercial (árabe/diseñador/nicho), familia olfativa, categorías Import | `categories`, `product_categories`; `admin_create_category`, `admin_set_product_categories`, archivar/restaurar | La **familia** sí es editable (categoría `olfactory_family`); las **notas** no. |
| Combos / sets | composición, verificación de composición, archivo | `combos`, `combo_items`; `admin_create_combo`, `admin_set_combo_composition`, `admin_update_combo_verification` | Composición por presentación (3/5/10 ml). |
| Pedidos | estado del pedido, línea de eventos | `orders`, `order_lines`, `order_status_events`; `admin_parfums_update_order_status` | Sin campo de regalo ni de zona/tarifa. |
| Reclamos | libro de reclamaciones | `complaint_book_entries`; `admin_update_complaint_status` | — |
| Configuración | **solo** contacto público (WhatsApp, correo) y datos legales (razón social, RUC, dirección, políticas) | `settings` (`public_contact`, `business_legal`); `admin_update_public_contact_setting`, `admin_update_business_legal_setting` | Las claves están **cerradas** por el trigger `app.validate_settings_value`: no se puede guardar una clave nueva sin migración. |
| Auditoría, Operaciones | lectura del log y del estado de automatizaciones | `audit_log`, `automation_worker_health` | Solo lectura. |
| Mayorista | **redirige a `/admin/import/mayorista`** | — | El mayorista se movió a Import (migración `20261002045724`). |

### 1.2 Admin Import (`/admin/import/…`)

Campañas/consolidados (crear, duplicar, estado, productos con versión: `admin_set_campaign_status`, `admin_duplicate_campaign`,
`admin_set_campaign_products_with_version`), productos y presentaciones (`import_presentations`, carga masiva `admin_bulk_import_catalog`,
publicación masiva), clientes, pedidos, lotes, reclamos, **configuración** (política de adelanto: `deposit_policies`) y **mayorista**
(`wholesale_policies`: mínimo, descuento por tipo comercial). Es el admin más completo y la referencia de patrón para lo nuevo.

### 1.3 Lo que el admin **no** tiene

1. Ningún editor de **contenido** (banners, textos, carruseles, FAQ, selector `/`, barra de anuncio).
2. Ningún editor de **notas/aromas**.
3. Ningún editor de **zonas de entrega**, **agencias Shalom** ni **tarifas**.
4. Ningún editor de **reglas promocionales** (regalo de 2 ml).
5. Ningún control del **video del home** (`home-video.ts` es código) ni de la **imagen de cada puerta del selector**.
6. Los combos del home y su orden dependen de datos pero no hay «carrusel curado» editable (orden/visibilidad en la home).

## 2. BD: qué existe y qué falta

28 tablas públicas + vistas (`admin_parfums_wholesale_catalog`). Aislamiento por `business_unit_id` (Parfums / Import) con RLS; lectura
pública solo de lo `published` y no archivado; escritura solo por RPC. Catálogo público cacheado 60 s con `unstable_cache` y la etiqueta
`parfums-catalog`; las mutaciones admin la invalidan (`parfums-storefront-revalidate.ts`).

| Necesidad | Tabla(s) hoy | Estado |
|---|---|---|
| Productos / variantes / inventario / fotos | `products`, `product_variants` (`variant_kind` decant\|bottle, `size_ml`, precio, verificación de precio), `inventory`, `inventory_reservations`, `product_media` | **Completo** y con admin. |
| Combos | `combos`, `combo_items` (por presentación) | **Completo** y con admin. |
| Campañas Import | `campaigns` (`status`, `opens_at`, `closes_at`, `public_message`), `campaign_products`, `import_presentations`, `deposit_policies` | **Completo** y con admin. La fecha estimada que muestra el selector sale de `opens_at`. |
| Settings | `settings (business_unit_id, key, value jsonb, is_public)` | **Solo 4 claves cerradas** (`public_contact`, `business_legal`, `operations_automation`, `search_indexing`). No sirve como almacén de contenido. |
| Notas / aromas | `products.specs->notes` (jsonb libre), `specs->tag`; familia = categoría | **Sin modelo**: lista de strings sin catálogo, sin capas, sin editor, sin garantía de ortografía/duplicados. |
| Envíos | `shipping_methods (code, name, notes, is_active)` — filas `shalom` y `private_delivery` | **Mínimo**: sin agencias, zonas, tarifas ni cobertura. Agencias (146) y distritos de Lima viven **en código** (`shalom-agencies.ts`, `lima-districts.ts`) y son **provisionales** (`docs/parfums-shipping.md`). |
| Mayorista | `wholesale_policies` (tipo comercial, mínimo, descuento), `variant_price_tiers`, vista `admin_parfums_wholesale_catalog` | Modelo **existe**; hoy solo Import lo administra y lo muestra (`public_get_import_wholesale_rules`). La definición de «mayorista de botellas selladas» de Parfums no tiene UI. |
| Regalo 2 ml | — | **No existe en BD**: regla en código (`promotion-eligibility.ts`), solo un aviso en la ficha; no se registra en `orders`/`order_lines`. |
| Contenido editable | — | **No existe.** |
| Pedidos | `orders` (`shipping_method_id`, `delivery_snapshot`, `deposit_*_snapshot`, `channel`), `order_lines` (snapshots) | Patrón de **snapshots** ya establecido: se reutiliza para tarifa/regalo. |

## 3. Mapa de solicitudes (inferidas; cotejar con la lista del cliente)

| # | Solicitud (inferida) | Estado | Evidencia / qué falta |
|---|---|---|---|
| R1 | Editar los banners/imágenes de la home (puertas del selector, héroes) | **Requiere desarrollo** | Hoy rutas fijas en código. Bloque A. |
| R2 | Editar textos de secciones (principios, FAQ, esenciales, intros, barra de anuncio) | **Requiere desarrollo** | Texto en TSX; `settings` no admite claves nuevas. Bloque A. |
| R3 | Carruseles administrables (orden y visibilidad de combos/sets, destacados) | **Parcial** | Destacados y rank: existen (`is_featured`, `featured_rank`, ventana). Orden/visibilidad de sets y textos del carrusel: no. Bloque A. |
| R4 | Editar notas/aromas de cada perfume | **Requiere desarrollo** | Sin editor ni modelo. Bloque B. |
| R5 | Editar familia olfativa / tipo | **Ya existe** | Categorías `olfactory_family`/`commercial_type`. |
| R6 | Catálogo de frascos enteros (ruta propia, filtros, fotos) | **Parcial** | Datos y venta en la ficha existen; falta la ruta/listado. Bloque C. |
| R7 | Mayorista de botellas selladas (mínimos, precios) | **Parcial** | Tablas y vista existen; UI solo en Import; pendiente decisión de dónde vive. Bloque D. |
| R8 | Agencias Shalom administrables y verificadas | **Parcial** | 146 agencias en código, sin verificar; falta tabla y editor. Bloque D. |
| R9 | Zonas de entrega de Lima (cobertura del motorizado, tarifa) | **Parcial** | Distritos en código, «provisional»; sin tarifas. Bloque D. |
| R10 | Regalo de 2 ml (solo con botella completa, nunca en mayorista) | **Parcial** | Regla y aviso en código; sin elección del perfume, sin registro en el pedido, sin toggle. Bloque D. |
| R11 | Bloqueo real de Import con la campaña cerrada + fecha estimada editable | **Parcial** | Fecha editable (`opens_at`) y estado visual: hechos; el bloqueo de compra ya existe en las RPC públicas (`public_get_import_current_campaign`). Falta comprobar el flujo completo carrito→checkout con campaña cerrada (otro PR). |
| R12 | Marca y filtros del catálogo | **Parcial** | Filtro de marca hecho (cliente); pasa a servidor en T12. Marca no es entidad (texto libre en `products.brand`). |
| R13 | Paginación/carga optimizada del catálogo | **Requiere desarrollo** | Provisional en cliente; T12 (rama `perf/catalog-server-pagination`). |
| R14 | Video e imágenes de la home administrables (MP4 en Cloudinary) | **Parcial** | Reproductor propio listo (`home-video.ts`, dormido); falta que el ID sea dato, no código. Bloque A. |
| R15 | Logo oficial en SVG y uso en header/selector | **Requiere desarrollo (asset)** | T20: depende del archivo del estudio; no es trabajo de BD. |

## 4. Arquitectura propuesta

Principios que se mantienen en los cuatro bloques: (1) **cero regresión**: con la BD vacía el sitio se ve exactamente como hoy (el texto
actual es el *fallback*); (2) **editores tipados**, nunca JSON libre; (3) **escritura solo por RPC `security definer` con auditoría y
`expected_updated_at`**; (4) **lectura pública solo de lo publicado**, cacheada con etiquetas e invalidada por la mutación; (5) **migraciones
aditivas** con relleno idempotente y marcador; (6) los datos comerciales desconocidos quedan **sin publicar** («release-safe»), nunca inventados.

### 4.1 Bloque A — Editor de contenido (banners, textos, carruseles)

**Modelo (nuevo):**
- `content_blocks (id, business_unit_id, key, kind, status draft|published|archived, payload jsonb, version int, publish_from, publish_until, updated_by, created_at, updated_at)`.
  `key` es una lista **cerrada y versionada en código** (`home.hero`, `gateway.parfums`, `gateway.import`, `home.principles`, `home.faq`, `announcement`, …); `kind` ∈ `banner | text | list | carousel`.
- `content_block_items (id, block_id, position, payload jsonb, media_id, is_active)` para los elementos ordenables de listas/carruseles.
- Los archivos se registran con el mismo patrón que `product_media` (Cloudinary firmado, alt obligatorio): tabla `content_media` o generalizar `product_media` a `media_assets`.
- `payload` se valida **por `kind` y por `key`** en un trigger `app.validate_content_block` (campos, largos, sin HTML, URL internas o `https`); el mismo esquema vive en `domains/admin-content/*-schema.ts`.

**Lectura pública:** vista/RPC `public_content_blocks(unit)` solo `published` y dentro de ventana; un `getContent(key, fallback)` en el servidor (cache `unstable_cache`, etiqueta `parfums-content`) que **devuelve el texto actual si no hay fila**. Cada componente recibe `fallback` tipado: nada se rompe si la BD falla o está vacía.

**Admin:** una sola sección «Contenido» con una lista de bloques conocidos; cada bloque abre **su formulario tipado** (no un editor genérico), vista previa con el componente real, estado borrador/publicado, programación, historial vía `audit_log`. Presets para evitar errores de marca: el contraste lo garantizan los tokens (el editor no elige colores libres; elige «claro / oscuro»).

**Fases:** A1 puertas del selector + barra de anuncio + textos de la home (lo más pedido, riesgo bajo); A2 carruseles (orden/visibilidad de sets y destacados, textos); A3 biblioteca de medios y video de la home (ID de Cloudinary como dato).
**Riesgos:** deriva visual (acotada con presets y la lista cerrada); rendimiento de la home (una sola lectura cacheada de todos los bloques); localización futura (el `key` ya admite `locale` si se añade).

### 4.2 Bloque B — Editor de notas/aromas

**Hoy:** `specs.notes` es un arreglo de textos sin catálogo.
**Propuesta:** `notes (id, slug, name, kind? , is_active)` como catálogo único y `product_notes (product_id, note_id, position, layer top|heart|base|null)`.
- La **familia** sigue siendo la categoría `olfactory_family` (ya editable); no se duplica.
- RPC `admin_set_product_notes(product_id, notes[], expected_updated_at)` análoga a `admin_set_product_categories`; `admin_create_note` con normalización (sin duplicados por `slug`).
- Relleno único desde `specs.notes` (script con *dry-run*, informe de notas nuevas por ortografía), `specs.notes` queda como *fallback* de lectura durante la transición y luego se retira.
- Lectura pública: `notes` entra en la consulta del catálogo (hoy `notes:specs->notes`) mediante la unión; el buscador, el Finder (`finder-rules`) y los atajos «Notas más presentes» usan la misma fuente.
- Admin: en la ficha del producto, selector con «chips» y creación al vuelo; pantalla «Notas» para renombrar/fusionar/desactivar.

**Decisión pendiente del cliente:** ¿pirámide olfativa (salida/corazón/fondo) o lista plana? El modelo admite ambas (`layer` nullable); la plana es la fase 1.

### 4.3 Bloque C — Catálogo de frascos enteros

**Datos:** ya existen (`variant_kind = 'bottle'`, `bottlePrices`, rol de foto `bottle`, verificación de precio de frasco). No hace falta tabla nueva; sí **tamaños y stock por variante** correctamente publicados (`inventory`).
**Ruta:** `/parfums/frascos` con el mismo patrón que el catálogo de decants tras **T12**: filtros y paginación en `searchParams`, consulta paginada en servidor. Por eso T12 va **primero**: su capa de consulta (`listProducts({ kind, filters, page })`) es la base de ambos catálogos.
**Producto:** tarjeta con tamaño del frasco y precio, aviso del regalo de 2 ml (regla de §4.4), enlace a la ficha (que ya vende frascos). Sin «cantidad genérica»; un selector de tamaño si hay más de uno.
**Alrededor:** entrada en el menú y en el pie; `sitemap`; canónicas; la redirección heredada `/perfumes-enteros.html` apunta hoy a `/parfums/catalogo?format=bottle` y pasaría a `/parfums/frascos`.
**Cuidado:** un frasco con precio no verificado (`bottlePricingVerificationStatus`) **no se publica** hasta confirmarse (regla release-safe ya vigente).

### 4.4 Bloque D — Reglas comerciales (mayoristas, Shalom, zonas, regalo 2 ml)

**Idea central:** las reglas pasan de constantes en código a **datos administrables**, evaluadas por **un solo módulo puro** (`domains/commerce/rules.ts`) que usa el cliente para *previsualizar* y el servidor (RPC de creación del pedido) para **decidir**, y cuyo resultado queda **congelado en el pedido** (snapshot), igual que ya hacen `deposit_policy_snapshot` y `delivery_snapshot`.

| Regla | Tabla(s) nueva(s) | Comportamiento |
|---|---|---|
| **Shalom** | `shipping_agencies (id, method_id, code, name, department, province, district, address, verification_status confirmed\|unverified, is_active, source)` | Reemplaza `shalom-agencies.ts`. El checkout lee agencias publicadas por RPC pública cacheada; las `unverified` se muestran con el aviso actual hasta que el dueño las confirme. Editor con CSV (importación con informe), nunca borrado físico. |
| **Zonas de Lima (motorizado)** | `delivery_zones (id, method_id, district_code, coverage full\|restricted\|quote_only, fee_amount null, note, is_active)` | Reemplaza `lima-districts.ts`. `fee_amount null` = se cotiza por WhatsApp (verdad de negocio actual: la web no muestra tarifa). La cobertura **nunca bloquea** un pedido salvo decisión expresa del cliente. Editor en cuadrícula por distrito. |
| **Regalo 2 ml** | `promotion_rules (id, business_unit_id, code, kind gift_decant, applies_to_variant_kind bottle, min_bottles int, gift_size_ml 2, eligible_commercial_type arab, is_active, valid_from, valid_until, excludes_channels text[])` | Solo con **botella completa** (`bottle`), nunca como producto aparte, **excluye** el canal mayorista e Import. El cliente elige el decant árabe de 2 ml entre los elegibles; el pedido guarda `gifts_snapshot jsonb` (regla, elección, ml) y el mensaje de WhatsApp lo incluye. El servidor **valida** que el carrito tenga la botella: el cliente no puede forzarlo. Admin: activar/desactivar y ventana. |
| **Mayoristas** | ya existen `wholesale_policies`, `variant_price_tiers`, vista `admin_parfums_wholesale_catalog` | Primero **decidir dónde vive** el mayorista de botellas selladas de Parfums (hoy el admin redirige a Import). Si Parfums lo necesita: reactivar `/admin/parfums/mayorista` sobre la **misma** vista, marcar el canal en `orders.channel`, y precedencia explícita: mayorista **excluye** regalo y descuentos de decant. |

**Orden de precedencia (documentado y testeado):** canal (retail/mayorista) → elegibilidad de botella → regalo → envío (agencia/zona) → total. **Pruebas:** pgTAP por regla (RLS pública solo publicado; RPC rechaza un regalo sin botella; mayorista nunca recibe regalo), unitarias del módulo de reglas, e2e del checkout con cada combinación.

## 5. Transversales

- **Seguridad:** misma matriz que hoy (`admin` escribe, `viewer` lee); MFA obligatorio; toda RPC nueva con `set search_path = ''`, comprobación de unidad y fila en `audit_log`; sin claves de servidor en el cliente.
- **Caché:** etiquetas por dominio (`parfums-catalog`, `parfums-content`, `parfums-shipping`, `parfums-rules`) e invalidación desde las acciones del admin con `revalidateTag`.
- **Migraciones:** aditivas y reversibles (hay `supabase/rollback/`), relleno idempotente, ningún dato comercial inventado; en Producción solo tras la revisión de precheck del dueño (regla vigente).
- **Pruebas:** pgTAP (`supabase/tests`), unitarias, e2e públicas y de admin; semilla local de QA fuera del repo.
- **Rendimiento:** ningún bloque agrega payload por página; contenido y reglas se leen en servidor y se pasan acotados (lección de T12/T13).

## 6. Fases y dependencias propuestas

| Fase | Contenido | Depende de | Tamaño |
|---|---|---|---|
| F3.0 | **T12**: catálogo con filtros y paginación en servidor (capa `listProducts`) | — | M |
| F3.1 | Contenido A1 (puertas del selector, barra de anuncio, textos de la home) | — | M |
| F3.2 | Notas/aromas (modelo, relleno, editor) | decisión: pirámide o lista | M |
| F3.3 | Catálogo de frascos enteros | F3.0 | M |
| F3.4 | Zonas y agencias (Shalom/motorizado como datos) | verificación del dueño | M |
| F3.5 | Regalo 2 ml (regla + pedido + mensaje) | F3.3 | M |
| F3.6 | Mayorista de botellas en Parfums | decisión del cliente | S–M |
| F3.7 | Contenido A2/A3 (carruseles, video, medios) | F3.1 | M–L |

## 7. Preguntas abiertas para el cliente / dueño

1. **La lista literal de las 15 solicitudes** (para cotejar §3).
2. Notas: ¿pirámide (salida/corazón/fondo) o lista plana?
3. Regalo 2 ml: ¿el cliente elige el perfume árabe de 2 ml o lo elige la tienda? ¿Un regalo por frasco o por pedido? ¿Vigencia?
4. Mayorista de botellas selladas: ¿vive en Parfums o en Import? ¿Mínimos y descuentos?
5. Zonas de Lima: lista oficial de distritos con cobertura restringida y si habrá tarifa publicada o solo cotización por WhatsApp.
6. Agencias Shalom: ¿quién las verifica y con qué fuente?
7. Contenido: ¿qué bloques quiere editar él mismo primero? ¿Necesita programar (fecha de inicio/fin)?
