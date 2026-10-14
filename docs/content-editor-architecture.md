# Editor de contenido desde el admin — auditoría y arquitectura (2026-10-14)

Qué puede editar hoy el cliente desde el admin, qué no, y qué arquitectura proponer para las **15 capacidades editables**. **Este
documento no implementa nada** (sin migraciones, sin código de aplicación, sin cambios de datos). Complementa y afina
`docs/fase-3-architecture.md` (auditoría general del admin y la BD), cuyas tablas de §1–§2 siguen vigentes.

## 0. Las 15 capacidades (lista cerrada con esta numeración)

La lista sale de los encargos de implementación que acompañan a esta tarea (notas, bloques, frascos, carruseles, Import, reglas,
revalidación). Los agrupé en 15 para poder mapearlos; si el cliente cuenta distinto, la tabla de §3 se reordena sin cambiar la propuesta.

| # | Capacidad |
|---|---|
| C1 | CRUD de notas/aromas en el admin |
| C2 | Asignar notas a productos |
| C3 | Notas en la ficha de producto y en el recomendador (lectura pública) |
| C4 | Bloques de contenido: modelo y esquemas (hero, carousel, text_banner, faq, gallery) |
| C5 | Editor de bloques: listar por página, alta/edición/baja, reordenar, previsualizar |
| C6 | Render público de bloques desde la BD, con respaldo al contenido actual |
| C7 | Catálogo de frascos enteros: `/parfums/frascos`, enlace «Perfumes enteros», marcar un producto como frasco entero |
| C8 | Regalo de 2 ml: elegir perfume árabe al comprar frasco entero (excluir Club de Nuit Precieux), validar en servidor y guardarlo en el pedido |
| C9 | Carruseles: elegir qué productos aparecen en cada uno (`carousel_items`) |
| C10 | Carruseles: velocidad configurable (20–60 px/s) |
| C11 | Import: condiciones y FAQ editables (texto enriquecido) |
| C12 | Import: quitar «Delivery privado» y añadir «Shalom todo el Perú» |
| C13 | Import: hero con estado, fecha de apertura/cierre, tiempo de entrega y «desde 1 unidad» |
| C14 | Reglas comerciales configurables (`promotion_rules`, `shipping_agencies`, `delivery_zones`) — **bloqueada por decisiones del cliente** |
| C15 | Revalidación: lo que se guarda en el admin se ve en la web en menos de 5 s |

## 1. Admin: qué editores existen

Escritura **solo por RPC `security definer`** (`admin_*`), con `audit_log` y, donde hay concurrencia, `expected_updated_at`; roles
`admin`/`viewer` con MFA; esquemas de formulario escritos a mano en `domains/admin-parfums/*-schema.ts` y re-validados en la BD por
triggers `app.validate_*`. No hay editores de JSON libre, a propósito.

| Admin | Edita | Tablas / RPC principales |
|---|---|---|
| Parfums · Productos | nombre, marca, descripciones, género, concentración, modo de venta, estados, destacado (rank y ventana), **variantes decant y bottle** (ml, precio, SKU), inventario, fotos | `products`, `product_variants`, `inventory`, `product_media` · `admin_create_product`, `admin_archive_*`, `admin_register_media`, `admin_reorder_media` |
| Parfums · Categorías | tipo comercial, familia olfativa | `categories`, `product_categories` · `admin_set_product_categories` |
| Parfums · Combos | composición y verificación | `combos`, `combo_items` |
| Parfums · Pedidos / Reclamos | estado y seguimiento | `orders`, `order_lines`, `order_status_events`, `complaint_book_entries` |
| Parfums · Configuración | **solo** contacto público y datos legales | `settings` (claves cerradas `public_contact`, `business_legal`) |
| Import · Campañas / consolidados | estado, fechas (`opens_at`, `closes_at`), mensaje público, productos y presentaciones, duplicar | `campaigns`, `campaign_products`, `import_presentations` · `admin_set_campaign_status`, `admin_duplicate_campaign` |
| Import · Configuración / Mayorista | política de adelanto; mínimos y descuentos por tipo | `deposit_policies`, `wholesale_policies` |
| Import · Pedidos, clientes, lotes, reclamos | operación | `orders`, `customers`, … |

**No existe ningún editor de:** notas/aromas, bloques de contenido (textos, banners, FAQ, galerías), carruseles, agencias/zonas de
envío, reglas promocionales, ni del tiempo de entrega o el mínimo de unidades de Import.

