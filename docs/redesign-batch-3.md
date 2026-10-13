# Rediseño, lote 3 — Home, Parfums, Catálogo, Producto y Combos (2026-10-13)

El cliente aprobó 15 observaciones visuales; este lote cubre las de Home, Parfums, Catálogo, Producto y Arma tu combo (23 puntos del
encargo). **No toca admin, BD ni editores.** Reglas respetadas: ningún píxel inventado ni arte sintetizado, tokens `--ds-*`
existentes (los nuevos son aliases/bandas aditivos, ver §0), `prefers-reduced-motion`, contraste AA y ningún componente nuevo
donde se podía reutilizar. Rama `design/redesign-batch-3`; sin push, sin PR, sin merge.

## 0. Tokens nuevos (aditivos, documentados en `DESIGN.md`)

| Token | Valor | Uso | Contraste medido |
|---|---|---|---|
| `--ds-color-surface` | alias de `--ds-gray-50` `#F5F5F7` | banda gris clara (el token que pedía el encargo no existía; es un alias, no un color nuevo) | tinta 15.5:1 |
| `--ds-color-surface-dark` | `#2B2B2E` | «Del frasco original a tu piel» | blanco 14.1:1 · texto muted 8.4:1 · dorado 5.7:1 |
| `--ds-color-surface-deep` | `#17171A` | banda de TikTok / video | blanco 17.9:1 · muted 10.2:1 · dorado 7.3:1 |
| `--ds-on-dark`, `--ds-on-dark-muted`, `--ds-hairline-on-dark` | `#FFF`, `rgba(255,255,255,.74)`, `rgba(255,255,255,.12)` | texto y separador sobre esas bandas | ver arriba |

## 1. Home `/`

| # | Pedido | Qué se hizo | Límites / decisiones |
|---|---|---|---|
| 1 | Imagen aprobada en cada tarjeta | Parfums: `parfums-hero.webp` (foto de los frascos Cruzial). Import: `import-conditions-container.webp` (contenedor con «CRUZIAL IMPORT»). Ambas a pantalla completa de la tarjeta (`object-fit: cover`, encuadre al sujeto). | **Asumí «aprobada» = arte de marca que ya estaba publicado en el sitio** (`parfums-hero` es el arte del héroe del catálogo; el contenedor ya vive en Import). Si el cliente prefiere otras, es cambiar dos rutas. No se generó ni retocó nada. |
| 2 | Logo oficial en el header | `logo-official.jpeg` (el mismo archivo del repo, **sin editar**) en una ficha redondeada con filete dorado; `alt="Cruzial Perfumería"`. | El JPEG trae su fondo negro: no se recortó ni se aplicó *keying* (regla de marca). Por eso va en ficha y no suelto sobre las fotos. T20 (SVG) sigue abierto. |
| 3 | Bloqueo visual de Import | Con la campaña cerrada: velo suave, «Estamos preparando el próximo consolidado» y «Apertura estimada: 14 de noviembre» (fecha en hora de Lima) o «Próximamente» si no hay fecha. Sigue siendo un enlace a `/import`; el `aria-label` incluye el aviso. | Solo visual. Lee dos RPC públicas que ya existen (`public_get_import_current_campaign` y `public_get_import_upcoming_campaign`, ésta con `opens_at`), sin tocar la BD, en caché de 60 s como el catálogo. Si falla la lectura el estado es «desconocido» y **no** se muestra el velo (nunca afirma un cierre que no puede respaldar). La lógica real de bloqueo es el otro PR. |

## 2. Parfums `/parfums`

