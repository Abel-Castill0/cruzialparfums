# Auditoría de herramientas, referencias y prácticas para Cruzial

Fecha de revisión: 2026-10-02  
Proyecto: `apps/web` de Cruzial Platform V2  
Responsable de implementación: Claude Code; Codex: arquitectura, investigación y revisión independiente.

## Conclusión ejecutiva

La lista mezcla instrucciones de texto, plugins de Claude, servidores MCP, automatizadores, librerías frontend, servicios de terceros, inspiración visual, herramientas de vídeo, ideas de marketing y recordatorios legales. No son intercambiables: instalar una habilidad no añade una librería al sitio; instalar una librería no le da a Claude acceso al navegador; un MCP puede permitir acciones externas; y una página de inspiración no es una dependencia.

La plataforma ya usa Next.js 16, React 19, TypeScript estricto, Supabase/PostgreSQL con RLS, Cloudinary, Vitest y Playwright. Tiene las rutas `sitemap.ts` y `robots.ts`, además de páginas de privacidad y términos separadas para Parfums e Import. La configuración revisada no muestra dependencias de GSAP, Motion, Anime.js, Three.js, Swiper, Firebase, Tailwind ni shadcn. En la búsqueda acotada de analytics/píxeles no encontré integración de Google Analytics/Tag Manager ni Meta Pixel. Es evidencia del código examinado, no de la configuración externa de Vercel, DNS, Google o Meta.

### Lo que recomiendo adoptar

1. **Mantener `CLAUDE.md` y `AGENTS.md` como autoridad del proyecto.** Las instrucciones de seguridad, alcance, verdad comercial y Git no se reemplazan con skills de terceros.
2. **Instalar solo dos skills de Vercel para el trabajo web:** `web-design-guidelines` y `vercel-react-best-practices`. La primera ayuda a revisar accesibilidad e interacción; la segunda aporta patrones de rendimiento para React/Next.
3. **Usar Microsoft Playwright MCP aislado para exploración manual con Claude.** Ya dejé su configuración de proyecto preparada y fijada en `@playwright/mcp@0.0.83`. Claude Code pedirá aprobar por primera vez el servidor del repo desde `/mcp`; Playwright Test sigue siendo el sistema de regresión de la aplicación. No añadir `agent-browser` a la vez: se solapan como controladores de navegador.
4. **Usar Context7 solo cuando se necesite consultar APIs actuales** de Next.js 16, Supabase, React o Cloudinary. Es útil porque las instrucciones locales recalcan que esta versión de Next tiene cambios y Claude debe revisar su documentación instalada.
5. **Para diseño, escoger una sola guía de criterio.** Primero probar `frontend-design` de Anthropic; opcionalmente sustituirla por Impeccable si el equipo quiere su flujo de crítica y pulido. No apilar Frontend Design, UI UX Pro Max, Taste, Top Design, Impeccable y otros a la vez.
6. **Para SEO, hacer auditorías de solo lectura** con la infraestructura existente y herramientas deterministas. No activar indexación ni aplicar correcciones en lote hasta satisfacer el corte factual/legal que ya establece el proyecto.

### No recomiendo instalar ahora

GSAP, Anime.js, Motion, Three.js, Swiper, shadcn, Firebase, n8n, Firecrawl, Apify, routers de modelos y grandes colecciones de plugins. Son opciones válidas solo si una tarea concreta demuestra que resuelven un problema actual. Varias duplican funciones del stack existente; otras introducen servicios, secretos, datos o coste operativo.

## Estado e instrucciones del repositorio

La autoridad operativa es [docs/current-v2.md](../current-v2.md). `CLAUDE.md` define 29 secciones y la jerarquía Codex/Claude. `apps/web/CLAUDE.md` importa las reglas de `AGENTS.md`. El archivo local de Next.js avisa que Next 16 difiere de versiones previas y pide consultar la guía instalada antes de editar. La raíz del proyecto es un monorepo, así que el package.json de la aplicación vive en `apps/web`.

### Reglas permanentes

Aplican a toda tarea que toque el proyecto:

- **Rol y evidencia:** Claude implementa y, cuando se autoriza, entrega; Codex diseña/revisa. El estado real del repo, CI, DB y runtime vence a resúmenes anteriores. `UNKNOWN` significa no inventar.
- **Alcance por defecto:** `apps/web`, `supabase`, `scripts` y `docs/current-v2.md`; el storefront legado de la raíz queda fuera si la petición no lo incluye.
- **Contexto:** buscar antes de leer, lecturas puntuales, una sola puerta completa al estabilizar, no releer gates cerrados sin evidencia de regresión, no volcar logs/diffs enormes ni enumerar recursos no relacionados.
- **Integridad de trabajo:** comprobar rama/estado antes de editar; stage explícito; no usar `git add -A`, `git clean`, `git reset --hard`, `git restore .` ni force push; conservar assets, secretos locales y trabajo ajeno.
- **Datos y seguridad:** nunca debilitar RLS, autorización, MFA, CSP, rate limits, firma de webhooks o límites de secretos; secretos solo en servidor; no exponer PII; migraciones aplicadas append-only.
- **Verdad comercial:** no inventar identidad legal, RUC, dirección, contacto, inventario, disponibilidad, producto, tamaño, concentración, campaña, reseña o métrica. La excepción documentada del dueño permite valores provisionales y editables de merchandising dentro de su alcance, con procedencia visible; no convierte valores supuestos en hechos del cliente.
- **Fallos:** reproducir y encontrar causa raíz. Corregir internamente los defectos P0/P1/P2 confirmados y añadir evidencia de regresión.
- **Cierre honesto:** no decir “100 %” solo por build/merge/deploy. Informar únicamente lo demostrado y conservar el estado de indexación conforme a la verdad del negocio.

### Reglas que se ejecutan cuando la tarea las activa

Estas reglas no son opcionales cuando aplican; simplemente no requieren trabajo en toda solicitud:

| Disparador | Trabajo exigido |
|---|---|
| Cambio de UI | Probar navegador en escritorio/móvil/tablet según el cambio, teclado/foco/accesibilidad, estados vacíos/cargando/error, consola y errores runtime. Las pruebas unitarias solas no acreditan el acabado visual. |
| Cambio de comportamiento | Tests dirigidos al flujo; después una sola puerta completa aplicable. El proyecto ya tiene `npm run check` y Playwright E2E. |
| Cambio de DB o Supabase | Consultar la skill Supabase, revisar auth/RLS/grants/scoping, mantener migraciones append-only y seguir respaldo/compatibilidad si hay release. |
| Push/merge/despliegue | Requiere autorización de release vigente en la tarea. Antes, comprobar base/HEAD exactos, checks, migraciones y rollback. No ampliar autorización a acciones destructivas ajenas. |
| SEO/publicación | Comprobar robots, sitemap, canonical, metadata, OpenGraph, schema, hechos comerciales, legales y media reales. No abrir indexación solo porque el build está verde. |
| Analítica/Pixel/cookies | Confirmar primero qué etiqueta se usa realmente, para qué datos/finalidad, terceros y consentimiento; no instalar trackers “por si acaso”. |
| Automatización a clientes | Verificar autorización del canal, consentimiento, textos/plantillas aprobados, idempotencia, frecuencia, baja y credenciales. Nunca probar enviando mensajes reales sin datos/autorización válidos. |
| Recursos externos o skills | Revisar fuente, licencia, scripts/hooks, permisos, datos enviados y compatibilidad antes de añadirlos. Instalar solo lo seleccionado, con scope de proyecto cuando sea posible. |
| Falta de credenciales/hechos externos | Terminar primero lo internamente posible y pedir una lista consolidada; jamás pedir que se pegue un secreto en el chat. |

