# Cruzial Platform V2 — Propuesta de schema Supabase

Estado: diseño de Fase 2.5. No es una migración ejecutable ni crea reglas comerciales.

## Estado de implementación

- **IMPLEMENTED (runtime, no DB):** adapter legacy de catálogo, separación de
  settings Parfums/Import y contrato editorial temporal
  `isFeatured/featuredRank/featuredFrom/featuredUntil`.
- **PROPOSED (DB):** todas las tablas y políticas descritas debajo. No existe
  todavía `supabase/` ni una migration, por lo que ninguna tabla se declara
  implementada.
- **UNKNOWN:** valores o reglas que dependen de decisión del cliente, incluidos
  alcance mayorista, estados finales de pedido, retención de PII, automatización
  de campañas y operación de waitlist. Un `UNKNOWN` no se convierte en constraint
  ni seed comercial.

Inventario mínimo **PROPOSED**: `business_units`, `products`,
`product_variants`, `categories`, `product_categories`, `product_media`,
`inventory`, `promotions`, `combos`, `combo_items`, `wholesale_policies`, `campaigns`,
`campaign_products`, `customers`, `orders`, `order_lines`, `shipping_methods`,
`deposit_policies`, `settings`, `admin_memberships`, `audit_log` y `waitlist`.

## Convenciones

- PK UUID; `created_at`/`updated_at` como `timestamptz`.
- Dinero como `numeric(12,2)` + `currency char(3)`, nunca float.
- Slug único dentro de su unidad/categoría según contexto.
- Estados limitados por enum o check cuando ya están confirmados.
- `archived_at` para borrado seguro; referencias históricas usan `restrict` o `set null`.
- JSONB solo para specs variables y snapshots, con validación por categoría/aplicación.
- Campos públicos y privados no se mezclan en vistas inseguras.

## Tablas núcleo

### `business_units`

`id`, `code` (`parfums|import`), `name`, `is_active`, timestamps.

### `categories`

`id`, `business_unit_id`, `parent_id`, `slug`, `name`, `description`,
`spec_schema jsonb`, `publication_status`, `sort_order`, timestamps, `archived_at`.

Una jerarquía permite relojes y futuras categorías sin nuevas tablas. `spec_schema`
describe claves admitidas; no convierte atributos no confirmados en contenido.

### `product_categories`

`product_id`, `category_id`, `sort_order`. PK compuesta `(product_id, category_id)`.

Un producto conserva una categoría primaria en `products.category_id` para
navegación/breadcrumb, pero puede aparecer en categorías adicionales (p. ej. una
fragancia Árabe incluida también en una colección temática) sin duplicar el
registro de producto. Tabla vacía hasta que exista un caso real de doble
categorización — no se siembra contenido de ejemplo.

### `products`

`id`, `business_unit_id`, `category_id`, `legacy_id`, `slug`, `name`, `brand`,
`short_description`, `description`, `sales_mode`, `publication_status`,
`production_status`, `is_featured`, `featured_rank nullable`,
`featured_from nullable`, `featured_until nullable`, `specs jsonb`, timestamps,
`archived_at`.

`sales_mode`: `campaign | always_available | catalog_only`.
`production_status`: `active | discontinued`. No representa stock ni visibilidad.
`publication_status`: `draft | published | hidden`; `hidden` retira un producto de
superficies públicas sin borrarlo. `is_featured` es curación editorial, no una
afirmación de ventas. `featured_rank` ordena el rail y la ventana opcional
`featured_from`/`featured_until` permite activarlo sin una lista permanente.

### `product_variants`

`id`, `product_id`, `sku`, `name`, `option_values jsonb`, `price_amount`, `currency`,
`publication_status`, `sort_order`, timestamps, `archived_at`.

Los tamaños 3/5/10 ml y el frasco completo se modelan como variantes; no como columnas.

### `variant_price_tiers`

`id`, `variant_id`, `min_quantity`, `price_amount`, `currency`, `context`, timestamps,
`archived_at`.

El mayorista usa tramos flexibles por variante. `context` distingue, por ejemplo,
`retail` y `wholesale`; no se crean columnas rígidas `price_4`/`price_10` ni equivalentes.

### `wholesale_policies`