| # | Pedido | Qué se hizo |
|---|---|---|
| 4 | «100% originales» no blanco | Franja a todo el ancho en `--ds-color-surface`. |
| 5 | «Encuentra tu familia» −20 % y «Designer» → «Diseñador» | Tarjetas y encabezado al 80 % de la columna (desde 768 px; en teléfono 61 % del carril). «Diseñador» en todas las etiquetas visibles: tarjetas, filtros, ficha, combos, texto del gateway **y la etiqueta que viene en los datos** (`specs.tag = "Designer"` en BD y fixture) mediante `displayTag()` al mapear, sin editar los datos. Quedan «designer» en el texto legal de Términos y en la meta description (no son etiquetas). |
| 6 | «¿No sabes por dónde empezar?» con fondo | Banda oscura: degradado tinta → `#2B2B2E` con un brillo dorado tenue. Chips translúcidos, CTA dorado con etiqueta tinta. (No usé el logo al 5 %: el JPEG tiene fondo negro y no se puede aplicar con transparencia sin editarlo.) |
| 7 | «Del frasco original a tu piel» sin fotos | Fuera las **tres** fotos (frasco, decant, y la de pedidos reales). Rediseñada en gris oscuro, solo texto: los 3 principios en tarjetas con numeral dorado y la caja de tamaños 3/5/10 ml. Se **borró del repo** `decants-real-orders.jpg` (4032×3024, pedidos reales; ya sin referencias). El historial de git la conserva: si privacidad exige purgarla es una reescritura de historial, decisión aparte. `parfums-authenticity` y `parfums-decant-3/5ml` siguen en Nosotros/Contacto (fuera de alcance). |
| 8 | TikTok más oscuro | Estaba en gris **claro** (no oscuro): ahora `--ds-color-surface-deep`, texto blanco 17.9:1, enlaces dorados 7.3:1. Aplica a `VideoStory` y `TikTokProfile` en tono Parfums; Import conserva su banda clara. |
| 9 | Combos −15 % y movidos | Tarjeta del carrusel al 85 % del ancho (en teléfono, el arte pasa de 340 a 290 px). La sección se movió **en el árbol** (`page.tsx`) a entre «Encuentra tu familia» y «¿No sabes por dónde empezar?». |
| 10 | Ruleta a 40 px/s | `MARQUEE_DRIFT_PX_PER_SECOND = 40` exportada en `product-marquee.tsx` (antes 26, constante privada). Solo en código. Se pausa/no se mueve con `prefers-reduced-motion` como antes. |

## 3. Catálogo `/parfums/catalogo`

| # | Pedido | Qué se hizo |
|---|---|---|
| 11 | Sin hero | Fuera el héroe (imagen, velo, CTA). Queda `h1` «Nuestra Colección» + una frase. Como ya no hay héroe, el header deja de ocultarse en esta ruta (`HERO_PATHS` solo `/parfums`). |
| 12 | Orden | Tarjetas de categoría → barra de filtros (buscador, Filtros, Orden) → grid. |
| 13 | Quitar presupuesto y frasco completo | Fuera de la UI. Los enlaces viejos con `?price=` / `?format=bottle` se ignoran (muestran el catálogo de decants). El dominio (`catalog-query`) conserva esos filtros sin usarlos, para no romper sus pruebas ni otros usos. |
| 14 | Filtro de marca | Nuevo grupo «Marca» en el panel: un `select` nativo con las marcas del propio catálogo (ordenadas), porque una lista de decenas de marcas no cabe como chips. Aparece como filtro activo («Marca Lattafa») y en la URL (`?brand=`). |
| 15 | Fondo gris | Página, intro, categorías y barra sobre `--ds-color-surface` (`#F5F5F7`); las tarjetas pasan a blancas para seguir leyéndose. |
| 16 | Tarjetas | Nombre en 600 y +10 % (1.0625 rem → 1.169 rem; 19.5 px en teléfono). **Selector de tamaño** 3/5/10 ml (radios nativos con aspecto de pill): el elegido en **tinta sólida con texto blanco** (16.8:1); un tamaño sin precio/stock se atenúa y no se puede elegir; el precio sigue al tamaño elegido; «Añadir» agrega 1 unidad de ese tamaño. Se quitó el contador de cantidad genérico (la cantidad se edita en el carrito). Teclado: flechas entre tamaños. |
| 17 | Sin frascos enteros | El catálogo solo muestra decants: se excluyen productos sin precio de decant, las tarjetas ya no ofrecen «Frasco N ml · S/» ni el aviso de regalo de frasco. **La ficha de producto sigue vendiendo frascos** (la ruta de frascos es otro PR). |
| 18 | 24 por vista | «Vista 1, Vista 2…» (pills, la actual en tinta sólida, `aria-current="page"`), 24 productos por vista, `?vista=N` compartible; cambiar filtro/orden/búsqueda vuelve a la Vista 1; al cambiar de vista se sube al inicio del grid. |

