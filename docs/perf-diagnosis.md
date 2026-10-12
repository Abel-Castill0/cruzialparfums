# Diagnóstico de rendimiento de `/parfums` y `/parfums/catalogo`

**Estado:** sólo diagnóstico. No se cambió código ni configuración (las configuraciones temporales usadas para medir se
revirtieron: `git diff -- apps/web/next.config.ts` está vacío). Espera tu decisión.

Rama `claude/apple-design-system` @ `c778fa0`, build de producción local (`next build` + `next start`), Chromium 156 headless.

## Resumen

1. **El problema no es el tamaño del JS.** `/parfums` descarga 157 KB gzip de JS (516 KB raw): **141 KB (90 %) es
   Next + React**, el código propio son ~30 KB raw (~10 KB gzip). No hay JS de terceros: 33 peticiones, todas del mismo origen.
2. **La brecha 2.1 s (real) ↔ 3.2 s (simulado) viene de cómo Lighthouse modela la página, no de un recurso oculto.**
   El LCP es la **imagen del héroe** (`hero-crop.webp`, 87 KB). Con throttling *aplicado* (red lenta + CPU 4× de verdad) el
   LCP es **2.29–2.56 s** (pasa por poco); con el modelo *simulado* es **2.87–3.54 s**, porque asigna 2.0 s (66 %) a "retraso
   de render" (CSS bloqueante + estilo/layout con CPU 4×) y no tiene en cuenta que la imagen ya llegó.
3. **Palanca real y medida: el peso de la imagen del héroe.** Servirla a 1080 px en lugar de 1920 px baja el LCP aplicado de
   **2.36 s a 1.64 s (−0.72 s)**; a 828 px, 1.61 s. Quitar además la fuente: 1.30 s.
4. **Hallazgo nuevo (malo): TBT con CPU 4× aplicado = 332–375 ms** (objetivo < 200). El modelo simulado lo subestima
   (34–42 ms) y mi medición anterior con Playwright también (127–153 ms, otra ventana). Hay que decidir con cuál de las dos
   nos guiamos.
5. **Estilo + layout cuestan ~0.7 s de hilo principal con CPU 4×**, pero ningún efecto visual aislado lo explica
   (cada uno aporta < 100 ms) y **no mueven el LCP** (2.38 s en todas las variantes).

## 1. Los 5 módulos más pesados

Metodología: build con `productionBrowserSourceMaps` (temporal, revertido) y atribución de bytes por fuente a cada chunk de la
primera carga de la ruta (`route-bundle-stats.json` de `next experimental-analyze`); gzip real por chunk, gzip por módulo
estimado proporcionalmente. `@next/bundle-analyzer` (plugin de webpack) no funciona con Turbopack; el equivalente oficial es
`next experimental-analyze` (se ejecutó con `-o`; sus datos binarios quedan en `.next/diagnostics/analyze`).
Totales: **`/parfums` 516 KB raw / 157 KB gzip en 11 chunks; `/parfums/catalogo` 530 KB / 161 KB en 11 chunks.**

### `/parfums`

| # | Módulo | Raw | Gzip (est.) | Origen | ¿Bloquea el render? |
|---|---|---|---|---|---|
| 1 | `next` cliente (router, segment-cache 53.6 KB, router-reducer 23.4 KB, `link`, `app-router`…) | 228.5 KB | 66.7 KB | Next | No: `<script>` async, prioridad *Low* |
| 2 | `react-dom` (compiled) | 202.6 KB | 63.3 KB | React/Next | No (async), pero su evaluación es el grueso del TBT |
| 3 | `react-server-dom-turbopack` | 23.4 KB | 7.1 KB | React/Next | No |
| 4 | `components/parfums/*` (cabecera, carrito, buscador, carrusel) | 20.2 KB | 6.9 KB | **Propio** | No (hidratación) |
| 5 | runtime de Turbopack | 9.8 KB | 3.9 KB | Next | No |
| — | `components/storefront/*` (`Reveal`, marquee, vídeo) | 7.6 KB | 2.5 KB | Propio | No |

### `/parfums/catalogo`

| # | Módulo | Raw | Gzip (est.) | Origen | ¿Bloquea el render? |
|---|---|---|---|---|---|
| 1 | `next` cliente | 228.5 KB | 66.7 KB | Next | No |
| 2 | `react-dom` | 202.6 KB | 63.3 KB | React/Next | No |
| 3 | `components/parfums/*` (**catálogo, filtros, tarjetas, recomendador**) | 38.2 KB | 12.1 KB | **Propio** | No (hidratación) |
| 4 | `react-server-dom-turbopack` | 23.4 KB | 7.1 KB | React/Next | No |
| 5 | runtime de Turbopack | 9.8 KB | 3.9 KB | Next | No |
| — | `domains/finder`, `domains/catalog`, `domains/carts` | 3.4 + 2.3 + 2.0 KB | ~2.5 KB | Propio | No |

