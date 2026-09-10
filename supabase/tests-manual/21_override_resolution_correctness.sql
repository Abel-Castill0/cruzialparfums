-- Cruzial Platform V2 — 4J4B Override resolution correctness
-- Verifies the actual database state after loader apply.
-- All data comes from the loader's population; no fixtures needed.
-- Campaign resolved by natural identity (Import BU + number=6), not fixed UUID.
--
-- NOT run by `supabase test db`. This file lives outside supabase/tests/ on
-- purpose (4J4C): it asserts real population state (844 products / 898
-- campaign_products / 912 presentations), which makes it non-hermetic — a
-- plain `supabase db reset && supabase test db` never has that data, and
-- never should (population happens only through the explicit 4J4B loader,
-- never through migrations/seed). The same named-case regressions (Accento
-- split, Arabia Heroes split, GOS Rouge/Black XS/Miss Dior presentation
-- splits, Infrared reassociation, CDN Preciux IV no-offer) are proven
-- hermetically, with no DB, in
-- scripts/import-consolidado-4j4b.test.mjs ("override resolutions: named
-- split-identity and reassociation regressions"), which runs on every
-- `npm run check` via `npm run test:4j4b`.
--
-- Run this file manually, against LOCAL Supabase only, after populating
-- local data with the 4J4B loader:
--   node scripts/load-import-consolidado.mjs --target local --apply
--   docker exec -i supabase_db_cruzialparfums \
--     psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests-manual/21_override_resolution_correctness.sql
-- Never run the loader's --apply mode against --target staging outside the
-- documented staging population procedure.

begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

-- Resolve campaign ID by natural identity
-- (Import BU + number 6)

-- ── 1. Split products: Accento produces 2 distinct products ──

select is(
  (select count(*)::int from public.products where business_unit_id = '22222222-2222-4222-8222-222222222222' and slug like 'import-accento-%'),
  2,
  'split_canonical_source_identity: Accento produces 2 distinct products'
);

-- ── 2. Each Accento product has its own campaign_product ──

select is(
  (select count(*)::int from public.campaign_products cp
   join public.products p on cp.product_id = p.id
   where p.slug like 'import-accento-%'
     and cp.campaign_id = (select id from public.campaigns where business_unit_id = '22222222-2222-4222-8222-222222222222' and number = 6)),
  2,
  'split_canonical_source_identity: each Accento product has a campaign_product'
);

-- ── 3. Accento prices differ (S/710 and S/720) ──

select is(
  (select count(*)::int from public.campaign_products cp
   join public.products p on cp.product_id = p.id
   where p.slug like 'import-accento-%'
     and cp.campaign_id = (select id from public.campaigns where business_unit_id = '22222222-2222-4222-8222-222222222222' and number = 6)
     and cp.price_amount::numeric in (710.00, 720.00)),
  2,
  'split_canonical_source_identity: Accento prices are S/710 and S/720'
);

-- ── 4. Arabia Heroes splits into 2 products ──

select is(
  (select count(*)::int from public.products where business_unit_id = '22222222-2222-4222-8222-222222222222' and slug like 'import-arabia-heroes-%'),
  2,
  'split_canonical_source_identity: Arabia Heroes produces 2 distinct products'
);

-- ── 5. GOS Rouge has 2 presentations ──

select is(
  (select count(*)::int from public.import_presentations ip
   join public.products p on ip.product_id = p.id
   where p.slug like 'import-gos-rouge-%'),
  2,
  'split_structural_presentations: GOS Rouge has 2 distinct presentations'
);

-- ── 6. GOS Rouge labels are correct ──

select ok(
  exists(select 1 from public.import_presentations ip
         join public.products p on ip.product_id = p.id
         where p.slug like 'import-gos-rouge-%' and ip.label = '100ml'),
  'split_structural_presentations: GOS Rouge has 100ml presentation'
);

select ok(
  exists(select 1 from public.import_presentations ip
         join public.products p on ip.product_id = p.id
         where p.slug like 'import-gos-rouge-%' and ip.label like 'Extrait%'),
  'split_structural_presentations: GOS Rouge has Extrait presentation'
);

-- ── 7. Black XS has EDT and EDP ──

select is(
  (select count(*)::int from public.import_presentations ip
   join public.products p on ip.product_id = p.id
   where p.slug like 'import-black-xs-%'),
  2,
  'split_structural_presentations: Black XS has EDT and EDP presentations'
);

-- ── 8. Miss Dior has Retail and Tester presentations ──

select is(
  (select count(*)::int from public.import_presentations ip
   join public.products p on ip.product_id = p.id
   where p.slug like 'import-miss-dior-%'),
  3,
  'split_structural_presentations: Miss Dior has 3 presentations (Retail, Tester, other)'
);

-- ── 9. Infrared EDP has EDP · 90ml presentation with S/330 ──

select is(
  (select cp.price_amount::numeric from public.campaign_products cp
   join public.products p on cp.product_id = p.id
   join public.import_presentations ip on cp.import_presentation_id = ip.id
   where p.name = 'Infrared EDP' and ip.label LIKE 'EDP%90ml'),
  330.00::numeric,
  'correct_source_block_association: Infrared EDP S/330 offer'
);

-- ── 10. CDN Preciux IV: has product but no campaign_product (all offers skipped) ──

select is(
  (select count(*)::int from public.campaign_products cp
   join public.products p on cp.product_id = p.id
   where p.slug like 'import-cdn-preciux-iv-%'),
  0,
  'omit_offer_pending_price_confirmation: CDN Preciux IV has 0 campaign_products'
);

-- ── 11. CDN Preciux IV: structure survives the skipped price conflict ──

select is(
  (select count(*)::int from public.import_presentations ip
   join public.products p on ip.product_id = p.id
   where p.slug like 'import-cdn-preciux-iv-%'),
  1,
  'omit_offer_pending_price_confirmation: CDN Preciux IV retains its 55ml presentation'
);

select ok(
  exists(select 1 from public.import_presentations ip
         join public.products p on ip.product_id = p.id
         where p.slug like 'import-cdn-preciux-iv-%' and ip.label = '55ml'),
  'omit_offer_pending_price_confirmation: CDN Preciux IV presentation is exactly 55ml'
);

-- ── 12. Total counts ──

select is(
  (select count(*)::int from public.products where business_unit_id = '22222222-2222-4222-8222-222222222222' and slug like 'import-%'),
  844,
  'global: 844 import products'
);

select is(
  (select count(*)::int from public.campaign_products
   where campaign_id = (select id from public.campaigns where business_unit_id = '22222222-2222-4222-8222-222222222222' and number = 6)),
  898,
  'global: 898 campaign products'
);

select is(
  (select count(*)::int from public.import_presentations ip
   join public.products p on p.id = ip.product_id
   where p.business_unit_id = '22222222-2222-4222-8222-222222222222' and p.slug like 'import-%'),
  912,
  'global: 912 structural import presentations'
);

-- ── 13. No null prices ──

select is(
  (select count(*)::int from public.campaign_products
   where campaign_id = (select id from public.campaigns where business_unit_id = '22222222-2222-4222-8222-222222222222' and number = 6)
     and price_amount is null),
  0,
  'global: no null prices'
);

-- ── 14. No null presentations ──

select is(
  (select count(*)::int from public.campaign_products
   where campaign_id = (select id from public.campaigns where business_unit_id = '22222222-2222-4222-8222-222222222222' and number = 6)
     and import_presentation_id is null),
  0,
  'global: no null presentations'
);

-- ── 15. No duplicate (campaign_id, product_id, import_presentation_id) ──

select is(
  (select count(*)::int from (
    select campaign_id, product_id, import_presentation_id, count(*) cnt
    from public.campaign_products
    group by campaign_id, product_id, import_presentation_id
    having count(*) > 1
  ) dups),
  0,
  'global: no duplicate campaign_products entries'
);

-- ── 16. All campaign_products reference valid products ──

select is(
  (select count(*)::int from public.campaign_products cp
   left join public.products p on cp.product_id = p.id
   where p.id is null
     and cp.campaign_id = (select id from public.campaigns where business_unit_id = '22222222-2222-4222-8222-222222222222' and number = 6)),
  0,
  'global: all campaign_products reference existing products'
);

select * from finish();
rollback;