**Los permisos no se deben convertir en acceso global irrestricto.** Claude Code permite omitir confirmaciones (`--dangerously-skip-permissions`), pero Anthropic lo documenta como opción de riesgo. El contrato actual ya autoriza continuar dentro del alcance expresamente aprobado; eso no da permiso para borrar datos, filtrar secretos o ejecutar una operación nueva y destructiva. Mantener el modo de permisos normal y aprobar de forma acotada evita que un prompt malicioso de una página, dependencia o archivo de datos se convierta en una acción del shell. La solución al exceso de preguntas es afinar el alcance/allowlist y las reglas de continuación, no desactivar todas las barreras.

## Herramientas recomendadas y cómo incorporarlas

### 1. Vercel Agent Skills: guía web + rendimiento React

**Para qué:** auditar patrones de interacción, foco, targets táctiles, formularios y accesibilidad; además revisar rendimiento React/Next. Encaja directamente con el stack. Son guías para Claude, no paquetes runtime de la web.

**Instalación desde la raíz del repo, solo para Claude Code:**

```powershell
npx skills add vercel-labs/agent-skills --skill web-design-guidelines --skill vercel-react-best-practices --agent claude-code
```

Revisar qué carpetas añade el instalador; mantenerlas locales al proyecto y no seleccionar todos los skills del repositorio. Si cambia la distribución del CLI, consultar su `--help` antes de repetirlo.

**Uso:** pedir que audite el diff final de una UI con `web-design-guidelines`, y que revise componentes React/Next modificados con `vercel-react-best-practices`. Aplicar sus hallazgos solo si respetan `AGENTS.md`, las prácticas reales de Next 16 instalado y la arquitectura de Cruzial.

### 2. Microsoft Playwright MCP: exploración de navegador

**Para qué:** dejar que Claude inspeccione e interactúe con una página en navegador, haga capturas y revise el comportamiento visible. Complementa la suite E2E existente; no la sustituye ni convierte una captura en prueba completa.

**Configuración de proyecto en Windows (compartida en `.mcp.json`):**

```powershell
claude mcp add playwright --scope project -- cmd /c npx -y @playwright/mcp@0.0.83 --isolated
```

La configuración ya está creada en `.mcp.json` y verificada con `claude mcp list`. **Queda pendiente una aprobación inicial dentro de Claude Code**: abrir Claude desde la raíz del proyecto, ejecutar `/mcp` y aprobar el servidor `playwright`. Anthropic requiere esta aprobación por seguridad para MCP de scope proyecto; no la he saltado. El modo `--isolated` descarta cookies/almacenamiento al cerrar la sesión. No conectar la sesión personal del navegador ni cargar estados autenticados salvo que el flujo de prueba lo requiera y haya autorización. `0.0.83` es la versión publicada que consulté al preparar la configuración; actualizar solo tras revisar la versión actual y validar el cambio.

**Uso:** iniciar la app local o usar el Preview correspondiente; inspeccionar rutas, tamaños y estados; detenerse antes de enviar pedidos, mensajes o escribir datos reales. Guardar resultados de QA solo cuando el cambio de UI/flujo los requiera.

### 3. Context7: documentación cambiante (opcional)

**Para qué:** pedir a Claude extractos de documentación vigente de bibliotecas concretas cuando implemente o depure APIs. Es conveniente con Next 16, Supabase y Cloudinary, pero no hace falta cargar documentación en cada pregunta.

**Instalación guiada:**

```powershell
npx ctx7 setup --claude
```

Elegir CLI/skill o MCP de acuerdo con el flujo ofrecido. El setup puede requerir inicio de sesión OAuth; el usuario tendría que autorizarlo en la página de cuenta si no se puede completar desde el escritorio. Uso natural: “consulta la documentación de Next.js 16 para esta API y compárala con la instalada”. Context7 ayuda a encontrar documentación, pero la guía local de Next.js y la versión del lockfile siguen mandando.

### 4. Skill de diseño: elegir una y probar

- **Anthropic `frontend-design`:** dirección visual, tipografía, paleta, composición y movimiento con criterio de producción. Fuente oficial. El repositorio publica un marketplace `anthropics/skills`, pero su plugin `example-skills` agrupa varias skills; si se busca solo Frontend Design, instalar/copiárselo de forma selectiva y revisar el destino del skill. No añadir el bundle entero solo por una habilidad.
- **Impeccable:** comandos de crítica/pulido (`/impeccable audit`, `critique`, `polish`, `adapt`, `optimize`) y detectores deterministas. Instalación normal documentada: `npx impeccable install`, luego en Claude Code `/impeccable init`. Sin embargo, la instalación integra hooks locales que se ejecutan después de editar; revisar el script y `.claude/settings.local.json` antes de habilitarlos. Es una alternativa completa a combinar muchas guías, no una obligación.
- **UI UX Pro Max:** catálogo amplio de estilos, paletas, fuentes y patrones; plugin marketplace: `/plugin marketplace add nicohodt/claude-code-ui-ux-skill` y `/plugin install ui-ux-pro-max@claude-code-ui-ux-skill`. Útil para idear variaciones, pero menos importante que probar la propia tienda con usuarios/tareas reales y ya existe una guía de diseño local.
- **Taste / Top Design:** guía de estética/experiencias de agencia; la usaría solo para un brief de marca o una landing de campaña. Puede empujar hacia efectos inmersivos que no ayudan al checkout.

**Decisión:** empezar con Frontend Design y Vercel guidelines. Si la revisión de usuario muestra que Claude todavía entrega UI genérica, hacer una prueba breve de Impeccable o UI UX Pro Max y conservar solo la que reduzca problemas observables.

## Catálogo completo de la lista, agrupado por función

Las filas con **sí** son directamente relevantes para el proyecto. **Condicional** significa que hay que justificar la tarea antes de introducirlo. **No ahora** es redundante, arriesgado, ajeno al stack o sin beneficio verificable para esta tienda. **No identificado** significa que el nombre escrito no permite reconocer con certeza un producto concreto; hace falta su URL exacta para evaluarlo.

### Diseño, referencias y librerías visuales

