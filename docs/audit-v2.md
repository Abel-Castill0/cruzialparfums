# Cruzial Platform V2 — Auditoría de Fase 0

Fecha: 2026-09-06
Baseline: `5fba38f` (`master`, igual a `origin/master`)
Tag local: `pre-v2-stable-2026-09-06`
Rama de trabajo: `codex/feature/cruzial-platform-v2`

## Resumen ejecutivo

La producción actual es un sitio estático multipágina estable. No hay framework,
compilación, TypeScript, API, base de datos, autenticación ni panel administrativo.
El catálogo, la configuración comercial y buena parte del comportamiento viven en
JavaScript global ejecutado en el navegador. La migración debe ser incremental y la
V2 debe desplegarse desde una raíz aislada hasta alcanzar paridad visual y funcional.

La base actual sí es reutilizable: identidad visual, composición editorial, catálogo
confirmado, fotografías, flujos de descubrimiento, carrito/checkout por WhatsApp y un
gate automatizado de regresión. No conviene trasladar el HTML repetido literalmente.

## Estado del repositorio

- Remoto: `https://github.com/Abel-Castill0/cruzialparfums.git`.
- Producción documentada: GitHub Pages bajo `/cruzialparfums/`.
- HEAD auditado: `5fba38f`.
- 254 archivos tracked en HEAD.
- 169 archivos untracked al iniciar la Fase 0: un PDF y fotografías PNG originales.
- Los archivos untracked pertenecen al cliente; no se movieron, borraron ni añadieron.
- El directorio `.agents/` y `skills-lock.json` están ignorados.
- No existe configuración de Vercel, Supabase, Next.js ni gestor de paquetes.
- Git almacena 188 archivos dentro de `img/perfumes`; el pack local pesa ~421 MiB.

## Stack actual

| Capa | Implementación actual | Consecuencia para V2 |
| --- | --- | --- |
| UI | 12 archivos HTML, CSS global y estilos inline | Extraer componentes; no copiar duplicación |
| Runtime | JavaScript vanilla con globals en `window` | Migrar por dominio y con tipos |
| Datos | `assets/data.js` | ETL versionado hacia Postgres; preservar IDs legacy |
| Carrito | `localStorage["cruzial_cart"]` | Mantener compatibilidad y separar Parfums/Import |
| Checkout | Formulario que construye URL de WhatsApp | Parametrizar por unidad; definir persistencia de pedido |
| Search/filtros | Filtrado completo en memoria | Suficiente hoy; consultas DB en catálogos grandes |
| Media | Archivos locales con rutas manuales | Migración controlada a Cloudinary, sin alterar originales |
| PWA | `manifest.json` + `sw.js` | Retirar/reemplazar con plan de invalidación de caché |
| Deploy | GitHub Pages | Mantener hasta que V2 supere todos los gates |
| Testing | `scripts/frontend-gate.mjs` | Conservar como contrato legacy y ampliar en V2 |

## Inventario de datos

Fuente canónica actual: `assets/data.js`.

- 99 productos totales: 96 activos y 3 descontinuados.
- Tipos: 69 `arab`, 23 `designer`, 4 `niche`, 3 `combo`.
- 26 marcas, 8 familias y 3 tamaños de decant (3/5/10 ml).
- 23 productos incluyen un objeto `bottle`.
- 96 productos tienen al menos una imagen asociada.
- No se detectaron IDs duplicados.
- Configuración global incluye un único WhatsApp, Instagram, ciudad, tamaños,
  atomizaciones, adelanto y resumen de delivery.
- Los combos tienen precio, pero el catálogo fuente no confirma todavía su contenido
  exacto; no debe inferirse una composición al migrarlos.

## Rutas y compatibilidad

| Ruta legacy | Función actual | Destino V2 propuesto |
| --- | --- | --- |
| `/` o `/index.html` | Home Parfums | `/` gateway; `/index.html` → `/parfums` |
| `/catalog.html` | Catálogo | `/parfums/catalogo` |
| `/product.html?id=:id` | Producto | `/parfums/productos/:slug` mediante lookup legacy |
| `/product.html?id=:id&variant=bottle` | Producto con frasco seleccionado | Destino anterior preservando `variant=bottle` |
| `/combos.html` + hashes | Sets y builder | `/parfums/combos` + mapa de anchors |
| `/checkout.html` | Checkout Parfums | `/parfums/carrito` o `/parfums/checkout`, por confirmar |
| `/mayorista.html` | Cotización mayorista | `/parfums/mayorista` |
| `/perfumes-enteros.html` | Redirect legacy | `308` a `/parfums/mayorista` |
| `/nosotros.html` | Marca/compra | `/parfums/nosotros` |
| `/contacto.html` | Contacto | `/parfums/contacto` |
| `/privacidad.html` | Legal Parfums | `/parfums/privacidad` |
| `/terminos.html` | Legal Parfums | `/parfums/terminos` |

