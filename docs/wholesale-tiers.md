# Tramos mayoristas: qué hay hoy y qué falta (2026-10-14)

Solo documento: **no se implementó nada y no se inventó ningún valor**. Fuentes revisadas: `docs/client-decisions.md`,
`docs/progress-v2.md`, `docs/current-v2.md`, `docs/4h2a-public-catalog-readiness.md`, `docs/architecture-v2.md`, `docs/import-decision.md`,
las migraciones `20260908070000_admin_parfums_wholesale.sql` y `20261002045724_import_octavo_preview_and_wholesale_transfer.sql`, el esquema
de la BD local, y el código de `apps/web/src/app/admin/import/mayorista`, `domains/import` y `components/import/home`.

## 1. Resumen

- **Sí existe una regla mayorista confirmada, pero es un solo tramo por tipo comercial, no una escalera de tramos.**
  *40 frascos completos del mismo tipo comercial → descuento fijo en soles por frasco.*
- **No existe ningún tramo «40 unidades mixtas»** como tal. Lo más parecido es que ya se combinan **productos distintos del mismo tipo**; lo que
  la regla vigente **no** permite es mezclar **tipos** distintos. Qué quiere decir el cliente con «mixtas» hay que confirmarlo (§4).
- **No se aplica en ningún cálculo:** ni el carrito ni el checkout calculan precio mayorista. El descuento solo se **muestra** en Import y la compra
  mayorista se coordina por atención directa (WhatsApp).

## 2. Tramos actuales

Regla confirmada por el cliente el 2026-09-06 (`client-decisions.md`, «Wholesale»; repetida en `progress-v2.md` §«Wholesale confirmed rule»):

| Tipo comercial | Desde (unidades) | Hasta | Descuento | Se cuenta |
|---|---|---|---|---|
| Árabe | **40** | sin tope | **S/ 5.00 menos por frasco** | solo frascos completos |
| Diseñador | **40** | sin tope | **S/ 7.00 menos por frasco** | solo frascos completos |
| Nicho | **40** | sin tope | **S/ 10.00 menos por frasco** | solo frascos completos |

Reglas de agrupación documentadas: los productos distintos **del mismo tipo comercial se suman**; los **tipos distintos no se suman** entre sí.
No hay descuento porcentual: es un monto absoluto en soles por frasco.

Dónde vive hoy (historia): nació como política de **Parfums**; el 2026-10-02 el mayorista **se movió a Import** («`/parfums/mayorista` y
`/mayorista.html` redirigen a `/import`»; las políticas de Parfums se archivan en el paso de aprovisionamiento y Import recibe una copia con los
mismos valores: mínimo 40 frascos, S/5 árabe, S/7 diseñador, S/10 nicho — `current-v2.md`). Los tramos «unit/m4/m12» de la versión antigua del sitio
se eliminaron (`progress-v2.md`).

**Producción no se verificó desde aquí** (la BD de Producción está fuera de alcance de esta sesión). Lo anterior es lo que dicen los documentos del
proyecto. En la BD **local** de pruebas las filas de Parfums coinciden con la regla (40 · 5/7/10), y las de Import son valores ficticios de QA
(mínimos 4/5/4 y descuentos S/1, S/2, S/3), que no deben confundirse con los reales.

## 3. Cómo se aplican hoy

**Base de datos**
- `wholesale_policies` (una fila por unidad de negocio y tipo): `scope`, `commercial_type` (`arabic|designer|niche`), `min_quantity`,
  `discount_amount` (> 0), `currency` (siempre `PEN`), `is_active`, `archived_at`.
- Restricciones que **limitan lo que se puede representar**: índice único `(business_unit_id, commercial_type)` entre las activas del alcance
  `per_commercial_type` → **una sola política activa por tipo**; la restricción de ese alcance exige `min_quantity` y `discount_amount` presentes y
  `min_amount` **nulo**. Es decir: **un solo tramo por tipo, por cantidad (nunca por monto), con descuento absoluto.**
- `variant_price_tiers` (precio por variante y cantidad mínima, con `wholesale_policy_id`) **existe pero está vacía** (0 filas): no se usa.
- RPC `admin_update_wholesale_policy` (escritura con auditoría y control de concurrencia) y `public_get_import_wholesale_rules()` (lectura pública:
  tipo, mínimo, descuento, moneda, solo Import, activas y no archivadas). Vista `admin_parfums_wholesale_catalog` (frascos publicados × política).