**Límite honesto (18):** la paginación es del lado del cliente: la página sigue recibiendo la lista completa en su payload y solo **renderiza** 24 tarjetas (y 24 imágenes) por vista. Paginar en servidor implicaría mover búsqueda y filtros al servidor: un refactor mayor que no estaba en el encargo.

## 4. Producto `/parfums/productos/[slug]`

| # | Pedido | Qué se hizo |
|---|---|---|
| 19 | Menos blanco | Página en `--ds-color-surface`; los recuadros que eran grises (foto, datos, notas, avisos, botones) pasan a blancos para no desaparecer. La foto conserva `mix-blend-mode: multiply`. |
| 20 | Rotación de fotos | Cada 5 s (`GALLERY_ROTATION_MS`); espera mientras el puntero o el foco están sobre el escenario; se detiene **para siempre** cuando la persona usa flechas, miniaturas, deslizar o teclas; no se mueve con `prefers-reduced-motion`. **Añadí un botón de pausa/reanudar siempre visible** (44 px, abajo a la izquierda): una imagen que cambia sola necesita una forma visible de detenerla (WCAG 2.2.2). No estaba en el encargo; si no se quiere, es un solo componente (`GalleryRotationToggle`). |

## 5. Arma tu combo `/parfums/combos`

| # | Pedido | Qué se hizo |
|---|---|---|
| 21 | Sin imagen del hero | Fuera la imagen; el héroe queda en texto y CTAs. |
| 22 | «Ver sets» | «Ver sets curados» → «Ver sets». |
| 23 | Carrusel de sets abajo | La sección «Sets Cruzial» pasa **debajo del armador** (antes del bloque de confianza final). Muestra **3 sets a la vez** desde 1024 px (2 en tablet, 1 en teléfono: tres no caben en 390 px) y avanza **un set cada 4 s** (`SETS_ROTATION_MS`); al llegar a la última ventana vuelve a la primera. Con 3 sets o menos todos están a la vista y no se mueve nada (ni controles). Espera con puntero/foco encima, no se mueve con `prefers-reduced-motion`, y flechas o pausa lo detienen. Los sets fuera de ventana son `inert` (el foco del teclado no cae en tarjetas invisibles). |

## 6. Pruebas

**Unitarias nuevas** (`npm run test`): `catalog-query` (marca, 24 por vista, vistas sin duplicados ni pérdidas, páginas fuera de rango, tamaños 3/5/10 y su disponibilidad), `display-labels` (Designer→Diseñador), `import-gate` (fecha en hora de Lima, «Próximamente»), reglas de rotación de fotos (`product-gallery`), reglas del carrusel de sets (`sets-carousel`) y la velocidad de la ruleta.