| Elemento | Qué es / posible uso | Decisión para Cruzial |
|---|---|---|
| MotionSites.ai / Motionsite.ai | Galería/mercado de prompts y referencias para sitios animados. Sirve para encontrar lenguaje visual y secuencias; sus prompts suelen asumir otro stack. | **Condicional:** tomar capturas/ideas, nunca pegar el prompt sin traducirlo a Next, CSS Modules, assets reales, accesibilidad y rendimiento. No copiar diseño literal. |
| Awwwards / Refero.design / Designvault.io | Galerías de inspiración y patrones de sitios/apps. | **Sí como inspiración**, no como especificación; revisar comercio, móvil, carga y accesibilidad del caso antes de imitar interacciones. |
| getdesign.md / Design.md generator / designmd.ai / designmd.app/library / awesome design.md | Generadores, catálogos o formatos de brief/sistema de diseño; algunos nombres se solapan. | **Condicional:** un `DESIGN.md` corto puede documentar tokens verificados. No generar un segundo sistema que contradiga paletas de marca ni meter la salida completa de un generador en `CLAUDE.md`. |
| Motionsites, Jitter.video | Referencia/creación de motion design y piezas visuales. | **Sí como referencia** para campañas o vídeo, no como dependencia de ejecución web. |
| Boneyard.vercel.app | Referencia visual para loaders/transiciones según la lista; no es parte del runtime de Cruzial. | **Condicional:** mirar ejemplos; evitar loader decorativo que retrase acceso a catálogo/checkout. Skeleton solo si los datos realmente tardan. |
| Samu-webart.com | Referencia propuesta para portafolio personal, no para la tienda de Cruzial. | **No en esta web comercial**; puede inspirar otro producto/portafolio. |
| Colors-visualizer.vercel.app / Brandbird.app / Shortcuts.design / 60fps.design | Apoyos para explorar color, visuales de marca, atajos o motion. | **Condicional/referencia**; validar paletas con decisiones del cliente y contraste real. No usar como paquete de producción. |
| itsHover.com / Morphicons | Colecciones de iconos o microanimaciones, pero la referencia “Morphicons” no especifica URL/producto. | **Condicional:** SVG/CSS propio o iconos con licencia clara. No animar iconos en todo control ni agregar dependencia por un detalle. Morphicons: **no identificado**. |
| Huachu design / Afaan Mustafa | Nombre/persona escrito sin enlace que identifique un skill o producto inequívoco. | **No identificado:** no instalar ni atribuir capacidades hasta recibir URL exacta. |
| Swiss / aurora UI / spatial UI / 3D flotante | Direcciones estéticas, no software. | **Condicional:** Swiss/editorial funciona como referencia tipográfica; auroras/3D no son dirección apropiada por defecto para perfumería/importación. Mantener contraste y foco en producto/compra. |
| Web typography / Refactoring UI / design-everyday-things / UX heuristics / microinteractions / scroll direction | Principios y contenido de diseño, no librerías. | **Sí como principios de decisión**; priorizar jerarquía, feedback, errores útiles y reducción de fricción. “scroll direction” requiere motivo UX, no ocultar navegación de forma impredecible. |
| Emil Kowalski / “Email kowalski” | Probablemente referencia al diseñador/ingeniero de motion Emil Kowalski; no se identificó un paquete llamado “Email Kowalski”. | **Sí como lectura/referencia** de interacción/motion; no instalar un paquete por esa frase. |

### Skills, instrucciones y flujos de Claude Code

| Elemento | Qué aporta / precaución | Decisión |
|---|---|---|
| Frontend Design (Anthropic) | Skill de diseño frontend, disponible en el ecosistema oficial de skills. | **Sí**, selectivo; no importar todas las skills de arte/marketing junto con él. |
| Vercel web design guidelines + Vercel React best practices | Auditoría de UI accesible y patrones/performance React. | **Sí**, recomendados arriba. |
| UI UX Pro Max / Impeccable / Taste skill / Top Design / Huachu design | Paquetes de criterio de UI; redundantes entre sí y con la guía local. | **Elegir máximo uno adicional**, no instalar el lote. Impeccable es más útil como crítica final; UI UX Pro Max para explorar estilos. Taste/Top Design para trabajo de marca/campaña. Huachu sin identificar. |
| Superpowers | Flujo con ideación, plan, subagentes y TDD. Puede imponer más pasos/equipos de los que requiere cada issue. | **No por defecto:** `CLAUDE.md` ya define disciplina, pruebas y cuándo delegar; probar solo si persiste una carencia concreta. |
| GSD / gstack / the-architect | Sistemas de orquestación, planificación, review, browse y handoff. Varios piden instalar hooks, reescribir reglas, actualizar automáticamente o cambiar el flujo de Git. | **No ahora:** riesgo de conflicto con el contrato de 29 secciones y reglas de releases. Especialmente no activar scripts de auto-commit/merge/deploy. |
| Skills for Real Engineers (`mattpocock/skills`) | Skills modulares (grill, bug diagnosis, TDD, handoff y otras). Licencia/procedencia deben verificarse en repo oficial; la configuración puede preguntar tracker/rutas. | **Condicional:** si se eligen, instalar solo `diagnose`/`handoff` o una habilidad requerida; no ejecutar setup que invente GitHub/Linear ni cambie reglas del proyecto. Handoff debe actualizar checkpoint, no duplicarlo. |
| Claude-mem | Captura herramientas/observaciones de sesiones y reinyecta contexto; otra implementación usa hooks y base local. | **No ahora:** recopilar datos completos de sesiones puede registrar rutas, fragmentos y contexto sensible; el repo ya tiene handoff/checkpoint y política de compactación. Revisar privacidad/licencia/retención si luego se evalúa. |
| Skill Creator / MCP Builder | Material para escribir nuevas skills o servidores MCP. | **Condicional:** solo si hay un procedimiento repetido que no resuelve `CLAUDE.md`; no crear un skill que replique las 29 reglas. |
| Claude Web Kit / web-artifacts / canvas-design / algorithmic-art / theme-factory / design-html / Slack GIF | Skills de prototipos, arte/documentos/web-artifacts o contenido, no mejoras runtime de Next por sí solos. “Claude Web Kit” puede referirse a más de un repo. | **No ahora** para tienda; canvas/arte solo para material gráfico puntual con licencia y aprobación. Slack GIF irrelevante sin tarea de Slack. |
| MCP Builder | Skill para construir herramientas MCP, no herramienta de búsqueda por sí sola. | **No necesario**: no hay una necesidad de crear un servidor personalizado actualmente. |
| Fine skills / “skills para ingenieros reales” | Probablemente Matt Pocock, pero “fine skills” no es nombre oficial inequívoco. | Evaluar el repo oficial `mattpocock/skills`; instalación selectiva, como fila anterior. |
| claude-skills-marketplace / marketing skills / finance, legal, ops packs | Marketplaces o conjuntos de prompts. Las skills no sustituyen una revisión profesional ni autorizan publicar cambios. | **No instalar todos.** Seleccionar una auditoría SEO/CRO puntual y revisar licencia, hooks, scripts, proveedor y telemetría antes. Finanzas/modelos DCF, 3-statement, comps, pitch decks y Excel no aplican a esta tarea. Skills legal-financieras solo como apoyo interno con abogado/contador. |
| `CLAUDE.md`, `AGENTS.md`, PRD, TRD, flujos, brief UX, esquema backend, plan de implantación | Instrucciones y artefactos de proyecto. | **Mantener actuales y concisos.** En una iniciativa amplia, brief/aceptación + flujo y plan de implementación; no duplicar arquitectura ya reflejada en código/checkpoint. Los esquemas de DB pertenecen a migraciones/docs existentes y requieren evidencia. |
| Handoff/resumen de sesión | Lista de objetivo, decisiones, pruebas, fallos y siguiente paso. | **Sí:** usar checkpoint canónico y una sola nota compacta con branch/HEAD, cambios, pruebas, pendientes y bloqueadores. No crear handoff por cada tarea pequeña. |

### Claude, prompts y comandos

`/plan`, `/model`, `/compact`, `/ultrathink`, `/ultrathinking`, `/goal`, `/agents`, `/verify`, `/review`, `/security-review`, `/critic`, `/expand`, `/firstprinciples`, `/stepbystep`, `/simplify`, `/ghost`, `/ooda`, `/alt3`, `/l99`, `/ultrareview`, `/ultraplan`, `/polish`, `/rewind` y similares **no son todos comandos nativos universales**. Algunos son funciones de Claude Code, otros vienen de plugins, otros son un modo de redactar el pedido o nombres inventados/mal escritos. Confirmar con `/help`, docs oficiales o plugin instalado antes de depender de ellos. `/rewind` y recuperación de cambios no reemplaza Git.

