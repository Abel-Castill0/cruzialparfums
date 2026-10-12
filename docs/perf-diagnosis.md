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
4. **Hallazgo nuevo (malo): TBT con CPU 4× aplicado = 332–375 ms** (causa raíz en la sección 6: hidratación + un segundo layout completo por el cambio de fuente) (objetivo < 200). El modelo simulado lo subestima
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

## 6. TBT root cause

**Estado:** sólo diagnóstico: no se optimizó ni se cambió código para esta sección (los experimentos de bisección inyectaron CSS en el navegador, nada en el repositorio).
Medido sobre el build de `59fc3bc` (el de la sección 2 era `c778fa0`; la diferencia es el enlace «Saltar al contenido», 44 líneas),
Chromium 156, móvil 390 px, **throttling aplicado**: RTT 150 ms, 1 638 Kbps, CPU 4×. Informe adjunto:
[`docs/lighthouse/perf-parfums-tbt-diagnosis-applied.html`](lighthouse/perf-parfums-tbt-diagnosis-applied.html) (ejecución 2).

### 6.1 Veredicto

Mi diagnóstico previo («90 % framework, ~30 KB propios, sin terceros») era correcto **y no contradice un TBT de 330–650 ms**: el
bloqueo no viene de cuánto JS se descarga sino de **tres trabajos del hilo principal que no son código propio**, y uno de ellos
**ni siquiera es JavaScript**:

| # | Trabajo | Peso (CPU 4×) | Naturaleza | Cuenta para el TBT |
|---|---|---|---|---|
| 1 | **Primer layout** de toda la página (1 105 objetos, 8 400 px de alto) | 336–345 ms | render | no (acaba antes del FCP) |
| 2 | **Segundo layout completo**, provocado por el intercambio de fuente (`font-display: swap`, Geist 29 KB) | 290 ms | render | **sí cuando la fuente llega después del primer layout (1 de 3 ejecuciones)** |
| 3 | **Hidratación**: un solo microtask ininterrumpido en el chunk principal | 295–304 ms | hidratación | **sí, siempre (~290–300 ms)** |

Por eso el TBT no es estable: **298, 649 y 300 ms** en tres ejecuciones idénticas. Con 3 trabajos de ~300 ms, el TBT es ≈ 300 ms
cuando sólo la hidratación cae después del FCP, y ≈ 650 ms cuando además el segundo layout (el de la fuente) también cae después.
El rango 332–375 ms de la sección 2 corresponde al primer caso.

### 6.2 Las 5 tareas largas (> 50 ms)

Extraídas de la traza de Lighthouse (`RunTask` del hilo `CrRendererMain`, tiempo propio por tipo de evento). Tiempos con CPU 4×
(÷4 ≈ ms reales en un portátil). «Bloqueo» = duración − 50 ms.

| # | Inicio | Duración | Bloqueo | Tipo | Módulo / función | Detalle |
|---|---|---|---|---|---|---|
| 1 | ≈ 0.95–1.04 s | **336–418 ms** | 331–368 | **render** | `Layout` (documento `/parfums`) | 1 105 objetos, todos sucios; + `UpdateLayoutTree` 83–85 ms (1 353 elementos). 0 ms de JS. Es un `LoAF` de 1 171 ms **sin ningún script**. |
| 2 | ≈ 2.29–2.31 s | **337–356 ms** | 287–306 | **hidratación** | chunk `0s7mvllxht1mo.js` (el principal de la app): `EvaluateScript` 331–347 ms, de ellos `RunMicrotasks` 295–304, `v8.compile` 26–34, `FunctionCall` 8–12 | `hydrateRoot` en una sola pasada. En el perfil de CPU no hay función caliente: lo mayor es `I` del runtime de Turbopack (instanciación de módulos) con **115 ms de tiempo propio**; el resto son decenas de funciones de React de 4–16 ms (`ax`, `ih`, `r2`, `sw`…). |
| 3 | ≈ 1.40 s (sólo ejecución 2) | **368 ms** | 318 | **render** | `Layout` 290 ms + `Paint` 42 | Segundo layout **completo** (1 101 de 1 105 objetos sucios). Desencadenante: `ResourceFinish` del `woff2` (29 288 B) a 1 387 ms → `ScheduleStyleRecalculation` → `InvalidateLayout`. En las ejecuciones 1 y 3 la fuente llegó antes del primer layout y esta tarea no existe. |
| 4 | ≈ 0.87–0.95 s | **85–114 ms** | 35–64 | render | `UpdateLayoutTree` 83–112 ms | Cálculo de estilo inicial (1 353 elementos, 5 hojas CSS ≈ 32 KB). |
| 5 | ≈ 2.94–2.97 s | **52–66 ms** | 2–16 | efectos/observer (inferido) | `FunctionCall` 50–63 ms, mismo chunk principal | Justo después de hidratar: se ejecutan los `useEffect` de montaje y llegan los callbacks iniciales de los observers (ver 6.5). Sin `Layout` ni estilo dentro. |