## 2. BD: qué tablas soportan editores y qué falta

| Soporta editor | No lo soporta |
|---|---|
| `products`, `product_variants`, `inventory`, `product_media`, `categories`, `product_categories`, `combos`, `combo_items`, `campaigns`, `campaign_products`, `import_presentations`, `deposit_policies`, `wholesale_policies`, `variant_price_tiers`, `settings` (4 claves) | `products.specs->notes` (JSON libre sin catálogo ni editor), `shipping_methods` (solo `code`/`name`/`notes`: `shalom` en Parfums, `private_delivery` en Import) |
| **Faltan tablas:** `notes`, `product_notes`, `content_blocks`, `carousels`, `carousel_items`, `shipping_agencies`, `delivery_zones`, `promotion_rules`; columnas para el regalo en `orders` | `campaigns` no tiene tiempo de entrega ni mínimo de unidades |

Patrones ya establecidos que se reutilizan: lectura pública solo de lo publicado (RLS), escritura por RPC con auditoría, **snapshots
en el pedido** (`delivery_snapshot`, `deposit_policy_snapshot`), caché con `unstable_cache` y etiquetas, migraciones aditivas con
`supabase/rollback/` y pruebas pgTAP en `supabase/tests`.

## 3. Matriz: ya existe / parcial / requiere desarrollo

| # | Estado | Evidencia y lo que falta |
|---|---|---|
| C1 | **Requiere desarrollo** | No hay tabla ni pantalla de notas; `specs.notes` es texto libre. |
| C2 | **Requiere desarrollo** | La ficha del producto del admin no tiene campo de notas (`product-presentation.ts` solo las **lee**). |
| C3 | **Ya existe (lectura)** | La ficha pinta `product.notes` y el recomendador puntúa por `product.notes` (`finder-rules.ts`). Solo cambia la **fuente** (de `specs.notes` a `product_notes`) manteniendo el contrato `notes: string[]`. |
| C4 | **Requiere desarrollo** | No existe `content_blocks`. |
| C5 | **Requiere desarrollo** | No hay editor ni biblioteca de arrastrar y soltar. |
| C6 | **Requiere desarrollo** | Textos e imágenes de home e Import están en TSX; no hay lectura desde BD. |
| C7 | **Parcial** | Las variantes `bottle` ya se crean y publican en el admin y la ficha ya las vende; **faltan** la ruta, el enlace del menú y la capa de consulta con ese filtro. |
| C8 | **Parcial** | La regla y el aviso existen como constante (`promotion-eligibility.ts`); falta elegir el perfume, validar en servidor y guardar en el pedido. |
| C9 | **Parcial** | Los destacados sí son editables (`is_featured`, `featured_rank`, ventana) y la tira los usa primero (`selectShowcaseProducts`); no hay selección por carrusel ni orden propio. |
| C10 | **Parcial** | La velocidad existe como constante (`MARQUEE_DRIFT_PX_PER_SECOND = 40`); no es dato. |
| C11 | **Requiere desarrollo** | Condiciones y FAQ de Import viven en `import-information.tsx`. |
| C12 | **Requiere desarrollo + decisión** | «Delivery privado» aparece en **5 lugares** (info, proceso, checkout, términos) y `shipping_methods` de Import solo tiene `private_delivery`. Ver premisa 5. |
| C13 | **Parcial** | `campaigns` ya trae estado y fechas y el hero ya las lee (`ImportHero`); faltan el tiempo de entrega y el mínimo como **datos**. Ver premisa 6. |
| C14 | **Requiere desarrollo, bloqueada** | Tablas inexistentes y faltan las decisiones del cliente (§5.5). |
| C15 | **Parcial** | Parfums ya revalida (§5.6); Import y los contenidos nuevos no. |

### Premisas de los encargos que **no coinciden con el código** (a corregir antes de implementar)

1. **`format` no existe.** El encargo C7 dice «ya existe `format`»: no hay columna `format` en `products` ni atributo equivalente. Lo
   que hay es `product_variants.variant_kind = 'bottle'`. Un producto **es** frasco entero si tiene una variante `bottle` publicada
   y con stock: no hace falta una marca manual (y una marca manual podría contradecir los datos). El filtro `format = 'full_bottle'`
   del encargo se implementa como esa condición derivada.
2. **No había Zod** (ni librería de arrastrar y soltar, ni editor de texto enriquecido). Los esquemas del admin eran funciones escritas a mano
   más triggers en la BD. **Resuelto el 2026-10-14 (§6):** Zod instalado y solo en servidor; sin arrastrar y soltar; sin editor enriquecido.
