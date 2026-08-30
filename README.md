# Cruzial Parfums — Decants y frascos (menor y mayor)

Sitio estático multi-página para Cruzial Parfums, basado en el **CATALOGO DE DECANTS.pdf (38 páginas, 2026)** como fuente oficial. Venden decants de **3, 5 y 10 ml** de perfumería árabe, diseñador y nicho, más combos árabes y frascos completos, al por menor y al por mayor. Sin pasarela de pagos: el cliente arma su carrito, completa sus datos en el checkout y el pedido se envía por WhatsApp (se confirma con **50% de adelanto**).

> Reglas permanentes del proyecto (datos nunca inventados, `assets/data.js` como
> única fuente de verdad) están en [`CLAUDE.md`](CLAUDE.md). Léelo antes de tocar
> precios, disponibilidad o cualquier dato comercial.

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
| Combos | Cuarteto Oriental (S/ 40 / 55 / 89) · Vainilla Freak (S/ 27 / 39 / 65) · Set Tulum (S/ 31 / 42 / 71) |

Estos valores viven en `assets/data.js` (`CRUZIAL_CONFIG` y `CRUZIAL_PRODUCTS`).
Los conteos de esta tabla y de abajo se verifican contando ese archivo, no de memoria —
si el catálogo cambia, esta sección puede desactualizarse; confirmar contra `data.js`.

## Estructura

| Archivo | Descripción |
| --- | --- |
| `index.html` | Home: hero → separación Decants / Perfumes Completos → Selección Cruzial (curaduría editorial) → Colecciones (combos) → La Experiencia Decant (formatos) → "arma tu combo" → Frasco Completo → Compra por Volumen (teaser mayorista) → CTA final |
| `catalog.html` | Catálogo de decants (**96 fragancias**: 69 árabes + 23 designer + 4 nicho) con filtros (género, familia, tipo, formato) y ordenamiento; incluye el armador de combos ("arma tu combo") |
| `perfumes-enteros.html` | Catálogo de frascos completos (perfume original sellado, por unidad o cotización por volumen) |
| `product.html?id=...` | Detalle: notas, concentración, decants 3/5/10 ml, frasco completo, atomizaciones y presentación |
| `checkout.html` | Carrito + datos del pedido → WhatsApp, con opciones de entrega reales y nota del 50% |
| `nosotros.html` | Historia y valores de la casa; también aloja Cruzial Journal, Cómo Comprar, FAQ y Newsletter (ver nota de arquitectura abajo) |
| `mayorista.html` | Tarifas de referencia (3/5/10 ml y combos) y formulario de cotización |
| `contacto.html` | Contacto: WhatsApp 924 590 921, Instagram @Cruzial_parfum, envíos y contraentrega |
| `logo.jpeg` | Logo oficial del cliente (medallón en header, footer y menú móvil) |
| `CATALOGO DE DECANTS.pdf` | Fuente oficial de productos y precios |
| `CLAUDE.md` | Reglas permanentes del proyecto (zero invented commerce, single source of truth) |
| `assets/data.js` | Configuración + **99 productos** (96 individuales + 3 combos) con precios 3/5/10 ml — única fuente de verdad comercial |
| `assets/styles.css` | Sistema de diseño noir + ivory + acento dorado, con tokens en `:root` y variantes `.section-obsidian` / `.section-ivory` |
| `assets/app.js` | Carrito, buscador, drawer, botellas SVG, combos, frascos, WhatsApp |

### Nota de arquitectura pendiente: FAQ / Cómo Comprar / Newsletter en `nosotros.html`

Estos tres bloques viven hoy en `nosotros.html` porque se removieron del home en la
reestructuración de Fase 3 (para que el home no cargara con contenido de soporte)
y se reubicaron ahí como destino temporal. Quedó documentado como una decisión
**pendiente de revisión**, no definitiva:

- FAQ no debería sentirse "escondida" bajo Nosotros — la opción evaluada es un
  bloque corto de FAQ en el home (`index.html#faq`) con enlace desde el footer,
  o una página propia `faq.html` si el catálogo crece lo suficiente para justificarla.
- Newsletter no tiene backend real (el `<form id="newsletter-form">` no envía a
  ningún servicio) — evaluar si eliminarlo del todo hasta tener uno, en vez de
  mantenerlo como formulario inerte en cualquier página.
