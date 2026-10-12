# Comparación visual: `master` frente a `claude/apple-design-system`

Evidencia para aprobar el rediseño sin abrir el código.

- **Antes:** `docs/screenshots/before/` (build de producción de `master` @ `1b13c99`, puerto 3100).
- **Después:** `docs/screenshots/after/` (build de la rama, puerto 3000).
- **Mismos datos:** ambas versiones leen la misma base local (catálogo comercial: 99 productos, 190 fotos reales de
  Cloudinary; un consolidado de Import de prueba). Datos de prueba, no de Producción.
- **Anchos:** 1280, 1440, 1920 (escritorio) · 768, 1024 (tableta) · 375, 390, 428 (móvil).
- **Páginas:** `home` (`/`), `parfums`, `parfums-catalogo`, `parfums-producto` (One Million Lucky), `parfums-combos`, `import`.
- **Nombres:** `<pagina>-<ancho>.jpg`. Son JPEG (calidad 78) con los primeros 3 200 px de la página tras recorrerla entera
  (para disparar las entradas al scroll); además `home|parfums|import-fold-<ancho>.jpg` es sólo la primera pantalla.
  Se usó JPEG y no PNG para que las 144 capturas pesen 22 MB en lugar de ~150 MB.
- **Qué se miró a ojo:** las 6 páginas a 1440 y 390 px, el héroe de Parfums a los 8 anchos y el detalle de producto.
  **Los demás anchos (768, 1024, 375, 428, 1280, 1920) se verificaron con script** (48 combinaciones página × ancho:
  0 con scroll horizontal, 0 con texto < 12 px, ≤ 2 objetivos táctiles < 44 px por pantalla), no una a una a ojo.

## Héroe de Parfums: titular frente al wordmark horneado

La imagen del héroe trae "CRUZIAL PERFUMERÍA" y su ornamento dentro del mapa de bits. Se reserva una franja inferior
(`--hero-foot`, 22 vh entre 152 y 200 px) y el titular vive en ella.

| Ancho | Resultado | Titular |
|---|---|---|
| 1280 × 800 | **sin choque**, ~80 px libres entre el ornamento y el titular | 1 línea |
| 1440 × 900 | sin choque | 1 línea |
| 1920 × 1080 | sin choque; el titular (máx. 3.5 rem) se ve pequeño sobre un lienzo grande | 1 línea |
| 1024 × 768 | sin choque, el más justo (el titular envuelve a 2 líneas) | 2 líneas |
| 768 × 1024 | sin choque | 2 líneas |
| 428 / 390 / 375 (móvil) | sin choque; imagen completa sobre fondo oscuro y texto abajo a la izquierda | 2 líneas |

El test `hero headline stays below the artwork wordmark band…` fija que el titular empiece en el 40 % inferior del héroe en
chromium, mobile y tableta. **No hay choque en ningún ancho**, así que no hace falta overlay, blur ni franja más alta.
Dos mejoras opcionales, no necesarias: subir el tope del titular a 4 rem en ≥ 1600 px, y una franja de 24 vh (no 22) en
1024 × 768 si se quiere más aire.

## Por página y punto de ruptura

Leyenda: ✅ mejoró claramente · ⚠️ dudoso · ❌ peor que antes.

### `/` (pasarela)
| | Escritorio (1280 / 1440 / 1920) | Tableta (768 / 1024) | Móvil (375 / 390 / 428) |
|---|---|---|---|
| ✅ | Una sola tipografía; botones "Entrar" como píldoras de vidrio en lugar de subrayado + círculo; cortina de 600 ms | igual | las dos puertas apiladas conservan jerarquía |
| ⚠️ | Panel Parfums negro plano frente a foto azulada de Import: los dos lados siguen siendo oscuros y de distinto tono | — | el titular "Parfums"/"Import" a 2.1 rem queda ligero |
| ❌ | — | — | — |

