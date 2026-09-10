-- Cruzial Platform V2 — 4J4B Override resolution correctness
-- Verifies the actual database state after loader apply.
-- All data comes from the loader's population; no fixtures needed.

begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

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
   where p.slug like 'import-accento-%' and cp.campaign_id = 'aa400000-0000-4000-8000-000000000006'),
  2,
  'split_canonical_source_identity: each Accento product has a campaign_product'
);

-- ── 3. Accento prices differ (S/710 and S/720) ──

select is(
  (select count(*)::int from public.campaign_products cp
   join public.products p on cp.product_id = p.id
   where p.slug like 'import-accento-%' and cp.campaign_id = 'aa400000-0000-4000-8000-000000000006'
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

-- ── 8. Miss Dior has Retail and Tester ──

select is(
  (select count(*)::int from public.import_presentations ip
   join public.products p on ip.product_id = p.id
   where p.slug like 'import-miss-dior-%'),
  2,
  'split_structural_presentations: Miss Dior has Retail and Tester presentations'
);

-- ── 9. Infrared EDP has EDP · 90ml presentation with S/330 ──

select is(
  (select cp.price_amount::numeric from public.campaign_products cp
   join public.products p on cp.product_id = p.id
   join public.import_presentations ip on cp.import_presentation_id = ip.id
   where p.name = 'Infrared EDP' and ip.label = 'EDP · 90ml'),
  330.00::numeric,
  'correct_source_block_association: Infrared EDP S/330 offer'
);

-- ── 10. CDN Preciux IV: has product and presentation but no campaign_product ──

select is(
  (select count(*)::int from public.campaign_products cp
   join public.products p on cp.product_id = p.id
   where p.slug like 'import-cdn-preciux-iv-%'),
  0,
  'omit_offer_pending_price_confirmation: CDN Preciux IV has 0 campaign_products'
);

-- ── 12. CDN Preciux IV: product exists but no presentation (all offers skipped) ──

select is(
  (select count(*)::int from public.import_presentations ip
   join public.products p on ip.product_id = p.id
   where p.slug like 'import-cdn-preciux-iv-%'),
  0,
  'omit_offer_pending_price_confirmation: CDN Preciux IV has no presentation (all offers skipped)'
);

-- ── 12. Total counts ──

select is(
  (select count(*)::int from public.products where business_unit_id = '22222222-2222-4222-8222-222222222222' and slug like 'import-%'),
  844,
  'global: 844 import products'
);

select is(
  (select count(*)::int from public.campaign_products where campaign_id = 'aa400000-0000-4000-8000-000000000006'),
  898,
  'global: 898 campaign products'
);

-- ── 13. No null prices ──

select is(
  (select count(*)::int from public.campaign_products where campaign_id = 'aa400000-0000-4000-8000-000000000006' and price_amount is null),
  0,
  'global: no null prices'
);

-- ── 14. No null presentations ──

select is(
  (select count(*)::int from public.campaign_products where campaign_id = 'aa400000-0000-4000-8000-000000000006' and import_presentation_id is null),
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
   where p.id is null and cp.campaign_id = 'aa400000-0000-4000-8000-000000000006'),
  0,
  'global: all campaign_products reference existing products'
);

select * from finish();
rollback;
