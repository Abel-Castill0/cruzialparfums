# PR 1 — Sistema de diseño Apple para el storefront (`claude/apple-design-system`)

> Cuerpo del PR. Rama de **sólo código**: 64 archivos, 11 commits convencionales, 0 capturas y 0 reportes. La evidencia
> (`DESIGN.md`, auditoría, capturas, Lighthouse) va en el **PR 2** (`claude/design-evidence`). Los comentarios del código citan
> `DESIGN.md`: se lee en el PR 2 hasta que se fusione.
>
> Comando (sólo con OK explícito para hacer push):
> `gh pr create --base master --head claude/apple-design-system --title "feat(design): Apple-style storefront system" --body-file docs/release/pr-1-design-system.md`

## Resumen ejecutivo

Rediseño de `/`, `/parfums/**` y `/import/**` a un único sistema: blanco `#FFFFFF` / `#F5F5F7`, tinta `#1D1D1F`, acento
`#0071E3`, una sola familia (Geist), escala de 8 px, tokens de movimiento, WCAG AA y objetivos táctiles ≥ 44 px. El admin no
cambia. No toca `supabase/`, `scripts/`, migraciones ni lógica de negocio: el rollback es revertir el merge.

Además cierra los dos fallos WCAG de nivel A que bloqueaban el release: **enlace «Saltar al contenido» global** (2.4.1) y
**estructura semántica del catálogo** (1.3.1: 95 `h2` de producto → `ul > li > article > h3` bajo un `h2` de sección).

| Commit | Alcance |
|---|---|
| `feat(design)` | tokens `--ds-*`, Geist, primitivas de interacción y foco |
| `feat(parfums)` ×4 | héroe y home · catálogo, ficha y filtros · recomendador · shell, checkout, combos, institucionales |
| `feat(storefront)` | `Reveal` con un único observer, marquee, vídeo, TikTok |
| `feat(home)` | selector de tienda `/` |
| `feat(import)` | sistema claro + superficies navy (opción C) |
| `perf(images)` | `images.qualities` 60/75 |
| `test(a11y)` | presupuesto de caché fría en el gate de axe |
| `a11y` | skip link global + semántica del catálogo + `accessibility-structure.spec.ts` |

## Capturas clave (3; el resto, en el PR 2)

