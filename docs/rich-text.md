# Texto restringido (Markdown mínimo) y validación con Zod (2026-10-14)

Base para todo el contenido que el cliente podrá editar (FAQ, condiciones, banners; ver `docs/content-editor-architecture.md`). **No es
un editor**: son el parser, el componente que lo muestra y los esquemas que lo validan. Todavía no hay ninguna pantalla del admin que lo use.

## 1. Qué se permite

| Se permite | Cómo se escribe |
|---|---|
| Párrafos | línea en blanco entre bloques |
| Salto de línea | un solo salto dentro del párrafo |
| Negrita / cursiva | `**negrita**`, `*cursiva*` (se pueden anidar: `**negrita *y cursiva***`) |
| Listas | líneas que empiezan con `- ` (o `* `) |
| Enlaces | `[texto](https://dirección)` — solo `https://` absoluto |
| Escapar un marcador | `\*`, `\[`, `\]` … |

Todo lo demás es **texto literal**: `# título`, `> cita` y `` `código` `` se ven tal cual, no se interpretan.

**Se rechaza** (el esquema devuelve un mensaje en español, no se pierde en silencio): HTML o etiquetas (`<script>`, `<img>`, `<iframe>`,
`<style>`, autoenlaces `<https://…>`, comentarios), imágenes (`![…](…)`), cualquier enlace que no sea `https://` absoluto
(`javascript:`, `data:`, `http:`, `//host`, rutas relativas, direcciones con usuario y contraseña) y caracteres de control.

## 2. Por qué es seguro (en capas)

1. **El parser no produce HTML.** `lib/rich-text/parse.ts` construye un árbol pequeño (párrafo, lista, texto, negrita, cursiva, enlace, salto).
2. **El renderizado es solo React.** `components/rich-text/rich-text.tsx` convierte el árbol en elementos; React escapa cada nodo de texto,
   así que `<script>` aparece como el texto `&lt;script&gt;`, nunca como una etiqueta. No hay `dangerouslySetInnerHTML`.
3. **El único atributo con datos del autor es `href`** y solo pasa si `parseSafeHttpsUrl` lo aprueba (https absoluto con host, sin
   espacios ni comillas ni caracteres de control, sin credenciales). Los enlaces llevan `target="_blank" rel="noopener noreferrer"`.
4. **El esquema Zod rechaza en la entrada** lo anterior, de modo que el admin avise a quien escribe.
5. Es un **Server Component sin código de cliente** y `schema.ts` es `server-only`.

**Por qué un parser propio y no `marked` + sanitizador:** el encargo decía «marked (o similar) + sanitización estricta». Un conversor a HTML
obliga a confiar en el sanitizador (la lista de fallos históricos de esos pares es larga) y suma dos dependencias y su peso. Aquí el
subconjunto cabe en ~130 líneas, **no genera HTML por construcción** y se prueba con casos maliciosos. Si algún día hiciera falta más
Markdown (encabezados, tablas), se reevalúa y entonces sí con una librería probada.

## 3. Esquemas Zod (`lib/rich-text/schema.ts`)

| Esquema | Regla |
|---|---|
| `richTextFieldsSchema` | `title`: texto recortado, 1–**80** caracteres · `body`: **≤ 2000** caracteres y sin lo rechazado |
| `restrictedMarkdownSchema` | solo el cuerpo (≤ 2000 y sin HTML / imágenes / enlaces no https / controles) |
| `httpsUrlSchema` | direcciones de botones o fuentes: solo `https://`, ≤ 2048 |
| `validateRichTextFields(input)` | devuelve `{ ok, value }` o `{ ok: false, errors }` con **el primer mensaje por campo**, la misma forma que los demás esquemas del admin |
| `findRichTextProblems(texto)` | lista de problemas (`html`, `image`, `link`, `control`) |

Los mensajes están en español y dicen qué hacer («los enlaces deben empezar con https://»).

## 4. Uso previsto

```tsx
import { RichText } from "@/components/rich-text/rich-text";
<RichText source={block.body} />            // banda clara
<RichText source={block.body} tone="dark" />  // bandas oscuras (enlaces dorados, contraste AA)
```
```ts
// en una Server Action del admin
const result = validateRichTextFields({ title: formData.get("title"), body: formData.get("body") });
if (!result.ok) return { status: "field_errors", errors: result.errors };
```

## 5. Pruebas (81 unitarias nuevas)

- `parse.test.ts`: `parseSafeHttpsUrl` (15 direcciones rechazadas: `javascript:` en cualquier combinación de mayúsculas, `data:`, `vbscript:`,
  `http:`, `//`, relativas, credenciales, espacios, comillas, `<`, NUL, largas), negrita/cursiva/enlaces y su anidación, marcadores sin cerrar,
  escapes, enlaces con destino rechazado (nunca son enlace), HTML como texto, y **entradas adversarias sin retroceso catastrófico**.
- `schema.test.ts`: 19 ataques rechazados (`<script>`, `<SCRIPT SRC=…>`, `onerror=`, `<iframe>`, `<style>`, `<svg onload>`, comentarios,
  autoenlaces, imágenes, `javascript:`/`JAVASCRIPT:`/`data:`/`http:`/`//`/rutas/credenciales, enlace vacío, NUL), límites 80/2000, mensajes,
  forma del resultado, entradas no string. Un `onerror=alert(1)` o un `<` en texto plano **sí** se permiten: solo pueden mostrarse como texto.
- `rich-text.test.tsx`: renderizado correcto, y **18 ataques** (incluidos `[a" onclick="…](https://…)`, `<scr<script>ipt>`, entidades) comprueban que
  el HTML resultante no contiene etiquetas fuera del conjunto permitido, ningún atributo `on*`, ningún `href` que no sea `https://` y que el
  texto de un enlace rechazado se muestra escapado.

## 6. Dependencia nueva: Zod

`zod ^4.6.7`, **solo en servidor** (esquemas de las Server Actions del admin y render público). Impacto en el paquete del navegador medido con el
mismo script antes y después (`docs/perf/zod-bundle/`): **0 bytes** en el total (1 293.5 KB crudo / 407.1 KB gzip, 68 archivos) y **0 de las 68 rutas
cambian** su JS de primera carga. Si un componente de cliente importara el esquema, costaría **82.7 KB minificados (23.0 KB gzip)** con Zod completo
(`zod/mini`: 13.2 KB / 4.6 KB): por eso `schema.ts` importa `server-only` y esa regresión rompería el build. `npm audit --omit=dev`: 0 vulnerabilidades.
