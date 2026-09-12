-- Cruzial Platform V2 — 4J5F staging-only QA fixtures.
--
-- Operator-run against `cruzial-v2-staging` ONLY, never local, never
-- production. Not a migration: not applied by `db reset`/`db push`, not
-- part of `supabase test db`. Purpose: hosted staging previously had 0
-- published Parfums products/media and exactly 1 real campaign (#6,
-- "Sexto Consolidado" — a real, in-flight client campaign, never mutated
-- here), which is not enough surface to exercise Admin publication/
-- readiness/conflict QA. This adds a small, clearly-marked, isolated,
-- removable dataset alongside the real client catalog — it never edits or
-- deletes an existing row.
--
-- Every fixture row is identifiable by:
--   - Parfums: slug prefix 'staging-qa-' and brand/name prefix 'STAGING QA'.
--   - Import: campaign numbers 9001-9003 (real consolidados are low
--     sequential integers; 9001+ can never collide with a real one) and
--     name prefix 'STAGING QA'.
-- No real pricing, availability, or campaign-lifecycle decision is
-- invented for any real client entity — every fixture price/status below
-- is synthetic, attached only to synthetic rows.
--
-- Idempotent: every INSERT is keyed to the table's real unique constraint
-- with ON CONFLICT DO NOTHING, so re-running this file is a no-op past the
-- first apply.
--
-- To remove everything this file adds:
--   delete from public.combo_items using public.combos c, public.products p
--     where combo_items.combo_id = c.id and c.product_id = p.id and p.slug like 'staging-qa-%';
--   delete from public.combos using public.products p
--     where combos.product_id = p.id and p.slug like 'staging-qa-%';
--   delete from public.inventory using public.product_variants v, public.products p
--     where inventory.product_variant_id = v.id and v.product_id = p.id and p.slug like 'staging-qa-%';
--   delete from public.product_media using public.products p
--     where product_media.product_id = p.id and p.slug like 'staging-qa-%';
--   delete from public.product_categories using public.products p
--     where product_categories.product_id = p.id and p.slug like 'staging-qa-%';
--   delete from public.product_variants using public.products p
--     where product_variants.product_id = p.id and p.slug like 'staging-qa-%';
--   delete from public.products where slug like 'staging-qa-%';
--   delete from public.categories where slug = 'staging-qa-family';
--   delete from public.campaigns where number in (9001, 9002, 9003);

-- ---------------------------------------------------------------------------
-- Parfums: one dedicated, non-wholesale-affecting category
-- ---------------------------------------------------------------------------
-- kind = 'olfactory_family' deliberately: the three real 'commercial_type'
-- categories (arabic/designer/niche) drive wholesale-eligibility aggregation
-- (AGENTS.md) and already have real CLIENT_CONFIRMED wholesale_policies rows
-- keyed to them 1:1 by a unique index — adding a fixture there would risk
-- perturbing real wholesale math or colliding with that unique index.

insert into public.categories (business_unit_id, kind, slug, name, publication_status)
values (
  '11111111-1111-4111-8111-111111111111', 'olfactory_family',
  'staging-qa-family', 'STAGING QA — Aroma', 'published'
)
on conflict (business_unit_id, slug) do nothing;

-- ---------------------------------------------------------------------------
-- Parfums: publishable product (category + priced published variant +
-- inventory + primary media — everything an admin needs before publishing)
-- ---------------------------------------------------------------------------

insert into public.products (
  business_unit_id, slug, name, brand, short_description, sales_mode,
  production_status, availability_status, publication_status, verification_status
) values (
  '11111111-1111-4111-8111-111111111111', 'staging-qa-publishable',
  'STAGING QA — Producto Publicable', 'STAGING QA',
  '4J5F hosted QA fixture — synthetic, not a real product.',
  'always_available', 'active', 'available', 'published', 'unknown'
)
on conflict (business_unit_id, slug) do nothing;

insert into public.product_categories (product_id, category_id)
select p.id, c.id
from public.products p, public.categories c
where p.slug = 'staging-qa-publishable' and c.slug = 'staging-qa-family'
  and p.business_unit_id = '11111111-1111-4111-8111-111111111111'
on conflict (product_id, category_id) do nothing;