3. **«Club de Nuit Précieux»** se llama en los datos **«Club de Nuit Precieux I»** (sin acento). La exclusión debe guardarse por
   **identidad del producto** (id o slug en la regla), nunca por nombre.
4. **Texto enriquecido = HTML = superficie de XSS** bajo la CSP actual. No se propone HTML libre sino un subconjunto restringido (§5.3).
5. **«Shalom todo Perú» en Import revierte una regla documentada**: hoy Import «no utiliza la modalidad Shalom de Cruzial Parfums»
   (texto público de `import-information.tsx`; Parfums e Import tienen carritos, pedidos y envíos independientes según
   `docs/architecture-v2.md`; la entrega privada de Import figura también en `docs/import-multicategory.md`). Requiere confirmación expresa del cliente y cambia términos,
   checkout, el método de envío de Import y los snapshots de pedido, no solo un texto de la FAQ.
6. **El hero de Import fue simplificado a propósito** (título + una línea + dos botones; `docs/import-fixes.md`) por indicación del
   Release Manager. C13 vuelve a mostrar estado, fechas y condiciones: es un **cambio de diseño** que hay que aprobar. Además
   «8 a 15 días hábiles» y «desde 1 unidad» son **afirmaciones comerciales**: deben venir del cliente y vivir como dato editable, no
   como texto fijo en el componente (regla «no inventar tiempos de envío»).
7. **Revalidación:** `revalidateTag(tag, { expire: 0 })` ya es la firma de Next 16 en el helper vigente; `updateTag` (lectura de lo
   escrito) solo es válido dentro de Server Actions. Las etiquetas pedidas (`parfums-catalog`, `import-campaign`, `content-blocks`)
   existen solo en parte (§5.6).

## 4. Principios comunes

1. **Cero regresión:** con la BD vacía el sitio se ve exactamente como hoy (el contenido actual es el respaldo tipado).
2. **Editores tipados, no genéricos:** cada bloque tiene su formulario y su esquema; el `jsonb` solo guarda lo validado.
3. **Escritura por RPC `security definer`** con `set search_path = ''`, comprobación de unidad, `audit_log` y `expected_updated_at`.
4. **Lectura pública solo de lo publicado** (RLS o vista), cacheada con etiquetas e invalidada por la mutación.
5. **Migraciones aditivas y reversibles**, relleno idempotente con *dry-run*; en Producción solo tras el precheck del dueño.
6. **Datos comerciales desconocidos no se inventan:** quedan sin publicar hasta que el cliente los confirme.
7. **Accesibilidad del editor y de lo que produce:** reordenar con botones además de arrastrar (WCAG 2.5.7), alt obligatorio en
   imágenes, contraste garantizado por tokens (el editor elige «claro/oscuro», no colores libres).

## 5. Arquitectura por capacidad

### 5.1 Notas y aromas — tablas relacionales (C1–C3)

```sql
notes(id uuid pk, business_unit_id, slug text, name text, type text check (type in ('top','heart','base','general')),
      description text, image_url text, is_active bool default true, created_at, updated_at, archived_at,
      unique (business_unit_id, slug))
product_notes(product_id uuid → products on delete cascade, note_id uuid → notes on delete restrict,
              position int default 0, primary key (product_id, note_id))
```
- `type` cubre tanto la lista plana (`general`) como la pirámide (`top|heart|base`); decidir cuál usar es del cliente, el modelo admite ambas.
- **RPC:** `admin_create_note`, `admin_update_note`, `admin_archive_note` (borrar = archivar; una nota en uso no se elimina) y
  `admin_set_product_notes(product_id, note_ids[], expected_updated_at)` análoga a `admin_set_product_categories`.
- **Relleno:** script idempotente desde `specs->notes` con informe de duplicados por ortografía (normalizar mayúsculas y tildes); lo
  que no se pueda unir queda para revisión manual. `specs.notes` se conserva como respaldo de lectura durante la transición.
- **Lectura pública:** el mapeo del catálogo sigue entregando `notes: string[]` (nombres de `product_notes`, en orden); así la ficha,
  el buscador, el Finder y los atajos no cambian. Etiqueta de caché: `parfums-catalog`.
- **Admin:** pantalla «Notas» (crear, editar, archivar, fusionar duplicados) y selector con chips en la ficha del producto, con
  creación al vuelo.
