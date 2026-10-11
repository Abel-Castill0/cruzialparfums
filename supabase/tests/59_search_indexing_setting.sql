-- Cruzial Platform V2 — platform-wide search indexing switch (20261011130000)

begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('59000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'idx-dual-admin@example.test', '', now(), now()),
  ('59000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'idx-parfums-admin@example.test', '', now(), now()),
  ('59000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'idx-viewer@example.test', '', now(), now()),
  ('59000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'idx-nobody@example.test', '', now(), now());

insert into public.admin_memberships (user_id, business_unit_id, role) values
  ('59000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'admin'),
  ('59000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'admin'),
  ('59000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'admin'),
  ('59000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'viewer'),
  ('59000000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', 'viewer');

-- Seed and default
select is((select count(*)::int from public.settings where key = 'search_indexing'), 1, 'exactly one search_indexing row');
select is((select business_unit_id from public.settings where key = 'search_indexing'), null::uuid, 'it is platform-wide');
select is((select value from public.settings where key = 'search_indexing'), '{"enabled": false}'::jsonb, 'indexing is OFF by default');

-- Public read (anon), independent from launch readiness
set local role anon;
select is(public.public_search_indexing_enabled(), false, 'anon reads false');
select throws_ok($$select public.admin_get_search_indexing()$$, '42501', null, 'anon cannot call the admin read model');
select throws_ok($$select public.admin_set_search_indexing(true, now())$$, '42501', null, 'anon cannot change indexing');
reset role;

-- Viewer of both units: may read the admin model, may not change
set local role authenticated;
set local request.jwt.claims to '{"aal":"aal2","sub":"59000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((public.admin_get_search_indexing() ->> 'canChange')::boolean, false, 'a viewer sees canChange=false');
select throws_ok(
  $$select public.admin_set_search_indexing(true, (select updated_at from public.settings where key = 'search_indexing'))$$,
  '42501', null, 'a viewer cannot change indexing');
reset role;

-- Admin of ONE unit cannot open the whole domain
set local role authenticated;
set local request.jwt.claims to '{"aal":"aal2","sub":"59000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((public.admin_get_search_indexing() ->> 'canChange')::boolean, false, 'a single-unit admin sees canChange=false');
select throws_ok(
  $$select public.admin_set_search_indexing(true, (select updated_at from public.settings where key = 'search_indexing'))$$,
  '42501', null, 'a single-unit admin cannot change indexing');
select throws_ok($$update public.settings set value = '{"enabled": true}' where key = 'search_indexing'$$,
  '42501', null, 'no direct table write path');
reset role;

-- No membership at all
set local role authenticated;
set local request.jwt.claims to '{"aal":"aal2","sub":"59000000-0000-4000-8000-000000000004","role":"authenticated"}';
select throws_ok($$select public.admin_get_search_indexing()$$, '42501', null, 'a user without membership cannot read the admin model');
reset role;

-- Dual admin at AAL1 is refused (MFA required)
set local role authenticated;
set local request.jwt.claims to '{"aal":"aal1","sub":"59000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$select public.admin_set_search_indexing(true, (select updated_at from public.settings where key = 'search_indexing'))$$,
  '42501', null, 'AAL1 cannot change indexing');
reset role;

-- Dual admin at AAL2: allowed, audited per unit, concurrency-checked
set local role authenticated;
set local request.jwt.claims to '{"aal":"aal2","sub":"59000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((public.admin_get_search_indexing() ->> 'canChange')::boolean, true, 'the dual AAL2 admin sees canChange=true');
select throws_ok($$select public.admin_set_search_indexing(true, '2000-01-01T00:00:00Z')$$, '40001', null, 'a stale token is rejected');
select throws_ok($$select public.admin_set_search_indexing(null, now())$$, '22023', null, 'null is rejected');
select lives_ok(
  $$select public.admin_set_search_indexing(true, (select updated_at from public.settings where key = 'search_indexing'))$$,
  'the dual AAL2 admin turns indexing on');
reset role;

select is(public.public_search_indexing_enabled(), true, 'the public read reflects the change');
select is(
  (select count(distinct business_unit_id)::int from public.audit_log
    where entity_type = 'settings' and action = 'settings_change' and after ->> 'key' = 'search_indexing'
      and actor_user_id = '59000000-0000-4000-8000-000000000001'),
  2, 'one audit row per business unit, with the real actor');
select is((select updated_by from public.settings where key = 'search_indexing'), '59000000-0000-4000-8000-000000000001'::uuid, 'updated_by is auth.uid()');

-- Shape validation
select throws_ok($$update public.settings set value = '{"enabled": "yes"}' where key = 'search_indexing'$$, '22023', null, 'enabled must be boolean');
select throws_ok(
  $$insert into public.settings (business_unit_id, key, value, is_public) values ('11111111-1111-4111-8111-111111111111', 'search_indexing', '{"enabled": true}', true)$$,
  '22023', null, 'search_indexing cannot be scoped to one unit');

select * from finish();
rollback;
