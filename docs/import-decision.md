# Decisión pendiente: ¿Import se unifica al sistema claro o conserva su identidad oscura?

**Estado:** el dueño eligió la **Opción C**; implementada en `claude/apple-design-system` (ver «Validación de C» al final). La Opción B no se implementó.

Evidencia visual (misma base local en ambas):

| | `master` (azul marino) | rama (sistema claro) |
|---|---|---|
| Escritorio 1440 | `docs/screenshots/before/import-1440.jpg`, `import-fold-1440.jpg` | `docs/screenshots/after/import-1440.jpg`, `import-fold-1440.jpg` |
| Móvil 390 | `docs/screenshots/before/import-390.jpg`, `import-fold-390.jpg` | `docs/screenshots/after/import-390.jpg`, `import-fold-390.jpg` |
| Otros anchos | `before/import-{1280,1920,768,1024,375,428}.jpg` | `after/import-{1280,1920,768,1024,375,428}.jpg` |

## Qué estaba en juego

En `master`, Parfums es crema/negro/dorado y Import es azul marino/plata, con una nota explícita en el CSS: *"the two
units share typography and structure, never a paint job"*. Import (consolidados, compra grupal por campaña, mayorista) es
otra unidad de negocio con otra audiencia y su propio logotipo (insignia azul marino con el monograma).
El brief del rediseño pide un solo sistema (blanco / `#F5F5F7` / `#1D1D1F` / acento `#0071E3`); la rama lo aplicó a Import.

## Opción A: unificar (estado actual de la rama)

**A favor**
- Una marca visual coherente: el visitante que pasa de Parfums a Import no siente que cambió de tienda.
- Un solo juego de tokens y de componentes: cada arreglo (contraste, foco, 44 px, movimiento) se hace una vez.
  Ya medido: 0 violaciones axe, texto sobre fotos 50/50 AA, 0 objetivos táctiles pequeños en Import.
- Formularios largos (carrito, checkout, condiciones) se leen mejor sobre fondo claro; el checkout es el cierre de venta.
- Menos superficie que mantener: desaparecieron los bloques `prefers-color-scheme: dark` y las variantes oscuras de `--import-*`.
- Coherente con la referencia Apple elegida (páginas de producto claras con héroes oscuros puntuales).

**En contra**
- **Se pierde la identidad de Import**, que era su atmósfera: el azul marino nocturno con el contenedor. Hoy sólo sobrevive
  en la foto del héroe y en el logotipo.
- Parfums e Import dejan de distinguirse de un vistazo; la separación "retail / consolidado" se apoya sólo en el copy.
- El logotipo de Import es un cuadrado azul marino sólido: sobre blanco pesa más que el de Parfums (círculo negro)
  y se ve como un parche.
- La página queda más "escasa": secciones de 128 px de aire con listas de 4 pasos de viñetas diminutas.
- Decisión difícil de revertir sin trabajo: el rediseño reutilizó `--ds-white` como superficie *y* como texto sobre acento,
  así que un tema oscuro posterior exige separar tokens semánticos.

## Opción B: mantener la identidad oscura con el sistema nuevo

Mismos componentes, escala tipográfica, espaciado, radios, movimiento, tamaños táctiles y reglas de accesibilidad; sólo cambia
la paleta bajo `[data-storefront="import"]`: fondo `#061527`/`#0B1F3D`, superficies `#0C223D`, texto `#F4F7FB`, acento
`#0071E3` (o su variante clara `#4DA3FF` para texto sobre marino), hairlines con alfa claro.

**A favor**
- Conserva la identidad y la diferenciación entre unidades; el contenedor y el logotipo azul marino encajan sin parches.
- Sigue el principio de Apple de secciones oscuras en páginas "de producto"; da un aire premium/nocturno distinto del
  catálogo de decants.
- La diferencia está contenida en un solo bloque de tokens; los componentes no divergen.
- Es lo que el cliente ya conocía de Import; es la opción conservadora.

**En contra**
- Dos paletas que mantener y verificar (cada texto secundario necesita su par de contraste oscuro: p. ej. gris sobre
  `#0C223D` exige ≥ 4.5:1, más fácil de fallar con 12–14 px).
- El brief original del rediseño fijaba la paleta clara para "todo el sitio"; B lo contradice parcialmente.
- Formularios largos y carrito sobre fondo oscuro: más fatiga y más riesgo de contraste en errores/estados.
- Sombras y "elevación" funcionan peor en oscuro (hay que sustituir sombra por luminosidad de superficie).
- Coste (estimación mía, no medida): ~1–2 días para separar tokens semánticos (`--ds-surface`, `--ds-on-accent`, `--ds-text`…), rehacer sombras,
  recalcular contrastes y recapturar.
- Si se elige B, el checkout de Import podría quedarse claro (opción B′): menos coherente dentro de la unidad.

## Opción C (híbrida): claro por defecto con identidad en puntos concretos

Es A + tres señales baratas de Import: (1) héroe y pie con el azul marino real (`#0B1F3D`) en lugar de gris carbón;
(2) un acento de unidad `--ds-unit` (azul marino) usado sólo en la insignia "Import", el estado de campaña y los
encabezados de sección; (3) logotipo sobre superficie propia (cápsula `#0B1F3D`) con aire a su alrededor. Cuesta ~½ día (estimación),
no divide los componentes y devuelve parte de la atmósfera.

