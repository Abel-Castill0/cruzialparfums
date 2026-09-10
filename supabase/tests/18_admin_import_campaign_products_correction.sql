-- Cruzial Platform V2 — Admin Import: 4J2 correctness correction
--
-- Exercises 20260909030000_admin_import_campaign_products_correction.sql:
--   1. admin_set_campaign_products fail-closed availability_status
--   2. admin_set_campaign_products exact-decimal price_amount syntax guard
--   3. admin_set_campaign_products quantity_limit preservation across a
--      full-replace (existing value survives; new association is null)
--   4. admin_duplicate_campaign — draft destination, exact copy, atomicity,
--      bounded audit, authorization, wrong-unit source, number/name input
--      validation.

begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('88890000-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'import-admin-4j2c@example.test', '', now(), now()),
  ('88890000-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'import-viewer-4j2c@example.test', '', now(), now()),
  ('88890000-cccc-4ccc-8ccc-cccccccccccc', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'parfums-only-admin-4j2c@example.test', '', now(), now());

insert into public.admin_memberships (user_id, business_unit_id, role) values
  ('88890000-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'admin'),
  ('88890000-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'viewer'),
  ('88890000-cccc-4ccc-8ccc-cccccccccccc', '11111111-1111-4111-8111-111111111111', 'admin');

insert into public.products (id, business_unit_id, slug, name, publication_status) values
  ('88891000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'cpc-import-product-a', 'CPC Import Product A', 'draft'),
  ('88891000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'cpc-import-product-b', 'CPC Import Product B', 'draft');

insert into public.campaigns (id, business_unit_id, number, name, status) values
  ('88893000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 811, 'CPC Source Campaign', 'draft'),
  ('88893000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 812, 'CPC Parfums Campaign', 'draft');

-- ---------------------------------------------------------------------------
-- Availability — fail closed
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"88890000-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
select throws_ok(
  $$select public.admin_set_campaign_products(
      '88893000-0000-4000-8000-000000000001',
      (select updated_at from public.campaigns where id = '88893000-0000-4000-8000-000000000001'),
      '[{"product_id":"88891000-0000-4000-8000-000000000001","price_amount":"16.00","sort_order":0}]'::jsonb)$$,
  'P2008', null, 'a missing availability_status is rejected, never defaulted to available'
);
select throws_ok(
  $$select public.admin_set_campaign_products(
      '88893000-0000-4000-8000-000000000001',
      (select updated_at from public.campaigns where id = '88893000-0000-4000-8000-000000000001'),
      '[{"product_id":"88891000-0000-4000-8000-000000000001","price_amount":"16.00","availability_status":"on_backorder","sort_order":0}]'::jsonb)$$,
  'P2008', null, 'an unsupported availability_status is rejected, never defaulted to available'
);
select is(
  (select count(*)::integer from public.campaign_products where campaign_id = '88893000-0000-4000-8000-000000000001'),
  0, 'no row was written by either rejected fail-closed call'
);
reset role;

-- ---------------------------------------------------------------------------
-- Exact decimal money — syntax guard (defense in depth; app layer already
-- validates, but this RPC is independently callable)
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"88890000-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
select throws_ok(
  $$select public.admin_set_campaign_products(
      '88893000-0000-4000-8000-000000000001',
      (select updated_at from public.campaigns where id = '88893000-0000-4000-8000-000000000001'),
      '[{"product_id":"88891000-0000-4000-8000-000000000001","price_amount":"16.555","availability_status":"available","sort_order":0}]'::jsonb)$$,
  'P2009', null, 'more than 2 decimals is rejected'
);
select throws_ok(
  $$select public.admin_set_campaign_products(
      '88893000-0000-4000-8000-000000000001',
      (select updated_at from public.campaigns where id = '88893000-0000-4000-8000-000000000001'),
      '[{"product_id":"88891000-0000-4000-8000-000000000001","price_amount":"abc","availability_status":"available","sort_order":0}]'::jsonb)$$,
  'P2009', null, 'a malformed price string is rejected'
);
select lives_ok(
  $$select public.admin_set_campaign_products(
      '88893000-0000-4000-8000-000000000001',
      (select updated_at from public.campaigns where id = '88893000-0000-4000-8000-000000000001'),
      '[{"product_id":"88891000-0000-4000-8000-000000000001","price_amount":"0.00","availability_status":"available","sort_order":0}]'::jsonb)$$,
  'a zero price ("0.00") is accepted'
);
reset role;
select is(
  (select price_amount from public.campaign_products where campaign_id = '88893000-0000-4000-8000-000000000001'),
  0.00, 'price_amount 0.00 was written exactly'
);

-- ---------------------------------------------------------------------------
-- quantity_limit preservation across a full replace
-- ---------------------------------------------------------------------------

-- Seed an association with quantity_limit = 7 directly (bypassing the RPC —
-- simulating a pre-existing row from before this correction, or one set by
-- some other confirmed future path). The RPC itself never lets the browser
-- set this value; this insert is test setup only.
insert into public.campaign_products (
  campaign_id, product_id, product_variant_id, price_amount, currency, availability_status, quantity_limit, sort_order
) values (
  '88893000-0000-4000-8000-000000000001', '88891000-0000-4000-8000-000000000002', null, 20.00, 'PEN', 'available', 7, 1
);

select is(
  (select quantity_limit from public.campaign_products where campaign_id = '88893000-0000-4000-8000-000000000001' and product_id = '88891000-0000-4000-8000-000000000002'),
  7, 'setup: quantity_limit = 7 before any admin_set_campaign_products call'
);

-- Now an admin edits price/availability for BOTH lines via the full-replace
-- RPC, sending no quantity_limit for either (it is not part of the browser
-- contract). Existing product_b keeps quantity_limit = 7; existing
-- product_a (which had no quantity_limit) stays null.
set local role authenticated;
set local request.jwt.claims to '{"sub":"88890000-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
select lives_ok(
  $$select public.admin_set_campaign_products(
      '88893000-0000-4000-8000-000000000001',
      (select updated_at from public.campaigns where id = '88893000-0000-4000-8000-000000000001'),
      '[
        {"product_id":"88891000-0000-4000-8000-000000000001","price_amount":"18.00","availability_status":"out_of_stock","sort_order":0},
        {"product_id":"88891000-0000-4000-8000-000000000002","price_amount":"22.00","availability_status":"available","sort_order":1}
      ]'::jsonb)$$,
  'admin edits price/availability for both existing lines'
);
reset role;

select is(
  (select quantity_limit from public.campaign_products where campaign_id = '88893000-0000-4000-8000-000000000001' and product_id = '88891000-0000-4000-8000-000000000002'),
  7, 'quantity_limit = 7 survives an unrelated price/availability edit'
);
select is(
  (select price_amount from public.campaign_products where campaign_id = '88893000-0000-4000-8000-000000000001' and product_id = '88891000-0000-4000-8000-000000000002'),
  22.00, 'the price was still updated by the same call'
);
select is(
  (select quantity_limit from public.campaign_products where campaign_id = '88893000-0000-4000-8000-000000000001' and product_id = '88891000-0000-4000-8000-000000000001'),
  null, 'a line with no prior quantity_limit stays null'
);

-- ---------------------------------------------------------------------------
-- admin_duplicate_campaign
-- ---------------------------------------------------------------------------

-- Give the source campaign a public_message and dates, so the reset can
-- actually be observed (not just "already null").
update public.campaigns
set opens_at = now(), closes_at = now() + interval '7 days', public_message = 'Stale marketing copy'
where id = '88893000-0000-4000-8000-000000000001';

set local role authenticated;
set local request.jwt.claims to '{"sub":"88890000-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
select lives_ok(
  $$select public.admin_duplicate_campaign('88893000-0000-4000-8000-000000000001', 911, 'CPC Duplicate')$$,
  'Import admin duplicates their own campaign'
);
reset role;

select is(
  (select count(*)::integer from public.campaigns where business_unit_id = '22222222-2222-4222-8222-222222222222' and number = 911),
  1, 'exactly one new campaign with the requested number exists'
);
select is(
  (select status from public.campaigns where number = 911),
  'draft', 'the destination campaign always lands on draft'
);
select is(
  (select opens_at from public.campaigns where number = 911),
  null, 'opens_at is reset, not copied'
);
select is(
  (select closes_at from public.campaigns where number = 911),
  null, 'closes_at is reset, not copied'
);
select is(
  (select public_message from public.campaigns where number = 911),
  null, 'public_message is reset, not copied (no confirmed rule for reusing stale marketing text)'
);
select is(
  (select count(*)::integer from public.campaign_products cp join public.campaigns c on c.id = cp.campaign_id where c.number = 911),
  2, 'both source campaign_products rows were copied'
);
select is(
  (select quantity_limit from public.campaign_products cp join public.campaigns c on c.id = cp.campaign_id where c.number = 911 and cp.product_id = '88891000-0000-4000-8000-000000000002'),
  7, 'quantity_limit is copied exactly, including a non-null value'
);
select is(
  (select price_amount from public.campaign_products cp join public.campaigns c on c.id = cp.campaign_id where c.number = 911 and cp.product_id = '88891000-0000-4000-8000-000000000002'),
  22.00, 'price_amount is copied exactly'
);
select is(
  (select availability_status from public.campaign_products cp join public.campaigns c on c.id = cp.campaign_id where c.number = 911 and cp.product_id = '88891000-0000-4000-8000-000000000001'),
  'out_of_stock', 'availability_status is copied exactly'
);
select is(
  (select action from public.audit_log where entity_type = 'campaign' and (after->>'destination_number')::integer = 911 order by created_at desc limit 1),
  'create', 'the duplication is audited'
);
select is(
  (select (after->>'copied_offer_count')::integer from public.audit_log where entity_type = 'campaign' and (after->>'destination_number')::integer = 911 order by created_at desc limit 1),
  2, 'audit metadata carries the bounded copied-offer count, not the product array'
);
select ok(
  (select after ? 'destination_campaign_id' and not (after ? 'campaign_products') from public.audit_log where entity_type = 'campaign' and (after->>'destination_number')::integer = 911 order by created_at desc limit 1),
  'audit after payload is bounded metadata only — no product array key present'
);

-- Input validation: bad number / blank name never create a partial campaign.
set local role authenticated;
set local request.jwt.claims to '{"sub":"88890000-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
select throws_ok(
  $$select public.admin_duplicate_campaign('88893000-0000-4000-8000-000000000001', 0, 'Bad Number')$$,
  'P2010', null, 'new_number must be greater than 0'
);
select throws_ok(
  $$select public.admin_duplicate_campaign('88893000-0000-4000-8000-000000000001', 912, '   ')$$,
  'P2010', null, 'a blank/whitespace-only new_name is rejected'
);
select throws_ok(
  $$select public.admin_duplicate_campaign('88893000-0000-4000-8000-000000000001', 911, 'Colliding Number')$$,
  '23505', null, 'a duplicate number within the same unit is rejected (unique_violation)'
);
reset role;

-- Atomicity: none of the three rejected calls above left a partial
-- destination campaign or any campaign_products rows behind.
select is(
  (select count(*)::integer from public.campaigns where business_unit_id = '22222222-2222-4222-8222-222222222222' and number in (0, 912)),
  0, 'no partial destination campaign was created by any rejected duplicate call'
);
select is(
  (select count(*)::integer from public.campaigns where business_unit_id = '22222222-2222-4222-8222-222222222222'),
  3, 'destination campaign count is unchanged by the rejected calls (campaign #6 + source + the one successful duplicate)'
);

-- Authorization / unit scope
set local role authenticated;
set local request.jwt.claims to '{"sub":"88890000-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}';
select throws_ok(
  $$select public.admin_duplicate_campaign('88893000-0000-4000-8000-000000000001', 920, 'Parfums admin attempt')$$,
  '42501', null, 'a Parfums admin cannot duplicate an Import campaign'
);
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"88890000-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
select throws_ok(
  $$select public.admin_duplicate_campaign('88893000-0000-4000-8000-000000000002', 921, 'Wrong unit source')$$,
  'P0002', null, 'an Import admin cannot duplicate a Parfums-owned campaign — wrong-unit source looks not-found'
);
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"88890000-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}';
select throws_ok(
  $$select public.admin_duplicate_campaign('88893000-0000-4000-8000-000000000001', 922, 'Viewer attempt')$$,
  '42501', null, 'Import viewer cannot duplicate a campaign'
);
reset role;

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select throws_ok(
  $$select public.admin_duplicate_campaign('88893000-0000-4000-8000-000000000001', 923, 'Anon attempt')$$,
  '42501', null, 'anonymous cannot execute admin_duplicate_campaign'
);
reset role;

select is(
  (select count(*)::integer from public.campaigns where business_unit_id = '22222222-2222-4222-8222-222222222222'),
  3, 'no unauthorized call created any campaign either'
);

select * from finish();
rollback;
