-- Cruzial Platform V2 — Operations Foundation V1 (Codex P1 #2 correction)
--
-- Proves public_list_import_catalog stamps every row with the
-- campaign_id/campaign_number that produced it (same statement as the
-- offers, via the selected_campaign CTE) — the DB-side half of the fix for
-- the campaign/offer identity race the repository layer (see
-- public-import-repository.test.ts) now guards against:
--
-- A. Every catalog row's campaign_id matches the actual open campaign
--    (public_get_import_current_campaign's id), not a hardcoded/guessed one.
-- B. When the eligible campaign changes, the catalog rows' campaign_id
--    changes with it — proving it is read live, not cached/coincidental.
-- C. public_get_import_product still returns campaign_id from the same
--    query as the product offer data (must not regress — Codex explicitly
--    flagged this as already-correct and to be preserved).

begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into public.categories (id, business_unit_id, kind, slug, name, publication_status, sort_order) values
  ('37370000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'import_category', 'cat-37', 'Cat 37', 'published', 1);

insert into public.products (id, business_unit_id, slug, name, brand, publication_status) values
  ('37371000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', '37-product-a', 'Product A 37', 'Brand', 'published');

insert into public.product_categories (product_id, category_id) values
  ('37371000-0000-4000-8000-000000000001', '37370000-0000-4000-8000-000000000001');

insert into public.import_presentations (id, product_id, stable_key, label, presentation_class, capacity_ml, publication_status) values
  ('37372000-0000-4000-8000-000000000001', '37371000-0000-4000-8000-000000000001', '100', '100 ml', 'single_fixed', 100, 'published');

-- Two campaigns, both eligible one at a time (never both open — the public
-- selector fails closed on >1 eligible open campaign, per test 24).
insert into public.campaigns (id, business_unit_id, number, name, status, opens_at, closes_at) values
  ('37373000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 961, '37 Campaign A', 'open', now() - interval '1 day', now() + interval '1 day'),
  ('37373000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 962, '37 Campaign B', 'draft', null, null);

insert into public.campaign_products (campaign_id, product_id, import_presentation_id, price_amount, availability_status, sort_order) values
  ('37373000-0000-4000-8000-000000000001', '37371000-0000-4000-8000-000000000001', '37372000-0000-4000-8000-000000000001', 150, 'available', 1),
  ('37373000-0000-4000-8000-000000000002', '37371000-0000-4000-8000-000000000001', '37372000-0000-4000-8000-000000000001', 175, 'available', 1);

-- =========================================================================
-- A. Catalog rows carry the actual open campaign's identity
-- =========================================================================

set local role anon;

select is(
  (select campaign_id from public.public_list_import_catalog()),
  (select id from public.public_get_import_current_campaign()),
  'A1: catalog row campaign_id matches the current open campaign (A)'
);

select is(
  (select campaign_number from public.public_list_import_catalog()),
  961,
  'A2: catalog row campaign_number matches campaign A''s number'
);

reset role;

-- =========================================================================
-- B. Rollover: switch which campaign is open — rows follow live, not cached
-- =========================================================================

update public.campaigns set status = 'draft' where id = '37373000-0000-4000-8000-000000000001';
update public.campaigns set status = 'open', opens_at = now() - interval '1 day', closes_at = now() + interval '1 day'
  where id = '37373000-0000-4000-8000-000000000002';

set local role anon;

select is(
  (select campaign_id from public.public_list_import_catalog()),
  '37373000-0000-4000-8000-000000000002'::uuid,
  'B1: after rollover, catalog row campaign_id follows the NEW open campaign (B)'
);

select is(
  (select campaign_number from public.public_list_import_catalog()),
  962,
  'B2: after rollover, catalog row campaign_number is B''s number, not stale A'
);

select isnt(
  (select campaign_id from public.public_list_import_catalog()),
  '37373000-0000-4000-8000-000000000001'::uuid,
  'B3: catalog row is never stamped with the now-closed campaign A''s id'
);

reset role;

-- =========================================================================
-- C. public_get_import_product still sources campaign_id from the SAME
-- query as the product offer data — must not regress
-- =========================================================================

set local role anon;

select is(
  (select campaign_id from public.public_get_import_product('37-product-a')),
  (select id from public.public_get_import_current_campaign()),
  'C1: product detail campaign_id still matches the current open campaign (unregressed)'
);

reset role;

select * from finish();
rollback;
