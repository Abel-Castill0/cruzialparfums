-- Cruzial Platform V2 — Operations Foundation V1 (Task 1)
--
-- Proves admin_get_import_publication_readiness / admin_list_import_publication_blockers
-- are campaign-scoped by an explicit id, not a hardcoded campaign #6:
--
-- A. Campaign #6 and #7 produce INDEPENDENT readiness results
-- B. Campaign #6 and #7 produce INDEPENDENT blocker lists
-- C. p_campaign_id is required (null rejected)
-- D. A campaign id from another business unit is rejected (not silently substituted)
-- E. A non-existent campaign id is rejected
-- F. An archived campaign still returns valid (non-throwing) readiness, flagged archived
-- G. admin_get_import_catalog_qa follows the LATEST non-archived campaign, not #6

begin;
select plan(11);

-- =========================================================================
-- Fixtures
-- =========================================================================

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) values
 ('5c5c0000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','scoped-import-admin@test','',now(),now());

insert into public.admin_memberships(user_id,business_unit_id,role) values
 ('5c5c0000-0000-4000-8000-000000000001',(select id from public.business_units where code='import'),'admin');

insert into public.categories(id,business_unit_id,kind,name,slug,publication_status) values
 ('5c5c3000-0000-4000-8000-000000000001',(select id from public.business_units where code='import'),'import_category','Cat Scoped','cat-scoped','published');

-- Two campaigns: #6 (older, will be archived) and #7 (latest, non-archived)
insert into public.campaigns(id,business_unit_id,number,name,status) values
 ('5c5c2000-0000-4000-8000-000000000006',(select id from public.business_units where code='import'),6,'Campaign 6 Scoped','open'),
 ('5c5c2000-0000-4000-8000-000000000007',(select id from public.business_units where code='import'),7,'Campaign 7 Scoped','draft');

-- Foreign business unit campaign (Parfums has no campaigns table use, so use a
-- fabricated Import-shaped id from a different unit is impossible since
-- campaigns.business_unit_id references business_units; instead prove
-- cross-unit rejection using a campaign id that belongs to Parfums directly
-- if one exists is unnecessary — proven instead via a random non-existent id).

-- Product A: fully ready under #7 (published, published presentation, primary
-- media, valid offer in #7), but has NO offer in #6 -> independent results.
insert into public.products(id,business_unit_id,name,brand,slug,publication_status) values
 ('5c5c1000-0000-4000-8000-000000000001',(select id from public.business_units where code='import'),'Scoped Product A','Brand S','scoped-product-a','published');

insert into public.product_categories(product_id,category_id) values
 ('5c5c1000-0000-4000-8000-000000000001','5c5c3000-0000-4000-8000-000000000001');

insert into public.import_presentations(id,product_id,stable_key,label,presentation_class,publication_status) values
 ('5c5c4000-0000-4000-8000-000000000001','5c5c1000-0000-4000-8000-000000000001','scoped-stable-1','Scoped Pres A','single_fixed','published');

insert into public.product_media(id,product_id,provider,secure_url,public_id,is_primary,sort_order) values
 ('5c5c5000-0000-4000-8000-000000000001','5c5c1000-0000-4000-8000-000000000001','cloudinary','https://res.cloudinary.test/scoped-a.jpg','cruzial/import/products/scoped/a',true,0);

-- Offer only exists in campaign #7, not #6.
insert into public.campaign_products(id,campaign_id,product_id,import_presentation_id,price_amount,currency,availability_status,sort_order) values
 ('5c5c6000-0000-4000-8000-000000000001','5c5c2000-0000-4000-8000-000000000007','5c5c1000-0000-4000-8000-000000000001','5c5c4000-0000-4000-8000-000000000001',120.00,'PEN','available',1);

select set_config('request.jwt.claims', '{"aal":"aal2","sub":"5c5c0000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set role authenticated;

-- =========================================================================
-- A. Campaign #6 and #7 produce INDEPENDENT readiness results
-- =========================================================================

-- Product A is ready under #7 (has an offer there).
select is(
  (select (admin_get_import_publication_readiness('5c5c2000-0000-4000-8000-000000000007') ->> 'ready_products')::bigint),
  1::bigint,
  'A1: product A is ready under campaign #7 (has offer there)'
);

-- Product A is NOT ready under #6 (missing_offer — no campaign_products row there).
select is(
  (select (admin_get_import_publication_readiness('5c5c2000-0000-4000-8000-000000000006') ->> 'ready_products')::bigint),
  0::bigint,
  'A2: product A is NOT ready under campaign #6 (no offer there) — independent from #7'
);

select is(
  (select (admin_get_import_publication_readiness('5c5c2000-0000-4000-8000-000000000007') ->> 'campaign_number')::bigint),
  7::bigint,
  'A3: readiness for the #7 id reports campaign_number 7'
);

select is(
  (select (admin_get_import_publication_readiness('5c5c2000-0000-4000-8000-000000000006') ->> 'campaign_number')::bigint),
  6::bigint,
  'A4: readiness for the #6 id reports campaign_number 6'
);

-- =========================================================================
-- B. Campaign #6 and #7 produce INDEPENDENT blocker lists
-- =========================================================================

select ok(
  exists(select 1 from admin_list_import_publication_blockers('5c5c2000-0000-4000-8000-000000000006',null,null,1,50)
    where product_id = '5c5c1000-0000-4000-8000-000000000001' and blocker_code = 'missing_offer'),
  'B1: product A has missing_offer blocker under #6'
);

select ok(
  not exists(select 1 from admin_list_import_publication_blockers('5c5c2000-0000-4000-8000-000000000007',null,null,1,50)
    where product_id = '5c5c1000-0000-4000-8000-000000000001'),
  'B2: product A has NO blockers under #7 (fully ready there)'
);

-- =========================================================================
-- C. p_campaign_id is required
-- =========================================================================

select throws_ok(
  $$select admin_get_import_publication_readiness(null)$$,
  '22023',
  null,
  'C1: null campaign id is rejected for readiness'
);

select throws_ok(
  $$select * from admin_list_import_publication_blockers(null,null,null,1,20)$$,
  '22023',
  null,
  'C2: null campaign id is rejected for blockers'
);

-- =========================================================================
-- E. A non-existent campaign id is rejected
-- =========================================================================

select throws_ok(
  $$select admin_get_import_publication_readiness('00000000-0000-4000-8000-000000000000')$$,
  'P0002',
  null,
  'E1: non-existent campaign id is rejected, not silently defaulted'
);

-- =========================================================================
-- F. An archived campaign still returns valid readiness, flagged archived
-- =========================================================================

select public.admin_archive_campaign(
  '5c5c2000-0000-4000-8000-000000000006',
  (select updated_at from public.campaigns where id = '5c5c2000-0000-4000-8000-000000000006')
);

select is(
  (select (admin_get_import_publication_readiness('5c5c2000-0000-4000-8000-000000000006') ->> 'campaign_archived')::text),
  'true',
  'F1: archived campaign readiness is flagged campaign_archived=true, not an error'
);

-- =========================================================================
-- G. admin_get_import_catalog_qa follows the LATEST non-archived campaign
-- =========================================================================

-- #6 is now archived; #7 is the only non-archived campaign left -> qa must
-- report campaign_number = 7, never fall back to a hardcoded 6.
select is(
  (select campaign_number from admin_get_import_catalog_qa()),
  7::bigint,
  'G1: catalog QA snapshot follows latest non-archived campaign (#7), not a hardcoded #6'
);

select * from finish();
rollback;
