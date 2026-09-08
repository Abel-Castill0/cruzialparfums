# Supabase Schema V2 — Overview

The authoritative schema is:

`supabase/migrations/*.sql`

Generated TypeScript contract:

`apps/web/src/lib/supabase/database.types.ts`

Do not infer current DB structure from this document when migrations/types
can answer the question directly.

## Core domains

Platform:

- business_units
- admin_memberships
- settings
- audit_log

Catalog:

- categories
- product_categories
- products
- product_variants
- inventory
- product_media

Commercial:

- wholesale_policies
- variant_price_tiers
- combos
- combo_items

Import:

- campaigns
- campaign_products
- deposit_policies
- shipping_methods

Orders:

- customers
- orders
- order_lines

## Important contracts

- UUID primary keys.
- business-unit isolation.
- RLS mandatory.
- server authz + RLS for mutations.
- money uses numeric/decimal plus an explicit currency.
- archive instead of destructive delete where history exists.
- orders store immutable commercial snapshots.
- publication, availability and production status are independent.
- inventory may be `status_only` without invented quantity.
- product media preserves provider identity, checksum, and migration provenance.
- one active primary media per product, enforced by a partial unique index.
- Phase-4F2B migrated media is product-level: `product_variant_id` remains null.
- settings are business-unit scoped.
- public SELECT is limited to published/public data.

## Parfums commercial state

Wholesale scope:

`per_commercial_type`

Stable types:

- arabic
- designer
- niche

Only full-bottle variants qualify.

## Operator-only imports

Controlled commercial and media migration functions live under `app`.

They must remain unavailable to:

- public
- anon
- authenticated
- service_role

Operator imports use plan → conflict gate → atomic apply.
Commercial/media imports resolve portable identity through business unit plus
`legacy_id`, never by copying environment-local UUIDs.

Never expose them as public RPCs.

## Current environment

Hosted staging:

`cruzial-v2-staging`
`iyxidhglyqkzoziyewlc`

Production Supabase does not exist yet.

## Changes

Add schema changes only through additive migrations.

Never rewrite migrations already applied to hosted staging.

Never:

`supabase db reset --linked`

For exact constraints, functions, columns or grants:

inspect the current migrations/types directly.