- Cómo Comprar es contenido de conversión (reduce fricción antes de comprar) y
  probablemente pertenece más cerca del catálogo/checkout que de la página
  institucional "Nosotros".

No implementar esta reubicación sin decisión explícita — ver `CLAUDE.md` sobre
cambios estructurales por fases.

## Notas sobre el catálogo digital

- **Descontinuados excluidos**: el PDF marca DESCONTINUADO a **Lovely Cherry**,
  **Bright Peach** (ambos Maison Alhambra) y **Ultra Male** (Jean Paul Gaultier);
  no se listan en catálogo, búsqueda ni destacados. (Nota: **Bharara King** SÍ es
  un producto activo normal — no está descontinuado.)
- **Royal Blend Sequoia** está incluido en el catálogo con precio oficial
  (S/ 12 / 16 / 26) — ya no está pendiente de precio.
- **Precios de frasco completo**: el PDF no publica precios de frascos (solo decants). Los `bottle` en `data.js` son **referenciales** y deben confirmarse con el cliente antes de producción.
- **Casa / marca, género, familia y notas** se asignaron con conocimiento público para los clonados más conocidos (Lattafa, Afnan, Armaf, Rasasi, etc.) y las casas de diseñador/nicho; revisar con el cliente si quiere campos más conservadores. Productos sin casa confirmada muestran solo el nombre.
- Combos: el PDF no detalla el contenido de cada combo; la web indica que el
  contenido exacto se confirma por WhatsApp (o el cliente arma el suyo con el
  combo-builder de `catalog.html`). El home no repite la cifra agregada de
  atomizaciones por combo — esa cifra vive solo en el `desc` de cada combo en
  `data.js`, donde está correctamente escopeada por producto.
- **"Bestseller"** es un campo interno en `data.js` (curaduría editorial del
  equipo), no una métrica de ventas verificada. Ninguna interfaz lo presenta
  como filtro, badge u orden — ver el comentario junto al campo en `data.js` y
  la regla ZERO INVENTED COMMERCE en `CLAUDE.md`.
- **"Desde S/ X"** en cualquier página se calcula únicamente sobre productos
  activos (`discontinued !== true`); un producto descontinuado nunca debe
  arrastrar el precio mínimo mostrado hacia abajo.

## Personalización obligatoria antes de producción

1. **Número de WhatsApp**: `WA_NUMBER` en `assets/data.js` ya está en `51924590921` (924 590 921). Cambiarlo solo si el número oficial cambia; también aparece en los enlaces `wa.me` de cada HTML.
2. **Productos**: precios de decant (`price`, 3/5/10 ml) y frasco referencial (`bottle`) en `assets/data.js`. El color de cada botella SVG se controla con `mood.a`, `mood.b`, `mood.liquid` y `mood.glow`.
3. **Redes sociales**: TikTok no tiene usuario oficial en el PDF (enlace genérico); completar si el cliente lo facilita.
4. **Políticas reales**: envíos, 50% de adelanto y métodos de pago ya reflejan el PDF; ajustar solo si el cliente indica cambios.
5. **Dominio y analítica**: añadir cuando se despliegue.
6. **Foto de hero real**: el hero usa arte generado (SVG) como placeholder hasta
   que el cliente entregue fotografía de producto real; ver especificación
   técnica del hero (formato, resolución, zonas seguras) antes de reemplazarlo.

## Flujo de compra

1. Explorar colección o buscar por marca/nota.
2. Añadir al carrito: decant (3, 5 o 10 ml), combo árabe o frasco completo.
3. Carrito persistente en `localStorage` (drawer lateral en todas las páginas); cada formato se suma por separado.
4. Checkout con datos de contacto y opción de entrega (Línea 1 gratis, motorizado, contraentrega, Shalom/Olva) → botón "Enviar pedido por WhatsApp" que abre `wa.me/51924590921` con el pedido detallado (indica "Frasco X ml" cuando corresponde) y el total estimado.
5. El asesor confirma stock, envío y total; **el pedido se cierra con el 50% de adelanto**.

## Despliegue

Sitio 100% estático: basta subir la carpeta a cualquier hosting (Netlify, Vercel, GitHub Pages, cPanel). No requiere build ni dependencias. Desplegado actualmente en GitHub Pages: `https://abel-castill0.github.io/cruzialparfums/`.
