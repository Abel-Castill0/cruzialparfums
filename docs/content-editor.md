# Editor de contenido de la web (guía de uso)

Fecha: 2026-10-17 · Migración: `supabase/migrations/20261017120000_content_blocks.sql` · Rollback:
`supabase/rollback/20261017_content_blocks_rollback.sql`

Desde `/admin/contenido` el cliente edita, sin tocar código, los textos y los productos de tres páginas públicas: la **portada
con selector de tiendas** (`/`), el **inicio de Cruzial Parfums** (`/parfums`) y el **inicio de Cruzial Import** (`/import`).

> Principio rector: **cero regresión.** Con la base de datos vacía el sitio se ve exactamente como hoy, porque el texto actual
> de la web es el respaldo tipado de cada sección. Mientras nadie edite una sección, esa sección se sigue pintando desde el
> código (TSX). Ver `docs/content-editor-architecture.md` §4–§5 para las decisiones de diseño y §5.2–§5.3 para el registro de
> secciones y los esquemas.

## 1. Quién puede editar

- Se necesita ser **administrador** de la tienda dueña de la sección (`parfums` o `import`) **y haber pasado el segundo factor
  (MFA, `aal2`)**. Sin MFA los textos no se leen ni se escriben.
- Un **viewer** ve el contenido en modo lectura: la tarjeta se abre con «Ver contenido» y **no** ofrece «Guardar», «Desactivar»
  ni «Restablecer».
- Una persona que administra ambas tiendas ve las dos secciones de Parfums y la de Import en la misma pantalla.

## 2. Qué se puede editar

La lista de secciones es **cerrada**: el admin nunca crea secciones, solo edita las que el registro declara
(`apps/web/src/lib/content/registry.ts`). Son seis más el orden del carrusel:

| Página | Sección | Unidad | Qué edita |
|---|---|---|---|
| Inicio (selector) | Puerta «Parfums» | parfums | Título y texto de la puerta. El botón «Entrar» y su destino **son fijos**. |
| Inicio (selector) | Puerta «Import» | parfums | Título y texto de la puerta. Con la campaña cerrada se muestra el aviso de estado en lugar del texto. Botón «Entrar» **fijo**. |
| Parfums · inicio | Portada (hero) | parfums | Titular y el botón principal (texto + destino). |
| Parfums · inicio | Carrusel de destacados | parfums | Solo el **título** de la tira. Qué perfumes y en qué orden se elige aparte (ver §4). |
| Parfums · inicio | Bloque «Del frasco a tu piel» | parfums | Titular, línea de apoyo y enlace («Conoce Cruzial»). |
| Parfums · inicio | Enlace a TikTok | parfums | Titular y texto. Solo se usa cuando no hay video de portada configurado. |
| Import · inicio | Bloque «Pedidos que llegan a tu puerta» | import | Titular y texto que introducen la galería de preparación. |

### Lo que NO es editable (a propósito)

- **El botón «Entrar»** de las dos puertas y su destino: son estructurales (llevan a `/parfums` y a `/import`).
- **HTML, CSS o clases**: los textos son texto plano (con un markdown mínimo en los bloques de texto: `**negrita**`, `*cursiva*`,
  listas con `- ` y enlaces `https://`). El admin nunca edita estilos ni el diseño.
- **La velocidad del carrusel**: sigue siendo una constante de código (no es dato).
- **El tipo de bloque** de cada sección: lo fija el registro, no el formulario.

## 3. Cómo se usa

Entra a **https://cruzial.pe/admin/contenido** (o `/admin/contenido` en local). Cada sección es una tarjeta con su estado.
Abre la tarjeta con **«Editar»** y trabaja dentro del formulario. Los cambios en la web se ven **en pocos segundos**.

Estados de la tarjeta:

| Estado | Significado |
|---|---|
| **Usando el contenido original** | No hay nada guardado; la web pinta el texto del código. |
| **Editado · aplicado en la web** | Hay una edición guardada y está activa. |
| **Edición guardada · desactivada en la web** | Hay una edición guardada, pero la web usa el texto original. |

Acciones:

- **Guardar.** Rellena los campos, deja marcada la casilla **«Aplicar esta edición en la web»** y pulsa **«Guardar»**. La
  primera vez crea la edición; las siguientes la actualizan. Mensaje: *"Contenido guardado."*
- **Desactivar / Activar.** Si hay una edición guardada, el botón **«Desactivar»** hace que la web vuelva al texto original
  **sin borrar** lo que escribiste; **«Activar»** la vuelve a aplicar. Esto es útil para probar sin perder el texto.
  Mensajes: *"La web vuelve al contenido original."* / *"La web usa tu edición."*
