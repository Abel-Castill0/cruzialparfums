# Héroe de Parfums: cuatro variantes para recuperar el impacto de la imagen

**Rama:** `claude/hero-variants` (parte de `claude/apple-design-system` @ `3020eb5`). **Nada se mergea.**
Las variantes viven detrás de `?hero=a|b|c|d` en `/parfums` (sin parámetro = el héroe actual). Evidencia en
`docs/hero-variants/` (`hero-<variante>-<ancho>.jpg`: A, B, C y actual a 1440 y 390 px; D a 1440, 1024 y 390 px, más los dos assets nuevos). **La recomendación vigente es la de la sección 6** (la de la sección 3 es anterior a D).

## 1. Análisis de la imagen

`public/parfums/hero/hero-crop.webp` — 1672 × 792 px (2.11 : 1), dos grupos de frascos a los lados y el logotipo
"CRUZIAL PERFUMERÍA" **horneado** en el centro. Medido sobre el archivo (coordenadas de la imagen):

| Zona | Rectángulo (x0, y0, x1, y1) | Estado |
|---|---|---|
| **Wordmark** (monograma + CRUZIAL + PERFUMERÍA + filete) | 615, 130 → 1075, 600 | **Sagrada** |
| **Frascos izquierda** (Tom Ford, Erba Pura, Valentino) | 110, 245 → 570, 700 | **Sagrada** |
| **Frascos derecha** (Sauvage, 9pm, Guerlain) | 1125, 190 → 1670, 735 | **Sagrada** (el frasco de cristal llega a x = 1670, el borde) |
| **Humo superior** | 0, 0 → 1672, ~125 | **Prescindible**: oscuro y sin detalle; 16 % de la altura |
| **Repisa entre grupos** | 575, 640 → 1125, 792 | **Prescindible** (piedra): 550 × 150 px de espacio libre entre los dos grupos |
| Follaje lateral | x < 100 y la repisa de abajo | Prescindible |

**Por qué "se perdió el 20 %".** No es que el héroe actual tenga menos imagen: es que **a 1440 × 864 la versión anterior hacía
`cover` por altura** (escala 1.09, recortando 190 px por lado: ya cortaba el frasco de cristal de la derecha) y la actual
muestra la imagen **entera** a escala 0.86 (−21 %) para dejar una franja inferior de 190 px al titular. Los datos:

| Escala de la imagen a 1440 px | Qué se ve |
|---|---|
| 1.09 (master) | wordmark entero, frascos izquierdos 86 %, derechos 68 % |
| 0.86 (héroe actual) | todo, el 74 % del primer viewport es arte |
| **0.92 (máximo sin cortar un solo frasco)** | todo; recorta sólo 90 px de follaje a la izquierda |

## 2. Las tres variantes

Métricas (script, 1440 × 900 salvo indicación; "arte en el viewport" = % de la primera pantalla ocupada por la imagen;
visibilidad = % de cada zona sagrada que queda en pantalla; contraste = texto blanco del `h1` contra el 95.º percentil de
luminosidad del píxel de detrás, medido sin texto):

| | Actual | **A · Velo** | **B · Zonas libres** | **C · Recorte sagrado** |
|---|---|---|---|---|
| Escala de la imagen (1440) | 0.86 | **1.09** | **1.09** | 0.92 |
| Arte en el viewport 1440 | 74 % | **96 %** | **96 %** | 81 % |
| Arte en el viewport 390 | 55 % | 55 % | 55 % | **68 %** |
| Wordmark visible | 100 % | 100 % | 100 % | 100 % |
| Frascos izq. / der. visibles (1440) | 100 / 100 | 86 / 68 | 86 / 68 | **100 / 100** |
| Frascos izq. / der. visibles (1920) | 100 / 100 | 100 / 81 | 100 / 81 | 100 / 100 |
| Texto sobre zona sagrada | 0 % | **5 %** (1440), 9 % (1024) | **0 %** | 0 % |
| Contraste del titular (1440 / 390) | 19.7 / 19.4 | 7.2 / 18.7 | 17.4 / 18.2 | 16.8 / 9.1 |
| Alto de los CTA | 48 px | 48 px | 48 px | 48 px |

Todos los CTA miden 48 px, el `h1` sigue siendo el primer encabezado y visible, y el contraste del titular es ≥ 7:1 en
todos los casos medidos (AA exige 3:1 para texto grande).

### A · "Velo" — la imagen a pantalla completa, titular sobre un degradado

- **Idea:** como en master (`cover`, 100 svh) y el titular encima, sobre un degradado negro que sube desde el borde
  inferior (0.78 → 0 en el 46 % inferior). El texto se limita a 3 rem para caber en la repisa central.