`id`, `business_unit_id`, `name`, `scope` (`per_product | per_order | unconfirmed`),
`min_quantity nullable`, `min_amount nullable`, `currency`, `is_active`, `notes`,
timestamps, `archived_at`.

Separa la **regla** de elegibilidad mayorista (a qué aplica el tramo: por producto,
por total de pedido, u otro criterio) del **precio** resultante, que sigue viviendo
en `variant_price_tiers` con `context = 'wholesale'`. `scope` se crea con el valor
`unconfirmed` porque `wholesaleThresholdScope` está registrado como `UNKNOWN` en
`docs/client-decisions.md` — no se fija `per_product` ni `per_order` sin confirmación
del cliente; el enum ya prevé el valor final para evitar una migración de tipo después.

### `inventory`

`id`, `product_variant_id`, `inventory_mode`, `quantity_on_hand nullable`,
`availability_status`, `updated_by`, `updated_at`.

`availability_status`: `available | out_of_stock`.
`inventory_mode`: `status_only | tracked_quantity`. No se decide aún cuál usa la
operación; `status_only` permite migrar el estado visible sin inventar cantidades.
Reservas, oversell y backorders quedan fuera hasta confirmar el flujo de órdenes.
Disponibilidad, producción y publicación son ejes independientes: un producto
`discontinued` puede seguir `available`, y `hidden` no significa agotado.

### `product_media`

`id`, `product_id`, `variant_id nullable`, `provider`, `public_id`, `secure_url`,
`width`, `height`, `bytes`, `format`, `alt`, `sort_order`, `is_primary`, metadata,
timestamps, `archived_at`.

### `combos` y `combo_items`

- `combos`: `id`, `product_id` (producto vendible del combo), configuración y timestamps.
- `combo_items`: `combo_id`, `product_variant_id`, `quantity`, `sort_order`.

No sembrar contenido de combos hasta confirmarlo. El builder personalizado es un tipo de
línea/pedido, no necesariamente un combo publicado.

## Promociones candidatas

### `promotions`, `promotion_rules` y `promotion_rewards`

Se reservan como modelo candidato para promociones auditables: cabecera/ventana de la
promoción, condiciones y recompensas. No se implementa un motor complejo ni se fijan
reglas comerciales durante paridad; cualquier migración requiere reconfirmación.

## Campañas

### `campaigns`

`id`, `business_unit_id`, `number`, `name`, `opens_at`, `closes_at`, `status`,
`public_message`, timestamps, `archived_at`.

Estados: `draft | scheduled | open | paused | closed | fulfilled`.
Índice único sugerido: `(business_unit_id, number)`. No imponer una sola campaña abierta
hasta confirmar esa regla.

### `campaign_products`

`id`, `campaign_id`, `product_id`, `product_variant_id nullable`, `price_amount`,
`currency`, `availability_status`, `quantity_limit nullable`, `sort_order`, timestamps.

El precio y disponibilidad pertenecen a la campaña. Cerrar una campaña no actualiza esta
tabla destructivamente ni toca pedidos.

## Clientes, envío y adelanto

### `customers`

`id`, `business_unit_id`, `full_name`, `phone`, `email nullable`, `document_id nullable`,
`verified_customer_status` (`pending_verification | new | returning`), `verified_by nullable`,
`verified_at nullable`, timestamps, `archived_at`.

Un cliente es independiente por unidad de negocio (misma persona en Parfums e Import son
dos filas, igual que carrito/catálogo no se comparten). `verified_customer_status` es el
estado que administra el negocio con el tiempo — arranca en `pending_verification` y solo
un admin lo mueve a `new`/`returning` con evidencia real de compras previas; nunca lo
decide el propio cliente. Esta tabla existe porque el estado debe persistir entre pedidos
para calcular el adelanto (§ `deposit_policies`), algo que un snapshot inmutable por pedido
no puede resolver por sí solo.

### `deposit_policies`

`id`, `business_unit_id`, `customer_status` (`new | returning`), `deposit_percentage
numeric(5,2)`, `effective_from`, `effective_until nullable`, `source`
(`CLIENT_CONFIRMED | UNKNOWN`), timestamps.