**Selección de modelo:** no asumir que “Opus = plan, Sonnet = normal, Haiku = rápido” aplica a todo plan y fecha. Elegir por complejidad y disponibilidad del plan: Haiku para búsqueda/triage acotado, Sonnet para la mayoría de implementación, Opus para decisiones de arquitectura, debugging difícil o revisión crítica; usar nivel de esfuerzo moderado salvo tarea compleja. Seleccionar modelos por `/model` según la versión/documentación actuales; no meter modelos/versiones fijas en instrucciones permanentes.

**Tokens:** `compact`/compactación, buscar fragmentos, salida resumida, evitar prompt packs duplicados y no releer gates cerrados sí ayudan. “Ultrathink”, OODA o `/firstprinciples` no garantizan verdad ni sustituyen evidencia; no mantener razonamiento máximo en tareas rutinarias.

### Navegador, búsqueda e investigación

| Elemento | Uso | Decisión |
|---|---|---|
| Web search MCP | Búsqueda citada en web. | Ya hay acceso a búsqueda en esta sesión; no añadir MCP duplicado salvo un flujo de Claude que lo necesite. Para investigación, usar documentos oficiales/primarios en cambios técnicos. |
| Microsoft Playwright MCP | Navegación/interacción humana guiada por agente, en navegador aislado. | **Sí**, configuración explicada arriba. |
| Playwright / Playwright CLI | Suite E2E automatizable existente; CLI alternativo para acciones interactivas/asistidas. | **Sí Playwright Test existente**; CLI solo si una necesidad concreta mejora QA. No reescribir E2E existentes. |
| `agent-browser` | CLI Rust para Chrome, snapshots, interacción y skills especializados; alternativa al MCP. | **No junto con Playwright MCP**; si se elige, instalar con `npm install -g agent-browser` y `agent-browser install`, mantener versiones y sesiones aisladas. Duplicaría navegación y añade binario/navegador. |
| Context7 | Documentación actual de dependencias. | **Opcional**, útil para APIs cambiantes; no un reemplazo de docs locales/versiones fijadas. |
| Firecrawl | Scrape/search con servicio MCP remoto o npm/API key. | **No ahora:** browser/search existente sirve para revisar inspiración; añade proveedor, cuotas y credenciales. Condicional para investigación repetible de muchos competidores, respetando robots/ToS. |
| Apify | Plataforma/mercado de actores para scraping y automatización de sitios. | **No ahora:** no se necesita recolectar datos a escala; cuidado con términos, datos personales y tarifas de actores. |
| Scrapling | Librería de scraping web, no una dependencia web para Next. | **No ahora:** sin caso de scraping backend autorizado. |
| n8n / n8n MCP | Automatización externa de workflows; el MCP puede configurar/ejecutar flujos en instancia conectada. | **No instalado en el stack.** Evaluar si se aprueban automatizaciones de bienvenida/carrito/postcompra; controlar consentimiento, duplicados, secretos, logs y consecuencias de ejecutar flujos reales. MCP debe tener permisos mínimos y no apuntar a producción durante pruebas. |
| RPA web/escritorio / Excel / cruces proveedores | Procesos operativos externos. | **Condicional:** solo con archivo/dataset, propósito, derechos y flujo concreto. No está en el alcance base de la tienda pública. |

### Frontend, animación, 3D y componentes

