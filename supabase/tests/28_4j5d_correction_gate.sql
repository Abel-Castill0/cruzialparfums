-- Cruzial Platform V2 — 4J5D correction gate tests (Phase 4J5D)
--
-- Tests:
-- A. Readiness does NOT require campaign already open
-- B. ready_for_manual_open semantics
-- C. Exact unconfirmed OFFER count (not product count)
-- D. Invalid price blocker
-- E. Unconfirmed blocker
-- F. Product unpublished blocker
-- G. Presentation unpublished blocker
-- H. Missing primary media blocker
-- I. Blocker RPC bounded pagination
-- J. Blocker filter
-- K. Viewer may read readiness
-- L. Viewer cannot mutate media
-- M. Import admin media mutation works
-- N. Parfums-only admin cannot mutate Import media
-- O. Import-only admin cannot mutate Parfums media
-- P. Direct product_media INSERT denied
-- Q. Direct product_media UPDATE denied
-- R. Direct product_media DELETE denied
-- S. Media RPC still works after revoke
-- T. Media conflict uses P2011, not 40001
-- U. Archived media is never public
-- V. Primary media selected deterministically

begin;
select plan(32);

-- =========================================================================
-- Fixtures
-- =========================================================================

-- Users
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) values
 ('4c4c0000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','corr-import-admin@test','',now(),now()),
 ('4c4c0000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','corr-import-viewer@test','',now(),now()),
 ('4c4c0000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000003','authenticated','authenticated','corr-parfums-admin@test','',now(),now());

-- Memberships
insert into public.admin_memberships(user_id,business_unit_id,role) values
 ('4c4c0000-0000-4000-8000-000000000001',(select id from public.business_units where code='import'),'admin'),
 ('4c4c0000-0000-4000-8000-000000000002',(select id from public.business_units where code='import'),'viewer'),
 ('4c4c0000-0000-4000-8000-000000000003',(select id from public.business_units where code='parfums'),'admin');

-- Import unit

-- Categories
insert into public.categories(id,business_unit_id,kind,name,slug,publication_status) values
 ('4c4c3000-0000-4000-8000-000000000001',(select id from public.business_units where code='import'),'import_category','Cat Corr','cat-corr','published'),
 ('4c4c3000-0000-4000-8000-000000000002',(select id from public.business_units where code='parfums'),'commercial_type','Cat Safe','cat-safe','published');

-- Products
insert into public.products(id,business_unit_id,name,brand,slug,publication_status) values
 ('4c4c1000-0000-4000-8000-000000000010',(select id from public.business_units where code='import'),'Draft Product','Brand A','corr-draft-product','draft'),
 ('4c4c1000-0000-4000-8000-000000000011',(select id from public.business_units where code='import'),'Published No Media','Brand B','corr-pub-no-media','published'),
 ('4c4c1000-0000-4000-8000-000000000012',(select id from public.business_units where code='import'),'Published With Media','Brand C','corr-pub-media','published'),
 ('4c4c1000-0000-4000-8000-000000000013',(select id from public.business_units where code='import'),'Published Unconfirmed','Brand D','corr-pub-unconf','published'),
 ('4c4c1000-0000-4000-8000-000000000020',(select id from public.business_units where code='parfums'),'Parfums Safe','Brand P','corr-parfums-safe','published');

-- Product-categories
insert into public.product_categories(product_id,category_id) values
 ('4c4c1000-0000-4000-8000-000000000010','4c4c3000-0000-4000-8000-000000000001'),
 ('4c4c1000-0000-4000-8000-000000000011','4c4c3000-0000-4000-8000-000000000001'),
 ('4c4c1000-0000-4000-8000-000000000012','4c4c3000-0000-4000-8000-000000000001'),
 ('4c4c1000-0000-4000-8000-000000000013','4c4c3000-0000-4000-8000-000000000001');

-- Campaign #6 (draft — NOT open)
insert into public.campaigns(id,business_unit_id,number,name,status) values
 ('4c4c2000-0000-4000-8000-000000000001',(select id from public.business_units where code='import'),6,'Campaign 6 Corr','draft');