### `/parfums`
| | Escritorio | Tableta | Móvil |
|---|---|---|---|
| ✅ | Titular + 2 acciones sobre el héroe; ritmo blanco/gris; carrusel de producto con sombra de contacto; "Encuentra tu familia" con tiles redondeados; combos en tarjeta blanca; recomendador con iconos de línea; pie claro | 2 columnas de pilares; mosaicos sin desfase | héroe con la imagen completa; carrusel de tarjetas al 62 % del ancho; tiles en snap |
| ⚠️ | La primera tarjeta del carrusel queda cortada a la izquierda (el riel es un bucle, igual que antes); subtítulos de la franja de pilares en 13–14 px gris | titular a 2 líneas a 1024 × 768 | la franja de pilares en 2 × 2 con subtítulos que envuelven a 3 líneas |
| ❌ | **La obra del héroe pierde ~20 % de altura** (la franja del titular): botellas y wordmark más pequeños que antes; se perdió la atmósfera "editorial dorado/crema" (decisión del brief) | idem | idem |

### `/parfums/catalogo`
| | Escritorio | Tableta | Móvil |
|---|---|---|---|
| ✅ | Héroe de 62 svh (antes 100 svh): los productos aparecen ~300 px antes; tarjetas sin borde con elevación y botón azul; chips y buscador en píldoras grises; puertas de categoría con scrim más profundo (texto AA) | 3 columnas | 2 columnas con "Añadir" a ancho completo |
| ⚠️ | Fotos con fondo gris degradado (Acqua di Gio, Angham) muestran su rectángulo dentro del tile gris; la sombra de contacto bajo el frasco es sutil | — | stepper + botón apilados: correcto pero denso a 375 |
| ❌ | Pierde el héroe a pantalla completa (menos "cine") | — | — |

### `/parfums/productos/<slug>`
| | Escritorio | Tableta | Móvil |
|---|---|---|---|
| ✅ | Tallas como botones con selección azul; cuadros de ficha grises sin borde; "Rendimiento" y "Frasco completo" ordenados; miniaturas con anillo azul | 2 columnas | imagen a ancho completo, tallas en 3 columnas |
| ⚠️ | El plano de la imagen principal es un rectángulo gris muy pálido; las flechas del visor son círculos blancos casi invisibles sobre ese gris (el glifo sí contrasta) | — | etiqueta del tipo ("Designer") junto a la imagen |
| ❌ | **Defecto encontrado y corregido durante esta comparación:** un paso mecánico del rediseño había convertido el plano de la imagen en una píldora (`border-radius: 980px`, porque "Stage" contiene "tag"), recortando la etiqueta y las flechas. Arreglado (`--ds-radius-lg`) y recapturado | idem | idem |

### `/parfums/combos`
| | Escritorio | Tableta | Móvil |
|---|---|---|---|
| ✅ | Sets en tarjetas blancas con tallas en píldoras azules y "Añadir set" azul (antes negro rectangular); constructor con chips y totales claros | 2 columnas | tarjetas apiladas, barra fija inferior |
| ⚠️ | Miniaturas del constructor de 58 px y textos de 12 px ("Total estimado") en el límite del mínimo | `Buscar perfume…` recortado por el placeholder a 1024 | — |
| ❌ | — | — | — |

### `/import`
| | Escritorio | Tableta | Móvil |
|---|---|---|---|
| ✅ | Sistema claro coherente con Parfums; texto sobre el héroe medido AA (antes 3.3:1 en el resumen); tarjetas, chips y botones azules; contraste y objetivos táctiles 100 % limpios | igual | héroe con botones apilados a ancho completo; sin desborde a 320 px (se corrigió el bloque mayorista) |
| ⚠️ | Grandes vacíos verticales (128 px por sección) y listas de 4 pasos con viñetas diminutas: se ve escaso; el logotipo (cuadrado azul marino) pesa sobre el fondo blanco | — | los pasos "01–04" en una columna larga |
| ❌ | **Pierde la atmósfera azul marino**: era la seña de identidad de Import y lo distinguía de Parfums. Ver `docs/import-decision.md` | idem | idem |

## Resumen para decidir

- **Mejoró claramente:** coherencia de sistema (1 fuente, 1 paleta, 1 acento), contraste (0 violaciones axe, texto sobre foto 50/50),
  objetivos táctiles, tarjetas/filtros/botones, combos, productos, rendimiento en `/parfums` móvil (LCP −0.7 s throttled).
- **Sigue dudoso:** el héroe de Parfums (arte más pequeña), fotos con fondo degradado en tiles grises, espacios vacíos de
  Import, flechas del visor de producto.
- **Peor que antes:** impacto cinematográfico del héroe de Parfums y del catálogo; identidad oscura de Import.