| Elemento | Qué hace / decisión técnica |
|---|---|
| Anime.js | Timeline, drag, scroll/interacción; `npm install animejs`. Con React usar `createScope` y limpiar en unmount. **No ahora:** redundante con CSS, `IntersectionObserver` y otras librerías. |
| GSAP + ScrollTrigger + Draggable | Secuencias complejas, scroll scrub/pin y arrastre; `npm install gsap`, importar y registrar plugins; en React usar hook y cleanup correctos. **Condicional:** solo si hay una escena de campaña imposible de mantener en CSS. No animar layout caro ni bloquear scroll. |
| Motion/Framer Motion | Motion for React actual se instala `npm install motion`; import desde `motion/react` o `motion/react-client` para RSC. Útil para layout/transiciones/gestos de React. **Posible preferencia React** si se construye una interacción; no instalar junto con GSAP/Anime sin arquitectura específica. |
| CSS animations | Ya disponible y apropiado para hover/reveal sencillos. | **Primera opción**: limitar a transform/opacity, cumplir `prefers-reduced-motion`, no animar cada sección por defecto. |
| WebGL / Three.js / `.glb` | WebGL es la API de gráficos; Three.js es motor 3D; `.glb` es formato binario glTF que puede cargarse con `GLTFLoader`. | **No ahora** para catálogo/carrito. Evaluar únicamente para una pieza hero de campaña con modelo/licencia real, fallback estático y presupuesto de peso/GPU/móvil. |
| Swiper.js | Carruseles React/swipe y módulos de navegación/paginación. `npm install swiper`. | **No ahora:** conservar el carrusel actual salvo bugs/teclado/touch medidos; si falla, comparar una integración accesible antes de reemplazar. |
| shadcn/ui | CLI copia componentes al repositorio, no es un sistema remoto. El `init` configura tokens/Tailwind y utilidades. | **No inicializar:** el app usa CSS Modules y no está configurada con Tailwind/shadcn; iniciar puede reconfigurar base visual. Importar un solo patrón manual solo con beneficio claro y revisar dependencias. |
| React Bits / Cult UI / 21st.dev | Registros/ejemplos/snippets de componentes. | **Inspiración selectiva**, comprobar código, licencia, accesibilidad, dependencias y responsive antes de copiar; no añadir registries enteros. |
| headroom | Patrón/lib para ocultar header al desplazarse. | El sitio ya tiene comportamiento de header; validar saltos, foco, volver arriba y el primer hero. No instalar otra librería por sí solo. |
| Tailwind animations | Utilidades/plugins alrededor de Tailwind. | **No ahora:** no usa Tailwind. Evitar incorporar Tailwind solo para una animación. |
| ponytail / sleepymotion | “ponytail” es un plugin/repositorio de preferencias del agente, no animación web; “sleepymotion” no pude identificarlo de forma confiable. | ponytail: **no necesario**; sleepymotion: **no identificado**, solicitar URL antes de evaluar. |
| Superpowers / gstack / Claude skills marketplace / `npx skills` / fine skills / GSD / skill creator / “skills for real engineers” | Colecciones, instaladores o flujos para crear/ejecutar skills. `npx skills` es un instalador de ecosistema, no una skill única; gstack y Superpowers son flujos/agentes con instrucciones y comandos propios. | **No instalar colecciones completas.** Elegir skills por tarea, revisar origen, versión, licencia, scripts y alcance. La guía de Claude Code del repo ya define el flujo; `skill creator` solo si luego se necesita mantener una skill propia. “Fine skills” y “skills for real engineers” necesitan URL para identificar el repositorio exacto. |
| The Agency / `agency-agents` | Probablemente `msitarzewski/agency-agents`, colección de agentes con perfiles de especialidad e integración para Claude Code. | **No ahora.** Claude ya implementa y Codex revisa; copiar decenas de roles aumenta instrucciones y posibles conflictos sin resolver una carencia concreta. Si se prueba después, usar un agente puntual y leer primero sus instrucciones y permisos. |
| Gentleman AI / `gentle-ai` | Probablemente el proyecto Gentleman Programming `gentle-ai`, un instalador/conjunto de agentes, hooks, memoria Engram y prácticas; el nombre escrito no permite confirmarlo al 100 %. | **No instalar el preset completo.** Puede cambiar configuración y añadir hooks/integraciones. El repo documenta telemetría asíncrona bajo su política de telemetría; revisarla antes de instalar. No hace falta para el flujo actual. |
| Engram / Graphify | Engram probablemente alude a la memoria/gestión de sesiones de Gentleman Programming o a proyectos de memoria con nombre similar; Graphify se refiere a más de un producto de indexación/grafo. | **No integrar por ahora.** `CLAUDE.md` y `docs/current-v2.md` son las fuentes explícitas de reglas y estado; otra memoria podría quedar obsoleta o mezclar contextos. Si se trata de Engram de Gentleman Programming, revisar requisitos adicionales (incluido `jq` para su plugin completo en Windows) y coste de contexto. Graphify necesita URL exacta. |
| Context Mode | Probablemente `mksglu/context-mode`, un servidor MCP local que intercepta/condensa salidas y usa búsqueda local; su repositorio declara licencia Elastic License 2.0. | **No instalar por ahora.** Añade comportamiento automático vía hooks y almacenamiento local que habría que auditar; la política local ya prioriza búsquedas y lecturas dirigidas. Evaluar licencia/versión actual antes de cualquier uso comercial. |
| Chrome Live Tabs / Chrome DevTools MCP / “browser tabs” | Integración de navegador que puede exponer pestañas y sesión del perfil real, según el producto al que se refiere la nota. | **Preferir Playwright MCP aislado** para QA. No conectar el perfil personal ni cookies de cliente. Si se quiere el producto exacto, hace falta su URL porque “live tabs” describe más de una integración. |
| MCP Builder / Context7 / Web search MCP / Firecrawl / Apify / Perplexity | MCP Builder crea conectores; Context7 trae documentación de librerías; búsqueda responde consultas; Firecrawl/Apify extraen páginas/datos; Perplexity es un servicio de búsqueda/respuestas. | **Context7 opcional** para documentación técnica cambiante. La búsqueda web ya cubre investigación puntual; no instalar Firecrawl/Apify ni otro buscador hasta que exista una extracción repetible y autorizada. Para un MCP, revisar servidor, permisos, datos salientes y credenciales. |
| “Webapp testing” / AccessLint / `playwright-mcp` / Playwright CLI | Referencias a pruebas de UI automatizadas, accesibilidad o control del navegador; hay varias herramientas llamadas webapp testing. | **Usar Playwright Test existente y el MCP aislado configurado** para acciones asistidas. AccessLint y “webapp testing” necesitan URL exacta para identificar proveedor; no duplicar suites sin caso de uso. |
| Huachu Design / Afaan Mustafa / SleepyMotion / voice-jcb / Morphicons / “Gees” / Glyph o Glib / Claude Web Kit | Nombres incompletos, posibles typos, creadores, recursos visuales o productos con múltiples resultados. | **No identificados con certeza; no instalar ni atribuirles capacidades.** La nota original no incluye URL/repositorio exacto. Pedir el enlace únicamente si uno de ellos se vuelve candidato para un trabajo concreto. |
| `itsfree.dev` / `getdesign.md` / `designmd.ai` / `designmd.app/library` / `designvault.io` / `Refero.design` / `colors-visualizer` / `60fps.design` / `shortcuts.design` / `cult-ui.com` | Directorios, galerías o sitios de referencia para ideas, tokens, colores, animaciones o componentes. | **Usar como referencias visuales**, no como dependencias ni autoridad de marca. Contrastar cualquier propuesta con `docs/client-decisions.md`, accesibilidad y assets reales; no copiar componentes sin revisar licencia y comportamiento. |
| `motionsites.ai` / Awwwards / Boneyard / Samu Webart / Jitter / `samu-webart.com` | Galerías, inspiración de sitios, motion o referencias de portafolio/loader. | **Inspiración, no especificación.** Extraer principios concretos (ritmo, composición, jerarquía) y adaptarlos; evitar scroll hijacking, pantallas de carga largas o efectos que dañen catálogo, accesibilidad y móvil. Samu Webart se relaciona con el portafolio personal citado, no con una necesidad de la tienda. |
| `masumi.network` / `finderlead.pro` / `tododeia.com/community` / `context.dev` / `refero.design` | Sitios/servicios de comunidad, búsqueda de referencias o herramientas, pero el objetivo exacto de varias menciones no queda claro solo por el nombre. | **No integrar** en la tienda. Tratar como fuente de consulta si la tarea lo requiere; para automatización, scraping o uso de datos, revisar términos y permisos. “Context.dev” no asumir que es Context7. |
| `img2threejs` / GLB / WebGL / Three.js / “Gees” | Conversión/modelado 3D y renderizado de escenas en navegador; GLB es un formato de asset 3D. “Gees” podría referirse a otra librería, no identificable. | **No para el selector de inicio ni el catálogo actual.** El coste de peso, GPU, batería, accesibilidad y producción supera el beneficio sin un asset 3D real aprobado. Considerar solo una campaña 3D con presupuesto, fallback estático, carga diferida y prueba en móviles modestos. |
| NVIDIA Build / NIM / “Google Claude Platform” / Google OAuth2 | NVIDIA NIM es infraestructura/APIs para ejecutar modelos; Google OAuth permite delegar acceso a APIs; “Google Claude Platform” no es un nombre inequívoco de producto. | **No son librerías UI ni requisitos de Claude Code.** Evaluar NVIDIA solo si se aprueba una función de IA con modelo/coste/datos concretos; OAuth solo para una integración Google real con scopes mínimos. La mención a Google/Claude requiere enlace exacto. |
| `design-html` / canvas-design / Excalidraw diagram / design.md generator / `awesome-design.md` / brandbird | Prompts, skills, formatos o utilidades para generar artefactos visuales, documentación de diseño, diagramas o imágenes sociales. | **Condicional** para un entregable que realmente lo necesite. No convertir cada herramienta en dependencia de runtime; confirmar fuente/licencia exacta para `design-html`, `design.md generator` y `awesome-design.md`. |
| Microinteractions / Web Typography / UX heuristics / design everyday things / Swiss / Aurora UI / spatial UI | Principios o estilos de diseño, no paquetes necesarios por sí solos. | **Aplicar como criterios de diseño**, no como “instalaciones”: jerarquía tipográfica, feedback comprensible, movimiento sobrio y contraste legible. Los gradientes/3D se justifican por la marca y el contenido, no por tendencia. |
| `/plan`, `/compact`, `/clear`, `/rewind`, `/model opus plan`, `/ultrathinking`, `/ultrareview`, `/ultraplan`, `/goal`, `/agents`, `/critic`, `/expand`, `/firstprinciples`, `/stepbystep`, `/simplify`, `/ghost`, `/verify`, `/security-review`, `/code-review`, `/ship`, OODA, ALT3, L99 | Comandos del cliente, plugins o convenciones de prompting; algunos son específicos de Claude/Codex u otros repositorios y no son comandos universales. | **No copiar la lista como si todos existieran.** Usar solo comandos confirmados en la instalación actual y en el directorio del proyecto. `CLAUDE.md` ya define planificación/validación; no subir modelo/effort a Opus por defecto. `--dangerously-skip-permissions` o equivalentes no son una forma segura de eliminar aprobaciones. |
| “Afaan Mustafa”, “Top-design”, “fine skills”, “L99”, “ALT3”, “Voice-JCB”, “The Architect”, “Glyph/Glib” | Nombres que pueden señalar creadores, prompts/repositorios o proyectos distintos; falta identificador inequívoco. | **Sin recomendación de instalación hasta recibir URL exacta.** Si se aporta, revisar autoría, actividad, licencia, instrucciones, scripts y permisos antes de confiarlo al agente. |