- **Pruebas:** pgTAP (RLS pública, nota en uso no se elimina, unicidad), unitarias del mapeo y del relleno, e2e del flujo
  crear nota → asignar → verla en la ficha y en el recomendador.

### 5.2 Bloques de contenido — JSONB tipado (C4–C6, C11)

```sql
content_blocks(id uuid pk, business_unit_id, page_slug text, section_key text,
               block_type text check (block_type in ('hero','carousel','text_banner','faq','gallery')),
               content jsonb not null, display_order int not null default 0, is_visible bool not null default true,
               status text check (status in ('draft','published')) default 'draft',
               publish_from timestamptz, publish_until timestamptz, version int default 1,
               updated_by uuid, created_at, updated_at,
               unique (business_unit_id, page_slug, section_key, display_order))
```
Es el modelo del encargo con cuatro añadidos necesarios: unidad de negocio (Parfums/Import no se mezclan), estado borrador/publicado
(para **previsualizar sin publicar**), ventana de publicación y versión.
- **Registro cerrado en código:** `page_slug` ∈ {`home`, `parfums`, `import`, …} y `section_key` ∈ lista versionada por página (cada
  sección sabe qué `block_type` admite). No se crean secciones nuevas desde el admin, solo se editan las previstas.
- **Validación en dos capas:** un esquema por `block_type` (campos, largos, sin HTML, URLs internas o `https`, alt obligatorio) en
  `domains/admin-content/` y un trigger `app.validate_content_block` en la BD con la misma forma (patrón de `settings`).
- **Lectura pública:** RPC/vista `public_content_blocks(unit, page)` solo `published` y dentro de ventana; `getBlocks(page)` en el
  servidor con `unstable_cache` y etiqueta **`content-blocks`**. Cada componente recibe su respaldo tipado (el texto actual): sin
  filas, o si la BD falla, se ve lo de hoy.
- **Admin:** «Contenido» → lista por página → formulario de cada bloque. **Reordenar con botones subir/bajar** (obligatorio por
  accesibilidad) y, opcional, arrastrar con una librería (dependencia nueva a decidir, p. ej. `@dnd-kit`). **Previsualización:**
  ruta de admin que renderiza la página pública con los borradores (`?preview` solo para admins autenticados, `noindex`).
- **Texto enriquecido (C11):** subconjunto restringido y **sin HTML**: párrafos, negrita, cursiva, listas y enlaces, guardado como
  Markdown limitado o árbol JSON y renderizado por un componente propio (no `dangerouslySetInnerHTML`). El editor es un `textarea`
  con barra mínima; no se agrega un editor WYSIWYG completo salvo decisión expresa.
- **Import (C11–C12):** `page_slug = 'import'`, secciones `conditions`, `faq`, `process`; el contenido actual de
  `import-information.tsx` pasa a ser el respaldo. Quitar «Delivery privado» y añadir Shalom exige antes la decisión de la premisa 5.
- **Pruebas:** unitarias por esquema (válidos, inválidos, XSS), pgTAP del trigger y de RLS (un borrador nunca es público), e2e
  editar → previsualizar → publicar → ver; y e2e del **respaldo** (sin filas el sitio es idéntico).

### 5.3 Carruseles editables — `carousels` y `carousel_items` (C9, C10)

```sql
carousels(key text pk, business_unit_id, speed_px_s int not null default 40 check (speed_px_s between 20 and 60),
          mode text check (mode in ('auto','manual')) default 'auto', updated_by, updated_at)
carousel_items(carousel_key → carousels, product_id → products, display_order int, primary key (carousel_key, product_id))
```
- Claves previstas: `parfums.showcase` (la tira de la home) e `import.preview`; el carrusel de sets sigue siendo «todos los sets
  publicados» (su orden depende de los combos). Los límites 20–60 px/s viven **en la BD (check) y en el esquema**, no solo en el slider.
- **Respaldo:** sin filas en `carousel_items` se usa la lógica actual (`selectShowcaseProducts`: destacados primero y relleno por marca).
  Con filas, **solo** productos publicados, con foto y disponibles (un producto despublicado desaparece solo del carrusel, la fila no se borra).
- **Admin:** por carrusel, búsqueda de productos, agregar/quitar/ordenar (con botones) y un control de velocidad con valor visible
  (no solo un slider) y vista previa. `prefers-reduced-motion` sigue anulando el movimiento, sea cual sea la velocidad.
- Etiqueta de caché: `content-blocks` (editorial) y `parfums-catalog` (el producto cambia aparte).

