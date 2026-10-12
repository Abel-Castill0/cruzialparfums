# Evidencia de la ronda de optimización y de la matriz de motores (2026-10-11)

Código medido: rama `claude/apple-design-system` (antes: `81de615`; después: `f976976`, + `934b23a` con los proyectos Firefox/WebKit).

## 1. TBT con throttling aplicado (CPU 4× + 4G lento), `/parfums`, 3 ejecuciones

Lighthouse 12, `--throttling-method=devtools`, RTT 150 ms, 1 638 Kbps, CPU 4×, Chromium 156.

| Ejecución | TBT antes | TBT después | LCP antes | LCP después | Rendimiento antes → después |
|---|---|---|---|---|---|
| 1 | 507 ms | **326 ms** | 2 175 ms | 2 044 ms | 86 → 92 |
| 2 | 335 ms | **305 ms** | 2 110 ms | 1 287 ms | 91 → 93 |
| 3 | 465 ms | **326 ms** | 2 406 ms | 1 277 ms | 86 → 93 |
| **Mediana** | **465 ms** | **326 ms** | 2 175 ms | 1 287 ms | |

Otros: CLS 0 en las 6; bytes transferidos 441 → 345 KB; primer layout 340–383 → 129–143 ms; **el segundo layout completo (cambio de
fuente) desaparece**; la hidratación (≈ 294–320 ms en un solo microtask) no cambia. **El TBT aplicado sigue > 200 ms → T13.**

Reportes: `lighthouse-parfums-tbt-before-run{1,2,3}.html`, `lighthouse-parfums-tbt-after-run{1,2,3}.html`.

Cambios aplicados (commit `f976976`): `sizes` del héroe (540 px en móvil → entrada de 1080; 100vw en escritorio → 1920),
`preload: true` explícito en Geist, `content-visibility: auto` en las tarjetas del catálogo (celda con relleno para no recortar
la sombra), en las secciones 3+ de `/parfums` y en el pie. CLS 0 al recorrer `/parfums` y `/parfums/catalogo` en 1440 y 390 px.

## 2. Matriz de motores (suite pública)

| Motor | Resultado | Notas |
|---|---|---|
| **Chromium** | **0 fallos** (en frío; con `mobile`, `tablet` y `responsive`: 275 pasan, 0 fallan, 39 omitidas) | `npm run check` EXIT 0 |
| **WebKit** 27.2 (Playwright) | contra build de producción: 37 pasan, 50 fallan (**todos artefacto**); contra el servidor de desarrollo: **69 pasan, 19 fallan, 13 omitidas** | ver T14–T19 |
| **Firefox** 157 | **no se pudo lanzar** desde este entorno (`browserType.launch: spawn UNKNOWN`) | `firefox.exe --version` funciona en consola: el binario es válido |

Artefacto de WebKit en producción: la CSP lleva `upgrade-insecure-requests`; WebKit lo aplica también a `http://localhost` y todos
los recursos (CSS, JS, fuentes, imágenes) se piden por `https://localhost` y fallan con «SSL connect error», así que la página se
ve sin estilos. Chromium y Firefox no hacen esa mejora en `localhost`. El servidor de desarrollo no emite la directiva
(`buildContentSecurityPolicy`), por eso la segunda pasada es la representativa.

Listas de resultados: `playwright-matrix-prod-run.txt`, `playwright-webkit-dev-failures.txt`.

### Hallazgos de WebKit contra el servidor de desarrollo (19)

| # | Pruebas | Causa más probable | Ticket |
|---|---|---|---|
| 16 | `Tab` no llega al enlace «Saltar al contenido» ni al CTA del héroe (también falla la prueba preexistente de `parfums-shell`) | WebKit no incluye los enlaces en el orden de `Tab` por defecto (en Safari: Opción + Tab). No es específico del skip link. | T15 |
| 1 | axe `color-contrast` en `/import/catalogo` (eyebrow del encabezado de categorías) | Diferencia de pintado o de `color-mix()` en WebKit; sin reproducir en Safari real | T16 |
| 1 | el diálogo del recomendador no aparece en 20 s | Ruta interceptada en servidor de desarrollo frío; sin reproducir | T17 |
| 1 | el carrusel de producto no reanuda su movimiento tras salir el puntero | `scrollLeft` por `requestAnimationFrame` en WebKit; sin reproducir | T18 |