### Imágenes, vídeo y marca

| Elemento | Para qué | Decisión |
|---|---|---|
| Cloudinary | Gestión/transformación/entrega de imagen y vídeo. Ya existe integración. | **Sí, mantener**; transformaciones responsive `f_auto/q_auto`; secretos solo servidor. Upload admin con autorización y firma; nunca preset público de escritura para clientes sin revisión de abuso. |
| Higgsfield / Google Flow / Veo / ImageGen / GPT Image / image-enhancer | Generar o retocar imagen/vídeo. | **Solo medios de campaña autorizados**; no representar falsamente un perfume/producto o empaques/pedidos reales. Revisar derechos, etiquetado si corresponde, licencias y coste. Claude Code no recibe acceso automático a cuentas externas. |
| Remotion / Hyperframes | Crear vídeo de forma programática con React o flujos HTML-vídeo. | **Condicional** para anuncios/posts, no para renderizar la tienda. |
| Brand guidelines / brand-kit / content studio | Documentar identidad y generar contenido. | **Condicional**; usar decisiones del cliente existentes, no reemplazarlas con colores o claims inventados. |
| Instagram/TikTok embeds | Prueba social/contenido social. | **Condicional:** confirmar permiso/URL, disponibilidad del embed, privacidad/CSP y rendimiento; ofrecer enlace/fallback. No bloquear LCP con widgets de terceros. |
| foto de equipo, reseñas, fotos de pedidos | Ideas de contenido. | Usar solo media y testimonios reales con autorización; no inventar compradores, armado o reseñas. |

### Marketing, SEO, CRO y datos de medición

| Elemento | Uso y encaje |
|---|---|
| Claude SEO / `claude-seo-ai` | Skill community MIT para auditoría técnica/AI-search y posibles fixes opt-in. Tiene subagentes/scripts/hooks. | **Condicional, solo auditoría read-only**; revisar scripts/hook antes de instalar. No aplicar `fix`, cambiar robots/indexing ni publicar schema hasta validar contenido y gate. |
| SEO-audit / programmatic SEO / AI SEO / Search Console | Auditoría, páginas de búsqueda o conexión a métricas reales. | **SEO audit y Search Console condicionales** cuando haya property/verificación y permiso. Programmatic SEO no se justifica con catálogo cambiante o datos no confirmados. No crear páginas masivas/llms.txt por moda. |
| page-CRO / signup-flow-CRO / form-CRO / popup-CRO / onboarding-CRO | Heurísticas de conversión. | **Sí como checklist acotado** para catálogo/búsqueda/carrito/checkout. Signup/onboarding/popup no son centrales para una compra guest; no introducir dark patterns. A/B test solo con volumen y consentimiento/analytics listos. |
| improve-retention / hooked-UX / lean UX / ab-test-setup | Teoría/experimentación de producto. | **Condicional**; diseñar experimentos con hipótesis/métrica y mínimos de privacidad; no implantar mecanismos adictivos. |
| copywriting / copy-editing / StoryBrand / made-to-stick / voice / humanise-text / social-content / content strategy | Escritura y mensaje. | **Condicional** para contenido encargado; toda promesa, origen, precio/stock, envío y afirmación de marca exige hecho aprobado. “voice-jcb” no se identificó con precisión. |
| Google Analytics / Meta Pixel | Medición/remarketing; no encontré sus scripts en el código revisado. | **No agregar hasta decisión del dueño y legal/consentimientos.** Si se usan, revelar proveedor, finalidad/categorías/datos y comunicar preferencias a tags; verificar comportamiento de rechazo. Política no equivale a consentimiento. |
| Sitemap, robots, metadata, OG, favicon, 404, breadcrumbs, CTA móvil, FAQ, alt, schema local, página gracias, reviews, mapas | Checklist SEO/UX del texto. Sitemap/robots existen. | **Sí según pertinencia y verdad.** Verificar metadata/OpenGraph en cada unidad; 404 y estados, CTA móvil solo si ayuda; breadcrumbs donde jerarquía existe; FAQ/schema solo con contenido visible y correcto; no crear reviews/mapa/tiempos/equipo falsos. |

### Automatización, servicios y plataformas no adoptadas

| Elemento | Decisión |
|---|---|
| Firebase | DB/Auth/storage alternative; duplica Supabase, que ya es infraestructura estable y segregada. **No migrar ni añadir**. |
| Polar.sh | Cobro/merchant-of-record orientado a productos/planes digitales, no una necesidad confirmada de pagos para perfume/importación. **No ahora**. No cambiar checkout/procesador por recomendación suelta. |
| Google OAuth2 | Protocolo para permitir acceso delegado a Google APIs; no es un login que deba añadirse porque sí. **Condicional** solo si se conecta Search Console/Analytics/API; scopes mínimos, consent y secretos seguros. App usa Supabase Auth. |
| Google Search Console | Servicio de medición/indexación de Search; **útil después** de verificar propiedad y cuando el dueño quiera trabajar visibilidad. No implica quitar `noindex`/robots automáticamente. |
| Omniroute / 9Router | Gateways locales/de terceros para múltiples proveedores y compresión/fallback de modelos. **No instalar** en Claude Code del proyecto: pueden cambiar proveedor, autenticación, privacidad, logging y garantía de modelo; ahorros anunciados son claims del proveedor y deben medirse. |
| NVIDIA Build / NVIDIA NIM | Portal para ejecutar/probar modelos (NIM APIs/blueprints), no librería frontend ni paso de build de Next.js. | **No relevante ahora**, salvo que se aprobase una función de IA y modelo/infra tras evaluar datos y coste. |
| Google Antigravity | Herramienta/entorno de desarrollo con agentes, no framework requerido por la web. | **No ahora**: Claude Code ya es el implementador principal. |
| React Native skills | Orientados a apps móviles nativas/Expo. | **No aplica** a Next.js web responsive. |
| AccessLint | No se pudo verificar de forma inequívoca qué producto/paquete es por el nombre; posible typo/nombre genérico. | **No identificado**; se cubren controles con axe + Playwright y tests existentes. |
| Tododeia/community / Apify / OAuth Google-Cloud / WhatsApp AgentKit | Comunidad, scraping, auth de API o agentes/canales; “WhatsApp AgentKit” no está identificado exactamente. | Apify y automatización son **condicionales**; comunidad solo aprendizaje; OAuth se evalúa con API real; WhatsApp requiere plataforma/canal y plantillas autorizadas, no un paquete supuesto. |
| Legal packs: contract-review, NDA, legal-risk, compliance, SQL-queries | Skills de apoyo para leer/documentar. | **No sustituyen abogada/o peruano, contador ni evidencia de negocio.** No usar para generar cláusulas finales automáticamente. SQL-query skill no reemplaza las reglas Supabase del repo. |

### Ideas de operación que sí tienen sentido como fases