## Recomendación

**Opción C: mantener la unificación clara (A) y devolver a Import dos o tres señales de identidad.** Razones:

1. El valor de este rediseño es una sola marca verificable (contraste, foco, táctil, movimiento). Dos temas duplican el
   coste de cada verificación futura, y en Import la mayor parte del tiempo del visitante está en catálogo, carrito y checkout,
   que son justo donde el fondo claro rinde mejor.
2. La identidad de Import nunca estuvo en el fondo, sino en la fotografía del contenedor y el logotipo; ambos se conservan.
3. Lo que hoy se siente "peor" (atmósfera, logotipo pesado, páginas escasas) tiene arreglos pequeños y locales (héroe/pie en
   marino real, cápsula del logotipo, reducir el aire vertical de 128 a 96 px en Import) sin tocar el sistema.
4. Es reversible en un sentido útil: si el dueño aún prefiere B, el trabajo de C (tokens de unidad, cápsula, héroe marino) es
   la mitad de B.

**Elegiría B sólo si** el negocio quiere posicionar Import como una marca separada (otro público, otro dominio, otro
tono); en ese caso conviene hacerlo con tokens semánticos desde el principio, no encima de este rediseño.

**Qué necesito del dueño:** A, B o C. No hago cambios hasta tener la respuesta.

## Validación de C (implementada)

Capturas: `docs/screenshots/import-c/` — `import-full-1440.jpg`, `import-full-390.jpg`, `import-hero-*.jpg`, y estados
`state-hover-hero-cta-1440.jpg`, `state-focus-header-1440.jpg`, `state-focus-footer-{1440,390}.jpg`.

**Qué se hizo.** Token `--ds-color-navy` (`#0B1F3D`) y `--ds-color-navy-deep` (`#0A1629`) en `globals.css` con sus pares de
texto/hairline; héroe con velo `color-mix(navy)` en lugar de negro; banner final de contacto como superficie navy con texto
`--ds-on-navy`; pie navy; logotipo en cápsula (cabecera y pie); `--ds-section-y` de Import 64/80/96 px. Tipografía, radios
(pill/lg), sombras, curvas y duraciones son los del sistema claro, sin ninguna variante propia.

**¿El héroe oscuro se siente parte del sistema o pegado?** **Parte del sistema.** Razones observables: (1) usa los mismos
botones (acento azul + secundario de vidrio), el mismo titular `--ds-text-hero` 600/−0.035em y la misma entrada que el héroe
de Parfums; (2) el velo es del mismo navy que el pie y el banner, de modo que la foto "se funde" hacia ese color en vez de
cortar contra un negro neutro; (3) la transición al cuerpo es un corte limpio horizontal a ancho completo, como en Parfums,
sin degradado ni sombra intermedia. Lo que podría leerse como pegado —que Parfums sea negro y no navy en su héroe— es
una diferencia entre unidades, no dentro de Import.

**¿El pie oscuro dialoga con el héroe?** **Sí.** Mismo `#0B1F3D`, y entre ambos aparece una tercera superficie navy (el banner
de contacto con la caja "CRUZIAL IMPORT"), de modo que la página tiene un ritmo oscuro–claro–oscuro–claro–oscuro en vez de
dos bloques aislados. Los enlaces del pie usan 9.5:1, el botón "Volver a Cruzial" repite el vidrio del héroe
(`rgba(255,255,255,.12)`), y el foco pasa a blanco para no perder contraste sobre navy.

**¿El logotipo en cápsula se ve intencional o forzado?** **Intencional, con una reserva.** La marca es un cuadrado con su
propio fondo navy; recortada en círculo dentro de una píldora del mismo navy ya no muestra marco ni "parche", y "Import"
da el nombre de la unidad que antes la imagen no legibilizaba a 60 px. Reserva: la marca de 44 px es pequeña (el texto
"CRUZIAL" bajo el monograma apenas se lee); si se quiere más presencia, hay que reexportar el logotipo en horizontal
(monograma + texto, fondo transparente), no agrandar la cápsula.

**Resultado:** ninguna respuesta es "pegado", así que **no se cambia a la Opción B**.

**Medidas.** axe (A/AA) 0 violaciones en `/import` móvil y escritorio; texto sobre fotos 50 de 50 muestras ≥ AA (el resumen
del héroe pasó de 3.3:1 a ≥ 4.5:1 con el velo navy); 105 pruebas Playwright de accesibilidad e Import (chromium, mobile,
tablet) en verde; sin scroll horizontal.

**Dudoso que queda (honesto).**
- La altura del héroe de Import sigue siendo 100 svh: es la única página donde el héroe no recupera la franja del primer
  contenido; no se tocó porque la decisión era de identidad, no de altura.
- El carrusel de productos y las tarjetas siguen siendo grises (`#F5F5F7`), idénticas a Parfums: la identidad de Import vive
  en las tres superficies navy, no en el cuerpo.
- "Consultar condiciones mayoristas" es una píldora blanca sobre gris con un texto largo que envuelve a 390 px.
- Prueba con un solo consolidado de ejemplo en la base local, no con una campaña real.