### 5.4 Frascos enteros y regalo de 2 ml (C7, C8)

- **Frascos (C7):** `/parfums/frascos` reutiliza la capa de consulta del catálogo (`catalog-query`, `loadCatalogPage`) con el
  predicado derivado «tiene variante `bottle` publicada y disponible» (premisa 1) y una proyección de tarjeta con **tamaño y precio del
  frasco**. Hereda la paginación en servidor de T12 (rama `perf/catalog-server-pagination`, aún sin mergear): **depende de ella**. Menú
  «Perfumes enteros», entrada en el pie y el sitemap; la redirección heredada `/perfumes-enteros.html` pasa a `/parfums/frascos`.
  Un frasco con precio sin verificar no se publica. No hay tabla nueva.
- **Regalo (C8):** reglas en la tabla de C14 (`promotion_rules`, tipo `gift_decant`), no en constantes. El cliente elige entre los
  decants árabes de 2 ml elegibles; la **lista de excluidos va por id/slug** (premisa 3). El pedido guarda `gifts_snapshot jsonb`
  (regla, producto elegido, ml) y el servidor **valida** al crear el pedido que el carrito tiene un frasco completo y que el regalo es
  elegible: el cliente no puede forzarlo. No es un producto aparte, no aplica a mayorista ni a Import.
  *Mientras C14 siga bloqueada*, una versión mínima de C8 sin tabla (regla y exclusiones en código con prueba) es posible, pero deja la
  regla fuera del admin: decidir si se acepta ese paso intermedio.

### 5.5 Envíos y reglas comerciales (C12, C14) — **bloqueado por el cliente**

```sql
shipping_agencies(id, method_id → shipping_methods, name, department, province, district, address,
                  coverage text, cost_amount numeric null, verification_status text, is_active, source)
delivery_zones(id, method_id, district_code, restricted bool, note, is_active)
promotion_rules(id, business_unit_id, type text, conditions jsonb, actions jsonb, is_active, valid_from, valid_until,
                excludes jsonb /* canales y productos */, updated_by)
```
- `conditions`/`actions` se validan **por `type`** (esquema tipado + trigger), no son JSON libre.
- **Un módulo puro** (`domains/commerce/rules.ts`) evalúa las reglas: el cliente **previsualiza** y el servidor (RPC de creación del
  pedido) **decide**; el resultado se **congela** en el pedido (como `deposit_policy_snapshot`).
- Orden de precedencia documentado: canal (minorista/mayorista) → elegibilidad de frasco → regalo → envío (agencia/zona) → total.
- **No se implementa hasta tener** las respuestas del cliente (§7): tramos y descuentos mayoristas, zonas y su cobertura, costos o
  «cotizar por WhatsApp», verificación de las 146 agencias, y la regla exacta del regalo. Hoy el pedido no muestra tarifa y la
  cobertura nunca bloquea; eso se conserva.

### 5.6 Revalidación admin → web (C15)

Estado hoy: `revalidateParfumsStorefront()` (`revalidateTag("parfums-catalog", { expire: 0 })`) se llama en las acciones de
productos, categorías, combos, configuración y fotos de Parfums. **Las acciones de Import solo revalidan rutas del admin.** Las
lecturas públicas de Import (catálogo, producto) no están en caché, así que ya reflejan el cambio en la siguiente petición; la
excepción es **`readImportGate`** (el estado del selector de `/`, caché de 60 s **sin etiqueta**): tarda hasta 60 s en reflejar un
cambio de campaña.
- **Etiquetas:** `parfums-catalog` (ya existe), **`import-campaign`** (nueva: la lee `readImportGate` y cualquier lectura cacheada de la
  campaña) y **`content-blocks`** (nueva: bloques, carruseles, notas visibles por contenido).
- **Regla:** cada Server Action de admin que cambie algo público llama a un único helper por etiqueta
  (`revalidateImportCampaign()`, `revalidateContentBlocks()`), igual que el actual; `updateTag` solo donde la persona que guarda
  deba **ver su propio cambio** de inmediato en la misma respuesta.
- **Verificación (<5 s):** una prueba e2e por etiqueta que guarda en el admin y sondea la página pública hasta ver el cambio con
  límite de 5 s; más un lint/prueba unitaria que **falla si una acción de admin que escribe en tablas públicas no llama al helper**.

## 6. Decisiones de plataforma (aprobadas 2026-10-14)