- **Pros:** máximo impacto (arte 96 % del primer viewport), es la solución más reconocible de "héroe de lujo", sin franja
  vacía; contraste 7.2:1.
- **Contras:** el degradado **oscurece la base de los frascos** y la repisa (la parte más cálida de la foto); el titular
  roza la base de Valentino (5 % del texto sobre zona sagrada, 9 % en 1024); recorta el frasco de cristal derecho (32 %)
  y parte de Tom Ford, igual que master; en móvil no cambia nada.
- **Coste:** bajo (sólo CSS).

### B · "Zonas libres" — el titular integrado en el arte, sin tocar nada sagrado

- **Idea:** misma imagen a pantalla completa, pero el titular va en el **humo superior** (por encima del monograma) y los
  CTA en la **repisa central** entre los dos grupos de frascos: justo las dos zonas prescindibles que midió el análisis.
  Sólo hay dos velos suaves arriba y abajo (0.55 → 0 en el 22–24 %), ninguno sobre un frasco.
- **Pros:** **0 % del texto sobre zonas sagradas en los 4 anchos medidos**; el mismo arte a escala 1.09 y 96 % del viewport;
  la estructura "titular → imagen → acciones" se lee como un cartel; contraste 17:1.
- **Contras:** titular más pequeño (2.5 rem frente a 3.5) porque el humo sólo da ~140 px; separa titular y CTA (~650 px) en
  desktop, lo que cuesta algo de "un solo golpe de vista"; también recorta frascos laterales como master (86 % / 68 %);
  en móvil el titular queda arriba y los CTA abajo, con la imagen en medio (más "editorial", menos directo).
- **Coste:** bajo (CSS + el orden del DOM ya es el correcto).

### C · "Recorte sagrado" — la mayor escala que no corta ningún frasco

- **Idea:** el techo físico de escala sin perder un solo frasco es 0.92 (recortando sólo los 100 px de follaje izquierdo con
  `object-position: 100%`). Se reduce la franja a 128–160 px (frente a 152–200) y titular + CTA van **en una sola fila**; un
  fundido suave une la repisa con la franja. En móvil la imagen sube a 310 % del ancho.
- **Pros:** **ningún frasco recortado** (100 / 100 en 1440 y 1920); el wordmark nunca se toca; +7 puntos de arte en el
  viewport (74 → 81 %) y en móvil +13 (55 → 68 %); es la opción más fiel a "la imagen es el activo".
- **Contras:** **no recupera el impacto de master** (0.92 frente a 1.09: −16 %): el cliente que vio la versión anterior seguirá
  notando la imagen más pequeña; a 1024 px la ventana es estrecha y recorta frascos (88 % / 70 %); la fila titular + CTA es
  ancha (~900 px) y en pantallas < 1100 envuelve; en móvil la imagen ocupa más pero los frascos desaparecen (1 % / 0 %)
  porque se ve sólo el wordmark.
- **Coste:** bajo (sólo CSS).

## 3. Recomendación

**B ("Zonas libres").** Razones:

1. Es la única variante que **recupera la escala de master (1.09, 96 % del viewport) sin poner texto sobre ninguna zona
   sagrada** (0 % de solape): el título y los botones viven en los dos espacios que la imagen ya traía vacíos.
2. No oscurece la foto (A sí) ni hace pasar la imagen por un recorte menor (C).
3. Cumple lo exigido: `h1` visible y primero en el DOM, contraste ≥ 17:1 (AA ≥ 3:1), CTA de 48 px.

**Reservas honestas.** (a) Recorta lo mismo que master en los extremos (frasco de cristal derecho 32 %): si el dueño no
acepta ese recorte, la respuesta es **C**, que es la única que no corta un frasco; (b) el titular es más pequeño y está
separado de los botones: conviene mirarlo en el teléfono de la clienta antes de decidir; (c) A es la alternativa más
"estándar" si se prefiere el texto agrupado abajo y se acepta el degradado.

**Decisión que necesito:** A, B o C (o una combinación, p. ej. B con la escala de C). Hasta entonces no se toca master ni
`claude/apple-design-system`; si eliges, la implementación definitiva sustituye el parámetro `?hero=` por el diseño elegido.

## 4. Variante D · "Reencuadre": se edita el asset, no el CSS

Las tres variantes anteriores operan con CSS sobre una imagen 1672 × 792 que no se puede acomodar a todos los formatos. D
parte de otra hipótesis: **entregar el arte ya encuadrado para cada formato** y mostrarlo a escala 1.0 (la imagen nunca se amplía
ni se recorta con `object-fit`), con el titular en la franja de tinta que queda debajo. Viva en `?hero=d`.