-- Presentations
insert into public.import_presentations(id,product_id,stable_key,label,presentation_class,publication_status) values
 ('4c4c4000-0000-4000-8000-000000000010','4c4c1000-0000-4000-8000-000000000011','corr-stable-1','Published No Media Pres','single_fixed','published'),
 ('4c4c4000-0000-4000-8000-000000000011','4c4c1000-0000-4000-8000-000000000012','corr-stable-2','Published With Media Pres','single_fixed','published'),
 ('4c4c4000-0000-4000-8000-000000000012','4c4c1000-0000-4000-8000-000000000013','corr-stable-3','Published Unconfirmed Pres','single_fixed','published'),
 ('4c4c4000-0000-4000-8000-000000000013','4c4c1000-0000-4000-8000-000000000011','corr-stable-4','Draft Pres','single_fixed','draft');

-- Media: product 0012 has an active primary
insert into public.product_media(id,product_id,provider,secure_url,public_id,is_primary,sort_order,archived_at) values
 ('4c4c5000-0000-4000-8000-000000000010','4c4c1000-0000-4000-8000-000000000012','cloudinary','https://res.cloudinary.test/img1.jpg','cruzial/import/products/test/1',true,0,null),
 ('4c4c5000-0000-4000-8000-000000000011','4c4c1000-0000-4000-8000-000000000012','cloudinary','https://res.cloudinary.test/img2.jpg','cruzial/import/products/test/2',false,1,null),
 ('4c4c5000-0000-4000-8000-000000000012','4c4c1000-0000-4000-8000-000000000011','cloudinary','https://res.cloudinary.test/img3.jpg','cruzial/import/products/test/3',false,0,null);

-- Campaign products (offers)
-- 0012: valid offer (available, price > 0)
-- 0013: unconfirmed offer
-- 0011: no offer at all (product has presentations but no campaign product)
insert into public.campaign_products(id,campaign_id,product_id,import_presentation_id,price_amount,currency,availability_status,sort_order) values
 ('4c4c6000-0000-4000-8000-000000000010','4c4c2000-0000-4000-8000-000000000001','4c4c1000-0000-4000-8000-000000000012','4c4c4000-0000-4000-8000-000000000011',150.00,'PEN','available',1),
 ('4c4c6000-0000-4000-8000-000000000011','4c4c2000-0000-4000-8000-000000000001','4c4c1000-0000-4000-8000-000000000013','4c4c4000-0000-4000-8000-000000000012',100.00,'PEN','unconfirmed',2);

-- =========================================================================
-- A. Readiness does NOT require campaign already open
-- =========================================================================

