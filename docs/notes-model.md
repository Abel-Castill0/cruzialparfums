# Notas y aromas: modelo relacional y editor (2026-10-14)

Implementa C1–C3 de `docs/content-editor-architecture.md` §5.1. Migración: `supabase/migrations/20261014130000_notes_model.sql`.
Reversa: `supabase/rollback/20261014_notes_model_rollback.sql` (probada: elimina todo y la migración se vuelve a aplicar limpia).

## 1. Qué cambia

Antes, las notas de un perfume eran texto libre en `products.specs->'notes'`, sin catálogo ni editor. Ahora:

| Pieza | Qué es |
|---|---|
| `notes` | Catálogo de notas por unidad: `name` (2–60), `slug` (derivado del nombre), `type` (`general` \| `top` \| `heart` \| `base`), `description` (≤ 300), `image_url` (https), `is_active` |
| `product_notes` | Notas de cada producto: `(product_id, note_id)` único, `position` (orden de visualización) |
| `admin_save_note` / `admin_delete_note` / `admin_set_product_notes` | Únicas vías de escritura (administrador, `SECURITY DEFINER`, `audit_log`) |
| Pantalla `/admin/parfums/notas` | Crear, editar, ocultar y borrar notas; muestra cuántos productos usa cada una |
| Sección «Notas y aromas» en la ficha del producto del admin | Lista ordenada con botones **↑ subir / ↓ bajar**, quitar, añadir; se guarda con «Guardar notas» (sin arrastrar: decisión de plataforma, `content-editor-architecture.md` §6) |

## 2. Lectura pública: el espejo `specs->'notes'`

La tienda, el buscador, el Finder y la ficha leen `notes: string[]` desde `products.specs->'notes'` (`supabase-public-catalog-repository.ts`: `notes:specs->notes`). Ese arreglo ahora es un **espejo** de las tablas relacionales:

- lo reescribe la base de datos con triggers cuando cambian los `product_notes` de un producto, o cuando una nota cambia de **nombre** o de **visibilidad** (`is_active`);
- contiene los nombres de las notas **activas**, en orden de `position`;
- solo se escribe si cambió (un no-op no mueve `products.updated_at`);
- quitar todas las notas deja `[]`: las notas antiguas **nunca reaparecen**.

Consecuencia: **la lectura pública no cambia ni una línea ni agrega carga** (ni consulta nueva ni más payload en el catálogo), y el contrato `notes: string[]` del Finder, de la búsqueda y de la ficha sigue idéntico. Lo que cambia es de dónde sale el dato.
El recomendador usa el **género** del producto (`products.gender`) y las notas con los mismos pesos de siempre (`finder-rules.ts`); no se tocó.
Cada guardado del admin expira la etiqueta de caché `parfums-catalog`, así que el cambio se ve en la tienda en segundos (el e2e lo comprueba con un control negativo).

## 3. Relleno desde `specs->notes`

La migración ejecuta `app.backfill_product_notes()` (idempotente; una función para poder probarla con datos):

1. Lee cada `specs->notes` que sea un arreglo; ignora textos vacíos, de menos de 2 o más de 60 caracteres.
2. Une las notas que difieren solo por mayúsculas, tildes o espacios (`Vainilla`, `vainilla `, `Ámbar`/`Ambar`): gana la ortografía más frecuente. Un producto que listaba las dos queda con una.
3. Crea una `note` por clave y un `product_note` por producto con su orden original.
4. Todas entran como `general`: **no se inventa la pirámide** (salida/corazón/fondo). Decidir si la tienda la usa es del cliente (`content-editor-architecture.md` §7.1, punto 5); el modelo admite ambas.

El espejo se reescribe con los nombres ya unificados. Si dos productos tenían ortografías distintas de la misma nota, ahora muestran la misma. **Antes de aplicar en Producción** conviene revisar el resultado: `select * from app.backfill_product_notes()` informa cuántas notas y vínculos creó (el número de notas distintas debería ser ≤ las ortografías originales).

Vista previa con los datos reales de Producción (solo lectura): `docs/notes-migration-preview.md` (70 notas, 297 vínculos, 0 colisiones).

## 4. Reglas

- Una nota que usan productos **no se borra** (`P2050`): se quita de ellos o se oculta con «Visible en la tienda» desactivado.
- Un producto admite hasta 30 notas, sin repetir, todas activas y de su misma unidad (un trigger lo exige también por SQL).
- «Otra ortografía» de una nota existente es un duplicado (`23505`).
- Solo administradores escriben; los visores ven la pantalla en solo lectura.
- Lectura pública por RLS: notas activas y notas de productos públicos.

## 5. Qué NO incluye

- Pirámide olfativa en la ficha pública (hoy es una lista plana, como siempre) ni imágenes de notas en la tienda: el modelo ya guarda `type` e `image_url`, y mostrarlos es una decisión de diseño del cliente.
- Fusionar duplicados desde la pantalla (el relleno ya une por ortografía; una fusión manual posterior se haría renombrando y reasignando).
- Notas por unidad Import: el modelo es por unidad, pero solo se construyó la pantalla de Parfums.
- Buscar productos por una nota concreta en el catálogo (el buscador ya incluye las notas en su texto).

## 6. Pruebas

| Capa | Archivo | Qué cubre |
|---|---|---|
| pgTAP | `supabase/tests/61_notes_model.sql` (44) | slug; relleno (unión de ortografías, orden, espejo, idempotencia, `specs` intacto); CRUD y concurrencia; orden subir/bajar y quitar; renombrar y ocultar llegan al espejo; vaciar no resucita las antiguas; borrar en uso (`P2050`); permisos y aislamiento por unidad; RLS pública |
| Unitarias | `domains/notes/note-forms.test.ts` | formulario (nombre, tipo, https) y ayudantes de orden |
| E2E | `e2e/isolated-notes.spec.ts` | crear dos notas → asignarlas → subir una → verlas **en ese orden** en la ficha pública en < 5 s (control negativo: sin la expiración de caché falla) → la nota en uso no se puede borrar → quitar → borrar |