- **Restablecer.** El botón **«Restablecer»** pide confirmar (casilla «Confirmo volver al contenido original») y **borra** la
  edición guardada: la web vuelve al texto del código y la tarjeta queda en «Usando el contenido original». Es la única acción
  destructiva; el texto original nunca se toca.

> Desactivar ≠ Restablecer. **Desactivar** conserva tu texto y solo lo deja fuera de la web; **Restablecer** lo elimina.

## 4. Elegir y ordenar los perfumes del carrusel

Debajo de las tarjetas, la tarjeta **«Productos del carrusel de destacados»** controla qué fragancias aparecen en la tira de la
portada y en qué orden:

- **Agregar:** «Buscar perfume para agregar» → sección «Agregar perfumes» → botón **«+ Marca Nombre»**.
- **Ordenar:** botones **↑** y **↓** en cada perfume (funciona sin ratón ni arrastrar: WCAG 2.5.7).
- **Quitar:** botón **«Quitar»**.
- **Guardar:** botón **«Guardar carrusel»**. Mensaje: *"Carrusel guardado."*

Si la lista queda vacía, la web usa la **selección automática** actual (los destacados), igual que hoy. Solo aparecen perfumes
publicados y no archivados; un perfume que se despublique después deja de mostrarse solo.

## 5. Cómo llega a la web (revalidación)

Guardar en el admin **expira al momento** las etiquetas de caché del contenido (`content-blocks` y `page-<página>`,
`apps/web/src/lib/content/revalidate.ts`), así que la página pública refleja el cambio en segundos, no en la ventana de caché.
El contenido leído vive en la caché de datos de Next 300 s como **respaldo** (por si algo se cambia por fuera del admin). Una
lectura que falle —tablas ausentes, red— devuelve «sin filas» y la página cae al texto del código: la tienda **nunca depende**
de que estas tablas existan.

## 6. Detalles técnicos (para el equipo)

- **Tablas:** `content_blocks` (una fila por sección: `content` jsonb validado, `is_visible`) y `carousel_items` (productos y
  orden por carrusel). Esquemas Zod en `apps/web/src/lib/content/schemas.ts`, replicados como triggers en la BD
  (`app.validate_content_block`) para que no se pueda guardar un bloque corrupto.
- **Escritura solo por RPC `security definer`** (`admin_save_content_block`, `admin_set_content_block_visibility`,
  `admin_delete_content_block`, `admin_set_carousel_items`, `admin_move_content_block`), con comprobación de unidad
  (`app.is_admin_for`, requiere `aal2`), `audit_log` y `expected_updated_at` para detectar ediciones concurrentes.
- **Lectura pública** solo de `is_visible = true` por RLS; el acceso del admin a las filas (incluidas las desactivadas) lo abre
  la política `content_blocks_admin_read` con `app.can_read_unit`.
- **Esquemas de bloque:** `hero` (titular + botón opcional), `text_banner` (titular + texto + botón opcional) y `carousel`
  (solo titular). Un botón sin destino o un texto con HTML/caracteres de control se rechazan en el formulario y en la BD.
- **Nota de mantenimiento:** `admin_move_content_block` existe (reordenar bloques) pero **no está cableado a ninguna acción ni
  interfaz**: las secciones son ranuras fijas. Queda como base para el futuro. El carrusel de productos sí se ordena.
- **No borrar el respaldo TSX** de cada sección hasta que el cliente cargue sus bloques en Producción (ver §4 del documento de
  arquitectura). Hasta entonces el respaldo garantiza la cero regresión.

### Aplicar la migración y probar

```powershell
# Aplicar en un stack local (la migración es aditiva):
docker exec -i supabase_db_<project> psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f -
# Tras aplicar a mano, refrescar la caché de esquema de PostgREST:
#   notify pgrst, 'reload schema'; notify pgrst, 'reload config';

# Pruebas de contenido (unit + e2e local):
npm test
node scripts/local-admin-browser.mjs --project=isolated --no-deps e2e/isolated-content-editor.spec.ts
```

Pruebas automatizadas: unit en `apps/web/src/lib/content/content.test.ts`; extremo a extremo en
`apps/web/e2e/isolated-content-editor.spec.ts` (editar→ver en la web en <5 s→Restablecer; desactivar sin borrar; el viewer no
ve el editor). El rollback está en `supabase/rollback/20261017_content_blocks_rollback.sql`.