- **Primero medir UX sin trackers:** eventos mínimos propios/anónimos solo si se aprueba, pruebas con sesiones moderadas y errores de checkout sin datos sensibles.
- **Luego Search Console:** conectar property verificada; revisar estado de indexación sin quitar las barreras públicas prematuramente.
- **Después automatizaciones:** bienvenida, carrito y postcompra solo tras concretar consentimientos, regla de expiración, proveedor y canal, plantilla de mensajes, opt-out, reintentos idempotentes y entorno de prueba.
- **Subidas:** la implementación observada concentra gestión de medios en Admin; no asumir que la tienda admite UGC público. La función de subir no transfiere automáticamente toda responsabilidad legal al usuario.

## Aspectos legales que deben tratarse correctamente

Esto es investigación técnica orientativa, no asesoría legal peruana ni texto listo para publicar. Revisar con abogado/a local que conozca consumo, datos y propiedad intelectual antes de cambiar términos o activar rastreadores.

### Datos personales, cookies, Google Analytics y Meta Pixel

La Ley peruana 29733 y el Reglamento DS 016-2024-JUS están vigentes. Los principios de finalidad, transparencia y consentimiento hacen que una política publicada por sí sola no sea sustituto del consentimiento válido cuando este es necesario. La información debe describir el tratamiento real: quién es titular/banco de datos, qué se recopila, finalidad, destinatarios/encargados, transferencias, conservación, derechos y canal para ejercerlos. Confirmar detalles y deberes con la ANPD/abogado según las categorías concretas de datos.

Si se añade GA4, Google exige aviso apropiado sobre qué datos/funciones se usan y obtener consentimiento u ofrecer posibilidad de rechazo conforme a su política; Consent Mode transmite el estado elegido pero no crea por sí mismo una solución de consentimiento. Un banner debe tener opciones reales y bloquear/ajustar tags según la opción. Para Meta Pixel aplica la misma disciplina: documentar su funcionamiento real y respetar las obligaciones locales aplicables. No afirmar que se usa “IA” en la tienda porque Claude asistió al desarrollo; declarar IA al usuario si un servicio visible realmente procesa sus datos o genera contenido/decisiones, explicando propósito e impacto con lenguaje adecuado.

### Arbitraje de consumo

Indecopi describe el arbitraje de consumo como voluntario y sujeto a adhesión o convenio arbitral. No insertar una renuncia general ni una cláusula obligatoria copiada de otro país. La validez, forma de aceptación y relación con otros reclamos de consumidores requieren asesoría local; aceptar términos no borra competencias/obligaciones legales.

### Contenido protegido/subidas y retirar contenido

El Decreto Legislativo 1724 (publicado en El Peruano el 2026-02-07) modificó el Decreto Legislativo 822 e introdujo supuestos de limitación de responsabilidad y un proceso de notificación/contra-notificación para ciertos proveedores de servicios digitales. La aplicación depende del rol y categorías precisas de servicio, condiciones legales y cumplimiento de pasos/plazos; no basta con poner una línea en Términos que transfiera “todo el riesgo” a quien sube archivos. En un flujo UGC público podría hacer falta designar públicamente un agente/contacto, canal accesible de reclamos, proceso de retirar/inhabilitar acceso, notificar al usuario y gestionar contra-notificación, además de atender órdenes y derechos de datos.

En este proyecto, lo encontrado apunta a que el manejo de imágenes corresponde a Admin y Cloudinary. Antes de habilitar cargas públicas: modelar quién puede subir, validación real de MIME/tamaño, firma, límites/rate limits, revisión de abuso, derechos de uso, reportes/takedown, retención y seguridad; evaluar asesoría legal y el encaje del servicio. No afirmar que el uploader asume de manera absoluta responsabilidad exclusiva.

## Riesgos y soluciones para el listado de bugs/UX

Las ideas enlistadas (“responsive”, carga, errores, teclado, formularios, navegación móvil, estados, CTA, botones, dark mode) son una **lista de comprobación**, no hallazgos confirmados de bugs en la versión actual. Claude debe reproducir en UI/browser y relacionar cada hallazgo con ruta, tamaño, pasos, resultado esperado/actual, severidad y evidencia. Corregir defectos internos P0–P2; no convertir ideas estéticas o heurísticas en bugs sin caso reproducible.

Mantener objetivos de rendimiento y accesibilidad: evitar scroll hijacking y loaders que oculten contenido; preferir CSS y `IntersectionObserver` para reveals básicos; movimiento discreto con `prefers-reduced-motion`; imagen responsive/optimizada con Cloudinary; LCP visible prioritario; carruseles operables por teclado, touch y lector; controles con foco visible/target táctil; inputs ≥16px en móvil; etiquetas y errores accionables; no bloquear la compra por vídeo o pixel tercero.

## Prompt mejorado para Claude Code

Pegar el texto siguiente en Claude Code Desktop abierto en el repositorio. El objetivo del prompt es investigación y preparación segura de herramientas; la implementación de funcionalidades se define por tareas concretas posteriores. Las instrucciones existentes del repo tienen precedencia sobre skills de terceros.

> Trabaja como ingeniero principal de Cruzial V2. Codex investigó las opciones; tú eres el implementador principal y debes verificar el estado actual del repositorio antes de actuar. Lee `CLAUDE.md`, `AGENTS.md`, `apps/web/CLAUDE.md`, `apps/web/AGENTS.md` y el bloque vigente de `docs/current-v2.md` con lecturas dirigidas. No leas completo `docs/progress-v2.md`. Conserva los archivos y assets locales no relacionados.
>
> **Objetivo:** preparar un conjunto pequeño de herramientas compatibles que ayude a construir y revisar el ecommerce Cruzial (Parfums e Import), sin cambiar el sistema de diseño, dependencias runtime, permisos, datos o despliegue por moda.
>
> **Inspección antes de instalar:** verifica rama/HEAD/estado; confirma versiones de Node/Claude, package manager/lockfile, skills y MCP ya instalados, scripts y CI. Revisa la fuente, licencia, contenido, scripts, hooks, telemetría, credenciales requeridas y archivos que instalaría cada candidato. No repitas nada existente.
>
> **Candidatos autorizados para preparar si pasan la inspección:** `web-design-guidelines` y `vercel-react-best-practices` de `vercel-labs/agent-skills`, con scope de este proyecto; Microsoft Playwright MCP ya configurado en `.mcp.json` a `@playwright/mcp@0.0.83` con `--isolated`; Context7 solo si puedes configurarlo sin poner secretos en el repo. Claude debe completar su aprobación inicial de `playwright` en `/mcp`; no alteres settings para saltar esa aprobación. Asegura que Playwright Test existente sigue siendo el test de regresión. Usa la guía oficial de Claude Code para el wrapper de Windows. Lista cada cambio de instalación antes de cerrar y verifica que no se ejecuten browser actions contra Producción.
>
> **Diseño:** empieza con la skill oficial Frontend Design si está disponible selectivamente. No instales todas las skills o colecciones. No combines GSAP, Anime.js y Motion; no incorpores Three/WebGL, Swiper, shadcn/Tailwind o Firebase sin requerimiento reproducible y análisis de tamaño/compatibilidad. CSS actual y componentes existentes son la opción inicial.
>
> **Reglas:** sigue el alcance por defecto `apps/web`, `supabase`, `scripts`, `docs/current-v2.md`; no modifiques master, Production, secrets, schema o datos reales dentro de esta tarea. No desactives confirmaciones globales ni uses `--dangerously-skip-permissions`. Nunca uses `git add -A`, `git clean`, `git reset --hard` o `git restore .`. No alteres `CLAUDE.md`/`AGENTS.md` para dar autoridad superior a un plugin.
>
> **Contenido/compliance:** no añadas GA, Meta Pixel, cookies publicitarias, IA a usuarios, n8n, Firecrawl, Apify, Firebase, pagos o login externo. No inventes datos de negocio, reseñas, fotos de pedidos, inventario o claims. Política de privacidad y términos describen solo integraciones realmente activas; cualquier cambio jurídico debe quedar como propuesta y enviarse a revisión legal peruana. No crear cláusulas que pretendan trasladar toda responsabilidad legal al usuario.
>
> **Calidad:** si algún skill/herramienta no puede instalarse de forma selectiva o exige una cuenta/permiso externo, no improvises: deja los comandos exactos, impacto y quién debe completar el paso. No escribas archivos ni instales candidatos no autorizados; pregunta una vez con una lista consolidada solo si falta una decisión o credencial indispensable. Para cambios de UI futuros reproduce los bugs en navegador y valida desktop/móvil/tablet, teclado, foco, accesibilidad, estados, consola y runtime; usa tests dirigidos y `npm run check`/gate completo conforme al contrato del repo, no una batería repetida sin cambios.
>
> **Entrega:** reporta qué está ya disponible, qué se añadió con archivos exactos, versión/licencia de cada pieza, pruebas de arranque, riesgos y límites, candidatos descartados y el próximo paso. No afirmes que Claude Desktop fue contactado si solo modificaste configuración local.