**Código**
- Admin: `/admin/import/mayorista` (`app/admin/import/mayorista/*`): una tarjeta por tipo para editar mínimo y descuento (`updateImportWholesalePolicy`).
  `/admin/parfums/mayorista` solo redirige.
- Público: la home de Import muestra la sección «Mayorista Cruzial Import» (`ImportWholesale`): «Desde N frascos · S/ X menos por frasco», con el
  aviso «el descuento no se calcula en el carrito de compra regular» y un botón de WhatsApp «Consultar condiciones mayoristas». Si no hay
  políticas dice que se confirmarán antes de abrir el consolidado.
- **No hay cálculo mayorista** en `domains/carts/import-cart.ts`, en el checkout de Import ni en los pedidos (los únicos «40» del carrito son el tope
  de líneas, `IMPORT_CART_MAX_LINES = 40`, sin relación).

## 4. Qué falta para «40 unidades mixtas»

**Primero hay que saber qué significa.** Tres lecturas posibles, con consecuencias distintas:

| Lectura | ¿Existe hoy? | Qué faltaría |
|---|---|---|
| A. 40 frascos de **productos distintos del mismo tipo** | **Sí, como regla escrita** (se suman); **no se calcula** en ningún flujo | Aplicarla en carrito/checkout o en la solicitud mayorista |
| B. 40 frascos **mezclando tipos** (árabe + diseñador + nicho cuentan juntos) | **No**: la regla vigente dice que los tipos no se combinan | Decisión del cliente + un descuento por frasco que dependa del tipo con un umbral **global**: no cabe en el modelo actual (el umbral vive por tipo) |
| C. 40 unidades **incluyendo decants** | **No**: «solo frascos completos» | Decisión del cliente; cambia la base de conteo |

Y, sea cual sea la lectura, hoy **falta técnicamente**:
1. **Cálculo:** nada evalúa el umbral ni aplica el descuento (ni en el carrito, ni en el checkout, ni al crear el pedido); el pedido no guarda un
   *snapshot* de la regla aplicada (como sí hacen el adelanto y la entrega).
2. **Varios tramos por tipo** (p. ej. 20/40/80): el índice único permite **una** política por tipo. Haría falta cambiar la restricción (varias filas
   por tipo con rangos que no se solapen) o usar `variant_price_tiers` (hoy sin uso).
3. **Descuento porcentual o precio por tramo:** el modelo solo guarda monto absoluto por frasco; un porcentaje (la tabla de abajo lo pide) necesita un
   campo nuevo o una regla de conversión.
4. **Canal mayorista en el pedido:** `orders.channel` existe, pero no hay un flujo de «solicitud mayorista» con su propia captura (hoy es por WhatsApp).
5. **Precedencia con otras reglas** (regalo de 2 ml, que **no** aplica a mayorista) y con el stock del consolidado.

## 5. Tabla para que el cliente confirme (vacía a propósito)

No se rellena ningún valor. Una fila por tramo; si el cliente quiere varios tramos, se agregan filas.

| Tipo comercial | Desde (unidades) | Hasta (unidades) | Descuento (%) | Descuento (S/ por frasco) | ¿Se suman tipos distintos? | ¿Cuenta decants? | Confirmado por / fecha |
|---|---|---|---|---|---|---|---|
| Árabe | | | | | | | |
| Árabe | | | | | | | |
| Diseñador | | | | | | | |
| Diseñador | | | | | | | |
| Nicho | | | | | | | |
| Nicho | | | | | | | |
| *Mixto (si aplica)* | | | | | | | |

Rellenar **% o S/**, no ambos. Para comparar, el valor vigente en soles es el de §2.

## 6. Preguntas para el cliente

1. ¿«40 unidades mixtas» = lectura A, B o C de §4?
2. ¿Habrá **más de un tramo** (por ejemplo, un descuento mayor a partir de otra cantidad) o se mantiene el tramo único de 40?
3. ¿El descuento se expresa en **soles por frasco** (como hoy) o en **porcentaje**?
4. ¿El mayorista vive en **Import** (como hoy) o también en Parfums (frascos sellados)?
5. ¿Se calcula en el carrito o se sigue **coordinando por WhatsApp** con cotización manual?
6. ¿Importa el orden de precedencia con el **regalo de 2 ml** (hoy: no aplica a mayorista)?