| Tema | Decisión | Estado |
|---|---|---|
| Validación | **Zod** | instalado (rama `feat/rich-text-zod`, `zod ^4.6.7`) |
| Reordenar | **Botones subir/bajar**, sin arrastrar y soltar | sin dependencia nueva |
| Texto editable | **Markdown restringido**, sin editor enriquecido ni HTML crudo | parser y esquemas hechos (`docs/rich-text.md`) |
| Imágenes | **Cloudinary** (ya en uso), con un preset por tipo de imagen | contrato definido abajo; presets sin crear en la cuenta |
| Caché | **Etiqueta + TTL de 5 min como respaldo** | `import-campaign` hecha (`docs/cache-revalidation.md`); `content-blocks` se crea con el sistema de bloques |

Ningún editor se implementa todavía: esto fija las bases para cuando se construyan.

### 6.1 Por qué Zod sí

- **Una sola definición por forma de dato.** Cada tipo de bloque (hero, carrusel, banner de texto, FAQ, galería) necesita validarse en el formulario del
  admin, en la Server Action y en la lectura pública (para no pintar un bloque corrupto). Con funciones a mano eso son tres copias que se desvían;
  con Zod es un esquema del que sale el tipo de TypeScript (`z.infer`) y los mensajes de error.
- **Hay entradas hostiles de verdad**: texto libre y URLs que acaban en una página pública. El esquema es el lugar donde se rechazan (HTML,
  imágenes, esquemas de URL distintos de `https`, largos), con casos de prueba.
- **Coste cero en el navegador.** Medido con el mismo script antes y después (`docs/perf/zod-bundle/`): **0 bytes** en el total del JS de cliente
  (1 293.5 KB crudo / 407.1 KB gzip, 68 archivos) y **0 de las 68 rutas** cambian su JS de primera carga, porque Zod solo se usa en el servidor.
  Importarlo en un componente de cliente costaría **82.7 KB minificados (23.0 KB gzip)** con la build completa o 13.2 KB (4.6 KB gzip) con `zod/mini`;
  por eso `lib/rich-text/schema.ts` importa `server-only` y esa regresión rompería el build.
- `npm audit --omit=dev`: 0 vulnerabilidades.
- **Alcance:** se adopta para el contenido editable nuevo. Los esquemas existentes del admin (productos, categorías…) **no se migran**: funcionan,
  están probados y migrarlos no aporta nada al cliente.

### 6.2 Por qué DnD no (botones subir/bajar)

- **Accesibilidad:** arrastrar y soltar exige un puntero; WCAG 2.2 (criterio 2.5.7, «Movimientos de arrastre») obliga a ofrecer una alternativa de un solo
  puntero. Los botones **son** esa alternativa, así que hay que construirlos igual; el arrastre solo sería un extra.
- **Peso y riesgo:** una librería de arrastre (p. ej. `@dnd-kit`) suma dependencias y código de cliente para una lista de 5–20 elementos que se reordena
  de vez en cuando; y en pantallas táctiles el arrastre dentro de una página con scroll es frágil.
- **Auditable:** «subir/bajar» es una operación con un resultado exacto (intercambiar dos `display_order` en una RPC con `expected_updated_at`), fácil de
  probar, de revertir y de registrar en `audit_log`.
- Si algún día la lista creciera hasta hacerlo incómodo, se reevalúa con una necesidad real y manteniendo los botones.

### 6.3 Por qué Markdown restringido (no Tiptap ni HTML)

- **Seguridad:** un editor WYSIWYG guarda **HTML**, y HTML publicado en una página pública bajo nuestra CSP es la superficie de XSS más común; obliga a un
  sanitizador cuyos fallos históricos son frecuentes. El subconjunto Markdown **no genera HTML**: se parsea a un árbol y se renderiza con elementos de
  React (que escapan el texto); el único atributo con datos del autor es un `https` validado.
- **Marca:** el cliente no puede romper la tipografía ni los colores del sistema de diseño; el componente `RichText` pone las clases (y el tono claro/oscuro).
- **Peso:** un editor enriquecido son cientos de KB de JavaScript de cliente solo en el admin, más sus extensiones y su accesibilidad propia.
- **Suficiente para el uso:** FAQ, condiciones y avisos necesitan párrafos, negrita, cursiva, listas y enlaces. Nada más. Lo que no está permitido se
  ve como texto literal (no se pierde ni se ejecuta), y lo peligroso se **rechaza con un mensaje** en el formulario.
- Detalle, casos maliciosos probados y límites (título ≤ 80, cuerpo ≤ 2000): `docs/rich-text.md`.

