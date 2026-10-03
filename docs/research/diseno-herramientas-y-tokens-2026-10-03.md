# Diseño, herramientas y ahorro de tokens — 2026-10-03

Estado: rama `claude/design/frontend-ux-audit-2026-10`, sin commit. Complementa
`claude-code-tooling-review-2026-10.md` (no lo repite).

## 1. Decisiones de diseño aplicadas

Dirección: lujo sobrio. Un solo gesto memorable por superficie, el resto en silencio.

| Superficie | Decisión | Por qué |
|---|---|---|
| Entrada `/` | Dos puertas, barra transparente solo con la marca, costura vertical, una frase real por puerta, cortina de entrada (único momento orquestado) y la puerta no mirada se atenúa al pasar el cursor | Era un fondo con dos botones; ahora tiene jerarquía sin añadir menús ni secciones |
| Catálogo Parfums | Una sola familia de controles (búsqueda, Filtros, Orden en píldoras), filtros como grupos de chips en popover (escritorio) y hoja inferior (móvil), chips activos removibles, tres puertas de categoría que ocupan todo el ancho y se oscurecen entre sí | Antes: 6 `select` nativos arriba y tarjetas de 3 columnas a la izquierda con la mitad derecha vacía |
| Fotografía de producto | Placa cálida (Parfums) o plata (Import) con `mix-blend-mode: multiply`: los fondos blancos de estudio se disuelven; Import ya no recorta el frasco | Las fotos se veían como rectángulos blancos y, en Import, cortadas |
| Tarjetas | Sin elevación al pasar el cursor; solo línea fina y zoom lento. Etiqueta de tipo como marcador discreto | El “levantar tarjeta” es el tic genérico |
| Import | Insignia redondeada con filo plata para la marca (el PNG no es transparente), tarjetas con placa, disponibilidad como punto, ficha con foto completa | Era la superficie más simple |
| Combos | Controles del selector en la misma familia de píldoras; resumen con botones de tamaño corregidos (una regla `.summary li button` los deformaba) | Coherencia y un bug visual real |
| 404 / error | 404 con marca y dos salidas; nueva barrera de error (`error.tsx`) | Había un 404 de una línea y ninguna barrera de error propia |
| Compartir enlaces | Imagen social 1200×630 derivada de las dos imágenes de marca existentes (`public/og/cruzial-og.jpg`) | WhatsApp es el canal principal; Import y la raíz no tenían imagen |

No se añadió ninguna dependencia. Movimiento: solo CSS, respeta `prefers-reduced-motion`.

## 2. Herramientas de la lista

**Ya activas en este repo:** frontend-design, vercel-react-best-practices, web-design-guidelines (proyecto);
impeccable, taste-skill, ui-ux-pro-max, emil-* y find-docs (usuario); Playwright MCP 0.0.83 (`.mcp.json`,
requiere aprobación en `/mcp`); Context7 (conector); Playwright Test.

**Adoptar solo si una tarea concreta lo exige** (cada una con coste de peso/compatibilidad):
GSAP+ScrollTrigger (si se pide parallax real; hoy CSS basta), Motion (solo un sistema de animación, no mezclar con GSAP/Anime.js),
Three.js/WebGL (solo con un activo 3D real y presupuesto de peso), Swiper (los carruseles actuales ya son accesibles),
Lenis/scroll suave (riesgo de “scroll hijacking”).

**No instalar ahora:** shadcn/Tailwind (duplica el sistema de diseño), Firebase, n8n/Apify/Firecrawl
(datos y servicios externos sin caso de uso), routers de modelos (9Router, OmniRoute: pasan tráfico por terceros),
colecciones enteras de skills (cada una cuesta contexto).

**Sin verificar (no instalar sin revisar fuente, licencia y scripts):** Ponytail, Huashu design, Afaan Mustafa, Gentleman IA,
Ruflo, Engram, Graphify, Claude-mem, Context-mode, gstack/agency-agents. No pude confirmar hoy que existan con esos
nombres ni qué instalan; el criterio es el de la primera revisión (leer el repo, no ejecutar su instalador a ciegas).

**No son herramientas, son tareas** (ya cubiertas por el repo o por decisión del dueño): GA/Meta Pixel (no activar),
política de IA (la recomendación es determinista y la web lo dice; revisar si cambia), cláusulas legales (revisión legal peruana).

## 3. Ahorro de tokens en Claude Code

Fuentes: [Composio](https://composio.dev/content/ways-to-cut-token-consumption-in-claude-code),
[KDnuggets](https://kdnuggets.com/7-practical-ways-to-reduce-claude-code-token-usage).

1. `/clear` al empezar una tarea nueva; `/compact` solo si hace falta continuidad.
2. CLAUDE.md corto: hoy pesa **22 KB (~5,5 k tokens) en cada turno**. Mover lo situacional a skills (se cargan bajo demanda).
3. Buscar antes de leer (ya es regla del repo); lecturas por rango; no volcar logs.
4. Subagentes solo para exploración amplia y aislada; en trabajo acoplado cuestan más de lo que ahorran.
5. Modelo por dificultad: Opus para decidir y revisar, Sonnet para implementar, Haiku para tareas mecánicas; bajar `/effort` en tareas simples.
6. Pocos MCP activos: cada servidor añade definiciones de herramientas al contexto.
7. Capturas de pantalla con parsimonia (cada imagen cuesta); preferir comprobaciones por DOM y reservar la imagen para el criterio visual.
8. Un handoff breve al cerrar sesión (objetivo, qué se probó, qué falló, siguiente paso).

### Propuesta de separación de CLAUDE.md (no aplicada)

*Siempre* (≈ 120 líneas): rol, alcance, “evidencia > resúmenes”, política de Git (§8), producción por defecto denegada (§10),
migraciones append-only (§12), seguridad (§15), verdad de negocio (§16), bugs P0–P2 (§18), definición de hecho (§25).
*Situacional (a skills o a docs)*: secuenciación de release (§11), BD y entorno (§13–14), UI/SEO/monitoreo (§20–22),
interacción con revisores (§23), modo producto completo (§24), reporte y compactación (§26–27).
No se editó el contrato: cambiar sus reglas es decisión del dueño.

## 4. Lista de comprobación (Morphicons / seguridad / SEO) frente al código

Verificado hoy en el repo: 404 propio (mejorado) y barrera de error (nueva); títulos con plantilla por unidad; imagen social (nueva);
`robots.ts` y `sitemap.ts` (indexación cerrada hasta el lanzamiento); páginas de privacidad y términos por unidad;
cabeceras de seguridad con prueba E2E; RLS con pgTAP; antiabuso de pedidos (`order-abuse.ts`); migas y página de gracias;
CTA visible antes del scroll; barra fija móvil en combos; FAQ en Parfums e Import; JSON-LD en la ficha de Parfums.

Pendiente, no se inventa: reseñas reales, casos de estudio, foto de equipo (no existen fotos reales en el repo),
enlace “saltar al contenido” (cambia los `<main>` de varias plantillas: conviene hacerlo en una tarea propia),
datos legales del negocio (bloqueo externo ya registrado).

## 5. Qué sigue

1. Aprobar `playwright` en `/mcp` y revisar la rama visualmente en Preview.
2. Decidir si se aplica la separación de CLAUDE.md (§3).
3. Fotografía real (pedidos, empaque) y una portada real del video: es el mayor salto de calidad que queda y no se puede generar con código.
4. Segunda pasada de Import: carrito, checkout y páginas legales con el mismo acabado de placa y píldoras.