Fila **CLIENT_CONFIRMED** prevista para Import: `new` → 50%, `returning` → 70% (confirmado
por el cliente, ver `docs/client-decisions.md`). El porcentaje vive en datos, no en código
repetido — evita hardcodear "50%"/"70%" en cada punto del checkout, igual que
`PARFUMS_SETTINGS`/`IMPORT_SETTINGS` centralizan WhatsApp/correo.

### `shipping_methods`

`id`, `business_unit_id`, `code`, `name`, `is_active`, `notes`, timestamps.

Fila Parfums: `shalom` (agencia + motorizado/contraentrega en Lima). Fila Import:
`private_delivery`. No existe ni se crea una fila `olva`. Cada unidad de negocio tiene su
propio método — no se comparte configuración de envío entre Parfums e Import.

## Pedidos y snapshots

### `orders`

`id`, `order_number`, `business_unit_id`, `campaign_id nullable`, `customer_id nullable`,
`channel`, `status`, `customer_snapshot jsonb`, `delivery_snapshot jsonb`,
`shipping_method_id nullable`, `claimed_customer_status` (`new | returning`,
autodeclarado por el cliente en el checkout — no confiable por sí solo),
`verified_customer_status_snapshot` (copia de `customers.verified_customer_status` al
momento del pedido), `deposit_policy_snapshot jsonb` (copia inmutable de la fila de
`deposit_policies` aplicada: porcentaje, id de política, vigencia), `subtotal_amount`,
`currency`, `notes`, timestamps, `archived_at`.

`status` incluye `pending_whatsapp_confirmation` como estado inicial tras crear el
borrador — nunca se declara "pedido confirmado" solo por generar el mensaje de WhatsApp.
Los campos/retención de PII y estados finales de pedido más allá de esto requieren
decisión del cliente. Los snapshots (`customer_snapshot`, `delivery_snapshot`,
`verified_customer_status_snapshot`, `deposit_policy_snapshot`) son la fuente de verdad
del pedido una vez confirmado — no se recalculan si `customers`/`deposit_policies` cambian
después.

### `order_lines`

`id`, `order_id`, `product_id nullable`, `product_variant_id nullable`,
`campaign_product_id nullable`, `product_name_snapshot`, `variant_snapshot jsonb`,
`unit_price_amount`, `currency`, `campaign_snapshot jsonb nullable`, `quantity`,
`line_total_amount`, timestamps.

Los snapshots son obligatorios e inmutables después de confirmar el pedido. Los FKs son
trazabilidad, no fuente para reescribir la historia.

## Operación

### `waitlist`

`id`, `business_unit_id`, `campaign_id nullable`, `product_id nullable`, `email nullable`,
`phone nullable`, `consent_snapshot jsonb`, `status`, timestamps.

Campos requeridos, consentimiento, doble opt-in y retención están pendientes.

### `settings`

`id`, `business_unit_id`, `key`, `value jsonb`, `is_public`, timestamps,
`updated_by`. Unique `(business_unit_id, key)`.

Claves iniciales previstas: WhatsApp por unidad, templates por flujo, campaña destacada,
contacto y banderas operativas. Cada fila pertenece a una unidad: no hay fallback
comercial global que pueda mezclar Parfums e Import. Valores sensibles no pertenecen aquí.

### `admin_memberships`

`id`, `user_id` FK a `auth.users`, `business_unit_id`, `role`, `is_active`, timestamps.
Unique `(user_id, business_unit_id)`.

Un mismo login autentica una vez; después `/admin` pregunta qué negocio administrar
(Parfums, Import, o ambos si tiene más de una fila) — no son dos sistemas de auth
separados. El rol puede diferir por unidad (p. ej. admin completo en Parfums, solo
lectura en Import) sin necesitar cuentas distintas. El primer usuario se provisiona
fuera del navegador público mediante un procedimiento seguro y luego queda auditado; su
email inicial viene de variable de entorno/config, no hardcodeado en el código fuente.

### `audit_log`

`id`, `actor_user_id`, `action`, `entity_type`, `entity_id`, `before jsonb`,
`after jsonb`, `request_id`, `created_at`.

Append-only para la aplicación. Precio, stock, visibilidad y campaña siempre generan log.