Atribución de «terceros»: **ninguna** de las cinco. Todas las peticiones son del mismo origen. El único script ajeno es `@swc/helpers`
(0.7 KB).

### 6.3 Treemap de scripts y arranque

Del audit `script-treemap-data` de Lighthouse (equivalente al Treemap de la pestaña Performance), sin comprimir:

| Script | Tamaño | Sin usar |
|---|---|---|
| **HTML de `/parfums` (payload RSC inline)** | **268 KB** | 0 |
| `0s7mvllxht1mo.js` (app + React DOM) | 224 KB | 89 KB |
| `1sgwvm69hc9zb.js` | 128 KB | 50 KB |
| `1-nqmp1rl8kqt.js` | 33 KB | 13 KB |
| `1mqv4bxw7o_2a.js` | 31 KB | 13 KB |
| 7 más | < 25 KB cada uno | |

`bootup-time`: el chunk principal consume **711 ms de scripting** (con CPU 4×); el documento sólo 13 ms de scripting + 27 ms de
análisis. Reparto del hilo principal en la carga (ejecución 1): ejecución de scripts 888 ms, otros 430, **estilo y layout 402**,
compilación 80, renderizado 74, HTML/CSS 47, GC 12.

### 6.4 Componentes cliente de `/parfums`

Calculado con el grafo de importaciones de `app/layout.tsx` → `app/parfums/layout.tsx` → `app/parfums/page.tsx` y con el
`page_client-reference-manifest` del build.

**7 fronteras `"use client"` propias** (el resto de lo que importan entra al bundle cliente por arrastre, ~23 módulos, de los
que 15 son hojas CSS y utilidades de dominio de carrito/catálogo):

| Componente | Líneas | Por qué es cliente (y si podría no serlo) |
|---|---|---|
| `shell/site-header-actions.tsx` | 296 | Cajón de carrito, buscador, teclado, `storage`; estado e interacción. Legítimo. Pero **recibe todo el catálogo como props** (6.6). |
| `home/combo-carousel.tsx` | 228 | Autoplay con `setInterval`, estado de índice, 2 observers, táctil. Legítimo; el autoplay es lo discutible. |
| `storefront/home/product-marquee.tsx` | 262 | Bucle `requestAnimationFrame` que mueve `scrollLeft` + flechas + 1 observer. El carrusel **es CSS `scroll-snap`** (`overflow-x: auto; scroll-snap-type: x proximity`), sin librería; el JS sólo añade la deriva automática y las flechas. |
| `storefront/home/video-story.tsx` | 78 | Estado del vídeo / consentimiento. Legítimo. |
| `shell/hero-aware-header.tsx` | 72 | `IntersectionObserver` que oculta/muestra la cabecera sobre el héroe. Podría ser CSS (`animation-timeline`) pero depende del soporte de `animation-timeline` en Safari. |
| `storefront/home/reveal.tsx` | 70 | Entrada al hacer scroll. **Candidato a CSS** (`animation-timeline: view()`) con soporte irregular de Safari. |
| `storefront/skip-link.tsx` | 44 | Nuevo (WCAG 2.4.1): `onClick` + `usePathname`. Legítimo. |

Más `cart/use-parfums-cart.ts` (hook cliente, `useSyncExternalStore`) y los de Next (`link`, `image-component`, `layout-router`,
`error-boundary`…). **No hay librerías de carrusel, animación ni estado de terceros.**

### 6.5 Las verificaciones concretas

| Pregunta | Resultado |
|---|---|
| **¿`IntersectionObserver` único o uno por tarjeta?** | **6 observers para 95 objetivos.** `Reveal` usa **uno compartido** (`rootMargin 0 0 -8% 0`) para sus 95 objetivos; los otros 5 son uno por componente propio (marquee ×1, combo ×2, cabecera ×1) y el de `rootMargin: 200px`, que no está en el código propio: es el observer compartido de `next/link` para el *prefetch* (se infiere del margen; no se verificó en el código de Next). No existe el antipatrón de 99 observers. |
| **¿`useEffect` pesado en el montaje?** | **No.** Todos los efectos de montaje son registro de observers/listeners y `matchMedia`. El único trabajo continuo es el `rAF` del marquee (sólo mientras está en pantalla); el `LoAF` muestra `forcedStyleAndLayoutDuration = 0`, es decir, no fuerza layout. |
| **¿Qué atribuye el perfil de CPU (muestreo 200 µs)?** | De 6 284 ms de perfil, 4 977 ms son *idle*; el JS propio y de frameworks suma ≈ 450 ms repartidos en ~7 archivos y decenas de funciones: **no hay una función dominante**. |
| **¿Carrusel con librería pesada?** | No: `scroll-snap` CSS + ~260 líneas propias (marquee) y ~230 (combos). |
| **Tamaño del payload RSC** | HTML de 396 KB (44.7 KB gzip); **274 KB (69 %) es el flight RSC** (32.6 KB gzip). En `/parfums/catalogo`: HTML 782 KB, flight 428 KB (55 %). |

