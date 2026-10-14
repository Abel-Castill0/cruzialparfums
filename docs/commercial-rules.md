# Reglas comerciales: zonas, agencias, regalo y mayorista (2026-10-14)

Implementa las decisiones del dueño del 2026-10-14 (ver `docs/content-editor-architecture.md` §7.0 y `docs/wholesale-tiers.md` §7).
Migración: `supabase/migrations/20261014120000_commercial_rules.sql`. Reversa: `supabase/rollback/20261014_commercial_rules_rollback.sql`.

## 1. Decisiones del dueño que se implementan

| # | Decisión | Dónde queda |
|---|---|---|
| 1 | Motorizado: Centro de Lima + Ate + Villa El Salvador + Carabayllo + distritos intermedios = cobertura; el resto `is_restricted = true`. La lista de los 43 distritos la propone el desarrollo y **el dueño la valida antes de aplicarla** | `delivery_zones` (vacía hasta la validación) y §4 |
| 2 | **Nunca se bloquea un pedido.** Una zona restringida solo desactiva la opción motorizado; Shalom siempre está disponible | checkout + validador del servidor |
| 3 | Shalom: cobertura «Todo Perú», descripción «Cotización por WhatsApp» | `shipping_agencies` (la migración la carga) |
| 4 | Regalo de 2 ml: solo con frasco entero, de un perfume árabe, excluyendo «Club de Nuit Precieux I» **por id** | `promotion_rules` (`gift_exclusion`), `orders.gift_product_id` |
| 5 | Mayorista: 40 unidades mixtas, descuento por tipo S/5 árabe · S/7 diseñador · S/10 nicho. Sin tramos > 40 (T28) | `promotion_rules` (`wholesale_mixed`), función `calculate_mixed_wholesale_quote` |
| 6 | Costo de envío editable en el pedido | `orders.shipping_cost_cents` |

## 2. Modelo de datos

Las tres tablas llevan `business_unit_id` (aislamiento por unidad, como el resto del esquema), `created_at`/`updated_at` y RLS activa.

| Tabla | Columnas clave | Lectura | Escritura |
|---|---|---|---|
| `shipping_agencies` | `name` (único por unidad, sin distinguir mayúsculas), `coverage`, `description`, `is_active` | pública si `is_active`; staff de la unidad | solo `admin_save_shipping_agency` / `admin_delete_shipping_agency` |
| `delivery_zones` | `district` (único por unidad, sin distinguir mayúsculas), `is_restricted` | pública | solo `admin_save_delivery_zone` / `admin_delete_delivery_zone` |
| `promotion_rules` | `rule_type` (`gift_exclusion` \| `wholesale_mixed`, **una regla por tipo y unidad**), `conditions` JSONB, `actions` JSONB, `is_active` | staff de la unidad | solo `admin_save_promotion_rule` / `admin_delete_promotion_rule` |
| `orders` (columnas nuevas) | `shipping_cost_cents` (entero ≥ 0, nulo = sin cotizar), `gift_product_id` (FK a `products`, `on delete set null`) | las que ya tenía | `admin_parfums_set_order_shipping_cost`, `attach_parfums_order_gift` |

Ninguna tabla tiene permiso de escritura directa: todo pasa por funciones `SECURITY DEFINER` con `search_path` vacío, verificación explícita de administrador (`app.assert_admin_for`), control de concurrencia (`expected_updated_at` → `40001`) y registro en `audit_log`
(crear = `create`, editar = `update`, borrar = `settings_change`; no se amplió `audit_log_action_check`, otras ramas la tocan).

**Forma de las reglas** (un trigger `app.validate_promotion_rule` rechaza cualquier otra):

| `rule_type` | `conditions` | `actions` |
|---|---|---|
| `gift_exclusion` | `{"excluded_product_ids": ["<uuid>", …]}` (≤ 50, sin repetir, productos de la misma unidad) | `{}` |
| `wholesale_mixed` | `{"min_units": 1–9999, "count": "bottles"}` | `{"discount_per_unit": {"arabic": n, "designer": n, "niche": n}, "currency": "PEN"}` (cada monto > 0 y ≤ 1000) |

## 3. Dónde se valida cada regla