insert into public.product_variants (
  product_id, variant_kind, size_ml, label, price_amount, currency,
  publication_status, price_verification_status
)
select p.id, 'decant', 5, '5 ml', 19.90, 'PEN', 'published', 'unknown'
from public.products p where p.slug = 'staging-qa-publishable'
on conflict (product_id, label) do nothing;

insert into public.inventory (product_variant_id, inventory_mode, availability_status)
select v.id, 'status_only', 'available'
from public.product_variants v
join public.products p on p.id = v.product_id
where p.slug = 'staging-qa-publishable' and v.label = '5 ml'
on conflict (product_variant_id) do nothing;

insert into public.product_media (
  product_id, provider, secure_url, alt, is_primary, sort_order
)
select p.id, 'legacy_static',
  'https://placehold.co/600x600/png?text=STAGING+QA',
  'STAGING QA placeholder image (4J5F, not a real product photo)', true, 0
from public.products p
where p.slug = 'staging-qa-publishable'
  and not exists (select 1 from public.product_media m where m.product_id = p.id);

-- ---------------------------------------------------------------------------
-- Parfums: blocked-by-missing-media (priced, categorized, no media — draft)
-- ---------------------------------------------------------------------------

insert into public.products (
  business_unit_id, slug, name, brand, short_description, sales_mode,
  production_status, availability_status, publication_status, verification_status
) values (
  '11111111-1111-4111-8111-111111111111', 'staging-qa-blocked-media',
  'STAGING QA — Bloqueado por Media', 'STAGING QA',
  '4J5F hosted QA fixture — priced and categorized, deliberately no media.',
  'always_available', 'active', 'available', 'draft', 'unknown'
)
on conflict (business_unit_id, slug) do nothing;

insert into public.product_categories (product_id, category_id)
select p.id, c.id
from public.products p, public.categories c
where p.slug = 'staging-qa-blocked-media' and c.slug = 'staging-qa-family'
  and p.business_unit_id = '11111111-1111-4111-8111-111111111111'
on conflict (product_id, category_id) do nothing;

insert into public.product_variants (
  product_id, variant_kind, size_ml, label, price_amount, currency,
  publication_status, price_verification_status
)
select p.id, 'decant', 5, '5 ml', 19.90, 'PEN', 'published', 'unknown'
from public.products p where p.slug = 'staging-qa-blocked-media'
on conflict (product_id, label) do nothing;

insert into public.inventory (product_variant_id, inventory_mode, availability_status)
select v.id, 'status_only', 'available'
from public.product_variants v
join public.products p on p.id = v.product_id
where p.slug = 'staging-qa-blocked-media' and v.label = '5 ml'
on conflict (product_variant_id) do nothing;

-- ---------------------------------------------------------------------------
-- Parfums: blocked-by-no-sellable-variant (categorized, media, zero variants)
-- ---------------------------------------------------------------------------

insert into public.products (
  business_unit_id, slug, name, brand, short_description, sales_mode,
  production_status, availability_status, publication_status, verification_status
) values (
  '11111111-1111-4111-8111-111111111111', 'staging-qa-blocked-variant',
  'STAGING QA — Bloqueado por Variante', 'STAGING QA',
  '4J5F hosted QA fixture — has media, deliberately zero variants/pricing.',
  'always_available', 'active', 'available', 'draft', 'unknown'
)
on conflict (business_unit_id, slug) do nothing;

insert into public.product_categories (product_id, category_id)
select p.id, c.id
from public.products p, public.categories c
where p.slug = 'staging-qa-blocked-variant' and c.slug = 'staging-qa-family'
  and p.business_unit_id = '11111111-1111-4111-8111-111111111111'
on conflict (product_id, category_id) do nothing;

insert into public.product_media (
  product_id, provider, secure_url, alt, is_primary, sort_order
)
select p.id, 'legacy_static',
  'https://placehold.co/600x600/png?text=STAGING+QA',
  'STAGING QA placeholder image (4J5F, not a real product photo)', true, 0
from public.products p
where p.slug = 'staging-qa-blocked-variant'
  and not exists (select 1 from public.product_media m where m.product_id = p.id);

-- ---------------------------------------------------------------------------
-- Parfums: archived/restorable
-- ---------------------------------------------------------------------------

