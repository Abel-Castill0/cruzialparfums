# Caché y revalidación: lo que se guarda en el admin se ve en la web (2026-10-14)

Política: **la etiqueta (tag) es la invalidación principal; el TTL es solo el respaldo** para cambios hechos fuera del admin
(un arreglo por SQL, una hora de apertura que llega). Decisión aprobada: tag + TTL de 5 minutos como respaldo.

## 1. Mapa de etiquetas

| Etiqueta | Qué cachea | TTL de respaldo | Quién la invalida |
|---|---|---|---|
| `parfums-catalog` | filas públicas del catálogo de Parfums y las vistas del catálogo por consulta (`lib/catalog/parfums-storefront.ts`, `parfums-catalog-page.ts` en la rama de T12) | 60 s | `revalidateParfumsStorefront()` en las acciones de productos, categorías, combos, configuración y fotos de Parfums |
| `import-campaign` | `readImportGate` (estado de Import en el selector `/`: abierto, cerrado o fecha estimada) | **300 s** | `revalidateImportCampaign()` en **cada** acción que cambia una campaña (§2) |
| `content-blocks` | *(reservada, aún sin uso)* bloques de contenido, carruseles | — | se creará con el sistema de bloques (`docs/content-editor-architecture.md`) |

Las lecturas públicas de Import (catálogo, ficha, hero) **no están en caché**: cada petición consulta las RPC, así que ya muestran el
cambio de inmediato. `readImportGate` era la excepción: antes tenía 60 s **sin etiqueta** y un cambio de campaña tardaba hasta 60 s.

**Por qué el TTL de `parfums-catalog` sigue en 60 s y no en 5 min:** además del admin, lo cambian escrituras que no pasan por una acción
del admin (pedidos que reservan stock, cargas por SQL). Subirlo a 300 s dejaría el stock visible desactualizado hasta 5 minutos. Se
puede subir cuando el stock deje de depender de ese caché.

## 2. Qué se cambió (rama `feat/import-campaign-revalidation`)

- `lib/catalog/import-campaign-cache.ts`: constantes `IMPORT_CAMPAIGN_CACHE_TAG = "import-campaign"` y TTL de 300 s.
- `lib/catalog/import-campaign-revalidate.ts`: `revalidateImportCampaign()` → `revalidateTag("import-campaign", { expire: 0 })` (firma de
  Next 16; `expire: 0` deja la entrada obsoleta al instante: ni una respuesta más desde caché).
- `lib/catalog/import-gate.ts`: `readImportGate` cacheada con `tags: ["import-campaign"]` y `revalidate: 300`.
- `app/admin/import/consolidados/actions.ts`: las **siete** acciones que mutan una campaña llaman al helper después de comprobar que la
  mutación salió bien: `createCampaignAction`, `duplicateCampaignAction`, `updateCampaignAction` (nombre, fechas, mensaje),
  `setCampaignStatusAction` (abrir/cerrar/programar), `archiveCampaignAction`, `setCampaignProductsAction` y
  `updatePresentationOfferAction`.
- **No** se llama desde las acciones de clientes, pedidos, mayorista, lotes o configuración de adelanto: no cambian el estado de la
  campaña que lee el selector.

**`revalidateTag` y no `updateTag`:** `updateTag` (lectura de lo escrito) solo es válido dentro de una Server Action y solo para la
persona que guarda; aquí quien debe ver el cambio es **el visitante** de otra sesión, y `revalidateTag(tag, { expire: 0 })` es la misma
llamada que ya usa Parfums.

## 3. Verificación

| Prueba | Qué comprueba |
|---|---|
| `lib/catalog/import-campaign-revalidate.test.ts` | el helper llama a `revalidateTag("import-campaign", { expire: 0 })`; tag y TTL de la política |
| `app/admin/import/consolidados/campaign-revalidation.test.ts` | **guarda estructural**: toda acción de `actions.ts` que revalida páginas del admin también llama a `revalidateImportCampaign()`, y lo hace **después** de comprobar el resultado; son exactamente siete; `readImportGate` lleva la etiqueta. Una acción nueva que olvide la llamada **falla aquí**. |
| `e2e/isolated-import-campaign-revalidation.spec.ts` | con la pila local y un administrador real (contraseña + TOTP): cierra la campaña abierta desde el admin y comprueba que `/` muestra «Estamos preparando el próximo consolidado» en **menos de 5 s**; la reabre y comprueba que desaparece en menos de 5 s. Restaura siempre la campaña. Corre en el proyecto `isolated` (después de los recorridos públicos). |

**Resultado medido (local, build de producción):** cerrar y reabrir se reflejan en `/` dentro de los 5 s, las dos veces. **Control negativo:**
con la llamada comentada en `setCampaignStatusAction`, la misma prueba **falla** (la home sigue mostrando el estado anterior pasados 5 s):
la prueba detecta de verdad la ausencia de la revalidación. Comando: `node scripts/local-admin-browser.mjs --build` y luego
`node scripts/local-admin-browser.mjs --project=setup` y `--project=isolated --no-deps e2e/isolated-import-campaign-revalidation.spec.ts`.

Nota: la prueba usa `E2E_ADMIN_*` (administrador de ambas unidades) y la base local desechable; se omite sola en CI y en cualquier
entorno que no sea la pila local.

## 4. Ajuste a una prueba existente

`presentation-offer-action.test.ts` simulaba `next/cache` solo con `revalidatePath`. Como la acción ahora también expira la etiqueta, el
mock añade `revalidateTag: vi.fn()`. La aserción no cambió; es el mínimo para que el módulo se importe.

## 5. Límites

- El TTL de 300 s significa que un cambio **fuera del admin** (SQL directo, o la hora de apertura programada que llega) puede tardar
  hasta 5 minutos en verse en el selector. El estado de una campaña **nunca cambia por las fechas** (lo dice el propio admin), así que el
  caso real es el SQL manual.
- En despliegues con varias instancias, `revalidateTag` invalida la caché de datos compartida de Vercel; en `next start` local es la
  caché del proceso. Las pruebas locales validan el mecanismo, no la propagación entre regiones.
