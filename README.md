# Cruzial Parfums — Decants y frascos (menor y mayor)

Sitio estático multi-página, elegante y de lujo para Cruzial Parfums, basado en el **CATALOGO DE DECANTS.pdf (38 páginas, 2026)** como fuente oficial. Venden decants de **3, 5 y 10 ml** de perfumería árabe, diseñador y nicho, más combos árabes y frascos completos, al por menor y al por mayor. Sin pasarela de pagos: el cliente arma su carrito, completa sus datos en el checkout y el pedido se envía por WhatsApp (se confirma con **50% de adelanto**).

## Datos oficiales (del PDF)

| Dato | Valor |
| --- | --- |
| WhatsApp | **924 590 921** (configurado como `51924590921`) |
| Instagram | **@Cruzial_parfum** |
| Formatos | Decants **3 / 5 / 10 ml** |
| Atomizaciones | 3 ml ≈ 50–60 · 5 ml ≈ 70–80 · 10 ml ≈ 140–150 |
| Presentación | Árabe: decant clásico · Diseñador/nicho: 3 ml clásico, 5/10 ml premium |
| Envíos | Delivery gratis por la **Línea 1 del tren eléctrico** (Lima Metropolitana) · motorizado (costo adicional) para otras zonas · **contraentrega** en Lima Metropolitana · **Shalom u Olva** a todo el Perú |
| Confirmación | Pedido se confirma con **50% de adelanto** |
| Métodos de pago | "Aceptamos todos los métodos de pago que se pueden visualizar, pedir tu método favorito al contacto oficial" (no se inventa una lista) |
| Combos | Cuarteto Oriental (40/55/89) · Vainilla Freak (27/39/65) · Set Tulum (31/42/71) |

## Estructura

| Archivo | Descripción |
| --- | --- |
| `index.html` | Home: hero, colecciones, bestsellers, combos árabes, frascos completos, arte del decant, cómo comprar, mayorista, FAQ, newsletter |
| `catalog.html` | Catálogo (95 productos) con filtros (género, familia, tipo: árabe/designer/nicho/combo, formato) y ordenamiento; `?format=bottle` abre solo frascos |
| `product.html?id=...` | Detalle: notas, concentración, decants 3/5/10 ml, frasco completo, atomizaciones y presentación |
| `checkout.html` | Carrito + datos del pedido → WhatsApp, con opciones de entrega reales y nota del 50% |
| `nosotros.html` | Historia y valores de la casa |
| `mayorista.html` | Tarifas de referencia (3/5/10 ml y combos) y formulario de cotización |
| `contacto.html` | Contacto: WhatsApp 924 590 921, Instagram @Cruzial_parfum, envíos y contraentrega |
| `logo.jpeg` | Logo oficial del cliente (medallón en header, footer y menú móvil) |
| `CATALOGO DE DECANTS.pdf` | Fuente oficial de productos y precios |
| `assets/data.js` | Configuración + 95 productos (66 árabes + 22 designer + 4 nicho + 3 combos) con precios 3/5/10 ml |
| `assets/styles.css` | Sistema de diseño Noir & Gold (dorado del logo) + responsive 320–1440 px |
| `assets/app.js` | Carrito, buscador, drawer, botellas SVG, combos, frascos, WhatsApp |

## Notas sobre el catálogo digital

- **Descontinuados excluidos**: el PDF marca DESCONTINUADO a Lovely Cherry, Bharara King y Le Male Le Parfum; no se listan en la tienda.
- **Royal Blend Sequoia** aparece en el PDF sin precios legibles; no se incluye hasta tener precio oficial.
- **Precios de frasco completo**: el PDF no publica precios de frascos (solo decants). Los `bottle` en `data.js` son **referenciales** y deben confirmarse con el cliente antes de producción.
- **Casa / marca, género, familia y notas** se asignaron con conocimiento público para los clonados más conocidos (Lattafa, Afnan, Armaf, Rasasi, etc.) y las casas de diseñador/nicho; revisar con el cliente si quiere campos más conservadores. Productos sin casa confirmada muestran solo el nombre.
- Combos: el PDF no detalla el contenido de cada combo; la web indica "el contenido exacto se confirma por WhatsApp".

## Personalización obligatoria antes de producción

1. **Número de WhatsApp**: `WA_NUMBER` en `assets/data.js` ya está en `51924590921` (924 590 921). Cambiarlo solo si el número oficial cambia; también aparece en los enlaces `wa.me` de cada HTML.
2. **Productos**: precios de decant (`price`, 3/5/10 ml) y frasco referencial (`bottle`) en `assets/data.js`. El color de cada botella SVG se controla con `mood.a`, `mood.b`, `mood.liquid` y `mood.glow`.
3. **Redes sociales**: TikTok no tiene usuario oficial en el PDF (enlace genérico); completar si el cliente lo facilita.
4. **Políticas reales**: envíos, 50% de adelanto y métodos de pago ya reflejan el PDF; ajustar solo si el cliente indica cambios.
5. **Dominio y analítica**: añadir cuando se despliegue.

## Flujo de compra

1. Explorar colección o buscar por marca/nota.
2. Añadir al carrito: decant (3, 5 o 10 ml), combo árabe o frasco completo.
3. Carrito persistente en `localStorage` (drawer lateral en todas las páginas); cada formato se suma por separado.
4. Checkout con datos de contacto y opción de entrega (Línea 1 gratis, motorizado, contraentrega, Shalom/Olva) → botón "Enviar pedido por WhatsApp" que abre `wa.me/51924590921` con el pedido detallado (indica "Frasco X ml" cuando corresponde) y el total estimado.
5. El asesor confirma stock, envío y total; **el pedido se cierra con el 50% de adelanto**.

## Despliegue

Sitio 100% estático: basta subir la carpeta a cualquier hosting (Netlify, Vercel, GitHub Pages, cPanel). No requiere build ni dependencias.