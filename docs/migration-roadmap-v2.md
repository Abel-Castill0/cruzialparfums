# Cruzial Platform V2 — Migration roadmap

Cada fase entra por una rama/PR revisable, produce evidencia y no cambia el dominio de
producción hasta Fase 11.

## Fase 0 — Audit + architecture

- Inventariar stack, rutas, datos, assets, deploy y riesgos.
- Fijar arquitectura, schema propuesto, decisiones y mapa de compatibilidad.
- Gate: baseline legacy PASS + documentos revisables + rama/tag seguros.

## Fase 1 — Next.js/V2 foundation

- Scaffold aislado en `apps/web`, App Router, TypeScript estricto y lint.
- Tokens base, shells vacíos por unidad, validación de env y tests mínimos.
- No conectar secretos ni publicar datos comerciales falsos.
- Gate: install reproducible, lint, typecheck, tests y build PASS.

## Fase 2 — Parfums visual parity

- Migrar navbar, footer, hero, catálogo, producto, combos, finder, mayorista, contacto y
  legal a componentes, usando fixtures derivados del catálogo legacy.
- Mantener comportamiento y copy; cambios de UX solo con evidencia.
- Gate: screenshots 320/390/430/768/1024/1440/1920, links, a11y, flujo de carrito y
  comparación contra producción.

## Fase 3 — Supabase schema/Auth

- CLI local, migraciones versionadas, seed no sensible, tipos generados, RLS y admin auth.
- ETL idempotente `assets/data.js → staging → tablas`, con reporte y `legacy_id`.
- Gate: reset completo, tests RLS, snapshots y cero secretos cliente.

## Fase 4 — Admin Parfums

- Dashboard operativo; productos, categorías, variantes, inventario, combos, media,
  settings, órdenes y audit log según V1.
- Gate: create/edit/publish/stock/archive/precio/media, authz server-side y auditoría.

## Fase 5 — Cruzial Gateway

- Gateway de marca con selección Parfums/Import y prioridad condicionada a campaña open.
- Gate: estados sin campaña/open/closed y responsive completo sin afectar `/parfums`.

## Fase 6 — Cruzial Import

- Home, categorías, búsqueda, filtros, producto y carrito Import independiente.
- Gate: los tres sales modes funcionan sin reglas específicas de relojes.

## Fase 7 — Consolidado campaigns

- Público y admin para create/duplicate/schedule/open/pause/close; precio/disponibilidad
  por campaña y snapshots de pedido.
- Gate: matriz de estados/transiciones aprobada y pedidos históricos inmutables.

## Fase 8 — Admin Import / CSV

- Import/export, bulk price y disponibilidad mediante staging y diff.
- Gate: old/new/created/unmatched/invalid, dry-run, rollback y audit log.

## Fase 9 — Waitlist / notifications

- Waitlist con consentimiento; Resend solo para flujos realmente aprobados.
- Gate: rate limit, idempotencia, opt-out/retención y entregabilidad configurada.

## Fase 10 — QA / security / performance / SEO

- E2E, RLS, links legacy, visual, accesibilidad, LCP/CLS, metadata, sitemap y caché.
- Gate: matriz firmada sin P0/P1 abiertos.

## Fase 11 — Production migration

- Backup, cutover controlado, redirects, retiro de SW legacy, observación y rollback.
- Gate: Parfums parity + admin + Import base + responsive + security todos PASS.

## Secuencia de datos y media

1. Exportar catálogo legacy de forma determinista con procedencia y checksum.
2. Validar IDs, precios, variantes, descontinuados, combos y rutas de imagen.
3. Bloquear del seed público todo dato `UNKNOWN` o pendiente.
4. Cargar staging Supabase, comparar conteos y hacer dry-run.
5. Importar con `legacy_id`; repetir debe ser idempotente.
6. Subir media por manifiesto sin transformar originales; registrar `public_id`/checksum.
7. Comparar páginas y pedidos de prueba antes de cambiar la fuente del storefront.

## Estrategia de rollback

- Hasta Fase 10, GitHub Pages/master es producción y V2 solo Preview.
- El cutover no elimina el sitio legacy ni sus fotos.
- Redirects comienzan temporales; el mapa se valida automáticamente.
- Migraciones tienen backup y plan forward-fix; no se edita producción desde Dashboard.
- Cloudinary puede revertir al path legacy mientras los originales sigan preservados.
