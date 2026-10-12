# Import multicategoría: impacto en el sistema de diseño

**Estado:** análisis para planificación. **No se ha implementado nada** (ni código, ni tokens, ni copy). Fecha: 2026-10-11.
Base de la auditoría: `DESIGN.md` (PR de evidencia), código de `apps/web/src/{components/import,domains/import,app/import}` en
`master` + `claude/apple-design-system`, y los componentes compartidos de `components/storefront`.

**Supuesto de partida (del cliente):** Import incorporará **relojes y otros productos de alta gama**, no sólo perfumes. Por tanto:
1. el sistema de diseño debe ser **agnóstico a la categoría**;
2. Import **no hereda** el patrón «recomendador de fragancias»;
3. el héroe y el copy de Import hablan de **«productos importados»**, no de «perfumes importados».

## 1. Resumen ejecutivo

- **La capa visual ya es casi neutra.** Los tokens `--ds-*` no llevan nombres de categoría y el copy de Import ya dice «productos»,
  «consolidado», «catálogo por campaña». **No hay ninguna cadena «perfume/fragancia/decant» en `components/import`, `app/import` ni
  `domains/import`.** El héroe de Import se titula con el nombre de la campaña (dato del admin).
- **Lo perfume-específico está en tres sitios:** (a) **tratamiento de la foto** (tomas de estudio sobre blanco con `mix-blend-mode:
  multiply` y «sombra de contacto del frasco», relación 1:1/4:5), (b) **el modelo de datos de presentación** (`capacityMl`, «Capacidad
  (ml)» en el admin, clases `single_fixed / multi_presentation / pack_set / ambiguous`), (c) **el patrón de descubrimiento** (Finder,
  filtros de género/familia/formato) que sólo existe en Parfums.
- **Riesgo mayor:** no es el diseño sino el **modelo de producto**: un reloj se describe con atributos (caja, movimiento, material,
  correa, resistencia al agua, garantía) que hoy no tienen dónde vivir; la «presentación» actual sólo sabe de mililitros y packs.
- **Decisión de producto abierta que condiciona el diseño:** para piezas de ticket alto, ¿se mantiene «añadir al carrito + WhatsApp» o
  pasa a «consultar»? (Ver §6, preguntas.)

## 2. Auditoría de `DESIGN.md`: qué es perfume-específico

| Ubicación en `DESIGN.md` | Elemento | ¿Perfume-específico? | Qué rompería con relojes |
|---|---|---|---|
| §1 principios 1–4, 6 | Silencio, producto protagonista, jerarquía por tamaño, movimiento, «sin inventar comercio» | **No** | — |
| §1 principio 5 | «WhatsApp es el único cierre de venta; un solo botón primario» | Parcial (es de negocio) | Con ticket alto puede querer «Solicitar / Consultar» y verificación; el patrón sirve, la etiqueta no |
| §2 paleta, navy (§2.1) | Blanco / `#F5F5F7` / tinta / acento / navy de Import | **No** | El navy como identidad de Import encaja mejor con relojes que con perfumes |
| §2 reglas | «Dorado en UI prohibido; el dorado vive en el logotipo y en la fotografía» | No | Es *más* útil con relojes de oro: evita competir con el producto |
| §3 tipografía, §4 espaciado, §5 radios/sombras, §8 movimiento | Escala Geist, 8 px, radios, tokens de easing | **No** | — |
| §6 iconografía | Línea fina 1.5 px | No | Faltan iconos de atributos (caja, correa, garantía) |
| **§7 Tarjeta de producto** | «Tomas de estudio sobre blanco… `mix-blend-mode: multiply`… sombra de contacto **detrás del frasco**» | **Sí** | Los relojes se fotografían en negro, ángulo 3/4, reflejos, PNG con alfa, a veces en muñeca; `multiply` tiñe fondos no blancos y apaga los reflejos |
| §7 Tarjeta de producto | Marca (14 px) / nombre / **precio «desde»** / botón «Añadir» | Parcial | Falta una línea de atributo clave (p. ej. «41 mm · acero») y precios altos sin «desde» |
| §7 Chip de filtro | Pill de 44 px, selección en acento | No | — (el contenido de los chips sí cambia: ver §4.1) |
| **§7 Recomendador (Finder)** | Quiz de pasos, iconos, resultado | **Sí (perfume)** | Perfil olfativo; no existe equivalente para relojes y **no debe heredarse** |
| §7 Hero | Foto a pantalla casi completa + franja `--hero-foot` por **wordmark horneado en el arte de Parfums** | Sí (Parfums) | Import usa otro héroe (contenedor + campaña); ya es independiente |
| §7 Carrusel | Scroll-snap, controles de 44 px | No | — |
| §7 Galería | Rejilla, radio 22 px | No | Necesita ratio libre |
| §7 «Combos» (Parfums) | Constructor de sets de decants | **Sí (perfume)** | Import no lo tiene; `pack_set` es otro concepto |
| `globals.css` | `[data-storefront="parfums"] :is(h1,h2,h3) em` (énfasis cursivo) | Sí (Parfums) | Ya está acotado a Parfums; no afecta a Import |

