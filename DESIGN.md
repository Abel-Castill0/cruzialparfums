# DESIGN.md — Sistema de diseño Cruzial (storefront)

Única fuente de verdad visual de `/parfums` y `/import`. Si una decisión de UI no está aquí, se añade aquí primero.
Implementación: tokens `--ds-*` en `apps/web/src/app/globals.css`, fuente `--font-sans` en `app/layout.tsx`.
Fuera de alcance: admin (`/admin/**`) conserva los tokens heredados.

## 1. Principios

1. **Silencio y precisión.** Superficies blancas, texto casi negro, un solo acento. El lujo se muestra con espacio,
   fotografía y tipografía firme, no con ornamento.
2. **El producto es el protagonista.** La fotografía manda; la UI se retira (sin marcos, sin filetes decorativos).
3. **Jerarquía por tamaño y peso, no por mayúsculas ni color.** Sin kickers en versalitas; sentence case.
4. **Movimiento con propósito.** Entra suave, responde rápido, nunca estorba (§8). Siempre con alternativa a
   `prefers-reduced-motion`.
5. **WhatsApp sigue siendo el único cierre de venta.** Un solo botón primario por vista.
6. **Sin inventar comercio.** Ningún precio, stock o claim nuevo; el rediseño sólo cambia presentación.

## 2. Color

Estrategia: **Restrained** — neutros + un acento ≤ 10 % de la superficie. Referencia: apple.com (producto).

| Token | Valor | Uso | Contraste |
|---|---|---|---|
| `--ds-white` | `#FFFFFF` | Fondo base, tarjetas | — |
| `--ds-gray-50` | `#F5F5F7` | Secciones alternas, chips, tarjeta de producto | — |
| `--ds-gray-100` | `#E8E8ED` | Estado pressed de chips, skeletons | — |
| `--ds-ink` | `#1D1D1F` | Texto principal, botón secundario | 16.8:1 sobre blanco · 15.5:1 sobre `#F5F5F7` |
| `--ds-ink-muted` | `#6E6E73` | Texto secundario, precios, captions | 5.1:1 sobre blanco · 4.7:1 sobre `#F5F5F7` |
| `--ds-accent` | `#0071E3` | CTA primario, selección de chip, foco | 4.7:1 con texto blanco encima · no usar como texto sobre `#F5F5F7` (4.3:1) |
| `--ds-accent-hover` | `#0077ED` | Hover del botón primario | — |
| `--ds-accent-press` | `#0058B0` | Active / enlaces sobre blanco | 6.9:1 (con texto blanco o sobre blanco) |
| `--ds-link` | `#0066CC` | Enlaces de texto | 5.6:1 sobre blanco · 5.1:1 sobre `#F5F5F7` |
| `--ds-danger` | `#B42318` | Errores de formulario | 6.6:1 |
| `--ds-success` | `#137333` | Confirmaciones | 6.0:1 |
| `--ds-overlay` | `rgba(0,0,0,.38)` | Capa sobre foto del héroe (más gradiente inferior) | texto blanco ≥ 4.5:1 |

Reglas:
- Prohibido: degradados morados/azules, gradientes en texto, color en bordes laterales, crema/beige, dorado en UI.
  (El dorado vive sólo en el logotipo y en la fotografía.)
- Acento sólo para: acción primaria, selección activa, foco, enlaces. Nunca decorativo.
- Texto sobre foto: siempre sobre `--ds-overlay` (blanco `#fff`, o `rgba(255,255,255,.86)` para secundario).
- Modo oscuro de página: no se ofrece. Las únicas superficies oscuras son héroes fotográficos y el pie.

## 3. Tipografía

Familia única: **Geist** (`next/font/google`, variable `--font-sans`). Sans geométrica y moderna, afín a SF Pro
Display; pesos 400 / 500 / 600. Pila: `var(--font-sans), -apple-system, "SF Pro Display", "Segoe UI", system-ui, sans-serif`.
Números de precio: `font-variant-numeric: tabular-nums`.

| Rol | Token | Tamaño (fluido) | Peso | Line-height | Letter-spacing |
|---|---|---|---|---|---|
| Hero (display) | `--ds-text-hero` | `clamp(2.75rem, 1.4rem + 5.4vw, 5rem)` | 600 | 1.04 | −0.035em |
| Título de página (h1) | `--ds-text-h1` | `clamp(2.25rem, 1.3rem + 3.6vw, 3.75rem)` | 600 | 1.07 | −0.03em |
| Título de sección (h2) | `--ds-text-h2` | `clamp(1.875rem, 1.3rem + 2.3vw, 3rem)` | 600 | 1.1 | −0.025em |
| Título de tarjeta (h3) | `--ds-text-h3` | `1.25rem` (20 px) | 600 | 1.25 | −0.015em |
| Nombre de producto | `--ds-text-card` | `1.0625rem` (17 px) | 500 | 1.3 | −0.01em |
| Cuerpo lead | `--ds-text-lead` | `clamp(1.0625rem, 1rem + .35vw, 1.3125rem)` | 400 | 1.5 | −0.005em |
| Cuerpo | `--ds-text-body` | `1rem` (16 px) | 400 | 1.55 | 0 |
| Caption / precio | `--ds-text-small` | `0.875rem` (14 px) | 400–500 | 1.45 | 0 |
| Etiqueta mínima | `--ds-text-micro` | `0.75rem` (12 px) | 500 | 1.35 | 0.01em |