### 6.4 Preset de Cloudinary por tipo de imagen

Hoy: subida **firmada** (la firma la genera el servidor; el secreto no sale de `lib/media/cloudinary.ts`), carpeta `cruzial/{unidad}/products/{id}`,
formatos `jpg/jpeg/png/webp`, máximo 10 MB, y las imágenes se sirven por `next/image` (`res.cloudinary.com` en `remotePatterns`), que redimensiona y
convierte. Para el contenido editable se mantiene ese mecanismo y se añade **un preset por tipo**, que fija carpeta, límites y la transformación de
entrada (tope de tamaño y calidad automática); la **proporción** la valida el servidor con las dimensiones que devuelve Cloudinary.

| Tipo de imagen | Carpeta | Proporción | Mínimo | Máx. peso | Transformación de entrada | Alt |
|---|---|---|---|---|---|---|
| Héroe / banner ancho | `cruzial/{unidad}/content/hero` | 16:9 – 21:9 | 1920 px de ancho | 3 MB | `c_limit,w_2560,q_auto:good` | obligatorio |
| Puerta del selector / tarjeta destacada | `cruzial/{unidad}/content/card` | 4:5 | 1200 × 1500 | 2 MB | `c_limit,w_1600,q_auto:good` | obligatorio |
| Carrusel / galería | `cruzial/{unidad}/content/gallery` | 4:5 o 1:1 | 1200 px | 2 MB | `c_limit,w_1600,q_auto:good` | obligatorio |
| Icono de nota / aroma | `cruzial/{unidad}/content/notes` | 1:1 | 400 × 400 | 300 KB | `c_limit,w_800,q_auto` | obligatorio |
| Imagen social (OG) | `cruzial/{unidad}/content/og` | 1.91:1 (1200 × 630) | 1200 × 630 | 1 MB | `c_fill,w_1200,h_630,q_auto` | — |
| Foto de producto *(ya existe)* | `cruzial/{unidad}/products/{id}` | libre (estudio sobre blanco) | — | 10 MB | sin cambios | obligatorio |

Reglas comunes: **nunca** se retoca ni se recorta el arte de marca (el recorte solo existe en la entrega por `object-position`, no en el archivo);
`f_auto` lo resuelve `next/image` (no se duplica la conversión); el logo oficial **no** pasa por ningún preset. **No se creó ningún preset en la
cuenta de Cloudinary** (requiere acceso a la cuenta, que está fuera de esta sesión): este cuadro es el contrato para crearlos y para validar la subida
en el servidor.

### 6.5 Política de caché (etiqueta + TTL)

1. **Cada lectura pública cacheada lleva una etiqueta y un TTL de respaldo.** La etiqueta es la invalidación principal; el TTL cubre cambios hechos fuera del admin.
2. **Cada acción de admin que cambia algo público expira la etiqueta** con un helper (`revalidateTag(tag, { expire: 0 })`), después de comprobar que la mutación salió bien;
   una prueba estructural falla si una acción nueva olvida la llamada.
3. **Etiquetas:** `parfums-catalog` (TTL 60 s: lo tocan también pedidos y cargas por SQL), `import-campaign` (TTL **300 s**, hecha), `content-blocks` (TTL **300 s**, se crea con los bloques).
4. **Objetivo:** un cambio guardado en el admin se ve en la web **en menos de 5 s**, verificado con una prueba e2e por etiqueta (la de `import-campaign` ya existe y tiene control negativo).
5. Todo en `docs/cache-revalidation.md`.

## 7. Resoluciones del 2026-10-14 (los 3 conflictos) y decisiones del cliente

### 7.0 Resoluciones

La auditoría dejó tres conflictos entre los encargos. El dueño los resolvió así; lo que sigue es la regla vigente y reemplaza lo que §5 y §7.1–7.3 dicen en contra.

**1. Zonas del motorizado (C14).** Cobertura **OK** = Centro de Lima + Ate + Villa El Salvador (VES) + Carabayllo + **los distritos intermedios**. Todo lo demás se marca
`is_restricted = true`. Un solo conjunto de distritos, no dos listas. La lista de los 43 distritos de Lima Metropolitana la **propone** el desarrollo en `docs/commercial-rules.md` y el dueño
la **valida antes de aplicarla**: la migración crea la tabla y **no** carga los distritos hasta esa validación.