**Tokens:** ninguno lleva nombre de categoría (`--ds-text-card`, `--ds-radius-*`, `--ds-color-navy`…). El único token con acento
de perfumería es `--hero-foot` (local del héroe de Parfums). **Conclusión: no hay que renombrar tokens**; hay que generalizar
*patrones de componente* y *datos*.

## 3. Estado actual de Import (código)

| Área | Hallazgo | Archivo |
|---|---|---|
| Copy del héroe | El `h1` es el **nombre de la campaña** (dato del admin) o «El próximo consolidado se está preparando.»; resumen = `publicMessage`. Garantías: «Consolidado independiente · Catálogo por campaña · Delivery privado». | `components/import/home/import-hero.tsx` |
| Imágenes de héroe | Contenedor de carga; fallback de catálogo es una «C» tridimensional navy. Ninguna imagen es de perfume. | `public/images/import-home/`, `public/import/catalog-fallback.png` |
| Secciones de la home | héroe → carrusel «Productos disponibles ahora» → «puertas» de categoría → catálogo → compras por volumen → condiciones → proceso → FAQ → contacto | `import-home-view.tsx`, `import-information.tsx` |
| Filtros del catálogo | Sólo **búsqueda + categoría + atajos por marca + paginación** (`PublicImportFilters = {query, category, page}`) | `domains/import/public-import.ts`, `import-catalog.tsx` |
| Categorías | Vienen de la BD (`categories.kind = 'import_category'`), con `slug`, `name`, `productCount` | `public-import.ts`, `import-showcase.ts` (`buildCategoryTiles`) |
| Producto | `name`, `brand`, `categorySlug/Name`, `mediaUrl`, `hasApprovedMedia`, `presentations[]` | `public-import.ts` |
| **Presentación** | `label`, `presentationClass` (`single_fixed` · `multi_presentation` · `pack_set` · `ambiguous`), **`capacityMl`**, `price`, `currency`, `availability` | `public-import.ts`; admin: «Capacidad (ml)» en `import-product-editor.tsx` |
| Foto en tarjeta | `aspect-ratio: 1/1; object-fit: contain; mix-blend-mode: multiply` | `import-home.module.css` (~l. 1042–1049) |
| Foto en ficha | marco `4/5`, `object-fit: cover`, `multiply` en la imagen principal | `app/import/producto/[slug]/page.module.css` |
| Recomendador | **No existe en Import** (ningún import de `finder`/`recommender` en `components/import` ni `app/import`) | — |
| Moneda | `formatCampaignPrice` ya soporta moneda (PEN con formato local) | `public-import.ts` |

## 4. Propuesta: qué generalizar

### 4.1 Filtros

Hoy hay dos arquitecturas distintas: Parfums (`CatalogFilters`: `gender · family · type · format · price · sort`, todo vocabulario de
perfumería) e Import (`query · category · page`). Para multicategoría:

- **Filtros por categoría, no globales.** Cada categoría declara sus *facetas* (p. ej. relojes: marca, tamaño de caja, material,
  movimiento, rango de precio; accesorios: material, color; perfumes: familia, concentración, formato). La UI de filtro es **una
  sola** (la barra de chips + panel de §7 del sistema) alimentada por la definición de facetas de la categoría activa.
- **Facetas comunes siempre disponibles:** marca, precio, disponibilidad en el consolidado, orden.
- **Las «puertas» de categoría** (ya existen) pasan a ser la navegación primaria cuando hay > 1 categoría; con una sola categoría
  se colapsan como hoy.
- **Atajos por marca:** hoy son una lista global; con multicategoría deben acotarse a la categoría activa.

### 4.2 Recomendador

- **Import no hereda el Finder de fragancias** (decisión del cliente; además no existe en el código de Import, así que no hay
  nada que desacoplar).