Reglas: mínimo absoluto 12 px; sin mayúsculas forzadas ni tracking positivo; `text-wrap: balance` en h1–h3 y
`pretty` en párrafos; medida de lectura ≤ 68ch; sin itálicas decorativas.

## 4. Espaciado

Base de 8 px. Todo `padding`, `margin` y `gap` sale de esta escala (excepciones: 4 px para micro-ajustes de icono).

| Token | px | Uso típico |
|---|---|---|
| `--ds-space-1` | 8 | Separación icono–texto, gap de chips |
| `--ds-space-2` | 16 | Padding interno de tarjeta compacta, gap de rejilla en móvil |
| `--ds-space-3` | 24 | Padding de tarjeta, gap de rejilla en escritorio |
| `--ds-space-4` | 32 | Separación título–contenido |
| `--ds-space-5` | 48 | Separación entre bloques dentro de una sección |
| `--ds-space-6` | 64 | Padding de sección en móvil |
| `--ds-space-7` | 96 | Padding de sección en tableta |
| `--ds-space-8` | 128 | Padding de sección en escritorio |

Anchura de contenido: `--ds-wrap: 1200px` (carruseles y héroes pueden sangrar a pantalla completa); gutter lateral
`24px` móvil / `32px` tableta / `48px` escritorio. El espacio en blanco es calculado: una sola separación vertical
entre secciones (`--ds-section-y`), nunca márgenes ad hoc.

## 5. Forma, bordes y sombras

| Token | Valor | Uso |
|---|---|---|
| `--ds-radius-sm` | 8 px | Inputs, miniaturas |
| `--ds-radius-md` | 14 px | Tarjetas de producto, paneles |
| `--ds-radius-lg` | 22 px | Tiles grandes, modales, héroes en tarjeta |
| `--ds-radius-pill` | 980 px | Botones, chips, controles del carrusel |
| `--ds-hairline` | `rgba(0,0,0,.08)` (`rgba(255,255,255,.18)` sobre oscuro) | Único borde permitido: inputs y separadores |
| `--ds-shadow-1` | `0 1px 2px rgba(0,0,0,.04), 0 2px 8px rgba(0,0,0,.04)` | Reposo de tarjeta / header al hacer scroll |
| `--ds-shadow-2` | `0 8px 28px rgba(0,0,0,.09)` | Hover de tarjeta, panel flotante |
| `--ds-shadow-product` | `0 18px 36px -14px rgba(0,0,0,.2), 0 4px 10px rgba(0,0,0,.05)` | Imagen del producto dentro de su tarjeta |
| `--ds-shadow-3` | `0 24px 64px rgba(0,0,0,.16)` | Modales y cajones |

Reglas: bordes sólidos opacos de 1 px prohibidos; si un contorno es imprescindible se usa `--ds-hairline` (alfa) o
sombra de 0 px de desplazamiento. Sin sombras duras (opacidad > .2, blur < 8 px).

## 6. Iconografía

Línea fina, trazo 1.5 px, caja de 24 px (20 px en chips), `stroke="currentColor"`, extremos redondeados, sin relleno.
Un solo conjunto (el actual de `shell-icons.tsx` y el del recomendador) con el mismo grosor. Los emojis están
prohibidos como icono.

## 7. Componentes

**Header.** Blanco translúcido (`rgba(255,255,255,.8)` + `backdrop-filter: saturate(180%) blur(20px)`) sólo aquí, 56 px;
sin borde, `--ds-shadow-1` tras hacer scroll. Enlaces 14 px / 500, subrayado animado (§8). Sobre el héroe es
transparente con texto blanco (`hero-aware-header`).

**Botón primario.** Fondo `--ds-accent`, texto blanco, 17 px / 500, alto 48 px (mín. 44), padding 0 24 px, radio pill.
Hover: fondo más oscuro (`--ds-accent-press`) y `scale(1.02)`. Active: `scale(1)`.
**Botón secundario.** Fondo `--ds-gray-50`, texto `--ds-ink`; sobre foto: blanco translúcido con blur.
**Enlace de texto.** `--ds-link`, con flecha "›"; subrayado en hover.

