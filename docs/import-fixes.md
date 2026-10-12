# Import: carrito, héroe y catálogo en móvil

## 1. Icono del carrito (`import-cart-badge.module.css`)

**Causa.** El icono usaba `--ds-on-photo-muted` (blanco translúcido, pensado para ir sobre la foto del héroe). Desde que Import pasó al
sistema claro (`DESIGN.md` §11), el header que aparece al salir del héroe es **blanco**: el icono quedaba blanco sobre blanco, y en el
catálogo, el carrito y el checkout (header claro desde el principio) no se veía en ningún momento. El contador también era blanco con
texto tinta sobre blanco.

**Arreglo.** Icono en tinta `#1D1D1F` (16.8:1 sobre blanco; `--ds-ink-muted` al pasar el puntero) y contador con el acento de marca
(dorado con tinta, 6.85:1). El brief proponía tinta «o un color de alto contraste sobre el fondo navy»: el header de Import no es navy
(el navy sólo está en el héroe, donde el header va oculto, y en el pie), por eso la tinta es el color correcto.

## 2. Héroe de Import (`import-hero.tsx`, `import-home.module.css`)

Queda **título, una línea y los dos botones**:

- Título: nombre del consolidado (`Octavo Consolidado` o el que corresponda), `clamp(2rem, 1.2rem + 3.4vw, 3.5rem)`.
- Una línea: el mensaje público del consolidado; si no hay, «Cierra el …»; en vista previa, «Vista previa · apertura estimada: …».
  El CSS la limita a una línea con puntos suspensivos, así un mensaje largo del admin no crece el héroe.
- Botones sin cambios de lógica: «Ver catálogo» (o «Explorar vista previa» cuando está por abrir) y «Consultar por WhatsApp».
- Se eliminan la píldora de estado («Consolidado #… abierto»), la rejilla de datos (Cierre / Precios / Atención) y la lista de garantías de
  los estados cerrados, junto con sus reglas CSS.

La fecha de cierre ya no aparece como dato aparte; si el consolidado tiene mensaje público, éste manda sobre «Cierra el …».

## 3. Catálogo (`/import/catalogo`)

- **Rejilla:** ya era 1 columna (≤ 767 px), 2 (≤ 1023), 3 y 4 (≥ 1200); se mantiene. La tarjeta ya hablaba el lenguaje de Parfums
  (gris `--ds-gray-50`, sin borde, sombra, elevación de 4 px y zoom de imagen al pasar el puntero).
- **El defecto real estaba en móvil:** la regla de teléfono ponía la tarjeta como `grid` de dos columnas (34 % / resto) pero una regla
  posterior de proporción 1:1 la anulaba, y a 390 px la columna de datos quedaba aplastada (precio y disponibilidad cortados, botón
  encima de la foto). Ahora la tarjeta del teléfono es **una columna apilada** (foto 5:4, datos debajo), declarada al final de la hoja
  para que gane.
- **Categorías:** `auto-fit` → `auto-fill`: con una sola categoría la tarjeta ya no se estira a todo el ancho (en 768 px ocupaba la
  pantalla entera).

## Antes / después

| | Antes | Después |
|---|---|---|
| Héroe 1440 | ![](screenshots/import-fixes-2026-10-12/import-hero-1440-before.jpg) | ![](screenshots/import-fixes-2026-10-12/import-hero-1440-after.jpg) |
| Héroe 768 | ![](screenshots/import-fixes-2026-10-12/import-hero-768-before.jpg) | ![](screenshots/import-fixes-2026-10-12/import-hero-768-after.jpg) |
| Héroe 390 | ![](screenshots/import-fixes-2026-10-12/import-hero-390-before.jpg) | ![](screenshots/import-fixes-2026-10-12/import-hero-390-after.jpg) |
| Header y carrito 1440 | ![](screenshots/import-fixes-2026-10-12/import-header-carrito-1440-before.jpg) | ![](screenshots/import-fixes-2026-10-12/import-header-carrito-1440-after.jpg) |
| Header y carrito 390 | ![](screenshots/import-fixes-2026-10-12/import-header-carrito-390-before.jpg) | ![](screenshots/import-fixes-2026-10-12/import-header-carrito-390-after.jpg) |
| Catálogo 1440 | ![](screenshots/import-fixes-2026-10-12/import-catalogo-1440-before.jpg) | ![](screenshots/import-fixes-2026-10-12/import-catalogo-1440-after.jpg) |
| Catálogo 768 | ![](screenshots/import-fixes-2026-10-12/import-catalogo-768-before.jpg) | ![](screenshots/import-fixes-2026-10-12/import-catalogo-768-after.jpg) |
| Catálogo 390 | ![](screenshots/import-fixes-2026-10-12/import-catalogo-390-before.jpg) | ![](screenshots/import-fixes-2026-10-12/import-catalogo-390-after.jpg) |

(Datos locales de prueba: un solo consolidado y un solo producto, por eso la rejilla se ve con una tarjeta; el comportamiento con
más productos lo fijan las columnas descritas arriba.)

## Límites

- Sólo se probó con un producto local; la rejilla de 3–4 columnas no se vio con datos reales.
- Las imágenes de producto de Import van con `object-fit: contain` y `mix-blend-mode: multiply` (misma regla que Parfums); si las
  fotos reales tienen fondo oscuro, quedarán como en las capturas locales.