- Si se quisiera una guía en el futuro, debe ser un **patrón distinto por categoría** («Guía para elegir»: uso, estilo, presupuesto)
  y no un componente de perfumería parametrizado. Recomendación: **no construir nada ahora**; para relojes de alta gama suele
  rendir más una asesoría por WhatsApp (ya es el cierre) que un quiz.

### 4.3 Secciones de producto y modelo de datos

- **Tarjeta:** sustituir el supuesto «frasco sobre blanco» por un **contenedor de medios neutro**: ratio configurable por categoría
  (1:1 por defecto, 4:5, 3:4), `object-fit: contain`, y **tratamiento por tipo de foto** en lugar de `multiply` universal:
  `studio-white` (multiply + sombra de contacto, como hoy), `cutout` (PNG con alfa: sin multiply, sombra de contacto),
  `lifestyle/dark` (sin blend, `cover`, sin sombra). El tipo se guarda por foto/categoría, no se infiere.
- **Línea de atributo clave** en la tarjeta (máx. 1 línea, 14 px muted): para perfumes «3 · 5 · 10 ml», para relojes «41 mm · acero».
- **Ficha:** galería con ratio libre (hoy `4/5`/`4/3` fijos) y **tabla de especificaciones** como sección propia (hoy no existe;
  en Parfums las «notas» ocupan ese lugar).
- **Presentación → variante:** `capacityMl` y las clases de presentación describen volúmenes y packs. Para relojes y accesorios las
  variantes son **combinaciones de atributos** (tamaño de caja, correa, color). Propuesta de modelo (a decidir con el equipo de datos,
  no con diseño): mantener `import_presentations` (precio, disponibilidad, etiqueta) y añadir un **conjunto de atributos
  tipado por categoría** (clave/valor con unidad) que alimente tanto la etiqueta de la variante como la tabla de especificaciones y
  las facetas. `capacityMl` pasa a ser *un atributo más* (`capacidad`, `ml`).
- **Precio:** soportar importes altos y moneda (ya hay moneda): sin «desde» cuando la variante es única; separador de millar;
  etiqueta «Precio de consolidado». Para piezas únicas, **stock = 1** debe poder mostrarse («Pieza única»).
- **Confianza (nuevo, necesario para alta gama):** bloque de garantía/autenticidad por producto (número de serie, documentos,
  garantía) y política de envío asegurado. **Es contenido y operación, no sólo diseño:** hay que definirlos con el cliente.

### 4.4 Jerarquía de contenido (home de Import)

Hoy: campaña → garantías → carrusel → categorías → catálogo → volumen → proceso → FAQ → contacto. Con relojes:

1. **Héroe de campaña** (se mantiene; copy en §5).
2. **Garantías de Import** (consolidado independiente, entrega privada) más una línea de *autenticidad/garantía* por categoría de alto valor.
3. **Puertas de categoría** *antes* del carrusel (hoy van después): con varias categorías son la primera decisión del visitante.
4. **Carrusel «Productos disponibles ahora»**, mezclando categorías o **uno por categoría** (cuando hay > 3).
5. **Catálogo** con filtros por categoría (§4.1).
6. Proceso, condiciones, FAQ, contacto (sin cambios); el FAQ gana preguntas de garantía y autenticidad.

## 5. Héroe y copy de Import: «productos importados»

Se **propone**, sin aplicar:

| Lugar | Hoy | Propuesta |
|---|---|---|
| `h1` del héroe | nombre de campaña (admin) | Guía de redacción para el admin: el nombre de campaña **no nombra una categoría** salvo que la campaña sea monográfica (p. ej. «Consolidado #7: relojes») |
| Resumen del héroe | `publicMessage` del admin | Plantilla neutra: «Productos importados de marcas seleccionadas. Precios exclusivos de este consolidado.» |
| Garantías | «Consolidado independiente · Catálogo por campaña · Delivery privado» | Se mantienen (ya son neutras); añadir «Productos con garantía» sólo cuando el cliente la confirme |
| `description` de metadatos de `/import` | «Importaciones, consolidados y productos seleccionados.» | Ya es neutra |
| Texto de la tarjeta de `/` (selector Parfums / Import) | «Import» | Añadir una línea descriptiva neutra («Productos importados por consolidado») |
| Imagen del héroe | contenedor de carga | Se mantiene: es neutra y describe el modelo logístico, no el producto |
| Fallback de catálogo | «C» navy | Se mantiene |

Regla de copy: **nombrar el modelo (consolidado, importación), no el producto**; las categorías aparecen sólo como datos (puertas y filtros).

## 6. Clasificación

### 6.1 Reutilizable tal cual
- Todos los **tokens `--ds-*`** (color, tipografía, espaciado, radios, sombras, movimiento) y las **reglas de color** (acento restringido,
  navy sólo en superficies, dorado sólo en logo y foto).
- **Superficies navy de Import** (héroe, banner de contacto, pie) y la cápsula del logotipo.
- Componentes compartidos: `Reveal` (observer único), `ProductMarquee` (acepta `tone="import"`), botones, chips, formularios, pie,
  carrito/cajón, navegación, `skip-link`, estructura semántica (`ul > li > article > h3`).
- Estructura de la home de Import (héroe, proceso, condiciones, FAQ, contacto) y el copy de garantías de consolidado.
- Accesibilidad y movimiento (AA, 44 px, `prefers-reduced-motion`).

### 6.2 Necesita abstracción (hoy acoplado a «frasco de perfume»)
| Pieza | Hoy | Abstracción |
|---|---|---|
| Tarjeta de producto | foto 1:1 sobre blanco, `multiply`, sombra de contacto de frasco | contenedor de medios con ratio y **tratamiento por tipo de foto** |
| Galería de ficha | marcos `4/5` y `4/3` fijos | ratio libre por categoría |
| Presentación | `capacityMl`, clases de presentación | **atributos tipados por categoría** (capacidad pasa a ser un atributo) |
| Etiquetas de variante | `label` libre + «Presentación / Pack o set» | etiqueta generada desde atributos (+ override manual) |
| Filtros | vocabulario de perfumería en Parfums; `query/category` en Import | **facetas declaradas por categoría** sobre un único panel de filtros |
| Atajos por marca | lista global | acotados a la categoría activa |
| Duplicación de componentes | Parfums e Import tienen tarjetas, galerías y filtros propios | subir a `components/storefront/*` los que sean genéricos (hoy sólo `Reveal`, `ProductMarquee`, vídeo y TikTok viven ahí) |
| Admin de Import | campo «Capacidad (ml)» en el editor de producto | formulario de atributos según categoría |

### 6.3 Necesita un patrón nuevo (específico de multicategoría)
1. **Navegación por categoría de primer nivel** (puertas + cabecera con categorías) cuando hay más de una; con una sola, el diseño actual.
2. **Tabla de especificaciones** de producto.
3. **Bloque de garantía y autenticidad** (serie, documentos, garantía, envío asegurado).
4. **Estado «pieza única / stock 1»** y manejo de precio alto (sin «desde», formato de millares).
5. **Tratamiento de fotos por tipo** (estudio, recorte, lifestyle/oscuro) como dato del medio.
6. **Plantilla de landing por categoría** (héroe corto + facetas + catálogo), opcional.
7. **Alternativa a «Añadir al carrito»** («Consultar por WhatsApp» con el producto precargado) para piezas de ticket alto, **si el cliente lo decide**.

## 7. Preguntas abiertas (a resolver antes de diseñar)

1. ¿Los relojes se venden con el mismo flujo de consolidado (solicitud → cierre → entrega) o con otro? ¿Requieren anticipo/verificación?
2. ¿«Añadir al carrito» o «Consultar» para piezas de ticket alto? ¿Hay un umbral de importe?
3. ¿Qué categorías entran y con qué atributos obligatorios (relojes, joyería, marroquinería, electrónica)? Esto define las facetas.
4. ¿Fotografía disponible por producto: estudio sobre blanco, recortes, fondo oscuro, lifestyle? Determina el tratamiento de §4.3.
5. ¿Hay garantías documentables (oficial, del importador) y envío asegurado? Se necesitan para el bloque de confianza.
6. ¿Una campaña puede mezclar categorías o será monográfica? Condiciona carrusel y copy del héroe.
7. ¿El nombre «Cruzial Import» y su identidad navy se mantienen para alta gama? (El navy ya encaja.)

## 8. Orden sugerido (planificación, sin compromiso)

1. Decidir §7 (producto/negocio) y el modelo de atributos con datos.
2. Abstraer tarjeta y galería (tratamiento de foto por tipo, ratio libre): bajo riesgo, sin cambiar datos.
3. Filtros por facetas y puertas de categoría primero.
4. Atributos tipados, tabla de especificaciones y bloque de garantía (requiere migración y admin).
5. Copy: guía de redacción de campañas y metadatos.

**Fuera de alcance de este documento:** esquemas SQL, migraciones, componentes, tokens nuevos y cualquier cambio en el admin.