| Regla | Servidor (TypeScript) | Base de datos |
|---|---|---|
| Zonas | `validateAndResolveParfumsOrder(input, catalog, { zones })` rechaza `motorizado` si el distrito es restringido **o no figura en la lista** (otra ciudad: solo Shalom). Con la tabla **vacía no se aplica nada** | — (el pedido nunca se rechaza por zona si elige Shalom) |
| Regalo | `checkGiftSelection`: frasco entero en el pedido (decants y sets no cuentan), perfume árabe, comprable, no excluido, con id de base de datos | `attach_parfums_order_gift` repite todo: frasco entero (`variant_snapshot.group = 'bottle'`), árabe publicado (`arab`/`arabic`), no excluido; idempotente por pedido (`P2041`–`P2044`); solo `service_role` |
| Mayorista | — | `calculate_mixed_wholesale_quote(unidad, líneas)`: suma frascos de cualquier tipo; si llega al mínimo, cada frasco recibe el descuento de **su** tipo. Decants no cuentan. Sin segundo tramo |
| Costo de envío | `parseShippingCostToCents` («15», «15.5», «15,50» → centavos) | `admin_parfums_set_order_shipping_cost` (0 a 100 000 000 centavos; vacío = borrar; no cambia `subtotal_amount`) |

El regalo se guarda **después** de crear el pedido, con una función aparte, a propósito: `create_parfums_order_request_v2` es la función de autoridad de pedidos (≈300 líneas, bloqueo de inventario) y no se
reescribe para una columna opcional. Si la base de datos rechaza el regalo (el servidor ya lo validó, así que solo ocurre ante una carrera), el pedido se conserva y el fallo se registra en el log; nunca se cancela un pedido por el regalo.

**Ejemplo mayorista** (verificado en `supabase/tests/60_commercial_rules.sql`): 15 árabes + 15 diseñador + 10 nicho = 40 → 15·5 + 15·7 + 10·10 = **S/ 280** de descuento; con 39 no hay descuento; con 50 se aplican los mismos montos por tipo.

## 4. Propuesta de zonas: lista de los 43 distritos (para validar)

**Criterio.** El dueño definió los extremos de cobertura (Centro, Ate, VES, Carabayllo) y «los intermedios». Se tomó el corredor urbano que une esos cuatro puntos y el anillo que los rodea; quedan restringidos los distritos que están **más allá** de cada extremo.
Fuente de los nombres: los 43 distritos de Lima Metropolitana de `apps/web/src/domains/orders/lima-districts.ts` (Callao no está: es otra provincia).

**Cobertura OK (30)** `is_restricted = false`:
Cercado de Lima, Rímac, Breña, Lince, Jesús María, Pueblo Libre, Magdalena del Mar, San Miguel, San Isidro, Miraflores, Barranco, Surquillo, San Borja, Santiago de Surco, Chorrillos, San Luis, La Victoria, El Agustino, Santa Anita, **Ate**, La Molina, San Juan de Lurigancho, Independencia, Los Olivos, San Martín de Porres, Comas, **Carabayllo**, San Juan de Miraflores, Villa María del Triunfo, **Villa El Salvador**.

**Restringidos (13)** `is_restricted = true`:
Ancón, Santa Rosa, Puente Piedra, Chaclacayo, Lurigancho-Chosica, Cieneguilla, Pachacámac, Lurín, Punta Hermosa, Punta Negra, San Bartolo, Santa María del Mar, Pucusana.

**Casos dudosos: confirma o corrige estos.**

| Distrito | Propuesta | Por qué es dudoso |
|---|---|---|
| Puente Piedra | restringido | Colinda con Carabayllo y Comas; está al noroeste, más allá del eje Comas–Carabayllo |
| San Juan de Lurigancho | cobertura | Es intermedio entre el Centro y Ate por el norte, pero es el distrito más grande y con zonas de difícil acceso |
| La Molina | cobertura | Intermedio entre Ate y Surco; Cieneguilla (más allá) queda restringido |
| Chaclacayo, Chosica | restringido | Más allá de Ate por la Carretera Central |
| Lurín, Pachacámac | restringido | Más allá de VES / Villa María del Triunfo |
| Independencia, Los Olivos, SMP, Comas | cobertura | Intermedios entre el Centro y Carabayllo |

La lista lista para aplicar está en `supabase/provisioning/delivery-zones-PROPOSED.sql` (**no se ha ejecutado en ningún entorno**: comprueba que quedan 43 filas). Mientras `delivery_zones` esté vacía, el checkout ofrece motorizado en todas partes.
Se puede corregir después desde `/admin/parfums/reglas` sin migración.

## 5. Administración