Los redirects de producto necesitan conservar query strings y resolver el ID legacy.
No se debe marcar como permanente un destino hasta validar el mapa completo en Preview.

## Partes reutilizables

1. Tokens visuales de `assets/styles.css`: paleta, tipografías, espaciado, radios y
   curvas de movimiento. Deben normalizarse como tokens, no copiarse sin depuración.
2. Estructura visual y accesible de header, footer, cards, drawers, filtros y finder.
3. Datos confirmados y etiquetas de procedencia de `assets/data.js` y `CLAUDE.md`.
4. IDs actuales como `legacy_id` estable para redirects, importación y soporte.
5. Fotos originales y WebP actuales, manteniendo `object-fit: contain` donde aplica.
6. Lógica de carrito, combo builder y templates de WhatsApp como especificación de
   comportamiento, reimplementada con tipos y pruebas.
7. `scripts/frontend-gate.mjs` como gate de la producción legacy.
8. SEO, canonical, sitemap, PWA y reglas de caché como inventario de migración.

## Riesgos priorizados

### P0 — bloquear publicación V2

- **Precios de frasco sin confirmar:** 23 productos los publican, mientras README los
  declara referenciales. Deben clasificarse con el cliente antes de importar/publicar.
- **Reglas de Import no definidas:** pago, cancelación, lead time, devolución,
  disponibilidad, garantía y envío no pueden heredarse de Parfums.
- **Sin identidad de admin configurada:** el correo inicial no está en el repo y no debe
  hardcodearse. Se necesita bootstrap seguro y auditable.
- **Sin proyecto/entornos Supabase ni Vercel:** no impide el scaffold local, pero sí
  cualquier gate remoto, Preview integrado o migración real de datos.

### P1 — alto

- `assets/data.js` mezcla datos, presentación, imágenes y defaults comerciales.
- Un solo carrito `cruzial_cart` mezcla cualquier futura línea de negocio.
- No existe persistencia de pedidos ni snapshots; cambiar datos muta lo que el usuario ve.
- Header/footer/drawers están duplicados en HTML, con historial de divergencias.
- `sw.js` puede conservar rutas/assets legacy; el cambio de scope requiere estrategia.
- Canonicals y sitemap apuntan a GitHub Pages; no deben cambiar antes del cutover.
- Producto dinámico usa query string y actualiza metadata en cliente; la V2 debe renderizar
  metadata y JSON-LD en servidor sin romper enlaces compartidos.
- Catálogo grande de Import no debe cargarse entero en el cliente.
- El repositorio contiene muchos binarios y duplicados; Cloudinary requiere manifiesto,
  checksum y rollback, no una carga manual destructiva.

### P2 — medio

- Fuentes dependen de Google Fonts y no existe política explícita de self-hosting.
- TikTok usa una URL genérica sin cuenta confirmada.
- No hay CI, pruebas unitarias, E2E, auditoría de links ni visual regression.
- No hay analytics implementada; los eventos solo deben añadirse después del núcleo V1.
- La plantilla Next.js 16.3.4 fija ESLint 9.39.5, ya marcado como no soportado; ESLint 10
  aún contradice los peer ranges de plugins transitivos. Mantener el pin y revalidar al
  actualizar `eslint-config-next`, sin instalar con `--force`.

## Evidencia de baseline

- `node scripts/frontend-gate.mjs`: PASS en 12 páginas, header, footer, cards,
  assets, precache, ARIA y PWA.
- Navegador local: sin errores ni warnings de consola en la portada.
- Portada probada en 320, 390, 430, 768, 1024, 1440 y 1920 px: sin overflow horizontal.
- Dos imágenes del carrusel no tienen `src` al cargar porque usan carga diferida por
  slide; no son requests fallidas.

## Conclusión

Foundation puede comenzar dentro de `apps/web` sin mover la producción legacy. La
publicación sigue bloqueada hasta resolver los P0, pero esos P0 no bloquean un scaffold
local, los contratos de tipos, los gates ni los adapters de datos falsos/no comerciales.
