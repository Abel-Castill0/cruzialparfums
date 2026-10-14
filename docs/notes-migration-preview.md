# Vista previa del relleno de notas (solo lectura, 2026-10-14)

**No se aplicó nada a Producción.** Este documento sale de **consultas de solo lectura (`SELECT`)** sobre `products.specs->'notes'` de Parfums en
el proyecto de Producción, aplicando el mismo algoritmo que `app.backfill_product_notes()` de la migración `20261014130000_notes_model.sql`
(clave = nombre sin tildes, en minúsculas, con guiones; gana la ortografía más frecuente; se ignoran textos de menos de 2 o más de 60 caracteres).
Las tablas nuevas **no existen** todavía en Producción (comprobado).

## 1. Totales antes y después

| | Antes | Después |
|---|---|---|
| Productos de Parfums | 100 (99 con `specs.notes`; 1 sin notas) | igual |
| Entradas de nota (nota × producto) | 297 | 297 vínculos `product_notes` |
| Ortografías distintas / notas únicas | **70** ortografías | **70 notas** (`notes`) |
| Entradas ignoradas por el filtro | — | **0** |
| Productos que cambian lo que ven los clientes | — | **0** (ver §2) |

## 2. Colisiones: ninguna

Ninguna nota se une con otra: **0 colisiones por mayúsculas, tildes o espacios**. Cada una de las 70 ortografías es su propia nota, así que no hay
"Vainilla / vainilla" que decidir en los datos reales. Como el espejo `specs->'notes'` se reescribe con los nombres, el orden y los mismos 297
vínculos, **el contenido público de cada ficha queda idéntico** (las mismas notas, en el mismo orden). Lo que cambia es de dónde salen.

## 3. Lista completa de las 70 notas (por número de productos)

Todas entran como tipo `general` (sin pirámide olfativa: es decisión del cliente).

| # | Nota | Productos |
|---|---|---|
| 1 | Ámbar | 59 |
| 2 | Vainilla | 35 |
| 3 | Especias | 23 |
| 4 | Madera | 21 |
| 5 | Acuático | 14 |
| 6 | Cítricos | 10 |
| 7 | Flores | 8 |
| 8 | Bergamota | 7 |
| 9 | Canela | 7 |
| 10 | Cuero | 7 |
| 11 | Cedro | 6 |
| 12 | Almizcle | 5 |
| 13 | Coco | 5 |
| 14 | Manzana | 5 |
| 15 | Piña | 5 |
| 16 | Café | 4 |
| 17 | Caramelo | 4 |
| 18 | Lavanda | 3 |
| 19 | Mandarina | 3 |
| 20 | Menta | 3 |
| 21 | Ron | 3 |
| 22 | Tabaco | 3 |
| 23 | Verde | 3 |
| 24 | Almendra | 2 |
| 25 | Cereza | 2 |
| 26 | Flores blancas | 2 |
| 27 | Frutos rojos | 2 |
| 28 | Limón | 2 |
| 29 | Marino | 2 |
| 30 | Rosas | 2 |
| 31 | 4 fragancias | 1 |
| 32 | Abedul | 1 |
| 33 | Agua | 1 |
| 34 | Algodón dulce | 1 |
| 35 | Avellana | 1 |
| 36 | Azafrán | 1 |
| 37 | Cacao | 1 |
| 38 | Cálido | 1 |
| 39 | Cardamomo | 1 |
| 40 | Castaña | 1 |
| 41 | Ciruela | 1 |
| 42 | Dulce | 1 |
| 43 | Flor de naranjo | 1 |
| 44 | Fresa | 1 |
| 45 | Fresco | 1 |
| 46 | Fruta | 1 |
| 47 | Fruta tropical | 1 |
| 48 | Frutal | 1 |
| 49 | Fuego | 1 |
| 50 | Geranio | 1 |
| 51 | Gourmand | 1 |
| 52 | Humo | 1 |
| 53 | Incienso | 1 |
| 54 | Jazmín | 1 |
| 55 | Mango | 1 |
| 56 | Melocotón | 1 |
| 57 | Metálico | 1 |
| 58 | Miel | 1 |
| 59 | Orientales | 1 |
| 60 | Oud | 1 |
| 61 | Pera | 1 |
| 62 | Pimienta | 1 |
| 63 | Pistacho | 1 |
| 64 | Plátano | 1 |
| 65 | Praliné | 1 |
| 66 | Romero | 1 |
| 67 | Selección | 1 |
| 68 | Toffee | 1 |
| 69 | Veraniego | 1 |
| 70 | Violeta | 1 |

## 4. Lo que conviene revisar con el cliente (no se tocó nada)

El relleno copia lo que ya estaba. Estos casos no son errores de ortografía, así que **no se unen solos**; deciden si se editan después desde `/admin/parfums/notas`:

- **Parecen familias o sensaciones, no notas:** Verde, Cálido, Fresco, Dulce, Frutal, Fruta, Orientales, Gourmand, Marino, Metálico, Veraniego, Fuego, Humo.
- **Posibles duplicados de significado:** Fruta / Frutal / Fruta tropical · Flores / Flores blancas · Agua / Acuático / Marino · Cítricos / Limón / Mandarina · Rosas (plural) frente a las demás notas en singular.
- **Parecen marcas del catálogo, no notas:** «4 fragancias» y «Selección» (1 producto cada una; probablemente sets).

Cualquier fusión después del relleno se hace en el admin: renombrar la nota que se quiere conservar, reasignar los productos de la otra y borrarla (una nota sin productos se puede borrar).

## 5. Cómo reproducirlo

1. En una copia o en Producción (solo lectura), ejecutar la consulta de totales y de ortografías con el mismo filtro de la migración.
2. Tras aplicar la migración (el dueño decide cuándo): `select count(*) from public.notes where business_unit_id = '11111111-1111-4111-8111-111111111111'` debe dar **70** y
   `select count(*) from public.product_notes` debe dar **297**.
3. Reversa: `supabase/rollback/20261014_notes_model_rollback.sql` (`specs->'notes'` queda con los últimos nombres reflejados, que hoy son los originales).

**Estado:** pendiente de tu revisión. No se aplica a Producción hasta que lo apruebes.