### 6.6 Hallazgo adicional: el layout serializa el catálogo completo en cada página

La fila RSC `d:` (el layout) pesa **195 KB**, y **178 KB son `cartProducts`**: 98 productos con precios por tamaño, ids, marca,
familia, etc., que `app/parfums/layout.tsx` pasa a `SiteHeader` → `SiteHeaderActions` (cliente) **en cada página de
`/parfums/**`**, más 14 KB de `searchProducts` (95 productos). Para el cajón de carrito y el buscador se envía el catálogo
entero aunque la página (p. ej. `/parfums/contacto`) no lo use.

Su coste en TBT, medido, es **bajo**: análisis de ese script 13 ms de scripting + 27 ms de parseo del documento con CPU 4×, y
ninguna función de deserialización aparece en el perfil. Lo que cuesta es **transferencia (~33 KB gzip por navegación completa),
memoria y trabajo de comparación de props en la hidratación**, no un bloqueo propio. Se anota como deuda (ticket T12), no como
causa del TBT.

### 6.7 Por qué la estructura de la página produce esos tres trabajos

- **El layout cuesta lo mismo que toda la página, no una sección.** Bisección: ocultar una a una las 9 secciones de `<main>`, el
  pie o la cabecera no deja un culpable claro (layout acumulado 289–591 ms frente a 377 ms de la base; la dispersión entre
  variantes iguales supera el efecto de cualquier bloque). **La única variante que mueve la aguja es `content-visibility: auto`
  en las secciones 3+: layout 377 → 195 ms, estilo 124 → 78 ms, hilo principal 1 277 → 1 004 ms** (5 cargas, mediana). El coste
  es proporcional al volumen total (1 105 objetos, 8 400 px), y se paga **dos veces** si la fuente llega tarde.
- **`text-wrap: balance` no es la causa** (`text-wrap: wrap` forzado: 348 ms, dentro del ruido). Tampoco las animaciones
  (deshabilitarlas no baja el layout), ni `contain: layout style` en las secciones (345 ms).
- **La hidratación es plana:** 7 fronteras cliente, 714 elementos DOM, 516 KB de JS
  (141 KB gzip de framework). Sin función caliente, no hay una optimización local que la baje de forma notable; el único método
  que la reduce de verdad es hidratar menos (menos fronteras cliente o `dynamic`/carga diferida de lo que está bajo el pliegue).

### 6.8 Qué lo reduciría (sin aplicar; estimación a partir de lo medido)

| Palanca | Ataca | Efecto esperado | Riesgo / cambia el diseño |
|---|---|---|---|
| Que la fuente Geist llegue antes del primer layout (`<link rel="preload">` ya la marca *High*; alternativa: `font-display: optional` o `size-adjust` más exacto en el fallback) | Tarea 3 (segundo layout) | Elimina ~290–368 ms de bloqueo en la ejecución mala: **TBT 650 → ~300 ms** y lo hace estable | `optional` puede dejar la fuente de respaldo en la primera visita; no cambia el diseño con un `size-adjust` fiel |
| `content-visibility: auto` + `contain-intrinsic-size` en secciones bajo el pliegue | Tareas 1 y 4 (y el relayout de la 3) | Layout −48 %, estilo −37 % (medido); **sin efecto en hidratación** | Posibles saltos de scroll con `Reveal`; hay que fijar alturas |
| Cargar bajo demanda lo que está bajo el pliegue (`combo-carousel`, `video-story`) o sustituir `Reveal`/header por CSS | Tarea 2 (hidratación) | −20 a −60 ms esperados (inferido; sin medir) | Soporte de `animation-timeline` en Safari (no verificado) |
| No pasar `cartProducts`/`searchProducts` al layout en cada página (cargar al abrir el cajón/buscador) | Payload (6.6) | −178 KB raw (~−14 KB gzip) del documento; TBT sin cambio apreciable | Cambia el flujo de datos del carrito: requiere diseño propio |

**Para llegar a < 200 ms con CPU 4× aplicada** habría que bajar la hidratación de ~300 a < 200 ms **y** evitar el segundo layout.
La primera mitad no tiene una palanca de bajo riesgo identificada (el JS es 90 % framework); es honesto decir que **no veo cómo
garantizar < 200 ms con el aplicado sin reducir de verdad lo que se hidrata**. La segunda mitad sí es barata y estable.

### 6.9 Limitaciones de esta medición

- Tres ejecuciones de Lighthouse aplicado; el TBT dio 298 / 649 / 300 ms, así que **cualquier cifra única es engañosa**: la
  distribución es bimodal según llegue o no la fuente antes del primer layout.
- La bisección de layout es una sola serie de 5 cargas por variante; la dispersión (≈ ±100 ms) impide leer las variantes que
  difieren menos que eso. Sólo `content-visibility` supera con claridad el ruido.
- La tarea 5 se atribuye a efectos/observers por inferencia (nombre de evento y momento), no por una función concreta.
- El tiempo de CPU del navegador local no es el de un teléfono real; no se midió en dispositivo.
