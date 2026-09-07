# CRUZIAL PLATFORM V2 — PROGRESS

## BRANCH

`codex/feature/cruzial-platform-v2`. `master` permanece intacto para GitHub Pages.

## HEAD

Baseline recuperado al iniciar este handoff: `3f93924`. El commit de cierre de
recovery se registra en el reporte final; no se reescribió historial.

## DONE
- Fase 0: baseline Git, stack, rutas, datos, media, SEO/PWA y deploy auditados.
- Tag local `pre-v2-stable-2026-09-06` creado en `5fba38f`.
- Rama `codex/feature/cruzial-platform-v2` creada; master no modificado.
- Arquitectura de carpetas, schema Supabase y roadmap propuestos.
- Reglas confirmadas, desconocidas y técnicas separadas.
- Riesgos P0/P1/P2 documentados; assets untracked preservados.
- Fase 1: Next.js 16 + TypeScript estricto aislado en `apps/web`.
- Rutas Foundation `/`, `/parfums`, `/import` y `noindex` global implementados.
- Contratos iniciales de unidad, sales mode, campañas y carritos separados creados.
- Fase 2A: export determinista de 99 registros legacy con checksum/procedencia y gate.
- `LegacyCatalogRepository` + `ProductMediaSource`; 188 assets no fueron duplicados.
- Shell Parfums anidado: announcement, header, footer, búsqueda, carrito, menú y WhatsApp.
- ProductCard y `/parfums/catalogo`: 96 fragancias, filtros, chips, quick-add y estados.
- Product detail: variantes 3/5/10 ml, frasco, cantidad, rendimiento, discontinuados y relacionados.
- SEO de producto seguro: metadata única, canonical solo con origen explícito y JSON-LD sin precios.
- Cart Parfums robusto: vacío, variantes, botella, cantidad, eliminar, total y persistencia aislada.
- Checkout: revisión editable y mensaje central de WhatsApp sin afirmar pedido confirmado.
- Combos: tres sets legacy, composición reconfirmable, variantes 3/5/10 ml y carrito real.
- Combo Builder: catálogo elegible, búsqueda, selección 3–6, total único y consulta WhatsApp central.
- Finder: cinco pasos, reglas deterministas sobre catálogo, resultados explicables y decant al carrito.
- `.env` raíz ignorado; ningún `.env` tracked ni exposición histórica de su ruta.
- Contacto público actualizado y centralizado: WhatsApp/email confirmados, con
  objetos de settings separados para Parfums e Import.
- Parfums migrado a negro/blanco; Home completa con FeaturedPerfumeRail editorial
  administrable, sin “Más Deseados”, “HOT” ni claims de ventas.
- Import Home completa a nivel foundation en azul profundo/blanco/plata, sin
  catálogo, fechas, evidencia o precios inventados.
- Gateway público y Admin permiten escoger Parfums/Import; Admin sigue sin auth/CRUD
  simulado y siempre `noindex,nofollow`.
- Schema Supabase reconciliado como propuesta, con estado explícito
  `IMPLEMENTED | PROPOSED | UNKNOWN`; no existen migrations todavía.

## CURRENT — FASE 2.5: BUSINESS RECONCILIATION + STOREFRONT COMPLETION
"Fase 2 parity PASS" ya NO se interpreta como cierre comercial de Parfums:
llegaron nuevas decisiones de cliente (2026-09-06) que reabren contratos de
datos y reglas ya dados por cerrados. Ver `docs/client-decisions.md` para el
detalle CONFIRMED/UNKNOWN de esta fase. Capacidades técnicas de Fase 2
(Product Detail, Cart, Checkout, Combos, Finder, Mayorista, Institucional,
404) se conservan y se reconcilian, no se reescriben desde cero.

Bloques de Fase 2.5 (orden de ejecución) — estado 2026-09-06/07:

1. ✅ Docs: reconciliar reglas (`c15f4e0`).
2. ✅ Datos de catálogo: `red-intensely`→Dumont Paris, `reserve-privee`→Givenchy,
   `purple-melancholia`→designer, `bir-intense`→hidden, spelling de
   `cdn-preciux-i`/`amber-o-gold-e`, `supremacy-noi` nombre completo
   (`55f3234`). Olva→Shalom + grep-gate de regresión (`58770eb`, encontró y
   corrigió 3 menciones vivas en Contacto/Nosotros/Checkout).
3. ✅ Descontinuado≠agotado: `availabilityStatus` separado de `discontinued`
   en el dominio; ProductCard/ProductDetail dejan de bloquear compra o
   mostrar "Agotado" sin evidencia (`a669087`).
4. ✅ Promoción de regalo solo elegible en frasco completo, regla
   centralizada en `promotion-eligibility.ts` (`5718652`).
5. ✅ Product Card: control de cantidad `[-] N [+] Añadir` (`7ca6df8`).
6. ✅ Combo Builder: tamaño por línea (`ComboLine`), ya no global (`bea08d5`).
7. ✅ Mayorista: línea confirmada + descuento por categoría, `wholesale-policy.ts`
   (`331f84f`); `wholesaleThresholdScope` queda `UNKNOWN` a propósito.
8. ✅ Gateway público `/`: paleta Import (azul/blanco/plata) separada de
   Parfums, card entera como `<Link>` nativo (`d1664df`).
9. ✅ Home real `/parfums` + `ComboCarousel`: hero/trust/discovery/combos/
   finder/autenticidad/mayorista en el orden pedido; "Más Deseados" no se
   reintrodujo (`995ebcd`).