**Chip de filtro.** Pill, alto 44 px, fondo `--ds-gray-50`, texto `--ds-ink` 15 px / 500, sin borde. Seleccionado:
fondo `--ds-accent`, texto blanco; transición de color 200 ms.

**Tarjeta de producto.** Sin borde; fondo `--ds-gray-50`, radio 14 px, padding 24 px. Imagen con `--ds-shadow-product`,
sobre fondo `--ds-gray-50`. Marca (14 px, `--ds-ink-muted`), nombre (`--ds-text-card`), precio (14 px,
`--ds-ink-muted`, tabular). Hover: `--ds-shadow-2`, `translateY(-4px)` y zoom de imagen ≤ 1.05.

**Hero.** Foto de alta calidad a pantalla casi completa (`min-height: min(100svh, 880px)`), `--ds-overlay` + gradiente
inferior; titular `--ds-text-hero` blanco, subtítulo `--ds-text-lead`; CTA primario + secundario pill.

**Carrusel.** Scroll-snap horizontal, controles circulares de 44 px (blanco translúcido), puntos de paginación de 8 px.

**Recomendador (Finder).** Sección `--ds-gray-50`, título h2, una frase de apoyo, pasos con iconos de línea,
resultado con entrada *fade-up* (§8).

**Galería / mosaico.** Rejilla con gap 16 px, radio 22 px, sin borde, pies de foto 14 px muted.

**Vídeo (TikTok).** Marco 9:16 radio 22 px, `--ds-shadow-2`; el estado "sin cargar" usa `--ds-gray-50` con botón
play pill, no un bloque negro.

**Formularios.** Inputs 48 px, fondo blanco, radio 12 px, `--ds-hairline`; foco: anillo `--ds-accent` 3 px alfa .35.

**Pie.** Fondo `--ds-gray-50`, texto muted, enlaces ≥ 44 px de alto táctil.

## 8. Movimiento

| Token | Valor | Uso |
|---|---|---|
| `--ds-ease-enter` | `cubic-bezier(0.16, 1, 0.3, 1)` (ease-out) | Aparición de elementos |
| `--ds-ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` (ease-in) | Salida de elementos |
| `--ds-ease-spring` | `cubic-bezier(0.25, 1, 0.5, 1)` | Hover, clic, controles |
| `--ds-dur-fast` | 200 ms | Color de chip, foco |
| `--ds-dur-base` | 300 ms | Hover de botón/tarjeta, subrayado |
| `--ds-dur-slow` | 400 ms | Entrada de tarjetas y bloques al scroll |
| `--ds-dur-hero` | 600 ms | Entrada del héroe |

Reglas:
- Sólo `transform` y `opacity` (más `background-color`/`color` en controles pequeños). Nunca `width`, `height`, `top`.
- **Entrada al scroll:** `opacity 0→1` + `translateY(20px)→0` con `IntersectionObserver` (`Reveal`); escalonado ≤ 80 ms
  entre hermanos; el contenido es visible sin JS y con movimiento reducido.
- **Botón:** hover → fondo más oscuro + `scale(1.02)`; active → `scale(1)` con `--dur-fast`.
- **Enlace de menú:** subrayado de 1 px que crece de 0 a 100 % de ancho (`transform: scaleX`, origen izquierdo) en 300 ms `--ds-ease-enter`.
- **Tarjeta de producto:** hover sombra 1→2 y zoom de imagen `scale(1.03)`.
- **`prefers-reduced-motion: reduce`:** sin desplazamientos ni escala; sólo cross-fade de opacidad ≤ 120 ms.

## 9. Accesibilidad y responsive

- Contraste mínimo WCAG AA (4.5:1 cuerpo, 3:1 texto grande/UI). Foco visible: anillo `--ds-accent` 3 px alfa .35 +
  contorno 2 px `--ds-accent` en teclado.
- Objetivos táctiles ≥ 44×44 px en cualquier viewport táctil (botones, enlaces de navegación y de pie, chips).
- Breakpoints: 390 (móvil), 768 (tableta), 1100 (escritorio), 1440 (ancho). Sin scroll horizontal.
- Imágenes: `next/image` con `sizes` real; `priority` sólo para la imagen del héroe; `loading="lazy"` en el resto.

## 10. Prohibiciones (checklist de revisión)

- [ ] Borde sólido opaco de 1 px · [ ] `border-left/right` > 1 px de acento · [ ] Texto con degradado
- [ ] Mayúsculas con tracking / kickers · [ ] Tamaño < 12 px · [ ] Cormorant, Jost o cualquier segunda familia
- [ ] Crema/beige · [ ] Dorado en UI · [ ] Sombra con alfa > .2 · [ ] Animar `width`/`height`
- [ ] Valor de espaciado fuera de la escala · [ ] Objetivo táctil < 44 px · [ ] Hex literal fuera de `globals.css`
