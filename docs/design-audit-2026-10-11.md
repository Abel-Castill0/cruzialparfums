# Auditoría de diseño del storefront — 2026-10-11

Alcance: `/`, `/parfums` (home, catálogo, combos, recomendador, producto, checkout, institucionales) y `/import`
(home, catálogo, producto, carrito, checkout). Admin queda fuera. Base: `origin/master` @ `1b13c99`, datos locales con
el catálogo comercial cargado (99 productos, 190 fotos reales). Método: skill `impeccable audit` (detector + lectura de
CSS) + capturas Playwright (1440 y 390 px) + axe (WCAG 2 A/AA) + medición de objetivos táctiles.

La referencia de destino es `DESIGN.md` (única fuente de verdad).

## Health score

| # | Dimensión | Nota | Hallazgo principal |
|---|-----------|------|--------------------|
| 1 | Accesibilidad | 3/4 | axe: 0 violaciones de contraste en home/parfums/import; 1 en `/parfums/finder`. 29 objetivos < 44 px en móvil |
| 2 | Rendimiento | 3/4 | Imágenes con `next/image`; 2 transiciones de `width` (layout); sin `will-change` indebido |
| 3 | Responsive | 3/4 | Sin scroll horizontal en ningún viewport; chips de 40 px, enlaces de pie de 18 px de alto |
| 4 | Theming | 1/4 | ~240 hex sueltos en CSS; 3 paletas (crema/negro, navy Import, oro heredado); token `--color-gold` vale negro |
| 5 | Anti-patrones | 2/4 | Tipografía en lista de rechazo (Cormorant), kickers en mayúscula 10–11 px, reglas finas en cada sección |
| | **Total** | **12/20** | Aceptable: la base es sólida, el sistema visual no está unificado |

## Anti-patrones (veredicto)

Parece diseño editorial "de manual" (serif de display + etiquetas en versalitas con tracking + filetes), no un
sistema propio. No hay degradados morados ni glassmorphism, pero sí:

- **[P1] Tipografía de reflejo.** Cormorant Garamond en 78 declaraciones `font-family` (`var(--font-display)`).
  Contraste alto y x-height baja: a 17–20 px se vuelve frágil; en titulares de 400 de peso se ve etéreo, no firme.
  Una segunda voz (Jost) y tres variables locales (`--vs-title-font`, `--tp-font`, `--mq-title-font`) fragmentan el sistema.
- **[P1] Tres paletas, ninguna tokenizada.** Crema (`#f7f3ea`, `#f1ebdf`, `#ede5d8`), negro cálido (`#0a0806`: 99 usos
  literales) y navy de Import (`#0b1f3d`…). `--color-gold` se redefinió a negro (comentario en `globals.css`): un
  token que miente. El `body` global lleva un filete vertical al 50 % (`linear-gradient` casi invisible) que se cuela
  bajo todo el contenido.
- **[P2] Etiquetas diminutas.** 75 declaraciones a 10 px y 38 a 11 px; 95 `text-transform: uppercase` con tracking
  (kickers "69 FRAGANCIAS", "TIKTOK · @CRUZIAL.PARFUM", "COMPRAS POR VOLUMEN"). Es el "eyebrow en cada sección".
  Legibilidad en móvil y tono "revista", no "producto premium sereno".
- **[P2] Bordes sólidos de 1 px por todas partes.** 241 declaraciones `border: 1px solid …` y filetes `border-top`
  entre secciones. Más 3 `box-shadow: inset 0 0 0 1px` que simulan borde. Dan sensación de rejilla técnica.
- **[P2] Sombras sin sistema.** Tres profundidades inconsistentes (`0 36px 80px /.4`, `0 12px 34px /.22`,
  `0 34px 70px -24px /.34`): las dos primeras son pesadas para una superficie clara. Sin sombra en estado reposo.
- **[P2] Escala de espaciado sin escala.** Valores sueltos de `padding/margin/gap`: 14 (82×), 10, 18, 22, 6, 13, 7, 17,
  26, 30… (≈ 60 valores distintos); 10, 12, 14, 18, 20 y 22 px suman más de 380 usos y ninguno es múltiplo de 8.
  Ritmo vertical irregular entre secciones.
- **[P2] Escala tipográfica plana + 10 pesos.** Pesos 400, 460, 500, 520, 560, 600, 620, 650, 680, 700 mezclados.
  Sin escala modular para títulos; cada módulo define su `clamp()`.
- **[P2] Movimiento sin sistema.** Hover `180 ms ease` genérico, `transform 700 ms` aislado, dos `transition: width`
  (layout). `Reveal` existe y es correcto (visible sin JS, respeta reduced-motion), pero se usa sólo en la home de
  Parfums; Import, catálogo y combos entran de golpe. 147 reglas `:hover`, ninguna con curva común.
- **[P2] Objetivos táctiles < 44 px (móvil).** `/parfums`: 29 (enlace "← cruzial.pe" 20×32, enlaces de pie 18 px,
  chips de filtro 40 px, botones de tamaño de combo 40 px). `/import`: 4. `/parfums/catalogo`: 12.