**E2E nuevas** (`e2e/redesign-batch-3.spec.ts`, en chromium, mobile y tablet):
- *Fondo gris en catálogo:* página, intro y capa `rgb(245,245,247)`; tarjetas blancas.
- *Filtros nuevos:* Tipo, Género, Familia, **Marca**; ausentes Presupuesto, Formato y «Frasco completo»; el filtro de marca deja solo esa marca, aparece como filtro activo y en la URL.
- *Selector de tamaño activo:* tres opciones 3/5/10 ml, la elegida en `rgb(29,29,31)` con texto blanco, la anterior deja de serlo, el precio cambia, sin «cantidad»; teclado con flechas; «Añadir» guarda `decant-{N}ml`.
- Sin héroe y orden intro → categorías → filtros → grid; sin frascos enteros (también con `?format=bottle`); 24 por vista con Vista 1/2 y `?vista=`; nombre 600 y ≥ 18.5 px.
- Home: logo oficial, fotos de las puertas, velo/estado de Import, orden de secciones, bandas no blancas y contraste AA calculado (craft ≥ 7:1 titulares / ≥ 4.5:1 texto; TikTok idem), sin fotos en «Del frasco…», «Diseñador».
- Producto: superficie gris; rotación a 5 s con reloj simulado (espera con hover, se detiene al elegir, botón de pausa, sin rotación con movimiento reducido).
- Combos: sin imagen, «Ver sets», carrusel después del armador, 3 a la vista, avance a 4 s, hover/flechas lo detienen, sets fuera de ventana no enfocables.

Las pruebas que necesitan más de 24 productos o más de 3 sets **se omiten solas** en un stack con pocos datos (como el de CI, con fixtures mínimos); la lógica que cubren (paginación, ventana del carrusel) está en las pruebas unitarias, y estas e2e se ejecutaron en local contra un seed de QA (60 fragancias, 12 marcas, 5 sets) que **no está en el repo y ya se eliminó** de la BD local.

**Pruebas existentes actualizadas** (porque codificaban el diseño anterior): cinco e2e que esperaban el héroe del catálogo (header oculto, scroll por encima del héroe), el de «catalog hero stacks…» (borrado: el héroe ya no existe) y «Designer» → «Diseñador».

**Verificación (2026-10-13):** `npm run check` EXIT 0 (lint, tipos, 1257 pruebas unitarias, build) y la suite pública e2e en frío sobre el build de producción (chromium, mobile, tablet, responsive), dos corridas seguidas: **361 pasan, 0 fallan, 58 omitidas** (las propias de otras pantallas/stacks y las que necesitan más datos, ver arriba). Firefox/WebKit no se corrieron (el matriz de motores es opt-in).

**Tres hallazgos durante la verificación (arreglados):**
1. *Carrera real en el catálogo:* el sincronizador de URL reescribía `history.replaceState` 300 ms tras cargar aunque no hubiera nada que sincronizar, y podía deshacer un enlace pulsado en esa ventana (el router aún no lo había confirmado). Ahora no toca el historial si la URL ya es la correcta. Antes no se veía porque el header estaba oculto y había que hacer scroll primero.
2. *axe «color-contrast» en móvil (falso positivo):* el contenido de las bandas oscuras, con `content-visibility: auto`, se medía sin pintar contra el blanco de la página (el dorado medía 2.45:1 cuando es 7.3:1). Las bandas oscuras (`data-band="dark"`) quedan siempre maquetadas.
3. *Fixture local vencido:* la campaña de Import del stack local cerraba el 13/10 a las 06:29 UTC; renové su ventana en la BD local (no en el repo) para que las pruebas de Import vuelvan a ser válidas.

**Decisión a revisar:** al quitar el héroe del catálogo desaparece su botón «Encontrar mi fragancia». El Finder sigue accesible desde la home (recomendador), la banda final del catálogo («Usar el Finder») y el estado sin resultados; la prueba del recomendador abre ahora desde la banda final. Si el cliente quiere el acceso arriba, es un enlace de texto en la intro.

## 7. Capturas antes / después (`docs/screenshots/redesign-batch-3/`)

«Antes» = `master` (72ff70c) y «después» = esta rama, con **los mismos datos locales** (el seed se aplicó a ambos). Ancho 1440 / 768 / 390. Los textos de producto son datos de QA local («Almizcle Gold 11», «Set de prueba»), no contenido real.