### 4.1 Qué se puede recortar (y qué no) del original

![Original](hero-variants/asset-original.jpg)

| Zona | Rectángulo (imagen original) | Veredicto |
|---|---|---|
| Humo superior | y 0 → 88 | **Muerto** (oscuro, sin detalle; el logotipo empieza en y = 130) |
| Follaje izquierdo | x 0 → 95 | **Muerto** (hojas; el primer frasco empieza en x = 110) |
| Borde derecho | x > 1670 | **No se toca**: el frasco de cristal de Guerlain llega a x = 1670 |
| Repisa inferior | y 764 → 792 | **Muerto** (28 px de piedra bajo los frascos, que acaban en y = 735) |
| Wordmark, 6 frascos | ver sección 1 | **Intactos** |

### 4.2 Los dos assets (originales sin tocar; archivos nuevos)

| Asset | Archivo | Píxeles | Proporción | Cómo se obtiene |
|---|---|---|---|---|
| Desktop y tablet apaisada | `public/parfums/hero/hero-d-wide.webp` | 1577 × 676 (109 KB) | **21:9** exacta | **Recorte puro** del original: x 95 → 1672, y 88 → 764. Ni un píxel inventado. |
| Móvil y tableta vertical | `public/parfums/hero/hero-d-portrait.webp` | 1100 × 1375 (102 KB) | **4:5** exacta | **Recomposición** con los píxeles del original: bloque del wordmark arriba y los dos grupos de frascos lado a lado debajo, con fundidos en las uniones. **El humo de fondo que une las piezas está sintetizado** (degradado con ruido derivado de los bordes del propio humo): es edición de arte, no un recorte. |

![Desktop 21:9](hero-variants/asset-d-wide-21x9.jpg)
![Móvil 4:5](hero-variants/asset-d-portrait-4x5.jpg)

Un recorte 4:5 del original no puede contener los dos grupos de frascos (mueven 1 560 px de ancho en 792 de alto), por eso en
móvil hace falta recomponer. `hero-d-portrait.webp` es la pieza que necesita visto bueno de quien lleve la marca.

### 4.3 Implementación (sólo en `claude/hero-variants`)

- `HeroArtworkD` en `hero-carousel.tsx`: `<picture>` con `getImageProps` de `next/image` (arte dirigido); el `<source>` vertical
  se usa con `(max-width: 767px), (max-width: 1100px) and (orientation: portrait)`; `fetchPriority="high"`, `quality` 60. Mismo `h1`
  y mismos enlaces que el héroe actual.
- CSS: el héroe pasa a altura automática = arte + franja. Sin velo sobre el arte. Un fundido de 16 % funde la repisa en la
  tinta. En pantallas bajas el arte vertical pierde como máximo el humo superior (17 % del cuadro) con `object-position: 50% 100%`;
  nunca un frasco.
- Peso servido (optimizador de Next, `q=60`): desktop 83 KB a 1577 px (el héroe actual: 87 KB); **móvil 29 KB a 640 px / 41 KB
  a 828 px** (el héroe actual en móvil descarga la imagen a 250 % del ancho: 44–87 KB).

### 4.4 Medidas (misma metodología que la sección 2, 5 anchos)

| | Actual | A | B | C | **D** |
|---|---|---|---|---|---|
| Escala de la imagen 1440 / 390 / 1024 | 0.86 / 0.58 / 0.71 | 1.09 / 0.58 / 0.92 | 1.09 / 0.58 / 0.92 | 0.92 / 0.72 / 0.76 | **0.91 / 0.36 / 0.65** |
| Anchura del wordmark en px (1440 / 390) | 396 / 268 | 502 / 268 | 502 / 268 | 423 / 333 | **420 / 163** |
| Arte en el viewport 1440 / 1024 / 390 | 74 / 73 / 55 % | 96 / 95 / 55 % | 96 / 95 / 55 % | 81 / 79 / 68 % | **69 / 57 / 58 %** |
| Frascos izq. / der. visibles, **1440** | 100 / 100 | 86 / 68 | 86 / 68 | 100 / 100 | **100 / 100** |
| Frascos izq. / der. visibles, **1024** | 99 / 79 | 63 / 49 | 63 / 49 | 88 / 70 | **100 / 100** |
| Frascos izq. / der. visibles, **820 (vertical)** | 17 / 10 | 4 / 0 | 4 / 0 | 14 / 8 | **100 / 100** |
| Frascos izq. / der. visibles, **390** | 15 / 8 | 15 / 8 | 15 / 8 | 1 / 0 | **100 / 100** |
| Wordmark visible (todos los anchos) | 100 % | 100 % | 100 % | 100 % | **100 %** |
| Texto sobre zona sagrada (peor ancho) | 3 % | 9 % | 0 % | 0 % | **0 %** |
| Contraste del `h1` (peor ancho) | 14.2 | 7.2 | 16.7 | 9.1 | **16.8** |
| Alto de los CTA | 48 px | 48 | 48 | 48 | **48** |
| `h1` presente y primer encabezado | sí | sí | sí | sí | **sí** |
| axe (WCAG 2.2 A/AA) sobre el héroe, 3 anchos | — | — | — | — | **0 violaciones** |