Por chunk (los mismos 5 más grandes en ambas rutas): `3odt6ak0509r2.js` 224.1 KB raw / 70.1 gzip (react-dom),
`0v2s8pfzbm7q7.js` 128.2 / 34.9 (cliente de Next), `0ce_08-ozszwm.js` 39.5 / 13.6, `1244yipdigkhq.js` 33.2 / 8.5,
`1kkcb1l5ds-0a.js` 30.7 / 9.4 (RSC). Código propio total en `/parfums`: ~30 KB raw; en `/parfums/catalogo`: ~46 KB raw.

**Terceros: ninguno** (TikTok, analytics y Cloudinary no aparecen como JS). TikTok sólo carga su iframe tras el toque en
"Reproducir"; Cloudinary llega como imágenes por el optimizador del mismo origen (`/_next/image`); `third-party-summary` de
Lighthouse sale vacío. Único tercero en el bundle: `@swc/helpers` (0.7 KB).

**Lo que bloquea el render no es JS sino CSS:** 5 hojas de estilo (3 + 11 + 2 + 15 + 1 = ~32 KB transferidos, 12 KB sin usar
en esta ruta) marcadas *VeryHigh*, y una fuente `woff2` de 29 KB (*High*, `font-display: swap`). Todo el JS es async/*Low*.

## 2. Lighthouse con throttling personalizado (4G lento + CPU 4×)

Parámetros: RTT 150 ms, 1 638 Kbps, CPU 4×. Tres ejecuciones por método. Reportes HTML adjuntos:
[`docs/lighthouse/perf-parfums-slow4g-cpu4x-applied.html`](lighthouse/perf-parfums-slow4g-cpu4x-applied.html) y
[`…-simulated.html`](lighthouse/perf-parfums-slow4g-cpu4x-simulated.html) (la segunda ejecución de cada serie).

| Método | Perf | FCP | **LCP** | **TBT** | CLS |
|---|---|---|---|---|---|
| *Aplicado* (`devtools`: el navegador está realmente limitado) | 86 / 87 / 87 | 2.34 / 2.27 / 2.30 s | **2.37 / 2.29 / 2.56 s** | **373 / 375 / 332 ms** | 0 |
| *Simulado* (modelo Lantern, el predeterminado de Lighthouse) | 95 / 93 / 90 | 1.51 s | **2.87 / 3.10 / 3.54 s** | 42 / 40 / 34 ms | 0 |
| Playwright real, CPU 4× + 1.6 Mbps (mediana de 5, medición anterior) | — | 1.38 s | 2.14 s | 136 ms | 0 |

Dos lecturas honestas: el LCP **aplicado** pasa (≤ 2.5 s en 2 de 3) y el **simulado** falla (3 de 3); y el TBT **aplicado
falla** (3 de 3) mientras el simulado pasa con holgura. Los tres números no son comparables entre sí.

## 3. El elemento LCP de `/parfums`

- **Elemento:** `<img>` del héroe: `div > main.home > section.hero > img` (alt "Composición de Cruzial Parfums con frascos de
  diseñador y el nombre de la marca"). **Es una imagen, no texto.** Archivo `public/parfums/hero/hero-crop.webp`
  (fuente 1672×792, 160 KB), servido por `/_next/image?url=/parfums/hero/hero-crop.webp&w=1920&q=60` → **87 KB** WebP.
- **Descubrimiento correcto:** `fetchpriority=high` aplicado, descubrible en el HTML inicial, sin *lazy*, con `<link rel=preload>`.
- **Cuándo se pinta (throttling aplicado, ejecución 2):**

| Fase | ms | % | Qué pasa |
|---|---|---|---|
| TTFB | 43 | 2 % | documento del servidor local |
| Retraso de carga | 650 | 28 % | el navegador **espera al HTML** (813 ms con la red limitada) antes de pedir la imagen: nace en t=693 |
| **Tiempo de carga** | **1 393** | **61 %** | la imagen (87 KB) comparte el enlace de 1.6 Mbps con la fuente (29 KB) y 5 CSS (32 KB): acaba en t=2 085 |
| Retraso de render | 206 | 9 % | pintar tras la imagen |

  → **LCP 2.29 s = la imagen terminando de descargar (+0.2 s).** En el modelo simulado la composición es distinta: carga
  corta (0.16 s), pero **2 036 ms (66 %) de retraso de render** modelados (CSS bloqueante + estilo/layout a 4×).
- **Qué la retrasa, en orden:** (1) su propio peso a 1920 px de ancho; (2) competir con la fuente y los CSS por el mismo
  ancho de banda; (3) el documento (45 KB) tiene que llegar antes de poder pedirla.

### Comprobación (experimento de diagnóstico, 7 ejecuciones/variante, mediana, móvil 390 px DPR 1.75, CPU 4× + 1.6 Mbps)

| Variante (sólo para medir; no está implementada) | FCP | **LCP** |
|---|---|---|
| Línea base (imagen 1920 px, 87 KB) | 1.51 s | **2.36 s** |
| Imagen a 1080 px (44 KB) | 1.24 s | **1.64 s** (−0.72) |
| Imagen a 828 px (30 KB) | 1.34 s | **1.61 s** (−0.75) |
| Sin fuente Geist (bloqueada) | 1.31 s | 2.26 s (−0.11) |
| Imagen 828 px + sin fuente | 1.19 s | **1.30 s** (−1.07) |

Otra causa de fondo: en móvil el CSS dibuja la imagen al 250 % del ancho (975 px CSS) pero **sólo se ve el ~40 % central**;
con DPR 1.75 `next/image` pide 1920 px para cubrir los 975 px enteros. Un recorte móvil de sólo la zona visible
(~700 px de ancho) rondaría 25–30 KB, sin cambiar lo que ve el visitante.

### Coste de render (mismo entorno, CPU 4×; indicador de lo que ocupa el hilo principal)

| Variante (CSS inyectado) | LCP | TBT | Estilo | Layout | Script | Hilo principal |
|---|---|---|---|---|---|---|
| Línea base | 2 380 | 150 | 139 | 594 | 228 | 1 566 ms |
| sin `mix-blend-mode` | 2 380 | 158 | 130 | 518 | 231 | 1 388 |
| sin `backdrop-filter` ni `mask-image` | 2 376 | 112 | 110 | 478 | 193 | 1 341 |
| sin `filter` ni `box-shadow` | 2 376 | 113 | 118 | 481 | 181 | 1 323 |
| `content-visibility: auto` bajo el pliegue | 2 388 | 106 | 105 | 481 | 196 | 1 314 |
| sin el riel de productos | 2 384 | 117 | 108 | 482 | 188 | 1 352 |

Ningún efecto aislado pesa más de ~250 ms de hilo principal ni mueve el LCP; el *layout* (~480–590 ms) es casi constante.
El DOM es pequeño (669 nodos): el coste viene del volumen de reglas CSS y de la rejilla, no del árbol. Tareas largas con
throttling aplicado: documento 570 ms @1.69 s y 279 ms @2.32 s (análisis HTML + estilo/layout), `react-dom` 196 ms @2.97 s.

## 4. ¿Hay margen real?

| Palanca | Efecto estimado | Cambia el diseño | Evidencia |
|---|---|---|---|
| Servir el héroe a ~1080 px (o recorte móvil dedicado ≈ 30 KB) | **LCP −0.7 s** (aplicado); mejora también el simulado | No | medido arriba |
| Fuente Geist (un `woff2` variable de 29 KB): subconjunto o precarga más temprana | LCP −0.1 s, FCP −0.2 s | No | medido |
| Código propio dividido (`dynamic`) para recomendador/filtros/vídeo | −10 a −20 KB raw en `/parfums`; poco en LCP | No | ~30 KB propios en total |
| Reducir hidratación del framework (141 KB gzip) | No hay palanca local: es Next 16 + React 19 | — | atribución |
| CSS: purgar 12 KB sin usar / dividir por ruta | FCP algo menor; no mueve el LCP | No | `unused-css-rules` |
| `inlineCss` | FCP −0.25 s pero TBT 186–257 ms (probado y revertido) | No | sesión anterior |
| `content-visibility: auto` bajo el pliegue | TBT ~−40 ms, hilo −250 ms | Riesgo de saltos de scroll en `Reveal` | medido |

**Conclusión.** Para cumplir "LCP < 2.5 s" en la simulación de Lighthouse hace falta bajar sobre todo el **peso de la imagen
del héroe**; el JS casi no tiene margen (90 % es framework). El TBT aplicado (330–375 ms) es un problema distinto, que viene de
la hidratación + estilo/layout con CPU 4× y no tiene una palanca única.

## 5. Decisión que necesito

1. ¿Optimizo la imagen del héroe (a ~1080 px o recorte móvil) y la fuente? Es la mejora medida más grande y no toca el diseño.
2. ¿Qué número manda para TBT: el aplicado (falla, 330–375 ms) o el simulado/Playwright (pasa)? Si manda el aplicado habrá que
   atacar hidratación/estilo, con ganancia incierta (~50–150 ms por palanca).
3. ¿Acepto el LCP aplicado (2.3–2.5 s) como "cumple" y dejo el simulado como referencia informativa?