10. ✅ Reconciliación de datos P1 (Valentino/Sceptre/One Million) — investigada
    y cerrada antes del resto del bloque (`3a40173`).
11. ✅ Cruzial Import — **solo foundation**: shell navy/blanco/plata,
    `/import` con estado de consolidado honesto ("sin consolidado activo",
    nunca fecha inventada) y categorías como datos, no CRUD ni catálogo
    falso (`da61c65`). Checkout/adelanto/delivery de Import quedan sin
    construir — no hay carrito Import todavía, así que no hay nada que
    conecte a un canal/regla no confirmados.
12. ✅ Admin gateway `/admin` — **solo foundation**: selector de unidad,
    `robots: noindex` forzado en todo `/admin/*` independientemente de la
    política de indexación pública, áreas listadas como "Próximamente" sin
    auth ni CRUD simulado (`ddb9fa3`).
13. ✅ Segunda auditoría: grep de Más Deseados/Olva/TODO/console.log/
    tamaño-global-combo/marcas viejas — limpio. Build de producción inspeccionada
    en `/`, `/parfums`, `/import`, `/admin` a 320/390/430/768/1024/1440/1920:
    sin overflow horizontal, enlaces nativos correctos y sin warnings/errors de
    consola. Capturas normales confirmaron hero, secciones, FAQ, CTA y gateways.
14. ✅ `docs/supabase-schema-v2.md` reconciliado (`3f93924` + cierre recovery):
    estado real por capa, entidades mínimas, rail administrable, separación
    producción/disponibilidad/visibilidad, snapshots, RLS e índices/constraints.

`apps/web`: 19 test files, 82 tests; `npm run check` completo en PASS al cierre
de recovery (catálogo + lint + typecheck + tests + build).

## PARTIAL

- Ningún trabajo parcial del último bloque Claude después del cierre de recovery.
- Import y Admin siguen siendo foundations deliberadas; no se presentan como
  checkout/carrito/auth/CRUD terminados.

## TODO

- Import: consolidado real, checkout/carrito propio, delivery privado y
  regla de adelanto 50/70 con `customerStatus` server-verificado (nada de
  esto existe todavía — solo la home/shell foundation).
- Admin: bootstrap de autenticación real antes de cualquier CRUD.
- Gate final de parity de Parfums (global responsive/SEO/a11y) antes de Supabase/cutover.
- Mantener Preview `noindex`; validar datos comerciales antes de Supabase/cutover.

## BLOCKED
- Publicación/cutover: falta confirmar cuentas, dominio y reglas comerciales P0.
- Import: faltan catálogo, políticas y operación de campañas/pedidos.
- 23 precios de frasco y composiciones combo son solo paridad legacy, no seed verificado.
- Bootstrap/MFA/recuperación/roles admin continúan sin definición operativa.
- `wholesaleThresholdScope` (40 unidades combinadas vs. por SKU): no confirmado.
- Ambigüedades registradas 2026-09-06: `1-million-lucky` ("One Million"),
  "Amber Gold Elixir es E.", fragmento "reserva para...". Ver
  `docs/client-decisions.md` → UNKNOWN_CLIENT_CLARIFICATION.

## TESTS
- `node scripts/frontend-gate.mjs`: PASS (12 páginas; header/footer/cards/assets/ARIA/PWA).
- Browser portada: 320/390/430/768/1024/1440/1920 sin overflow horizontal.
- Browser portada: sin errores/warnings de consola.
- Catálogo: 99 total, 96 activos, 3 descontinuados, 0 IDs duplicados.
- V2: export check + lint + typecheck + 45 tests + build PASS.
- Catálogo V2: 320/360/390/768/1024/1280/1440; 1/2/3/4 columnas, sin overflow.
- Catálogo V2: precios sin wrap, alturas por fila uniformes, fondo blanco, 0 controles anidados.
- Menú/búsqueda/carrito/filtros: foco, Escape, restauración y consola validados.
- Product Detail: 320/360/390/430/768/1024/1440/1920 sin overflow; CTA ≥ 50 px.
- Producto normal, frasco, cantidad, carrito, discontinuado, 404, metadata y schema validados.
- Cart: vacío/una/múltiples, variante/frasco, cantidad/eliminar y total derivados validados.
- Checkout: mensaje codificado y 320/360/390/430/768/1024/1440/1920 sin overflow.
- Combos: tres sets exactos, contenido legacy visible, builder 3/5/10 ml y WhatsApp validados.
- Combos: 320/360/390/430/768/1024/1440/1920 sin overflow; CTA móvil separado de WhatsApp.
- Finder: flujo completo, límites, ranking, carrito, foco, Tab, Escape y ausencia de lenguaje IA validados.
- Finder: inicio y resultados en 320/360/390/430/768/1024/1440/1920 sin overflow.
- Recovery 2026-09-07: catálogo determinista; 5 archivos dirigidos/22 tests;
  lint, typecheck, build y `git diff --check` PASS antes del checkpoint global.
- Recovery visual: `/`, `/parfums`, `/import`, `/admin` en
  320/390/430/768/1024/1440/1920, sin overflow de documento ni consola.

## PREVIEW

- No se realizó deploy durante recovery. La política de Preview sigue
  `noindex,nofollow`; cualquier despliegue futuro será Preview antes de Production.

## PRODUCTION

- No se realizó deploy ni cutover. `master` y GitHub Pages no se modificaron.

## NEXT

Gate global de parity de Parfums: matriz completa responsive + SEO + accesibilidad
de las superficies ya implementadas, antes de iniciar Supabase, Import operativo o
cutover.