| Sección | 1440 | 768 | 390 |
|---|---|---|---|
| Gateway `/` | [antes](screenshots/redesign-batch-3/gateway-1440-before.jpg) · [después](screenshots/redesign-batch-3/gateway-1440-after.jpg) | [antes](screenshots/redesign-batch-3/gateway-768-before.jpg) · [después](screenshots/redesign-batch-3/gateway-768-after.jpg) | [antes](screenshots/redesign-batch-3/gateway-390-before.jpg) · [después](screenshots/redesign-batch-3/gateway-390-after.jpg) |
| 100% originales | [antes](screenshots/redesign-batch-3/parfums-originales-1440-before.jpg) · [después](screenshots/redesign-batch-3/parfums-originales-1440-after.jpg) | [antes](screenshots/redesign-batch-3/parfums-originales-768-before.jpg) · [después](screenshots/redesign-batch-3/parfums-originales-768-after.jpg) | [antes](screenshots/redesign-batch-3/parfums-originales-390-before.jpg) · [después](screenshots/redesign-batch-3/parfums-originales-390-after.jpg) |
| Encuentra tu familia | [antes](screenshots/redesign-batch-3/parfums-familia-1440-before.jpg) · [después](screenshots/redesign-batch-3/parfums-familia-1440-after.jpg) | [antes](screenshots/redesign-batch-3/parfums-familia-768-before.jpg) · [después](screenshots/redesign-batch-3/parfums-familia-768-after.jpg) | [antes](screenshots/redesign-batch-3/parfums-familia-390-before.jpg) · [después](screenshots/redesign-batch-3/parfums-familia-390-after.jpg) |
| Combos (home) | [antes](screenshots/redesign-batch-3/parfums-combos-1440-before.jpg) · [después](screenshots/redesign-batch-3/parfums-combos-1440-after.jpg) | [antes](screenshots/redesign-batch-3/parfums-combos-768-before.jpg) · [después](screenshots/redesign-batch-3/parfums-combos-768-after.jpg) | [antes](screenshots/redesign-batch-3/parfums-combos-390-before.jpg) · [después](screenshots/redesign-batch-3/parfums-combos-390-after.jpg) |
| ¿No sabes por dónde empezar? | [antes](screenshots/redesign-batch-3/parfums-recomendador-1440-before.jpg) · [después](screenshots/redesign-batch-3/parfums-recomendador-1440-after.jpg) | [antes](screenshots/redesign-batch-3/parfums-recomendador-768-before.jpg) · [después](screenshots/redesign-batch-3/parfums-recomendador-768-after.jpg) | [antes](screenshots/redesign-batch-3/parfums-recomendador-390-before.jpg) · [después](screenshots/redesign-batch-3/parfums-recomendador-390-after.jpg) |
| Del frasco original a tu piel | [antes](screenshots/redesign-batch-3/parfums-frasco-a-piel-1440-before.jpg) · [después](screenshots/redesign-batch-3/parfums-frasco-a-piel-1440-after.jpg) | [antes](screenshots/redesign-batch-3/parfums-frasco-a-piel-768-before.jpg) · [después](screenshots/redesign-batch-3/parfums-frasco-a-piel-768-after.jpg) | [antes](screenshots/redesign-batch-3/parfums-frasco-a-piel-390-before.jpg) · [después](screenshots/redesign-batch-3/parfums-frasco-a-piel-390-after.jpg) |
| TikTok | [antes](screenshots/redesign-batch-3/parfums-tiktok-1440-before.jpg) · [después](screenshots/redesign-batch-3/parfums-tiktok-1440-after.jpg) | [antes](screenshots/redesign-batch-3/parfums-tiktok-768-before.jpg) · [después](screenshots/redesign-batch-3/parfums-tiktok-768-after.jpg) | [antes](screenshots/redesign-batch-3/parfums-tiktok-390-before.jpg) · [después](screenshots/redesign-batch-3/parfums-tiktok-390-after.jpg) |
| Catálogo: inicio | [antes](screenshots/redesign-batch-3/catalogo-inicio-1440-before.jpg) · [después](screenshots/redesign-batch-3/catalogo-inicio-1440-after.jpg) | [antes](screenshots/redesign-batch-3/catalogo-inicio-768-before.jpg) · [después](screenshots/redesign-batch-3/catalogo-inicio-768-after.jpg) | [antes](screenshots/redesign-batch-3/catalogo-inicio-390-before.jpg) · [después](screenshots/redesign-batch-3/catalogo-inicio-390-after.jpg) |
| Catálogo: tarjetas | [antes](screenshots/redesign-batch-3/catalogo-tarjetas-1440-before.jpg) · [después](screenshots/redesign-batch-3/catalogo-tarjetas-1440-after.jpg) | [antes](screenshots/redesign-batch-3/catalogo-tarjetas-768-before.jpg) · [después](screenshots/redesign-batch-3/catalogo-tarjetas-768-after.jpg) | [antes](screenshots/redesign-batch-3/catalogo-tarjetas-390-before.jpg) · [después](screenshots/redesign-batch-3/catalogo-tarjetas-390-after.jpg) |
| Catálogo: panel de filtros | [antes](screenshots/redesign-batch-3/catalogo-filtros-1440-before.jpg) · [después](screenshots/redesign-batch-3/catalogo-filtros-1440-after.jpg) | [antes](screenshots/redesign-batch-3/catalogo-filtros-768-before.jpg) · [después](screenshots/redesign-batch-3/catalogo-filtros-768-after.jpg) | [antes](screenshots/redesign-batch-3/catalogo-filtros-390-before.jpg) · [después](screenshots/redesign-batch-3/catalogo-filtros-390-after.jpg) |
| Catálogo: paginador (nuevo) | [después](screenshots/redesign-batch-3/catalogo-paginador-1440-after.jpg) | [después](screenshots/redesign-batch-3/catalogo-paginador-768-after.jpg) | [después](screenshots/redesign-batch-3/catalogo-paginador-390-after.jpg) |
| Producto | [antes](screenshots/redesign-batch-3/producto-1440-before.jpg) · [después](screenshots/redesign-batch-3/producto-1440-after.jpg) | [antes](screenshots/redesign-batch-3/producto-768-before.jpg) · [después](screenshots/redesign-batch-3/producto-768-after.jpg) | [antes](screenshots/redesign-batch-3/producto-390-before.jpg) · [después](screenshots/redesign-batch-3/producto-390-after.jpg) |
| Combos: inicio | [antes](screenshots/redesign-batch-3/combos-inicio-1440-before.jpg) · [después](screenshots/redesign-batch-3/combos-inicio-1440-after.jpg) | [antes](screenshots/redesign-batch-3/combos-inicio-768-before.jpg) · [después](screenshots/redesign-batch-3/combos-inicio-768-after.jpg) | [antes](screenshots/redesign-batch-3/combos-inicio-390-before.jpg) · [después](screenshots/redesign-batch-3/combos-inicio-390-after.jpg) |
| Combos: sets | [antes](screenshots/redesign-batch-3/combos-sets-1440-before.jpg) · [después](screenshots/redesign-batch-3/combos-sets-1440-after.jpg) | [antes](screenshots/redesign-batch-3/combos-sets-768-before.jpg) · [después](screenshots/redesign-batch-3/combos-sets-768-after.jpg) | [antes](screenshots/redesign-batch-3/combos-sets-390-before.jpg) · [después](screenshots/redesign-batch-3/combos-sets-390-after.jpg) |

La rotación (fotos, sets, ruleta) es movimiento: no se ve en una captura fija; está cubierta por las pruebas con reloj simulado.

## 8. Pendiente / fuera de este lote

- Confirmar con el cliente que `parfums-hero` y el contenedor son las imágenes «aprobadas» del selector (#1).
- Paginación en servidor (#18), ficha de producto sin frascos (#17) y la lógica real de bloqueo de Import (#3): otros PRs.
- T20 (logo en SVG), T25 (héroe vertical) y T25-video siguen abiertos.
