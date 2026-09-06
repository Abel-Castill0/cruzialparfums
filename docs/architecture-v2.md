# Cruzial Platform V2 — Arquitectura propuesta

Estado: decisión técnica de Fase 0; sujeta solo a restricciones de negocio pendientes.

## Principios

- Un repositorio, una aplicación Next.js, un dominio, un proyecto Supabase y un admin.
- Parfums e Import comparten infraestructura y design system, no carritos ni reglas.
- Server Components para lectura por defecto; Client Components solo donde hay interacción.
- Toda mutación comprueba autorización en servidor y vuelve a estar limitada por RLS.
- Postgres pasa a ser la fuente comercial canónica después del cutover validado.
- Archivar por defecto; hard-delete solo cuando no hay referencias ni obligación de retención.
- No automatizar una transición o regla comercial que el cliente no haya confirmado.

## Aislamiento incremental

La raíz estática existente queda intacta durante Foundation y paridad. Vercel debe usar
`apps/web` como Root Directory en la rama V2. `master` continúa publicando GitHub Pages.

```text
cruzialparfums/
├── apps/
│   └── web/
│       ├── public/
│       ├── src/
│       │   ├── app/
│       │   │   ├── (gateway)/page.tsx
│       │   │   ├── parfums/
│       │   │   ├── import/
│       │   │   ├── admin/
│       │   │   ├── auth/callback/route.ts
│       │   │   └── api/media/sign/route.ts
│       │   ├── components/
│       │   │   ├── design-system/
│       │   │   ├── storefront/
│       │   │   └── admin/
│       │   ├── domains/
│       │   │   ├── catalog/
│       │   │   ├── campaigns/
│       │   │   ├── carts/
│       │   │   ├── orders/
│       │   │   ├── media/
│       │   │   └── settings/
│       │   ├── lib/
│       │   │   ├── auth/
│       │   │   ├── supabase/
│       │   │   ├── validation/
│       │   │   └── observability/
│       │   └── styles/
│       └── tests/
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   ├── seed.sql
│   └── tests/
├── scripts/
│   ├── migrate-legacy-catalog/
│   └── verify-legacy-redirects/
└── docs/
```

No se propone Turborepo ni paquetes separados en V1: una sola app no justifica ese
costo. Si más adelante existe un segundo runtime real, los módulos puros pueden
extraerse sin cambiar las rutas.

## Árbol de rutas

```text
/
├── parfums/
│   ├── catalogo
│   ├── productos/[slug]
│   ├── combos
│   ├── finder
│   ├── mayorista
│   ├── carrito
│   ├── checkout            (nombre final pendiente)
│   ├── nosotros
│   ├── contacto
│   └── legal/*
├── import/
│   ├── categorias/[slug]
│   ├── productos/[slug]
│   ├── consolidado/[number]
│   ├── carrito
│   └── lista-de-espera
└── admin/
    ├── dashboard
    ├── parfums
    ├── import
    ├── products
    ├── categories
    ├── inventory
    ├── combos
    ├── campaigns
    ├── orders
    ├── media
    ├── waitlist
    ├── settings
    └── audit-log
```

Los nombres internos pueden estar en inglés; las URLs públicas se mantendrán en español
salvo compatibilidad legacy. Route groups separan layouts sin añadir segmentos.

## Límites de dominio

- **Catalog:** unidades, categorías, productos, variantes, medios y publicación.
- **Campaigns:** consolidado, transición de estado y oferta por campaña.
- **Carts:** dos stores y dos contratos de línea independientes.
- **Orders:** creación, estado y snapshots inmutables de líneas.
- **Admin:** casos de uso; no contiene lógica comercial duplicada.
- **Settings:** configuración versionable por unidad, incluida WhatsApp.

Los componentes no consultan Supabase directamente. Usan queries/commands del dominio,
lo que permite fixtures en Foundation y políticas coherentes al conectar Postgres.

## Lectura y escritura

```text
Storefront → Server Component/query → Supabase client de servidor → RLS → Postgres
Admin UI → Server Action/Route Handler → auth + autorización → validación → RLS → DB
Upload admin → endpoint firmado de servidor → Cloudinary → product_media → audit_log
CSV → staging + diff → aprobación admin → transacción → catálogo + audit_log
```

- El cliente público recibe solo columnas públicas y filas publicadas.
- El navegador puede usar la anon key; nunca recibe `service_role` ni secretos Cloudinary.
- Cada Server Action y Route Handler verifica sesión/rol, aunque el botón esté oculto.
- La validación de entrada se comparte entre formulario, handler y job.
- Las operaciones críticas generan audit log dentro de la misma transacción cuando sea
  posible.

## Carritos separados

Contratos mínimos distintos:

```ts
type ParfumsCartLine = {
  productId: string;
  variantId: string;
  quantity: number;
};

type ImportCartLine = {
  productId: string;
  variantId: string;
  campaignProductId?: string;
  quantity: number;
};
```

Persistencia cliente inicial:

- `cruzial:v2:cart:parfums`
- `cruzial:v2:cart:import`

El precio se vuelve a resolver en servidor al crear el pedido; el navegador no es fuente
de verdad. El pedido guarda su snapshot aunque el checkout final continúe en WhatsApp.
La compatibilidad con `cruzial_cart` se implementará una sola vez y solo para Parfums.

## Campañas

`campaigns.status` conserva los estados confirmados: `draft`, `scheduled`, `open`,
`paused`, `closed`, `fulfilled`. `opens_at`/`closes_at` son `timestamptz` informativos
hasta confirmar si las transiciones son automáticas. `campaign_products` controla precio
y disponibilidad propios sin mutar el producto o pedido histórico.

Si hubiera más de una campaña abierta, la selección del banner/gateway no se inferirá:
se requiere una regla de cliente o una referencia explícita en settings.

## Media

- Original preservado; no background removal automático.
- Upload firmado y restringido desde admin.
- DB guarda provider, `public_id`, URL segura, dimensiones, bytes, formato, alt y orden.
- Transformaciones de entrega usan tamaños responsive, formato automático y calidad auto.
- Migración con manifiesto `legacy_path → public_id`, checksum y reporte de faltantes.
- El corte a Cloudinary se hace por lotes reversibles; no se borran originales al migrar.

## URLs, SEO y caché

- `next.config.ts` conserva redirects simples; el lookup de `product.html?id=` usa una
  ruta de compatibilidad con `legacy_id`.
- Primero redirects temporales en Preview; `308` solo tras validar matriz completa.
- Metadata/JSON-LD se generan en servidor por producto.
- Sitemap separado por unidad y solo con contenido público indexable.
- No registrar el service worker V2 hasta definir scope/versionado. En cutover se sirve
  una estrategia que retire caches legacy sin dejar precios obsoletos.

## Referencias oficiales vigentes

- [Next.js App Router y organización](https://nextjs.org/docs/app/getting-started/project-structure)
- [Next.js: autenticación y autorización](https://nextjs.org/docs/app/guides/authentication)
- [Next.js: redirects](https://nextjs.org/docs/app/api-reference/config/next-config-js/redirects)
- [Supabase SSR](https://supabase.com/docs/guides/auth/server-side)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase migrations](https://supabase.com/docs/guides/local-development/database-migrations)
- [Vercel deployments y Preview](https://vercel.com/docs/deployments/overview)
- [Cloudinary uploads firmados](https://cloudinary.com/documentation/nextjs_image_and_video_upload)
- [Cloudinary responsive images](https://cloudinary.com/documentation/nextjs_image_transformations)