- **`/admin/parfums/reglas`** (menú Gestión → Reglas comerciales): distritos (alta, edición «Sin motorizado», baja), agencias (alta, edición, baja) y perfumes excluidos del regalo (lista con buscador). Los cambios en zonas expiran la etiqueta de caché `delivery-zones` (TTL de respaldo 300 s), por lo que el checkout los ve en segundos.
- **`/admin/import/mayorista`**: sección «Regla mixta (vigente)» (mínimo de unidades y tres descuentos). Las reglas por tipo de siempre siguen ahí porque son las que muestra hoy la sección pública Mayorista de Import; deben mantenerse con el mismo mínimo y montos.
- **Texto público del mayorista** (home de Import): ahora dice que el mínimo es mixto (se suman los frascos de cualquier tipo) y cada tipo muestra «S/ X menos por frasco». El número del mínimo sale de las reglas por tipo y solo se muestra si los tres coinciden.
- **Detalle del pedido de Parfums**: campo «Costo de envío cotizado (S/)» (guarda centavos, no toca el total) y, si el cliente eligió regalo, el perfume.
- Solo administradores escriben; los visores ven la página en solo lectura.

## 6. Despliegue

1. Migración `20261014120000` (aditiva; carga Shalom y la regla mixta de Import). Es un cambio sin efecto visible para el cliente: sin distritos no se restringe nada.
2. `supabase/provisioning/commercial-rules-seed.sql` (exclusión del regalo): guarda el **id** del producto en la regla. Lo encuentra por su slug estable `cdn-preciux-i` dentro de Parfums y **se detiene** si no hay exactamente un producto con ese slug, nombre «Club de Nuit Precieux I» y marca Armaf. Verificado en solo lectura en Producción el 2026-10-14: una coincidencia, id `3228ae87-1dae-437e-b6f3-8a901f7cb4ac`, publicado (los «CDN Preciux I/IV» de Import son otros productos y el filtro de unidad los deja fuera).
3. Cuando el dueño valide §4: `supabase/provisioning/delivery-zones-PROPOSED.sql` (o crear los distritos desde el admin).
4. Producción: lo aplica el dueño con su proceso y comprobación previa; esta sesión no tocó Producción.

Los fixtures locales y del proyecto QA (`scripts/local-browser-fixtures.sql`) cargan la lista propuesta para que los e2e del checkout ejerciten un distrito cubierto y uno restringido.

## 7. Qué NO incluye (a propósito)

- **Selector de regalo en el checkout.** El servidor, la base de datos y el admin ya soportan `giftProductId`, pero el checkout público todavía no pregunta por el perfume (hoy el regalo se acuerda por WhatsApp). Es un cambio de interfaz pública que conviene diseñar aparte.
- **Descuento mayorista en pedidos.** `calculate_mixed_wholesale_quote` calcula la cotización, pero ningún pedido de Import la usa: sigue la coordinación por WhatsApp y el total del pedido no se reescribe. Aplicarlo al pedido requiere cambiar `create_import_order_request`.
- **Bloqueo de `/import` para no-admin** (decisión 3 de `content-editor-architecture.md` §7.0): PR aparte.
- **Tramos > 40 (T28)** y `shipping_agencies` como parte del checkout (hoy Shalom es la única opción y los puntos de recojo siguen en `shalom-agencies.ts`).
- Pedidos anteriores: `shipping_cost_cents` y `gift_product_id` quedan nulos.

## 8. Pruebas

| Capa | Archivo | Qué cubre |
|---|---|---|
| pgTAP | `supabase/tests/60_commercial_rules.sql` (51) | tablas y RLS, datos confirmados (Shalom, 40·5/7/10, sin distritos, sin tramo > 40), formas de reglas, regalo (frasco entero, árabe, exclusión por id, idempotencia, solo servidor), CRUD y permisos, concurrencia, costo de envío, cotización mixta (40 → S/280, 39 → nada, 50 sin segundo tramo, decants) |
| Unitarias | `domains/commercial/*.test.ts`, `domains/orders/parfums-order-request.test.ts`, `app/admin/parfums/reglas/zone-revalidation.test.ts` | zonas, regalo, formularios, validador de pedidos, expiración de caché en cada acción de zonas |
| E2E | `e2e/ux-regressions.spec.ts` (checkout), `e2e/isolated-commercial-rules.spec.ts` (admin) | motorizado apagado en un distrito restringido y Shalom ofrecido; alta y baja de un distrito desde el admin con reflejo en el checkout |