## Fuentes principales

### Claude Code, Skills y MCP

- [Anthropic: MCP en Claude Code, scopes, Windows y configuración de proyecto](https://docs.anthropic.com/en/docs/claude-code/mcp)
- [Anthropic: CLI y permiso para saltar prompts (opción de riesgo)](https://docs.anthropic.com/en/docs/claude-code/cli-usage)
- [Anthropic: memoria e instrucciones CLAUDE.md](https://docs.anthropic.com/en/docs/claude-code/memory)
- [Anthropic Skills: marketplace y conjuntos publicados](https://github.com/anthropics/skills)
- [Anthropic Claude Code Frontend Design plugin](https://github.com/anthropics/claude-code/tree/main/plugins/frontend-design)
- [Vercel Agent Skills](https://github.com/vercel-labs/agent-skills)
- [Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines)
- [Skills CLI: instalación selectiva y scope de proyecto](https://github.com/vercel-labs/skills)
- [Microsoft Playwright MCP](https://github.com/microsoft/playwright-mcp)
- [Playwright MCP: aislamiento y configuración](https://github.com/microsoft/playwright/blob/main/docs/src/getting-started-mcp.md)
- [Context7 para Claude Code](https://github.com/upstash/context7/blob/master/docs/clients/claude-code.mdx)
- [Impeccable](https://github.com/pbakaus/impeccable)
- [UI UX Pro Max](https://github.com/nicohodt/claude-code-ui-ux-skill)
- [Superpowers](https://github.com/obra/superpowers)
- [Skills for Real Engineers](https://github.com/mattpocock/skills)
- [Claude-mem](https://github.com/thedotmack/claude-mem)
- [Claude SEO AI](https://github.com/Hainrixz/claude-seo-ai)
- [The Agency (agentes y división de Claude Code)](https://github.com/msitarzewski/agency-agents/tree/main/integrations/claude-code)
- [Gentleman Programming: gentle-ai](https://github.com/Gentleman-Programming/gentle-ai)
- [Gentleman Programming: Engram plugin y requisitos](https://github.com/Gentleman-Programming/engram/blob/main/docs/PLUGINS.md)
- [Context Mode (MCP/hooks/licencia)](https://github.com/mksglu/context-mode)

### Web, motion, media y automatización

- [Motion for React: instalación y Next App Router](https://motion.dev/docs/react-installation)
- [Anime.js: React y cleanup](https://animejs.com/documentation/getting-started/using-with-react/)
- [GSAP: instalación](https://gsap.com/docs/v3/Installation/) y [ScrollTrigger](https://gsap.com/docs/v3/Plugins/ScrollTrigger/)
- [Three.js GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html)
- [Swiper React](https://swiperjs.com/react)
- [shadcn/ui CLI](https://ui.shadcn.com/docs/cli)
- [Cloudinary Next.js](https://cloudinary.com/documentation/nextjs_integration) y [uploads firmados/no firmados](https://cloudinary.com/documentation/nextjs_image_and_video_upload)
- [Firecrawl MCP](https://docs.firecrawl.dev/mcp-server/introduction)
- [Apify MCP](https://github.com/apify/apify-mcp-server)
- [Vercel agent-browser](https://github.com/vercel-labs/agent-browser)
- [n8n MCP](https://docs.n8n.io/advanced-ai/mcp/accessing-n8n-mcp-server/)
- [NVIDIA Build/NIM](https://build.nvidia.com/explore/discover)
- [Google DeepMind Veo y Flow](https://deepmind.google/models/veo/)
- [Google Consent Mode](https://developers.google.com/tag-platform/security/concepts/consent-mode)
- [Google Analytics: política de uso/aviso y elección del usuario](https://developers.google.com/analytics/devguides/collection/protocol/ga4/policy)
- [Google Tag consent setup](https://developers.google.com/tag-platform/security/guides/consent)
- [Corey Haines Marketing Skills](https://github.com/coreyhaines31/marketingskills)

### Fuentes oficiales peruanas

- [Ley 29733 en el archivo del Congreso](https://leyes.congreso.gob.pe/DetLeyNume_1p.aspx?xNorma=6&xNumero=29733&xTipoNorma=0)
- [ANPD: Reglamento DS 016-2024-JUS](https://www.gob.pe/institucion/anpd/normas-legales/6554453-16-2024-jus)
- [ANPD: normativa de datos personales](https://www.gob.pe/institucion/anpd/colecciones/3482-normativa-de-proteccion-de-datos-personales)
- [Gobierno del Perú: transparencia, privacidad y ética en IA](https://www.gob.pe/110227-transparencia-privacidad-y-etica-en-la-ia)
- [Indecopi: arbitraje de consumo](https://consumidor.gob.pe/arbitraje-de-consumo/)
- [Código de Protección y Defensa del Consumidor](https://consumidor.gob.pe/wp-content/uploads/2020/07/Codigo-de-Proteccion-y-Defensa-del-Consumidor-2023-1.pdf.pdf)
- [El Peruano: Decreto Legislativo 1724 (derechos de autor y servicios digitales)](https://busquedas.elperuano.pe/dispositivo/NL/2484948-7)

## Límites de esta revisión

Revisé los artefactos de instrucciones del repositorio, el package manifest de `apps/web`, el checkpoint vigente y búsquedas dirigidas del código de medición/media. No hice un escaneo integral de vulnerabilidades, una auditoría jurídica, una auditoría de todas las imágenes ni un análisis de todos los documentos de cliente: no eran necesarios para decidir compatibilidad de estas herramientas. No instalé dependencias npm en la aplicación ni cambié el código del producto. Sí preparé la configuración MCP de proyecto para Playwright, fijada a `@playwright/mcp@0.0.83`; Claude Code aún debe recibir la aprobación inicial en `/mcp`. No instalé skills adicionales. Los elementos ambiguos que requieren una URL concreta permanecen marcados como no identificados.