- **[P3] Héroe.** El bitmap trae el logotipo y la leyenda "CRUZIAL PERFUMERÍA" horneados; el `<h1>` es sólo
  `sr-only`. El botón es rectangular con borde de 1 px (no pill). Franja de 36 px con tres mensajes en 11 px.
- **[P3] Superficies oscuras con fotografía de fondo** (banda de combos, TikTok sin cargar) sobre una página crema:
  el bloque negro del vídeo (340×460) es el elemento más pesado de la home y no es contenido real hasta el toque.
- **[P3] Import** usa navy a pantalla completa con tarjetas redondeadas de borde fino: el sitio parece dos marcas.

## Errores visuales / espaciado verificados en capturas

- Home Parfums: la franja "assurance" (4 pilares) queda separada del carrusel por un vacío mayor que el resto de
  transiciones entre secciones (ritmo vertical irregular).
- Categorías (Árabes / Designer / Nicho): tarjetas con desfase vertical intencional (la central +58 px) y textos
  blancos sobre fotos con scrim variable: el contraste depende de la foto.
- Recomendador: chips de notas con 40 px de alto y contadores en gris claro sobre beige; axe marca 1 nodo de
  contraste en `/parfums/finder`.
- `Combos Cruzial.` / `Cuarteto Oriental`: texto blanco sobre fondo fotográfico oscuro con botón de 1 px; el
  carrusel usa flechas blancas circulares sobre el fondo fotográfico.
- Import sin campaña publicada: el `main` deja grandes vacíos entre héroe, mayorista y bloque de TikTok (estado
  vacío sin diseño propio).

## Positivo (mantener)

- Cero violaciones axe de nivel A/AA en home, parfums e import; sin scroll horizontal en 390 px.
- `Reveal` ya garantiza contenido visible sin JS y bajo `prefers-reduced-motion` (24 módulos con media query).
- Fotografía real de producto, `next/image` con `sizes`, `loading="lazy"` en secciones bajo el pliegue.
- Estructura de contenido sólida: Hero → carrusel → categorías → recomendador → galería → vídeo → combos → FAQ.
- Foco visible global y `scroll-behavior` condicionado.

## Plan de corrección (en orden)

1. Tokens `--ds-*` y fuente en `globals.css`/`layout.tsx` (sin tocar el admin, que comparte los tokens heredados).
2. Re-tematizar CSS del storefront con mapeo mecánico (colores → tokens, fuente → `--font-sans`, bordes → hairline,
   mayúsculas/tracking fuera, sombras → escala) y revisión manual de héroe, tarjetas, filtros, recomendador.
3. Sistema de movimiento (curvas/duraciones/Reveal) aplicado a Parfums e Import.
4. QA: axe, 44 px, 390/768/1440, `npm run lint`, `typecheck`, vitest, e2e del storefront.

## Resultado tras la implementación (misma fecha)

Comparativa medida con los mismos scripts (axe WCAG 2 A/AA, objetivos táctiles en `a/button/input/select/summary`,
detector de impeccable) sobre el build de producción local.

| Métrica | Antes | Después |
|---|---|---|
| Violaciones axe de contraste (6 rutas × 2 viewports) | 1 (`/parfums/finder`) | 0 |
| Objetivos < 44 px en `/parfums` móvil | 29 | 1 (enlace en línea dentro de una frase, exento) |
| Objetivos < 44 px en `/parfums/catalogo` móvil | 12 | 0 |
| Objetivos < 44 px en `/parfums/combos` móvil | 17 | 0 |
| Scroll horizontal (320–1440 px) | ninguno | ninguno |
| Detector impeccable (patrones prohibidos) | 4 avisos (borde lateral, 2 `transition: width`, `<img>`) | 0 |
| `border: 1px solid` opaco / con `currentColor` | 241 | 3 (chevron del selector y subrayado de un enlace legal) |
| Hex literales fuera de `globals.css` | ~240 | 0 (sólo `#000` en máscaras) |
| Declaraciones `uppercase` / tracking positivo | 95 | 0 |
| Tamaños < 12 px | 113 | 0 |
| Pesos de fuente distintos | 10 | 3 (400 / 500 / 600) |
| Familias tipográficas en el storefront | 2 + 3 locales | 1 (Geist) |
| Valores de espaciado fuera de la escala de 8 | ~60 | 0 |
| Transiciones de propiedades de layout | 4 | 0 |

Puntuación estimada con la misma rúbrica: Accesibilidad 4/4 · Rendimiento 3/4 · Responsive 4/4 · Theming 4/4 ·
Anti-patrones 4/4 → **19/20**. El punto que falta es rendimiento: no se midió Lighthouse/Web Vitals y las imágenes
de catálogo siguen dependiendo de Cloudinary + `next/image` (AVIF activado en `next.config.ts`).

Verificación: `tsc`, `eslint`, vitest (1214), build de producción y Playwright público
(chromium + mobile + tablet + responsive: 188 passed, 0 failed, 39 skipped que requieren fixtures de BD).
Dos especificaciones se actualizaron porque describían el diseño anterior (héroe sin texto; botones de talla con
borde). Una ejecución aislada falló una vez en `axe /parfums/combos` y no se reprodujo en 4 repeticiones.