| Antes (`master`) | Después |
|---|---|
| ![Parfums antes](https://github.com/Abel-Castill0/cruzialparfums/blob/claude/design-evidence/docs/screenshots/before/parfums-fold-1440.jpg?raw=true) | ![Parfums después](https://github.com/Abel-Castill0/cruzialparfums/blob/claude/design-evidence/docs/screenshots/after/parfums-fold-1440.jpg?raw=true) |

Import, opción C (héroe navy, logotipo en cápsula):
![Import C](https://github.com/Abel-Castill0/cruzialparfums/blob/claude/design-evidence/docs/screenshots/import-c/import-hero-1440.jpg?raw=true)

*(Los enlaces resuelven cuando `claude/design-evidence` está subida.)*

## Métricas antes → después (`master` → rama)

| Métrica | `master` | Rama | Fuente |
|---|---|---|---|
| Violaciones axe de contraste (6 rutas × 2 viewports) | 1 | **0** | axe |
| Texto sobre fotos por debajo de AA | no medido | 12/47 → **0/50** | muestreo de píxeles |
| Objetivos táctiles < 44 px, móvil (`/parfums` · `/catalogo` · `/combos` · `/import`) | 29 · 12 · 17 · 4 | **1 · 0 · 0 · 1** | script |
| Encabezados `h2` de producto en `/parfums/catalogo` | un `h2` por producto (≈ 95) | **0** (`h3` bajo un `h2`) | e2e |
| Enlace para saltar bloques | solo admin | **todas las páginas** | e2e |
| LCP real móvil (CPU 4× + 1.6 Mbps), `/parfums` | 2.79 s | **2.14 s** | Playwright (mediana de 5) |
| LCP simulado Lighthouse móvil, `/parfums` | 4.38 s | **2.89 s** (sigue > 2.5 s en las 4 páginas) | Lighthouse |
| CLS | 0 | **0** | ambos |
| TBT simulado / real 4× | 46 / 137 ms | 47 / 136 ms | Lighthouse / Playwright |
| TBT con throttling aplicado (`/parfums`) | no medido | **298 – 649 ms** (> 200) | Lighthouse `devtools` |
| Lighthouse Rendimiento móvil / escritorio | — | 92–95 / 100 | Lighthouse |
| Lighthouse Accesibilidad / Buenas prácticas | 100 / 100 | 100 / 100 | Lighthouse |
| Suite pública Playwright **en frío** (chromium, mobile, tablet, responsive) | 11–15 fallos | **260 pasan, 0 fallan** (39 omitidas) | Playwright |
| `npm run check` (eslint, tsc, vitest 1 214, build, checks del repo) | — | **EXIT 0** | npm |

Esta rama, **sin ningún archivo de documentación**, pasa `npm run check` y la suite en frío: no hay dependencias ocultas
de `docs/`.

## Decisiones

1. **Import = sistema claro + identidad navy puntual (opción C)**, no oscuro completo (B). Navy como token
   (`--ds-color-navy`) en héroe, banner final y pie; logotipo en cápsula; ritmo vertical 64/80/96 px. Validada contra el
   criterio «si algo se siente pegado, pasar a B»: ninguna de las tres comprobaciones lo dio.
2. **Héroe de Parfums: este PR lleva el actual** (imagen entera a escala 0.86, titular en una franja inferior). Se evaluaron
   cuatro alternativas en `claude/hero-variants` (**no incluida**): **C** (0.92, ningún frasco cortado) y **D** (asset
   reencuadrado 21:9 / 4:5, ningún frasco cortado en ningún ancho, también en móvil). Recomendación: D condicionada a aprobar
   el asset vertical; C si no se quiere tocar el arte. Pendiente de decisión del dueño; irá en un PR aparte.
3. **AVIF desactivado** (+31 % de tiempo de codificación en frío y más 504 del optimizador); WebP con `quality` 60 sólo en héroes.
4. **Sombras sólo al hover** en rejillas de producto y sin `backdrop-filter` en velos de pantalla completa (−15 fps con CPU 4×).
5. **Skip link montado en `app/layout.tsx`** (no por página); el `<main>` recibe `id` y `tabindex=-1` tras cada navegación.
   No se muestra en `/admin`, que conserva el suyo.

## Excepciones aceptadas

| Excepción | Justificación |
|---|---|
| LCP simulado de Lighthouse > 2.5 s (4 páginas móviles) | El LCP real (1.1–2.1 s) y el aplicado (2.3–2.6 s) rondan o cumplen; el modelo asigna ~2 s de «retraso de render» que no se observa. |
| TBT aplicado > 200 ms | Causa raíz en `docs/perf-diagnosis.md` §6 (PR 2): hidratación ≈ 300 ms + un segundo layout completo por el cambio de fuente. Los otros dos métodos lo dan < 200 ms. |
| 1 objetivo táctil < 44 px por pantalla | Enlace en línea dentro de una frase: WCAG 2.5.8 exime los enlaces en línea. |
| 3 bordes opacos de 1 px (`currentColor`) | Glifos/subrayados, no contornos de componente. |
| Superficies oscuras (héroes con foto, mosaicos, barra de anuncio, toasts, pie y banner navy de Import) | Decisión de `DESIGN.md` §2.1 y §11; contraste medido AA. |
| axe `region` (mejores prácticas) marca el botón flotante de WhatsApp y el control de la barra de anuncio | Preexistente; no es WCAG A/AA. |
| `--color-*` y `--font-display/body` siguen existiendo | Los usa `/admin/**`. |
| 39 pruebas omitidas | Requieren fixtures de BD/admin; esta rama no toca `supabase/`, `scripts/` ni rutas admin. |

## Riesgos y lo que NO está verificado

- **Firefox y WebKit no se han probado** (no instalados; descarga ~250 MB pendiente de permiso). Riesgo de Safari:
  `color-mix()`, `mask-image`, `:has()`.
- **Dispositivos reales (Android / iPhone) y lector de pantalla (NVDA / VoiceOver): no realizados.** Hay un esquema de
  encabezados y landmarks como sustituto, no equivalente.
- El skip link depende de JavaScript para crear su destino (el storefront ya lo necesita).
- Datos de prueba: la verificación visual usó el catálogo comercial y una campaña de Import de prueba **sólo en la BD local**;
  nada tocó QA ni Producción. Indexación: sigue OFF (decisión del dueño).

## Deuda técnica (tickets sugeridos)

| # | Ticket | Prioridad |
|---|---|---|
| T1 | Optimizar la imagen del héroe de `/parfums` (≈ 1080 px o recorte móvil) y la fuente: LCP −0.7 s medido | Alta |
| T2 | Decidir la variante del héroe (C / D) y fusionar `claude/hero-variants` | Alta |
| T3 | Reducir el TBT aplicado (< 200 ms): evitar el segundo layout (fuente), `content-visibility`, hidratar menos | Media |
| T4 | Instalar Firefox/WebKit, añadir proyectos a `playwright.config.ts` y ejecutar la matriz | Alta |
| T5 | Pasada manual en Android + iPhone y con NVDA/VoiceOver | Alta |
| ~~T6~~ | ~~Skip link y `h2` de producto~~ — **cerrado en este PR** (commit `a11y`) | — |
| T7 | Logotipo de Import horizontal con fondo transparente | Baja |
| T8 | Calentar la caché de imágenes antes del gate de axe en CI (en lugar de `test.slow`) | Baja |
| T9 | Mover capturas y reportes Lighthouse a artefactos de CI (≈ 31 MB; ya separados en el PR 2) | Baja |
| T10 | Migrar el admin al sistema `--ds-*` y retirar los tokens heredados | Baja |
| T11 | Probar `color-mix()`, `mask-image` y `:has()` en Safari 16/17 | Media |
| T12 | El layout de `/parfums/**` serializa 98 productos (178 KB de RSC) hacia `SiteHeaderActions` en cada página | Media |

## Cómo revisarlo

Por commit: tokens → héroe/home → catálogo → recomendador → shell/checkout → movimiento → selector → Import → perf → tests → a11y.
Sólo se verificó el estado final con la compuerta completa; los commits intermedios no se probaron uno a uno.

Evidencia visual, auditoría y reportes: **PR 2** (`claude/design-evidence`, sólo documentación).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