insert into public.products (
  business_unit_id, slug, name, brand, short_description, sales_mode,
  production_status, availability_status, publication_status, verification_status,
  archived_at
) values (
  '11111111-1111-4111-8111-111111111111', 'staging-qa-archived',
  'STAGING QA — Archivado', 'STAGING QA',
  '4J5F hosted QA fixture — archived on creation for restore-flow QA.',
  'always_available', 'discontinued', 'available', 'archived', 'unknown',
  now()
)
on conflict (business_unit_id, slug) do nothing;

insert into public.product_variants (
  product_id, variant_kind, size_ml, label, price_amount, currency,
  publication_status, price_verification_status, archived_at
)
select p.id, 'decant', 5, '5 ml', 19.90, 'PEN', 'archived', 'unknown', now()
from public.products p where p.slug = 'staging-qa-archived'
on conflict (product_id, label) do nothing;

-- ---------------------------------------------------------------------------
-- Parfums: combo ready (client_confirmed) / combo incomplete (pending)
-- ---------------------------------------------------------------------------

insert into public.products (
  business_unit_id, slug, name, brand, short_description, sales_mode,
  production_status, availability_status, publication_status, verification_status
) values (
  '11111111-1111-4111-8111-111111111111', 'staging-qa-combo-ready',
  'STAGING QA — Combo Listo', 'STAGING QA',
  '4J5F hosted QA fixture — combo with confirmed composition.',
  'always_available', 'active', 'available', 'published', 'unknown'
)
on conflict (business_unit_id, slug) do nothing;

insert into public.combos (product_id, composition_verification_status)
select p.id, 'client_confirmed'
from public.products p where p.slug = 'staging-qa-combo-ready'
on conflict (product_id) do nothing;

insert into public.combo_items (combo_id, product_variant_id, quantity, sort_order)
select c.id, v.id, 1, 0
from public.combos c
join public.products cp on cp.id = c.product_id
cross join public.product_variants v
join public.products vp on vp.id = v.product_id
where cp.slug = 'staging-qa-combo-ready'
  and vp.slug = 'staging-qa-publishable' and v.label = '5 ml'
on conflict (combo_id, product_variant_id) do nothing;

insert into public.products (
  business_unit_id, slug, name, brand, short_description, sales_mode,
  production_status, availability_status, publication_status, verification_status
) values (
  '11111111-1111-4111-8111-111111111111', 'staging-qa-combo-pending',
  'STAGING QA — Combo Pendiente', 'STAGING QA',
  '4J5F hosted QA fixture — combo composition not yet confirmed.',
  'always_available', 'active', 'available', 'draft', 'unknown'
)
on conflict (business_unit_id, slug) do nothing;

insert into public.combos (product_id, composition_verification_status)
select p.id, 'pending_reconfirmation'
from public.products p where p.slug = 'staging-qa-combo-pending'
on conflict (product_id) do nothing;

-- ---------------------------------------------------------------------------
-- Import: three isolated QA campaigns exercising draft/open/closed lifecycle.
-- Numbers 9001-9003 can never collide with a real consolidado (low
-- sequential integers). The real campaign #6 ("Sexto Consolidado") is never
-- read from or written to by this file.
-- ---------------------------------------------------------------------------

insert into public.campaigns (business_unit_id, number, name, status)
values (
  '22222222-2222-4222-8222-222222222222', 9001, 'STAGING QA — Draft', 'draft'
)
on conflict (business_unit_id, number) do nothing;

insert into public.campaigns (business_unit_id, number, name, status, opens_at, closes_at)
values (
  '22222222-2222-4222-8222-222222222222', 9002, 'STAGING QA — Open', 'open',
  now() - interval '1 day', now() + interval '6 days'
)
on conflict (business_unit_id, number) do nothing;

insert into public.campaigns (business_unit_id, number, name, status, opens_at, closes_at)
values (
  '22222222-2222-4222-8222-222222222222', 9003, 'STAGING QA — Closed', 'closed',
  now() - interval '10 days', now() - interval '3 days'
)
on conflict (business_unit_id, number) do nothing;

-- ---------------------------------------------------------------------------
-- Verification: one row per fixture, for the operator to confirm the apply.
-- ---------------------------------------------------------------------------

select 'parfums_category' as fixture, slug, publication_status::text as state
  from public.categories where slug = 'staging-qa-family'
union all
select 'parfums_product', slug, publication_status from public.products where slug like 'staging-qa-%'
union all
select 'import_campaign', number::text, status from public.campaigns where number in (9001, 9002, 9003)
order by 1, 2;
