-- Cruzial Platform V2 — 4J4C correction: Import campaign RPC error transport.
-- Exercises 20260910020000_import_campaign_concurrency_conflict_code.sql:
-- admin_update_campaign / admin_set_campaign_status / admin_archive_campaign
-- / admin_set_campaign_products now raise P2011 (not the reserved 40001
-- serialization_failure class) on a stale p_expected_updated_at. Small
-- self-contained fixtures — no 4J4B population required.

begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('23230000-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'import-admin-4j4c-cc@example.test', '', now(), now()),
  ('23230000-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'import-viewer-4j4c-cc@example.test', '', now(), now());

insert into public.admin_memberships (user_id, business_unit_id, role) values
  ('23230000-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'admin'),
  ('23230000-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'viewer');

insert into public.products (id, business_unit_id, slug, name, publication_status) values
  ('23231000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'cc-import-product-a', 'CC Import Product A', 'draft');

insert into public.campaigns (id, business_unit_id, number, name, status) values
  ('23233000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 821, 'CC Source Campaign', 'draft');

-- ---------------------------------------------------------------------------
-- A. admin_set_campaign_products — stale write
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"23230000-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
select throws_ok(
  $$select public.admin_set_campaign_products(
      '23233000-0000-4000-8000-000000000001', '2000-01-01T00:00:00Z'::timestamptz,
      '[{"product_id":"23231000-0000-4000-8000-000000000001","price_amount":"10.00","availability_status":"available","sort_order":0}]'::jsonb)$$,
  'P2011', null, 'A: stale admin_set_campaign_products fails closed with P2011, not 40001'
);
reset role;
select is(
  (select count(*)::integer from public.campaign_products where campaign_id = '23233000-0000-4000-8000-000000000001'),
  0, 'A: no campaign_products row was written by the rejected stale call'
);
select is(
  (select count(*)::integer from public.audit_log where entity_type = 'campaign' and action = 'composition_update' and entity_id = '23233000-0000-4000-8000-000000000001'),
  0, 'A: no composition_update audit entry was written for the rejected call'
);

-- ---------------------------------------------------------------------------
-- B. admin_update_campaign — stale write
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"23230000-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
select throws_ok(
  $$select public.admin_update_campaign(
      '23233000-0000-4000-8000-000000000001', '2000-01-01T00:00:00Z'::timestamptz,
      'Renamed', null, null, null)$$,
  'P2011', null, 'B: stale admin_update_campaign fails closed with P2011, not 40001'
);
reset role;
select is(
  (select name from public.campaigns where id = '23233000-0000-4000-8000-000000000001'),
  'CC Source Campaign', 'B: campaign name is unchanged after the rejected stale call'
);
select is(
  (select count(*)::integer from public.audit_log where entity_type = 'campaign' and action = 'update' and entity_id = '23233000-0000-4000-8000-000000000001'),
  0, 'B: no update audit entry was written for the rejected call'
);

-- ---------------------------------------------------------------------------
-- C. admin_set_campaign_status — stale write
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"23230000-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
select throws_ok(
  $$select public.admin_set_campaign_status(
      '23233000-0000-4000-8000-000000000001', '2000-01-01T00:00:00Z'::timestamptz, 'open')$$,
  'P2011', null, 'C: stale admin_set_campaign_status fails closed with P2011, not 40001'
);
reset role;
select is(
  (select status from public.campaigns where id = '23233000-0000-4000-8000-000000000001'),
  'draft', 'C: campaign status is unchanged after the rejected stale call'
);
select is(
  (select count(*)::integer from public.audit_log where entity_type = 'campaign' and action = 'campaign_state_change' and entity_id = '23233000-0000-4000-8000-000000000001'),
  0, 'C: no campaign_state_change audit entry was written for the rejected call'
);

-- ---------------------------------------------------------------------------
-- D. admin_archive_campaign — stale write
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"23230000-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
select throws_ok(
  $$select public.admin_archive_campaign(
      '23233000-0000-4000-8000-000000000001', '2000-01-01T00:00:00Z'::timestamptz)$$,
  'P2011', null, 'D: stale admin_archive_campaign fails closed with P2011, not 40001'
);
reset role;
select is(
  (select archived_at from public.campaigns where id = '23233000-0000-4000-8000-000000000001'),
  null, 'D: campaign is not archived after the rejected stale call'
);
select is(
  (select count(*)::integer from public.audit_log where entity_type = 'campaign' and action = 'archive' and entity_id = '23233000-0000-4000-8000-000000000001'),
  0, 'D: no archive audit entry was written for the rejected call'
);

-- ---------------------------------------------------------------------------
-- Authorization remains intact (viewer denied on all four; anon denied too)
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"23230000-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}';
select throws_ok(
  $$select public.admin_set_campaign_products('23233000-0000-4000-8000-000000000001',(select updated_at from public.campaigns where id='23233000-0000-4000-8000-000000000001'),'[]'::jsonb)$$,
  '42501', null, 'viewer cannot call admin_set_campaign_products'
);
select throws_ok(
  $$select public.admin_update_campaign('23233000-0000-4000-8000-000000000001',(select updated_at from public.campaigns where id='23233000-0000-4000-8000-000000000001'),'x',null,null,null)$$,
  '42501', null, 'viewer cannot call admin_update_campaign'
);
select throws_ok(
  $$select public.admin_set_campaign_status('23233000-0000-4000-8000-000000000001',(select updated_at from public.campaigns where id='23233000-0000-4000-8000-000000000001'),'open')$$,
  '42501', null, 'viewer cannot call admin_set_campaign_status'
);
select throws_ok(
  $$select public.admin_archive_campaign('23233000-0000-4000-8000-000000000001',(select updated_at from public.campaigns where id='23233000-0000-4000-8000-000000000001'))$$,
  '42501', null, 'viewer cannot call admin_archive_campaign'
);
reset role;

-- A correctly-versioned call from the real admin still succeeds normally
-- (proves P2011 is specific to the stale branch, not a blanket regression).
set local role authenticated;
set local request.jwt.claims to '{"sub":"23230000-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
select lives_ok(
  $$select public.admin_update_campaign('23233000-0000-4000-8000-000000000001',(select updated_at from public.campaigns where id='23233000-0000-4000-8000-000000000001'),'CC Source Campaign Renamed',null,null,null)$$,
  'a correctly-versioned admin_update_campaign call still succeeds'
);
reset role;
select is(
  (select name from public.campaigns where id = '23233000-0000-4000-8000-000000000001'),
  'CC Source Campaign Renamed', 'the successful call actually persisted'
);

select * from finish();
rollback;