**2. Bloqueo de pedidos (C14): nunca.** Una zona restringida **solo deshabilita la opción motorizado**. Shalom (todo el Perú, cotización por WhatsApp) **siempre** está disponible y el pedido
**siempre** se puede completar. Esto mantiene la regla vigente («la cobertura nunca bloquea») y descarta cualquier error de validación que impida confirmar un pedido por el distrito.

**3. Acceso a `/import` (C11–C13): sin redirecciones.**

| Visitante | Ve | No ve |
|---|---|---|
| No-admin, campaña no abierta (Próximamente / Cerrado) | Hero con estado y fechas, «Cómo funciona», «Condiciones» | Catálogo (`/import/catalogo`), botón de añadir al carrito, «Explorar vista previa» |
| Dueño / admin | Todo, siempre | — |
| Cualquiera, campaña abierta | Todo (sin cambios) | — |

Se interpreta que el bloqueo aplica cuando la campaña **no** está abierta (el encargo original decía «bloqueado para no-admin cuando cerrado»); con campaña abierta Import sigue siendo público.
Esto **sustituye** la vista previa pública de «Próximamente» por el hero + secciones informativas; ningún `redirect()`. Pendiente de implementar en su propio PR (no está en este).

**4. «Ningún editor todavía».** Esa instrucción era de la fase 1 (auditoría) y **terminó**. Los editores se implementan en orden (§8), cada uno en su propio PR.
**5. Tramos mayoristas.** 40 unidades mixtas, descuento por tipo (S/5 · S/7 · S/10); tramos > 40 = **T28**. Ver `docs/wholesale-tiers.md` §7.
**6. Versión vigente del encargo:** la lista de **22 puntos**; no hay dos versiones.

### 7.1 Decisiones del cliente que siguen abiertas

1. **C14:** tramos y descuentos mayoristas (y dónde viven: Parfums o Import), zonas de Lima con cobertura restringida, si habrá tarifa
   publicada o solo cotización por WhatsApp, quién verifica las agencias Shalom y cómo.
2. **C8:** ¿elige el cliente el perfume o la tienda?; un regalo por frasco o por pedido; vigencia; confirmar la exclusión de «Club de Nuit
   Precieux I» y de cualquier otro.
3. **C12:** confirmación expresa de **Shalom todo el Perú en Import** (revierte la regla vigente) y qué pasa con «delivery privado»
   (¿se retira de checkout y términos también?).
4. **C13:** aprobar volver a mostrar estado, fechas y condiciones en el hero de Import; confirmar «8 a 15 días hábiles» y «desde 1
   unidad» y si cambian por campaña (en tal caso son campos de `campaigns`).
5. **C1–C3:** ¿pirámide olfativa (salida/corazón/fondo) o lista plana? ¿hay imágenes de notas (el modelo admite `image_url`)?
6. **C4–C6:** qué bloques quiere editar primero y si necesita programar su publicación.

## 8. Orden de implementación sugerido y dependencias

| Fase | Capacidades | Depende de | Tamaño |
|---|---|---|---|
| 0 | T12: catálogo en servidor (rama `perf/catalog-server-pagination`) | revisión | hecho, sin mergear |
| 1 | C15 (helpers de etiquetas, `import-campaign`, prueba que exige revalidar) | — | S |
| 2 | C1–C3 (notas) | decisión 5 | M |
| 3 | C4–C6 (motor de bloques + 1.ª sección: puertas del selector y textos de la home) | decisión 6, §6 | M–L |
| 4 | C9–C10 (carruseles) | fase 3 (biblioteca de medios) | M |
| 5 | C7 (frascos) | fase 0 | M |
| 6 | C11, C13 (Import: condiciones, FAQ, hero) | fase 3 y decisiones 3–4 | M |
| 7 | C8, C12, C14 (regalo, Shalom Import, reglas) | resueltas el 2026-10-14 (§7.0); quedan T28 y la validación de la lista de distritos | M–L |

## 9. Riesgos

- **Deriva visual** por contenido libre: acotada por registro cerrado de secciones, esquemas por tipo y presets claro/oscuro.
- **Rendimiento:** una sola lectura cacheada por página para todos los bloques; ningún bloque agrega payload por producto (lección de T12).
- **Datos comerciales no confirmados** (tiempos, mínimos, zonas): el modelo los hace editables, pero **publicarlos es del cliente**.
- **Migraciones en Producción:** todas son aditivas, con relleno idempotente y reversa en `supabase/rollback/`; se aplican por el proceso con precheck del dueño.
- **Revertir la regla «Import no usa Shalom»** toca términos legales y checkout: requiere revisión legal del cliente.
