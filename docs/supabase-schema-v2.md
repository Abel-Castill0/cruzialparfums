# Cruzial Platform V2 — Propuesta de schema Supabase

Estado: diseño de Fase 0. No es una migración ejecutable ni crea reglas comerciales.

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

### `products`

`id`, `business_unit_id`, `category_id`, `legacy_id`, `slug`, `name`, `brand`,
`short_description`, `description`, `sales_mode`, `publication_status`,
`lifecycle_status`, `specs jsonb`, timestamps, `archived_at`.

`sales_mode`: `campaign | always_available | catalog_only`.
`lifecycle_status`: `active | out_of_stock | discontinued | archived`.

### `product_variants`

`id`, `product_id`, `sku`, `name`, `option_values jsonb`, `price_amount`, `currency`,
`publication_status`, `sort_order`, timestamps, `archived_at`.

Los tamaños 3/5/10 ml y el frasco completo se modelan como variantes; no como columnas.

### `inventory`

`id`, `product_variant_id`, `track_quantity`, `quantity_on_hand`, `availability_status`,
`updated_by`, `updated_at`.

Permite stock booleano sin inventar cantidades. Reservas/backorders quedan fuera hasta
confirmar el flujo de órdenes.

### `product_media`

`id`, `product_id`, `variant_id nullable`, `provider`, `public_id`, `secure_url`,
`width`, `height`, `bytes`, `format`, `alt`, `sort_order`, `is_primary`, metadata,
timestamps, `archived_at`.

### `combos` y `combo_items`

- `combos`: `id`, `product_id` (producto vendible del combo), configuración y timestamps.
- `combo_items`: `combo_id`, `product_variant_id`, `quantity`, `sort_order`.

No sembrar contenido de combos hasta confirmarlo. El builder personalizado es un tipo de
línea/pedido, no necesariamente un combo publicado.

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

## Pedidos y snapshots

### `orders`

`id`, `order_number`, `business_unit_id`, `campaign_id nullable`, `channel`, `status`,
`customer_snapshot jsonb`, `delivery_snapshot jsonb`, `subtotal_amount`, `currency`,
`notes`, timestamps, `archived_at`.

Los campos/retención de PII y estados finales de pedido requieren decisión del cliente.

### `order_items`

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

### `site_settings`

`id`, `business_unit_id nullable`, `key`, `value jsonb`, `is_public`, timestamps,
`updated_by`. Unique `(business_unit_id, key)`.

Claves iniciales previstas: WhatsApp por unidad, templates por flujo, campaña destacada,
contacto y banderas operativas. Valores sensibles no pertenecen aquí.

### `admin_profiles`

`user_id` FK a `auth.users`, `display_name`, `role`, `is_active`, timestamps.
V1 admite solo administradores. El primer usuario se provisiona fuera del navegador
público mediante un procedimiento seguro y luego queda auditado.

### `audit_logs`

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
- Check de dinero no negativo y cantidad de línea mayor que cero.
- Índices en publicación/categoría, `sales_mode`, campaña/status/fechas, order number,
  audit entity+fecha y búsquedas normalizadas.
- FK restrictiva desde order items cuando borrar rompería trazabilidad; el flujo normal
  archiva productos.
- Trigger o función transaccional para `updated_at` y audit de operaciones críticas.

## Matriz RLS propuesta

| Recurso | `anon` | admin autenticado |
| --- | --- | --- |
| Unidades/categorías/productos/variantes/media | SELECT solo público | CRUD autorizado |
| Campañas/campaign products | SELECT solo visible públicamente | CRUD + transiciones |
| Settings | SELECT solo `is_public` | CRUD autorizado |
| Orders/order items | Sin acceso directo | Acceso autorizado |
| Waitlist | Sin SELECT/INSERT directo | Acceso autorizado |
| Admin profiles/audit/import staging | Sin acceso | Acceso autorizado según función |

La inscripción a waitlist entra por Route Handler con validación y rate limit. RLS se
habilita en toda tabla del schema expuesto; grants y policies se prueban por separado.
Una función `is_admin(auth.uid())`/claim validado centraliza la política sin confiar en
metadata editable por el usuario. Views públicas deben usar `security_invoker` o una
alternativa que conserve RLS.

## Gates de Fase 3

1. `supabase db reset` reconstruye todo desde cero.
2. Tipos TypeScript regenerados sin diff pendiente.
3. Tests SQL demuestran: anon solo ve publicado; anon no muta; admin autorizado muta;
   usuario autenticado no-admin no accede al admin.
4. No hay `service_role` ni secretos en bundle cliente.
5. Order snapshot no cambia al modificar producto/variante/campaña.
6. Archivar un producto con pedidos conserva la historia.
