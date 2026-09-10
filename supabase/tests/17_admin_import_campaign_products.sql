-- Cruzial Platform V2 — Admin Import: Campaign Products / Prices /
-- Availability (Phase 4J2)
--
-- Exercises 20260909020000_admin_import_campaign_products.sql:
-- admin_set_campaign_products full-replace, referential guards (cross-unit
-- product, archived product/variant, variant/product mismatch), Import-unit
-- scoping identical to the 4J1 correction, optimistic concurrency on the
-- parent campaign, archived-campaign rejection, audit, and role/unit
-- isolation.

begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('88880000-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'import-admin-4j2@example.test', '', now(), now()),
  ('88880000-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'import-viewer-4j2@example.test', '', now(), now()),
  ('88880000-cccc-4ccc-8ccc-cccccccccccc', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'parfums-only-admin-4j2@example.test', '', now(), now());

insert into public.admin_memberships (user_id, business_unit_id, role) values
  ('88880000-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'admin'),
  ('88880000-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'viewer'),
  ('88880000-cccc-4ccc-8ccc-cccccccccccc', '11111111-1111-4111-8111-111111111111', 'admin');

-- Fixtures: one Import product with a variant, one Parfums product (cross-
-- unit rejection), one archived Import product, an Import product with an
-- archived variant, and two campaigns (draft + open).
insert into public.products (id, business_unit_id, slug, name, publication_status) values
  ('88881000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'cp-import-product', 'CP Import Product', 'draft'),
  ('88881000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'cp-parfums-product', 'CP Parfums Product', 'draft'),
  ('88881000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', 'cp-import-archived', 'CP Import Archived', 'draft');
update public.products set archived_at = now() where id = '88881000-0000-4000-8000-000000000003';

insert into public.product_variants (id, product_id, variant_kind, label, price_amount) values
  ('88882000-0000-4000-8000-000000000001', '88881000-0000-4000-8000-000000000001', 'bottle', 'CP Variant Active', 100),
  ('88882000-0000-4000-8000-000000000002', '88881000-0000-4000-8000-000000000001', 'bottle', 'CP Variant Archived', 100);
update public.product_variants set archived_at = now() where id = '88882000-0000-4000-8000-000000000002';

insert into public.campaigns (id, business_unit_id, number, name, status) values
  ('88883000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 801, 'CP Draft Campaign', 'draft');
insert into public.campaigns (id, business_unit_id, number, name, status, archived_at) values
  ('88883000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 802, 'CP Archived Campaign', 'draft', now());

-- ---------------------------------------------------------------------------
-- Create: Import admin sets the full line-item set
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"88880000-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
select lives_ok(
  $$select public.admin_set_campaign_products(
      '88883000-0000-4000-8000-000000000001',
      (select updated_at from public.campaigns where id = '88883000-0000-4000-8000-000000000001'),
      '[{"product_id":"88881000-0000-4000-8000-000000000001","product_variant_id":"88882000-0000-4000-8000-000000000001","price_amount":45,"availability_status":"available","sort_order":0}]'::jsonb)$$,
  'Import admin sets campaign_products for their own campaign'
);
reset role;

select is(
  (select count(*)::integer from public.campaign_products where campaign_id = '88883000-0000-4000-8000-000000000001'),
  1, 'one campaign_products row now exists'
);
select is(
  (select price_amount from public.campaign_products where campaign_id = '88883000-0000-4000-8000-000000000001'),
  45.00, 'price_amount was written as submitted'
);
select is(
  (select currency from public.campaign_products where campaign_id = '88883000-0000-4000-8000-000000000001'),
  'PEN', 'currency is always PEN, never client-supplied'
);
select is(
  (select action from public.audit_log where entity_type = 'campaign' and action = 'composition_update' order by created_at desc limit 1),
  'composition_update', 'the replace is audited as composition_update'
);
select is(
  (select actor_user_id from public.audit_log where entity_type = 'campaign' and action = 'composition_update' order by created_at desc limit 1),
  '88880000-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 'audit actor is the real auth.uid'
);

-- ---------------------------------------------------------------------------
-- Full replace: a second call with a different set REPLACES, not appends
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"88880000-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
select lives_ok(
  $$select public.admin_set_campaign_products(
      '88883000-0000-4000-8000-000000000001',
      (select updated_at from public.campaigns where id = '88883000-0000-4000-8000-000000000001'),
      '[{"product_id":"88881000-0000-4000-8000-000000000001","price_amount":60,"availability_status":"out_of_stock","quantity_limit":3,"sort_order":0}]'::jsonb)$$,
  'a second call with a different item set replaces the first'
);
reset role;

select is(
  (select count(*)::integer from public.campaign_products where campaign_id = '88883000-0000-4000-8000-000000000001'),
  1, 'still exactly one row after replace (old row removed, not appended)'
);
select is(
  (select product_variant_id from public.campaign_products where campaign_id = '88883000-0000-4000-8000-000000000001'),
  null, 'the replacement item has no variant (product-level line item)'
);
select is(
  (select availability_status from public.campaign_products where campaign_id = '88883000-0000-4000-8000-000000000001'),
  'out_of_stock', 'availability_status was updated by the replace'
);
select is(
  (select quantity_limit from public.campaign_products where campaign_id = '88883000-0000-4000-8000-000000000001'),
  3, 'quantity_limit was written'
);

-- ---------------------------------------------------------------------------
-- Referential guards
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"88880000-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
select throws_ok(
  $$select public.admin_set_campaign_products(
      '88883000-0000-4000-8000-000000000001',
      (select updated_at from public.campaigns where id = '88883000-0000-4000-8000-000000000001'),
      '[{"product_id":"88881000-0000-4000-8000-000000000002","price_amount":10,"sort_order":0}]'::jsonb)$$,
  'P2004', null, 'a Parfums-owned product cannot be added to an Import campaign'
);
select throws_ok(
  $$select public.admin_set_campaign_products(
      '88883000-0000-4000-8000-000000000001',
      (select updated_at from public.campaigns where id = '88883000-0000-4000-8000-000000000001'),
      '[{"product_id":"88881000-0000-4000-8000-000000000003","price_amount":10,"sort_order":0}]'::jsonb)$$,
  '22023', null, 'an archived product cannot be added'
);
select throws_ok(
  $$select public.admin_set_campaign_products(
      '88883000-0000-4000-8000-000000000001',
      (select updated_at from public.campaigns where id = '88883000-0000-4000-8000-000000000001'),
      '[{"product_id":"88881000-0000-4000-8000-000000000001","product_variant_id":"88882000-0000-4000-8000-000000000002","price_amount":10,"sort_order":0}]'::jsonb)$$,
  '22023', null, 'an archived variant cannot be added'
);
select throws_ok(
  $$select public.admin_set_campaign_products(
      '88883000-0000-4000-8000-000000000001',
      (select updated_at from public.campaigns where id = '88883000-0000-4000-8000-000000000001'),
      '[{"product_id":"88881000-0000-4000-8000-000000000001","product_variant_id":"88882000-0000-4000-8000-000000000001","price_amount":-5,"sort_order":0}]'::jsonb)$$,
  '23514', null, 'a negative price is rejected by the table check constraint'
);
select is(
  (select count(*)::integer from public.campaign_products where campaign_id = '88883000-0000-4000-8000-000000000001'),
  1, 'still exactly one row after every rejected call above (no partial writes)'
);

-- ---------------------------------------------------------------------------
-- Concurrency: stale expected_updated_at rejected
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"88880000-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
select throws_ok(
  $$select public.admin_set_campaign_products(
      '88883000-0000-4000-8000-000000000001',
      '2000-01-01T00:00:00Z',
      '[{"product_id":"88881000-0000-4000-8000-000000000001","price_amount":10,"sort_order":0}]'::jsonb)$$,
  '40001', null, 'a stale expected_updated_at is rejected without silent overwrite'
);
reset role;

-- ---------------------------------------------------------------------------
-- Archived campaign cannot have its products edited
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"88880000-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
select throws_ok(
  $$select public.admin_set_campaign_products(
      '88883000-0000-4000-8000-000000000002',
      (select updated_at from public.campaigns where id = '88883000-0000-4000-8000-000000000002'),
      '[{"product_id":"88881000-0000-4000-8000-000000000001","price_amount":10,"sort_order":0}]'::jsonb)$$,
  'P2007', null, 'an archived campaign cannot have its products edited'
);
reset role;

-- ---------------------------------------------------------------------------
-- Cross-unit RPC scope (same posture as the 4J1 correction)
-- ---------------------------------------------------------------------------

insert into public.campaigns (id, business_unit_id, number, name, status)
values ('88883000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 803, 'CP Parfums Campaign', 'draft');

-- The unit check runs before app.assert_admin_for (same ordering as
-- admin_update_campaign after the 4J1 correction), so a Parfums admin
-- pointed at a Parfums-owned campaign hits "not found" (P0002), not
-- "forbidden" (42501) — the RPC never gets far enough to evaluate whether
-- the caller administers Import at all, because the campaign itself is
-- already rejected as not-Import.
set local role authenticated;
set local request.jwt.claims to '{"sub":"88880000-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}';
select throws_ok(
  $$select public.admin_set_campaign_products(
      '88883000-0000-4000-8000-000000000003',
      (select updated_at from public.campaigns where id = '88883000-0000-4000-8000-000000000003'),
      '[]'::jsonb)$$,
  'P0002', null, 'a Parfums admin cannot reach a Parfums-owned campaign through the Import-scoped campaign_products RPC either'
);
reset role;

-- Pointed at a genuinely Import campaign instead, the same Parfums-only
-- admin now clears the unit-match check and is correctly rejected by
-- app.assert_admin_for (42501) — proving that branch is still reachable and
-- still enforced, not just shadowed by the P0002 check above.
set local role authenticated;
set local request.jwt.claims to '{"sub":"88880000-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}';
select throws_ok(
  $$select public.admin_set_campaign_products(
      '88883000-0000-4000-8000-000000000001',
      (select updated_at from public.campaigns where id = '88883000-0000-4000-8000-000000000001'),
      '[]'::jsonb)$$,
  '42501', null, 'a Parfums-only admin cannot mutate a genuinely Import campaign''s products'
);
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"88880000-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
select throws_ok(
  $$select public.admin_set_campaign_products(
      '88883000-0000-4000-8000-000000000003',
      (select updated_at from public.campaigns where id = '88883000-0000-4000-8000-000000000003'),
      '[]'::jsonb)$$,
  'P0002', null, 'an Import admin cannot reach a genuinely Parfums-owned campaign through this RPC either'
);
reset role;

-- ---------------------------------------------------------------------------
-- Role isolation
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"88880000-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}';
select throws_ok(
  $$select public.admin_set_campaign_products(
      '88883000-0000-4000-8000-000000000001',
      (select updated_at from public.campaigns where id = '88883000-0000-4000-8000-000000000001'),
      '[]'::jsonb)$$,
  '42501', null, 'Import viewer cannot mutate campaign_products'
);
reset role;

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select throws_ok(
  $$select public.admin_set_campaign_products(
      '88883000-0000-4000-8000-000000000001',
      now(),
      '[]'::jsonb)$$,
  '42501', null, 'anonymous cannot execute admin_set_campaign_products'
);
reset role;

-- ---------------------------------------------------------------------------
-- Direct table write is still closed (Phase 4J1 posture, unchanged by 4J2)
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"88880000-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
select throws_ok(
  $$update public.campaign_products set price_amount = price_amount where campaign_id = '88883000-0000-4000-8000-000000000001'$$,
  '42501', null, 'direct UPDATE on campaign_products is still denied — 4J2 only added the audited RPC'
);
reset role;

-- ---------------------------------------------------------------------------
-- Empty replace clears the set (admin removes the last product)
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"88880000-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
select lives_ok(
  $$select public.admin_set_campaign_products(
      '88883000-0000-4000-8000-000000000001',
      (select updated_at from public.campaigns where id = '88883000-0000-4000-8000-000000000001'),
      '[]'::jsonb)$$,
  'an empty array clears the campaign''s products'
);
reset role;
select is(
  (select count(*)::integer from public.campaign_products where campaign_id = '88883000-0000-4000-8000-000000000001'),
  0, 'zero campaign_products rows remain after an empty replace'
);

select * from finish();
rollback;