### `catalog_imports` y `catalog_import_rows` (Fase 8)

- Job: archivo, checksum, unidad, estado, actor, contadores y timestamps.
- Row: número de fila, match key, clasificación `old|new|created|unmatched|invalid`,
  `before`, `after`, errores y estado de aplicación.

El CSV se parsea a staging. El admin revisa el diff antes de ejecutar una transacción.
No se actualiza catálogo directamente desde el upload.

## Índices y constraints mínimos

- Unicidad de `business_units.code`, SKU no nulo, slugs por contexto y número de campaña.
- Unicidad de `deposit_policies(business_unit_id, customer_status, effective_from)`,
  `shipping_methods(business_unit_id, code)`, `settings(business_unit_id, key)` y
  `admin_memberships(user_id, business_unit_id)`.
- Check de dinero no negativo, cantidad de línea mayor que cero y
  `deposit_percentage` entre 0 y 100.
- Check de ventana editorial: `featured_until` es posterior a `featured_from`
  cuando ambas existen; índice parcial por unidad/rank para productos publicados
  con `is_featured = true`.
- Índices en publicación/categoría, `sales_mode`, campaña/status/fechas, order number,
  `orders(customer_id)`, `customers(business_unit_id, phone)`, audit entity+fecha y
  búsquedas normalizadas.
- FK restrictiva desde `order_lines` cuando borrar rompería trazabilidad; el flujo normal
  archiva productos. `orders.customer_id` usa `set null` — el snapshot ya conserva los
  datos del cliente al momento del pedido, así que borrar/archivar un cliente no rompe
  pedidos históricos.
- Trigger o función transaccional para `updated_at` y audit de operaciones críticas.

## Matriz RLS propuesta

| Recurso | `anon` | admin autenticado |
| --- | --- | --- |
| Unidades/categorías/product_categories/productos/variantes/media | SELECT solo público | CRUD autorizado |
| Campañas/campaign products | SELECT solo visible públicamente | CRUD + transiciones |
| Wholesale policies/price tiers | SELECT solo público (mayorista) | CRUD autorizado |
| Shipping methods | SELECT solo `is_active` | CRUD autorizado |
| Deposit policies | Sin acceso directo; resolución server-side | CRUD autorizado |
| Settings | SELECT solo `is_public` | CRUD autorizado |
| Customers | Sin acceso directo | Acceso autorizado por unidad |
| Orders/order lines | Sin acceso directo | Acceso autorizado por unidad |
| Waitlist | Sin SELECT/INSERT directo | Acceso autorizado |
| Admin memberships/audit log/import staging | Sin acceso | Acceso autorizado según función |

La inscripción a waitlist entra por Route Handler con validación y rate limit. RLS se
habilita en toda tabla del schema expuesto; grants y policies se prueban por separado.
Con `admin_memberships` ahora scoped por `business_unit_id`, la política pasa a ser
`is_admin_for(auth.uid(), business_unit_id)` — un admin autorizado en Parfums no debe
poder mutar filas de Import solo por estar autenticado, y viceversa. Ninguna policy
confía en metadata editable por el usuario. Views públicas deben usar `security_invoker`
o una alternativa que conserve RLS.

## Gates de Fase 3

1. `supabase db reset` reconstruye todo desde cero.
2. Tipos TypeScript regenerados sin diff pendiente.
3. Tests SQL demuestran: anon solo ve publicado; anon no muta; admin autorizado muta;
   usuario autenticado no-admin no accede al admin.
4. No hay `service_role` ni secretos en bundle cliente.
5. Order snapshot no cambia al modificar producto/variante/campaña.
6. Archivar un producto con pedidos conserva la historia.
7. Un admin con `admin_memberships` solo en Parfums no puede leer ni mutar filas de
   Import (y viceversa), verificado con un test RLS explícito por unidad.
8. `claimed_customer_status` de un pedido nunca sustituye a
   `verified_customer_status_snapshot` para calcular el adelanto aplicado — el cálculo
   real usa siempre el snapshot verificado, nunca el valor autodeclarado por el cliente.
9. Cambiar `customers.verified_customer_status` o `deposit_policies` después de un pedido
   no altera `orders.deposit_policy_snapshot` de pedidos ya creados.
