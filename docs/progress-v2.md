# CRUZIAL PLATFORM V2 — PROGRESS

## BRANCH

`codex/feature/cruzial-platform-v2`. `master` permanece intacto para GitHub Pages.

## HEAD

`74aeeb6` al iniciar el Global Parfums Quality / Parity Gate.

## CURRENT

- V2 aislada en `apps/web`: Next.js 16, App Router y TypeScript estricto.
- Fuente canónica temporal: `assets/data.js` mediante
  `LegacyCatalogRepository`; fixture solo para paridad legacy, nunca seed
  comercial automático.
- Implementado: gateway, Home Parfums, catálogo, producto, cart drawer,
  checkout, combos/builder, Finder, mayorista, institucional, legales y 404.
- Home Parfums usa negro/blanco y conserva hero, trust, discovery, combos,
  Finder, educación, autenticidad, mayorista, FAQ y CTA. FeaturedPerfumeRail
  existe pero no renderiza productos hasta recibir curación real.
- Import y Admin son foundations honestas; no representan catálogo, carrito,
  auth ni CRUD implementados.
- Preview y Admin permanecen `noindex,nofollow`; Production/cutover no autorizados.
- Global Parfums Quality / Parity Gate: **IN PROGRESS**.

## DONE

- Foundation, Catalog, Product Detail, Cart, Checkout, Combos, Finder,
  Mayorista e Institutional cerrados por capability; no se reescriben sin
  regresión demostrada.
- Catálogo reconciliado: hidden, descontinuado independiente de disponibilidad,
  regalo solo en frasco, cantidad desde card, tamaño por línea en combos y
  mayorista con alcance de 40 unidades todavía UNKNOWN.
- Contacto operativo centralizado: WhatsApp `+51 926 390 591` y correo público
  `dominiocruzial@gmail.com`, con settings separados Parfums/Import.
- Paletas LATEST: Parfums negro/blanco con dorado no dominante; Import azul
  profundo/blanco/plata.
- Schema Supabase documentado solo como propuesta; no existen migrations.
- Recovery anterior cerrada y rama sincronizada con GitHub.

## PARTIAL

- Gate global de Parfums: auditoría responsive, funcional, a11y, SEO,
  performance, seguridad y enlaces internos en curso.

## TODO

- Cerrar el gate global de Parfums y registrar únicamente evidencia vigente.
- Después del gate, iniciar Supabase Foundation + migrations + RLS + auth Admin
  en una ejecución separada.
- Import operativo y Admin CRUD permanecen fuera del bloque actual.

## BLOCKERS

- Cutover: dominio/cuentas definitivas y reglas comerciales P0 sin confirmar.
- Import: catálogo, operación de campañas/pedidos y políticas finales pendientes.
- Admin: bootstrap, MFA, recuperación y roles operativos pendientes.
- 23 precios de frasco y composiciones combo son paridad legacy, no seed verificado.
- `wholesaleThresholdScope`: 40 unidades combinadas vs. por SKU sigue UNKNOWN.
- Reemplazo de `sceptre-malachite`: falta un asset nuevo del cliente.

## TESTS — CURRENT

- Baseline del gate en `74aeeb6`: `npm run check` PASS.
- Catálogo determinista, lint y typecheck: PASS.
- Vitest: 19 archivos, 82 tests PASS.
- Build: 18 rutas generadas PASS.
- Evidencia responsive/funcional final: pendiente de este gate.

## HISTORICAL

- El detalle de commits y checkpoints anteriores vive en Git. Las cantidades
  antiguas de tests no se conservan aquí como si fueran métricas actuales.
- Tag local `pre-v2-stable-2026-09-06` apunta al baseline `5fba38f`.

## PREVIEW

- No deploy en este bloque. Preview debe permanecer `noindex,nofollow`.

## PRODUCTION

- No deploy, merge, cutover ni cambios en `master`/GitHub Pages.

## NEXT

Cerrar Global Parfums Quality / Parity Gate. Si queda verde, el siguiente
bloque será **Supabase Foundation + migrations + RLS + auth Admin**, sin
iniciarlo en esta ejecución.
