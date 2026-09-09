-- Cruzial Platform V2 — Admin Import: Consolidado lifecycle + security
-- foundation (Phase 4J1)

begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('44444444-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'import-admin-4j1@example.test', '', now(), now()),
  ('55555555-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'import-viewer-4j1@example.test', '', now(), now()),
  ('66666666-cccc-4ccc-8ccc-cccccccccccc', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'parfums-only-admin-4j1@example.test', '', now(), now());

insert into public.admin_memberships (user_id, business_unit_id, role) values
  ('44444444-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'admin'),
  ('55555555-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'viewer'),
  ('66666666-cccc-4ccc-8ccc-cccccccccccc', '11111111-1111-4111-8111-111111111111', 'admin');

-- ---------------------------------------------------------------------------
-- Create: Import admin can create a draft campaign
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"44444444-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
select lives_ok(
  $$select public.admin_create_campaign(6, 'Sexto Consolidado', null, null, 'Mensaje público')$$,
  'Import admin creates a draft campaign'
);
select is(
  (select status from public.campaigns where business_unit_id = '22222222-2222-4222-8222-222222222222' and number = 6),
  'draft', 'a newly created campaign always starts as draft (no create-as-open shortcut)'
);
reset role;

select is(
  (select action from public.audit_log where entity_type = 'campaign' order by created_at desc limit 1),
  'create', 'campaign creation is audited'
);
select is(
  (select actor_user_id from public.audit_log where entity_type = 'campaign' order by created_at desc limit 1),
  '44444444-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 'audit actor is the real auth.uid, never client-supplied'
);

-- Duplicate number inside Import rejected
set local role authenticated;
set local request.jwt.claims to '{"sub":"44444444-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
select throws_ok(
  $$select public.admin_create_campaign(6, 'Otro Sexto', null, null, null)$$,
  '23505', null, 'duplicate campaign number inside Import is rejected'
);
-- Invalid time window rejected
select throws_ok(
  $$select public.admin_create_campaign(7, 'Séptimo', now(), now() - interval '1 day', null)$$,
  '23514', null, 'closes_at before opens_at is rejected'
);
reset role;

-- Viewer cannot create
set local role authenticated;
set local request.jwt.claims to '{"sub":"55555555-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}';
select throws_ok(
  $$select public.admin_create_campaign(8, 'Octavo', null, null, null)$$,
  '42501', null, 'Import viewer cannot create a campaign'
);
reset role;

-- Parfums-only admin cannot create/mutate Import campaigns
set local role authenticated;
set local request.jwt.claims to '{"sub":"66666666-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}';
select throws_ok(
  $$select public.admin_create_campaign(9, 'Noveno', null, null, null)$$,
  '42501', null, 'a Parfums-only admin cannot create an Import campaign'
);
reset role;

-- ---------------------------------------------------------------------------
-- Direct-write path is closed
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"44444444-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
select throws_ok(
  $$update public.campaigns set name = name where number = 6 and business_unit_id = '22222222-2222-4222-8222-222222222222'$$,
  '42501', null, 'an Import admin cannot write campaigns directly through the table (audited RPC is the only path)'
);
select throws_ok(
  $$insert into public.campaigns (business_unit_id, number, name) values ('22222222-2222-4222-8222-222222222222', 999, 'Bypass')$$,
  '42501', null, 'direct INSERT on campaigns is denied'
);
select throws_ok(
  $$delete from public.campaigns where number = 6 and business_unit_id = '22222222-2222-4222-8222-222222222222'$$,
  '42501', null, 'direct DELETE on campaigns is denied'
);
select throws_ok(
  $$insert into public.campaign_products (campaign_id, product_id, price_amount)
    select id, (select id from public.products limit 1), 10 from public.campaigns where number = 6$$,
  '42501', null, 'direct write on campaign_products is denied'
);
reset role;

-- ---------------------------------------------------------------------------
-- Edit: metadata update with optimistic concurrency
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"44444444-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
select lives_ok(
  $$select public.admin_update_campaign(
      (select id from public.campaigns where number = 6 and business_unit_id = '22222222-2222-4222-8222-222222222222'),
      (select updated_at from public.campaigns where number = 6 and business_unit_id = '22222222-2222-4222-8222-222222222222'),
      'Sexto Consolidado (editado)', null, null, 'Mensaje actualizado')$$,
  'Import admin edits campaign metadata'
);
select throws_ok(
  $$select public.admin_update_campaign(
      (select id from public.campaigns where number = 6 and business_unit_id = '22222222-2222-4222-8222-222222222222'),
      '2000-01-01T00:00:00Z', 'Stale edit', null, null, null)$$,
  '40001', null, 'a stale expected_updated_at is rejected without silent overwrite'
);
reset role;

-- ---------------------------------------------------------------------------
-- Status change: explicit action, audited
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"44444444-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
select lives_ok(
  $$select public.admin_set_campaign_status(
      (select id from public.campaigns where number = 6 and business_unit_id = '22222222-2222-4222-8222-222222222222'),
      (select updated_at from public.campaigns where number = 6 and business_unit_id = '22222222-2222-4222-8222-222222222222'),
      'open')$$,
  'Import admin opens the campaign'
);
reset role;
select is(
  (select status from public.campaigns where number = 6 and business_unit_id = '22222222-2222-4222-8222-222222222222'),
  'open', 'status is now open'
);
select is(
  (select action from public.audit_log where entity_type = 'campaign' and action = 'campaign_state_change' order by created_at desc limit 1),
  'campaign_state_change', 'status change is audited as campaign_state_change'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"55555555-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}';
select throws_ok(
  $$select public.admin_set_campaign_status(
      (select id from public.campaigns where number = 6 and business_unit_id = '22222222-2222-4222-8222-222222222222'),
      (select updated_at from public.campaigns where number = 6 and business_unit_id = '22222222-2222-4222-8222-222222222222'),
      'closed')$$,
  '42501', null, 'Import viewer cannot change status'
);
reset role;

-- ---------------------------------------------------------------------------
-- Public visibility — only open, non-archived, Import campaigns
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"44444444-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
select public.admin_create_campaign(10, 'Draft Test', null, null, null);

select public.admin_create_campaign(11, 'Scheduled Test', null, null, null);
select public.admin_set_campaign_status(
  (select id from public.campaigns where number = 11 and business_unit_id = '22222222-2222-4222-8222-222222222222'),
  (select updated_at from public.campaigns where number = 11 and business_unit_id = '22222222-2222-4222-8222-222222222222'),
  'scheduled');

select public.admin_create_campaign(12, 'Paused Test', null, null, null);
select public.admin_set_campaign_status(
  (select id from public.campaigns where number = 12 and business_unit_id = '22222222-2222-4222-8222-222222222222'),
  (select updated_at from public.campaigns where number = 12 and business_unit_id = '22222222-2222-4222-8222-222222222222'),
  'paused');

select public.admin_create_campaign(13, 'Closed Test', null, null, null);
select public.admin_set_campaign_status(
  (select id from public.campaigns where number = 13 and business_unit_id = '22222222-2222-4222-8222-222222222222'),
  (select updated_at from public.campaigns where number = 13 and business_unit_id = '22222222-2222-4222-8222-222222222222'),
  'closed');

select public.admin_create_campaign(14, 'Fulfilled Test', null, null, null);
select public.admin_set_campaign_status(
  (select id from public.campaigns where number = 14 and business_unit_id = '22222222-2222-4222-8222-222222222222'),
  (select updated_at from public.campaigns where number = 14 and business_unit_id = '22222222-2222-4222-8222-222222222222'),
  'fulfilled');

select public.admin_create_campaign(15, 'Archived Test', null, null, null);
select public.admin_archive_campaign(
  (select id from public.campaigns where number = 15 and business_unit_id = '22222222-2222-4222-8222-222222222222'),
  (select updated_at from public.campaigns where number = 15 and business_unit_id = '22222222-2222-4222-8222-222222222222'));
reset role;

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select is(
  (select count(*)::integer from public.campaigns where number = 6 and business_unit_id = '22222222-2222-4222-8222-222222222222'),
  1, 'anon reads the open Import campaign'
);
select is(
  (select count(*)::integer from public.campaigns where number = 10 and business_unit_id = '22222222-2222-4222-8222-222222222222'),
  0, 'anon cannot read draft'
);
select is(
  (select count(*)::integer from public.campaigns where number = 11 and business_unit_id = '22222222-2222-4222-8222-222222222222'),
  0, 'anon cannot read scheduled'
);
select is(
  (select count(*)::integer from public.campaigns where number = 12 and business_unit_id = '22222222-2222-4222-8222-222222222222'),
  0, 'anon cannot read paused'
);
select is(
  (select count(*)::integer from public.campaigns where number = 13 and business_unit_id = '22222222-2222-4222-8222-222222222222'),
  0, 'anon cannot read closed'
);
select is(
  (select count(*)::integer from public.campaigns where number = 14 and business_unit_id = '22222222-2222-4222-8222-222222222222'),
  0, 'anon cannot read fulfilled'
);
select is(
  (select count(*)::integer from public.campaigns where number = 15 and business_unit_id = '22222222-2222-4222-8222-222222222222'),
  0, 'anon cannot read archived'
);
reset role;

-- campaign_products inherit campaign visibility via app.campaign_is_public
-- (campaign_products has no mutation RPC yet — that is 4J2 — so this checks
-- the shared resolver campaign_products_public_read depends on).
select is(
  (select app.campaign_is_public(id) from public.campaigns where number = 6 and business_unit_id = '22222222-2222-4222-8222-222222222222'),
  true, 'app.campaign_is_public is true for the open campaign (campaign_products_public_read relies on this)'
);
select is(
  (select app.campaign_is_public(id) from public.campaigns where number = 10 and business_unit_id = '22222222-2222-4222-8222-222222222222'),
  false, 'app.campaign_is_public is false for the draft campaign (campaign_products_public_read relies on this)'
);

-- ---------------------------------------------------------------------------
-- Archive: audited, hidden publicly, cannot be edited afterwards
-- ---------------------------------------------------------------------------

select is(
  (select action from public.audit_log where entity_type = 'campaign' and action = 'archive' order by created_at desc limit 1),
  'archive', 'archive is audited'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"44444444-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
select throws_ok(
  $$select public.admin_update_campaign(
      (select id from public.campaigns where number = 15 and business_unit_id = '22222222-2222-4222-8222-222222222222'),
      (select updated_at from public.campaigns where number = 15 and business_unit_id = '22222222-2222-4222-8222-222222222222'),
      'Should not work', null, null, null)$$,
  'P2007', null, 'an archived campaign cannot be edited'
);
reset role;

-- ---------------------------------------------------------------------------
-- Actor spoof impossible
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"44444444-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
select public.admin_create_campaign(16, 'Actor Check', null, null, null);
reset role;
select is(
  (select actor_user_id from public.audit_log where entity_type = 'campaign' and entity_id = (select id from public.campaigns where number = 16 and business_unit_id = '22222222-2222-4222-8222-222222222222')),
  '44444444-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
  'audit actor always comes from auth.uid(), never a caller-supplied value (there is no actor parameter on any RPC)'
);

-- ---------------------------------------------------------------------------
-- Anonymous cannot use Admin RPCs at all
-- ---------------------------------------------------------------------------

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select throws_ok(
  $$select public.admin_create_campaign(17, 'Anon Attempt', null, null, null)$$,
  '42501', null, 'anonymous cannot execute admin_create_campaign'
);
reset role;

select * from finish();
rollback;