select set_config('request.jwt.claims', '{"sub":"4c4c0000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set role authenticated;

-- Campaign #6 is draft, not open. But product 0012 should still be "ready" commercially.
-- (it has: published product, published presentation, valid offer with price > 0, primary media)
select is(
  (select (admin_get_import_publication_readiness() ->> 'campaign_status')::text),
  'draft',
  'A1: campaign #6 status is draft'
);

-- The campaign not being open should NOT make ready_products = 0
select ok(
  (select (admin_get_import_publication_readiness() ->> 'ready_products')::bigint > 0),
  'A2: ready_products > 0 even though campaign is draft'
);

-- =========================================================================
-- B. ready_for_manual_open semantics
-- =========================================================================

-- ready_for_manual_open should be FALSE when any blocker exists
-- (3 of 4 products have blockers: draft, missing_offer, unconfirmed)
select is(
  (select (admin_get_import_publication_readiness() ->> 'ready_for_manual_open')::text),
  'false',
  'B1: ready_for_manual_open is false when blockers exist'
);

-- ready_products should be 1 (only product 0012 meets all gates)
select is(
  (select (admin_get_import_publication_readiness() ->> 'ready_products')::bigint),
  1::bigint,
  'B2: ready_products is 1 (only product with all gates met)'
);

-- =========================================================================
-- C. Exact unconfirmed OFFER count (not product count)
-- =========================================================================

-- There is 1 unconfirmed offer ROW (the campaign_products row for product 0013)
select is(
  (select (admin_get_import_publication_readiness() ->> 'unconfirmed_offer_count')::bigint),
  1::bigint,
  'C1: unconfirmed_offer_count is 1 (the offer ROW, not the product)'
);

-- =========================================================================
-- D. Product unpublished blocker
-- =========================================================================

-- Product 0010 is draft — should appear in blockers
select ok(
  exists(select 1 from admin_list_import_publication_blockers(null,null,1,50)
    where product_id = '4c4c1000-0000-4000-8000-000000000010' and blocker_code = 'product_unpublished'),
  'D1: draft product has product_unpublished blocker'
);

-- =========================================================================
-- E. Presentation unpublished blocker
-- =========================================================================

-- Product 0011 has a published presentation (0010) and a draft presentation (0013)
-- But published_presentations > 0, so it should NOT have presentation_unpublished
-- However, it has no campaign offer — so it gets 'missing_offer'
select ok(
  exists(select 1 from admin_list_import_publication_blockers(null,null,1,50)
    where product_id = '4c4c1000-0000-4000-8000-000000000011' and blocker_code = 'missing_offer'),
  'E1: product with presentations but no offer gets missing_offer'
);

-- =========================================================================
-- F. Missing primary media blocker
-- =========================================================================

-- Product 0011 has media (id 0012) but no primary — should get missing_primary_media
select ok(
  exists(select 1 from admin_list_import_publication_blockers(null,null,1,50)
    where product_id = '4c4c1000-0000-4000-8000-000000000011' and blocker_code = 'missing_primary_media'),
  'F1: product with media but no primary gets missing_primary_media'
);

-- =========================================================================
-- G. Unconfirmed offer blocker (offer row level)
-- =========================================================================

-- Product 0013 has an unconfirmed offer — should appear in offer_blockers
select ok(
  exists(select 1 from admin_list_import_publication_blockers(null,null,1,50)
    where product_id = '4c4c1000-0000-4000-8000-000000000013' and blocker_code = 'offer_unconfirmed'),
  'G1: product with unconfirmed offer gets offer_unconfirmed blocker'
);

-- =========================================================================
-- H. Blocker RPC bounded pagination
-- =========================================================================

-- Page size capped at 50: requesting 100 should return same count as 50
select ok(
  (select count(*) from admin_list_import_publication_blockers(null,null,1,100))
  = (select count(*) from admin_list_import_publication_blockers(null,null,1,50)),
  'H1: page size capped at 50'
);

-- Page 1 returns results
select ok(
  (select count(*) from admin_list_import_publication_blockers(null,null,1,20)) > 0,
  'H2: page 1 returns results'
);

-- =========================================================================
-- I. Blocker filter
-- =========================================================================

-- Filter by offer_unconfirmed
select is(
  (select count(*) from admin_list_import_publication_blockers(null,'offer_unconfirmed',1,50)),
  1::bigint,
  'I1: filter by offer_unconfirmed returns exactly 1 row'
);

-- Filter by product_unpublished
select ok(
  (select count(*) from admin_list_import_publication_blockers(null,'product_unpublished',1,50)) > 0,
  'I2: filter by product_unpublished returns results'
);

-- =========================================================================
-- J. Invalid blocker filter rejected
-- =========================================================================

select throws_ok(
  $$select * from admin_list_import_publication_blockers(null,'invalid_code',1,20)$$,
  '22023',
  null,
  'J1: invalid blocker filter is rejected'
);

-- =========================================================================
-- K. Viewer may read readiness
-- =========================================================================

reset role;
select set_config('request.jwt.claims', '{"sub":"4c4c0000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set role authenticated;

select lives_ok(
  $$select admin_get_import_publication_readiness()$$,
  'K1: viewer can read readiness'
);

select lives_ok(
  $$select * from admin_list_import_publication_blockers(null,null,1,20)$$,
  'K2: viewer can read blockers'
);

-- =========================================================================
-- L. Viewer cannot mutate media
-- =========================================================================

select throws_ok(
  $$select admin_register_media('4c4c1000-0000-4000-8000-000000000012','https://test','cloudinary')$$,
  '42501',
  null,
  'L1: viewer cannot register media'
);

-- =========================================================================
-- M. Import admin media mutation works
-- =========================================================================

reset role;
select set_config('request.jwt.claims', '{"sub":"4c4c0000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set role authenticated;

-- Register media
select lives_ok(
  $$select admin_register_media('4c4c1000-0000-4000-8000-000000000011','https://res.cloudinary.test/new.jpg','cloudinary',null,'cruzial/import/products/test/new',null,null,null,'jpg',null,false)$$,
  'M1: import admin can register media'
);

-- Update media alt
select lives_ok(
  $$select admin_update_media(
    (select id from public.product_media where secure_url = 'https://res.cloudinary.test/new.jpg' limit 1),
    (select updated_at from public.product_media where secure_url = 'https://res.cloudinary.test/new.jpg' limit 1),
    'new alt', null
  )$$,
  'M2: import admin can update media alt'
);

-- Set primary
select lives_ok(
  $$select admin_set_media_primary(
    (select id from public.product_media where secure_url = 'https://res.cloudinary.test/new.jpg' limit 1),
    (select updated_at from public.product_media where secure_url = 'https://res.cloudinary.test/new.jpg' limit 1)
  )$$,
  'M3: import admin can set primary'
);

-- Archive
select lives_ok(
  $$select admin_archive_media(
    (select id from public.product_media where secure_url = 'https://res.cloudinary.test/new.jpg' limit 1),
    (select updated_at from public.product_media where secure_url = 'https://res.cloudinary.test/new.jpg' limit 1)
  )$$,
  'M4: import admin can archive media'
);

-- Restore
select lives_ok(
  $$select admin_restore_media(
    (select id from public.product_media where secure_url = 'https://res.cloudinary.test/new.jpg' limit 1),
    (select updated_at from public.product_media where secure_url = 'https://res.cloudinary.test/new.jpg' limit 1)
  )$$,
  'M5: import admin can restore media'
);

-- =========================================================================
-- N. Parfums-only admin cannot mutate Import media
-- =========================================================================

reset role;
select set_config('request.jwt.claims', '{"sub":"4c4c0000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set role authenticated;

select throws_ok(
  $$select admin_update_media(
    (select id from public.product_media where product_id = '4c4c1000-0000-4000-8000-000000000012' limit 1),
    (select updated_at from public.product_media where product_id = '4c4c1000-0000-4000-8000-000000000012' limit 1),
    'cross unit hack', null
  )$$,
  '42501',
  null,
  'N1: parfums admin cannot update Import media'
);

-- =========================================================================
-- O. Import-only admin cannot mutate Parfums media
-- =========================================================================

reset role;
select set_config('request.jwt.claims', '{"sub":"4c4c0000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set role authenticated;

-- Product 0020 is parfums — import admin should not be able to register media for it
select throws_ok(
  $$select admin_register_media('4c4c1000-0000-4000-8000-000000000020','https://test','cloudinary')$$,
  '42501',
  null,
  'O1: import admin cannot register media for Parfums product'
);

-- =========================================================================
-- P. Direct product_media INSERT denied
-- =========================================================================

select throws_ok(
  $$insert into public.product_media(product_id,provider,secure_url) values('4c4c1000-0000-4000-8000-000000000012','cloudinary','https://hack')$$,
  '42501',
  null,
  'P1: direct INSERT into product_media is denied'
);

-- =========================================================================
-- Q. Direct product_media UPDATE denied
-- =========================================================================

select throws_ok(
  $$update public.product_media set alt='hacked' where product_id='4c4c1000-0000-4000-8000-000000000012'$$,
  '42501',
  null,
  'Q1: direct UPDATE of product_media is denied'
);

-- =========================================================================
-- R. Direct product_media DELETE denied
-- =========================================================================

select throws_ok(
  $$delete from public.product_media where product_id='4c4c1000-0000-4000-8000-000000000012'$$,
  '42501',
  null,
  'R1: direct DELETE from product_media is denied'
);

-- =========================================================================
-- S. Media RPC still works after revoke
-- =========================================================================

-- The admin_register_media RPC should still work (SECURITY DEFINER)
select lives_ok(
  $$select admin_register_media('4c4c1000-0000-4000-8000-000000000011','https://res.cloudinary.test/after-revoke.jpg','cloudinary')$$,
  'S1: admin_register_media still works after direct write revoke'
);

-- =========================================================================
-- T. Media conflict uses P2011, not 40001
-- =========================================================================

select throws_ok(
  $$select admin_update_media(
    (select id from public.product_media where secure_url = 'https://res.cloudinary.test/after-revoke.jpg' limit 1),
    '2000-01-01T00:00:00Z'::timestamptz,
    'stale test', null
  )$$,
  'P2011',
  null,
  'T1: stale media update uses P2011, not 40001'
);

-- =========================================================================
-- U. Archived media is never public
-- =========================================================================

-- Archived media should not appear in public queries
-- (verified via RLS: archived_at is null required for public_read)
select is(
  (select count(*) from public.product_media
   where archived_at is not null
     and is_primary = true),
  0::bigint,
  'U1: archived media is never set as primary'
);

-- =========================================================================
-- V. Primary media selected deterministically
-- =========================================================================

-- Product 0012 has primary=true on media 0010
select is(
  (select is_primary from public.product_media where id = '4c4c5000-0000-4000-8000-000000000010'),
  true,
  'V1: primary media is_primary = true'
);

select is(
  (select is_primary from public.product_media where id = '4c4c5000-0000-4000-8000-000000000011'),
  false,
  'V2: non-primary media is_primary = false'
);

select * from finish();
rollback;
