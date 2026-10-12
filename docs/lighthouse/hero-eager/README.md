# Héroe de `/parfums`: restaurar `loading="eager"` y el preload (LCP)

Regresión de la variante F (PR #99): el héroe pasó a `getImageProps` y quedó `loading="lazy"`, sin el preload que Next añade a `<Image preload>`.
Lighthouse en producción lo marca: **«LCP lazy-loaded» (score 0)**; en `/parfums` móvil el LCP pasa 44 % (1.1 s) esperando a que empiece la
descarga. En `/` (la home del storefront) **no** ocurre: su imagen LCP ya es `fetchpriority="high"` y no es perezosa (ver T22).

## Cambio

- `loading="eager"` en el `<img>` (y `fetchpriority="high"` se mantiene).
- Dos `<link rel="preload" as="image">`, cada uno con `media` (el complemento exacto del otro): el logotipo para móvil/tableta vertical y el
  `srcset`/`sizes` del recorte 21:9 para escritorio. Así cada pantalla sólo baja el asset que muestra.
- Prueba e2e: `parfums-shell.spec.ts` «hero LCP image is eager, high priority and preloaded once…» (falla si se quita el `eager` o los
  preloads; comprobado con dos mutaciones).

## Medición (build local de producción, `/parfums`, móvil, 3 ejecuciones por estado)

**Throttling aplicado** (el navegador está realmente limitado: 4G lento 1.6 Mbps/150 ms + CPU 4×):

| | Rendimiento | LCP (ms) | Retraso de carga del LCP | FCP | TBT (ms) | CLS | Bytes | «LCP lazy-loaded» |
|---|---|---|---|---|---|---|---|---|
| Antes (`lazy`) | 96 / 96 / 96 | 1 615 / 1 635 / 1 660 (**mediana 1 635**) | 1 020 / 1 055 / 1 064 | ≈ 1 085 | 217 / 217 / 214 | 0 | 292 KB | **falla** (0) |
| Después (`eager` + preload) | 95 / 95 / 95 | 1 282 / 1 291 / 1 269 (**mediana 1 282**) | 206 / 213 / 202 | ≈ 1 086 | 273 / 259 / 238 | 0 | 293 KB | **pasa** (1) |
| Diferencia | −1 | **−353 ms (−22 %)** | **−842 ms** | 0 | **+42 ms** (mediana 217 → 259) | 0 | +1 KB | corregido |

**Simulado** (modelo Lantern de Lighthouse, el predeterminado):

| | Rendimiento | LCP (ms) | TBT (ms) | Elemento LCP |
|---|---|---|---|---|
| Antes | 94 / 94 / 94 | 3 040 / 3 009 / 2 998 | 54 / 43 / 38 | el `<img>` del héroe (retraso de carga 1.3–1.8 s) |
| Después | 90 / 90 / 90 | 3 525 / 3 482 / 3 477 | 112 / 91 / 85 | **`h2#showcase-title`** (retraso de render 3 025 ms) |

**Lectura honesta.** Con el navegador realmente limitado el cambio mejora el LCP 353 ms y elimina el hallazgo. El modelo simulado, en cambio,
**empeora** el LCP y la puntuación: al adelantarse la imagen, el candidato final a LCP pasa a ser el encabezado «Fragancias para descubrir»
(un bloque algo mayor que la ventana de 280 × 83 px del logotipo), cuyo pintado depende de la hidratación (`Reveal`). Es un artefacto del
modelo, no una imagen más lenta, pero la puntuación simulada de Lighthouse bajará unos puntos. Las mediciones reales (aplicado) mandan para
Core Web Vitals en campo.

**No empeora, salvo el TBT:** bytes iguales (292 → 293 KB) y una sola petición del asset por viewport (1440 × 900 y 1024 × 768: el recorte
21:9; 375 × 667 y 820 × 1180: el logotipo; el preload se consume, no se duplica); CLS 0. **El TBT aplicado sube ≈ 42 ms (217 → 259)** en las
tres ejecuciones; la hipótesis (no verificada) es que el pintado temprano de la imagen cae ahora dentro de la ventana de TBT. Sigue siendo el
problema de hidratación de T13, no una causa nueva.

Producción (antes del fix, simulado, `cruzial.pe/parfums`, 2026-10-12): rendimiento 97, LCP 2 494 ms, TBT 30 ms, retraso de carga 1 104 ms.

Reportes: `local-{before,after}-applied-throttling.html`, `local-{before,after}-simulated.html`, `production-before-parfums-mobile.html`.
