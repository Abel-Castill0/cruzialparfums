-- Cruzial Platform V2 — Admin Import: Consolidado lifecycle + security
-- foundation (Phase 4J1)

begin;
create extension if not exists pgtap with schema extensions;
select plan(46);

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

-- ---------------------------------------------------------------------------
-- Cross-unit scope: update/status/archive are intrinsically Import-scoped
-- ---------------------------------------------------------------------------
--
-- A campaign row that (however unrealistically) belongs to Parfums must be
-- unreachable through the Import-only lifecycle RPCs — not just unreachable
-- by someone who is not a Parfums admin, but unreachable *because these RPCs
-- resolve the Import unit themselves and never trust business_unit_id off
-- the row alone*. Inserted directly (privileged setup), bypassing the admin
-- RPCs entirely, since admin_create_campaign itself cannot produce a
-- non-Import row.

insert into public.campaigns (id, business_unit_id, number, name, status)
values (
  '77777777-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  501, 'Parfums Campaign (should be unreachable via Import RPCs)', 'draft'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"66666666-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}';
select throws_ok(
  $$select public.admin_update_campaign(
      '77777777-0000-4000-8000-000000000001',
      (select updated_at from public.campaigns where id = '77777777-0000-4000-8000-000000000001'),
      'Renamed by Parfums admin', null, null, null)$$,
  'P0002', null, 'a Parfums admin cannot admin_update_campaign a Parfums-owned campaign row through the Import-scoped RPC'
);
select throws_ok(
  $$select public.admin_set_campaign_status(
      '77777777-0000-4000-8000-000000000001',
      (select updated_at from public.campaigns where id = '77777777-0000-4000-8000-000000000001'),
      'open')$$,
  'P0002', null, 'a Parfums admin cannot admin_set_campaign_status a Parfums-owned campaign row through the Import-scoped RPC'
);
select throws_ok(
  $$select public.admin_archive_campaign(
      '77777777-0000-4000-8000-000000000001',
      (select updated_at from public.campaigns where id = '77777777-0000-4000-8000-000000000001'))$$,
  'P0002', null, 'a Parfums admin cannot admin_archive_campaign a Parfums-owned campaign row through the Import-scoped RPC'
);
reset role;

-- Also: an Import admin cannot reach the SAME row either, even though they
-- administer Import — the row genuinely belongs to Parfums, not Import, so
-- "resolve Import, require the row match it" correctly excludes it too.
set local role authenticated;
set local request.jwt.claims to '{"sub":"44444444-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
select throws_ok(
  $$select public.admin_update_campaign(
      '77777777-0000-4000-8000-000000000001',
      (select updated_at from public.campaigns where id = '77777777-0000-4000-8000-000000000001'),
      'Renamed by Import admin', null, null, null)$$,
  'P0002', null, 'an Import admin cannot reach a genuinely Parfums-owned campaign row either'
);
reset role;

select is(
  (select name from public.campaigns where id = '77777777-0000-4000-8000-000000000001'),
  'Parfums Campaign (should be unreachable via Import RPCs)', 'the Parfums campaign name is unchanged by every attempted Import-RPC call above'
);
select is(
  (select status from public.campaigns where id = '77777777-0000-4000-8000-000000000001'),
  'draft', 'the Parfums campaign status is unchanged'
);
select is(
  (select archived_at from public.campaigns where id = '77777777-0000-4000-8000-000000000001'),
  null::timestamptz, 'the Parfums campaign remains unarchived'
);

-- Import admin still works normally on a real Import campaign, right after
-- the denials above — proving the fix scopes correctly rather than breaking
-- legitimate same-unit access.
set local role authenticated;
set local request.jwt.claims to '{"sub":"44444444-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
select lives_ok(
  $$select public.admin_update_campaign(
      (select id from public.campaigns where number = 6 and business_unit_id = '22222222-2222-4222-8222-222222222222'),
      (select updated_at from public.campaigns where number = 6 and business_unit_id = '22222222-2222-4222-8222-222222222222'),
      'Sexto Consolidado (editado de nuevo)', null, null, 'Mensaje final')$$,
  'Import admin still edits their own Import campaign normally after the cross-unit fix'
);
reset role;

-- ---------------------------------------------------------------------------
-- Real campaign_products public RLS — the actual table policy, not just the
-- app.campaign_is_public() helper checked earlier.
-- ---------------------------------------------------------------------------

-- campaign_products_public_read (hardened in 20260907154401_integrity_hardening.sql)
-- also requires the referenced product itself to be publicly visible
-- (app.product_is_public: publication_status = 'published', not archived) —
-- a draft product would hide the row regardless of campaign visibility, so
-- the product used here must be published for this to test the campaign
-- dimension in isolation.
insert into public.products (id, business_unit_id, slug, name, publication_status)
values ('88888888-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'import-rls-test-product', 'Import RLS Test Product', 'published');

insert into public.campaigns (id, business_unit_id, number, name, status, archived_at) values
  ('99990000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 901, 'CP Open',      'open',      null),
  ('99990000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 902, 'CP Draft',     'draft',     null),
  ('99990000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', 903, 'CP Scheduled', 'scheduled', null),
  ('99990000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-222222222222', 904, 'CP Paused',    'paused',    null),
  ('99990000-0000-4000-8000-000000000005', '22222222-2222-4222-8222-222222222222', 905, 'CP Closed',    'closed',    null),
  ('99990000-0000-4000-8000-000000000006', '22222222-2222-4222-8222-222222222222', 906, 'CP Fulfilled', 'fulfilled', null),
  ('99990000-0000-4000-8000-000000000007', '22222222-2222-4222-8222-222222222222', 907, 'CP Archived',  'open',      now());

insert into public.campaign_products (id, campaign_id, product_id, price_amount) values
  ('99991000-0000-4000-8000-000000000001', '99990000-0000-4000-8000-000000000001', '88888888-0000-4000-8000-000000000001', 25),
  ('99991000-0000-4000-8000-000000000002', '99990000-0000-4000-8000-000000000002', '88888888-0000-4000-8000-000000000001', 25),
  ('99991000-0000-4000-8000-000000000003', '99990000-0000-4000-8000-000000000003', '88888888-0000-4000-8000-000000000001', 25),
  ('99991000-0000-4000-8000-000000000004', '99990000-0000-4000-8000-000000000004', '88888888-0000-4000-8000-000000000001', 25),
  ('99991000-0000-4000-8000-000000000005', '99990000-0000-4000-8000-000000000005', '88888888-0000-4000-8000-000000000001', 25),
  ('99991000-0000-4000-8000-000000000006', '99990000-0000-4000-8000-000000000006', '88888888-0000-4000-8000-000000000001', 25),
  ('99991000-0000-4000-8000-000000000007', '99990000-0000-4000-8000-000000000007', '88888888-0000-4000-8000-000000000001', 25);

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select is(
  (select count(*)::integer from public.campaign_products where id = '99991000-0000-4000-8000-000000000001'),
  1, 'campaign_products: open Import campaign product is visible to anon (real table policy)'
);
select is(
  (select count(*)::integer from public.campaign_products where id = '99991000-0000-4000-8000-000000000002'),
  0, 'campaign_products: draft Import campaign product is invisible to anon'
);
select is(
  (select count(*)::integer from public.campaign_products where id = '99991000-0000-4000-8000-000000000003'),
  0, 'campaign_products: scheduled Import campaign product is invisible to anon'
);
select is(
  (select count(*)::integer from public.campaign_products where id = '99991000-0000-4000-8000-000000000004'),
  0, 'campaign_products: paused Import campaign product is invisible to anon'
);
select is(
  (select count(*)::integer from public.campaign_products where id = '99991000-0000-4000-8000-000000000005'),
  0, 'campaign_products: closed Import campaign product is invisible to anon'
);
select is(
  (select count(*)::integer from public.campaign_products where id = '99991000-0000-4000-8000-000000000006'),
  0, 'campaign_products: fulfilled Import campaign product is invisible to anon'
);
select is(
  (select count(*)::integer from public.campaign_products where id = '99991000-0000-4000-8000-000000000007'),
  0, 'campaign_products: archived (even though status=open) Import campaign product is invisible to anon'
);
reset role;

select * from finish();
rollback;