Capturas: `docs/hero-variants/hero-d-reencuadre-1440.jpg`, `…-1024.jpg`, `…-390.jpg`.

### 4.5 Lectura honesta

**Lo que gana D**
- Es la única variante con **los seis frascos y el wordmark completos en todos los anchos**, incluidos 1024 (88/70 en C), la
  tableta vertical (17/10 en el actual) y el móvil (15/8 en el actual, 1/0 en C). Hoy, en móvil, el visitante ve el logotipo y
  casi nada del producto.
- 0 % de texto sobre arte, contraste 16.8:1, sin velo sobre la foto (A) ni degradado que oscurezca la base de los frascos.
- Mismo tamaño de frasco que C en 1440 (0.91 frente a 0.92) y +6 % respecto al actual, sin la máscara ni el desplazamiento.
- Más ligera en móvil (29–41 KB frente a 44–87 KB).

**Lo que cuesta D**
- **Menos superficie de arte en pantalla en escritorio**: 69 % del primer viewport a 1440 (74 % el actual, 81 % C, 96 % A/B) y
  57 % a 1024. Se debe a que recortar el humo muerto acorta el cuadro: a un ancho dado, un 21:9 es más bajo que un 2.1:1. **No
  recupera el "impacto" medido en píxeles de A/B**; sólo iguala el tamaño del producto de C.
- **El wordmark se hace pequeño en móvil**: 163 px de ancho frente a 268 px actuales (−39 %): es el precio de mostrar todos los
  frascos. En 390 px el nombre sigue legible pero ya no domina.
- El asset vertical es una **recomposición con fondo sintetizado**: hay que aprobarla y, si se adopta, que diseño la rehaga con
  el archivo original en alta resolución (el actual es 1672 px).
- A diferencia de A/B, el héroe ya no ocupa el 100 % de la pantalla (813 px a 1440 × 900; 757 px a 390 × 844): asoma una franja de unos 45–55 px de la
  sección siguiente, algo que puede verse como pista de scroll o como pérdida de inmersión.

## 5. Comparación A · B · C · D

| Criterio | A · Velo | B · Zonas libres | C · Recorte sagrado | D · Reencuadre |
|---|---|---|---|---|
| Cambia | CSS | CSS | CSS | **asset** + CSS |
| Frascos cortados en 1440 | sí (32 % der.) | sí (32 % der.) | **no** | **no** |
| Frascos cortados en móvil | sí | sí | sí (casi todos) | **no** |
| Tamaño del producto en 1440 | 1.09 | 1.09 | 0.92 | 0.91 |
| Superficie de arte en 1440 | **96 %** | **96 %** | 81 % | 69 % |
| Texto sobre zona sagrada | hasta 9 % | **0 %** | **0 %** | **0 %** |
| Titular | sobre degradado | en el humo, lejos de los CTA | en una franja fina | **en franja natural propia** |
| Riesgo | oscurece la foto | titular pequeño y separado | pierde impacto | **asset recompuesto; héroe más bajo; wordmark pequeño en móvil** |
| Esfuerzo si se elige | bajo | bajo | bajo | **medio (diseño del asset 4:5)** |

## 6. Recomendación final

**D, condicionada a aprobar el asset vertical.** Es la única que resuelve las dos objeciones al mismo tiempo (nada de producto
cortado y titular en una franja que respeta el arte) y la única que arregla el móvil, donde hoy casi no se ve producto. Lo que no
hace es "recuperar el impacto" en el sentido de superficie de arte en escritorio: eso sólo lo da **B** (96 %), a costa de cortar el
frasco de cristal derecho (32 %).

Regla para decidir:
- **Prima no cortar producto y que el móvil enseñe el catálogo → D** (con el asset 4:5 rehecho por diseño a partir del original).
- **Prima la máxima presencia de la foto en escritorio y se acepta el recorte → B.**
- **No se quiere tocar el arte → C** (tamaño idéntico a D en escritorio, sin cambios de asset, pero en móvil no se ve producto).

No se ha mergeado nada; `claude/hero-variants` queda como rama de evidencia.
