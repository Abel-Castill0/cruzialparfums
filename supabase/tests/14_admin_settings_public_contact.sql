-- Cruzial Platform V2 — Admin Settings: public contact (Phase 4G1)

begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('11111111-aaaa-4aaa-8aaa-aaaaaaaaaaab', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'parfums-admin-settings@example.test', '', now(), now()),
  ('22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbc', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'import-admin-settings@example.test', '', now(), now()),
  ('33333333-cccc-4ccc-8ccc-cccccccccccd', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'parfums-viewer-settings@example.test', '', now(), now());

insert into public.admin_memberships (user_id, business_unit_id, role) values
  ('11111111-aaaa-4aaa-8aaa-aaaaaaaaaaab', '11111111-1111-4111-8111-111111111111', 'admin'),
  ('22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbc', '22222222-2222-4222-8222-222222222222', 'admin'),
  ('33333333-cccc-4ccc-8ccc-cccccccccccd', '11111111-1111-4111-8111-111111111111', 'viewer');

-- ---------------------------------------------------------------------------
-- Seed data / isolation
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::integer from public.settings where key = 'public_contact'),
  2, 'both units have an independent public_contact row'
);
select isnt(
  (select id from public.settings where key = 'public_contact' and business_unit_id = '11111111-1111-4111-8111-111111111111'),
  (select id from public.settings where key = 'public_contact' and business_unit_id = '22222222-2222-4222-8222-222222222222'),
  'Parfums and Import rows are distinct, not a shared global row'
);
select is(
  (select is_public from public.settings where key = 'public_contact' and business_unit_id = '11111111-1111-4111-8111-111111111111'),
  true, 'public_contact is flagged is_public'
);

-- ---------------------------------------------------------------------------
-- Direct-write audit-bypass gap is closed
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-aaaa-4aaa-8aaa-aaaaaaaaaaab","role":"authenticated"}';
select throws_ok(
  $$update public.settings set value = value where key = 'public_contact' and business_unit_id = '11111111-1111-4111-8111-111111111111'$$,
  '42501', null, 'a Parfums admin cannot write settings directly through the table (audited RPC is the only path)'
);
reset role;

-- ---------------------------------------------------------------------------
-- Admin can update own-unit setting, audited with the real actor
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-aaaa-4aaa-8aaa-aaaaaaaaaaab","role":"authenticated"}';
select lives_ok(
  $$select public.admin_update_public_contact_setting(
      'parfums',
      (select updated_at from public.settings where key = 'public_contact' and business_unit_id = '11111111-1111-4111-8111-111111111111'),
      '51926390591', '926 390 591', 'dominiocruzial@gmail.com')$$,
  'Parfums admin updates the public_contact setting'
);
select is(
  (select action from public.audit_log where entity_type = 'settings' order by created_at desc limit 1),
  'settings_change', 'the update is audited as settings_change'
);
select is(
  (select actor_user_id from public.audit_log where entity_type = 'settings' order by created_at desc limit 1),
  '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaab'::uuid, 'audit actor is the real auth.uid, never client-supplied'
);
select is(
  (select after ? 'value' from public.audit_log where entity_type = 'settings' order by created_at desc limit 1),
  true, 'audit after payload records the new value'
);
reset role;

-- Import's row is untouched by the Parfums update above.
select is(
  (select value->>'contactEmail' from public.settings where key = 'public_contact' and business_unit_id = '22222222-2222-4222-8222-222222222222'),
  'dominiocruzial@gmail.com', 'Import row is unchanged by a Parfums-scoped update'
);

-- ---------------------------------------------------------------------------
-- Invalid values rejected (shape validation trigger)
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-aaaa-4aaa-8aaa-aaaaaaaaaaab","role":"authenticated"}';
select throws_ok(
  $$select public.admin_update_public_contact_setting(
      'parfums',
      (select updated_at from public.settings where key = 'public_contact' and business_unit_id = '11111111-1111-4111-8111-111111111111'),
      '51926390591', '926 390 591', 'not-an-email')$$,
  '22023', null, 'an invalid contact email is rejected'
);
select throws_ok(
  $$select public.admin_update_public_contact_setting(
      'parfums',
      (select updated_at from public.settings where key = 'public_contact' and business_unit_id = '11111111-1111-4111-8111-111111111111'),
      'not-e164', '926 390 591', 'dominiocruzial@gmail.com')$$,
  '22023', null, 'a non-E.164 WhatsApp number is rejected'
);

-- ---------------------------------------------------------------------------
-- Stale write rejected
-- ---------------------------------------------------------------------------

select throws_ok(
  $$select public.admin_update_public_contact_setting(
      'parfums', '2000-01-01T00:00:00Z', '51926390591', '926 390 591', 'dominiocruzial@gmail.com')$$,
  '40001', null, 'a stale expected_updated_at is rejected without silent overwrite'
);
reset role;

-- ---------------------------------------------------------------------------
-- Role/unit isolation
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"33333333-cccc-4ccc-8ccc-cccccccccccd","role":"authenticated"}';
select throws_ok(
  $$select public.admin_update_public_contact_setting(
      'parfums',
      (select updated_at from public.settings where key = 'public_contact' and business_unit_id = '11111111-1111-4111-8111-111111111111'),
      '51926390591', '926 390 591', 'dominiocruzial@gmail.com')$$,
  '42501', null, 'a Parfums viewer cannot mutate the setting'
);
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbc","role":"authenticated"}';
select throws_ok(
  $$select public.admin_update_public_contact_setting(
      'parfums',
      (select updated_at from public.settings where key = 'public_contact' and business_unit_id = '11111111-1111-4111-8111-111111111111'),
      '51926390591', '926 390 591', 'dominiocruzial@gmail.com')$$,
  '42501', null, 'an Import-only admin cannot mutate the Parfums setting'
);
select lives_ok(
  $$select public.admin_update_public_contact_setting(
      'import',
      (select updated_at from public.settings where key = 'public_contact' and business_unit_id = '22222222-2222-4222-8222-222222222222'),
      '51926390591', '926 390 591', 'dominiocruzial@gmail.com')$$,
  'an Import admin can update its own unit setting'
);
reset role;

-- ---------------------------------------------------------------------------
-- Anonymous
-- ---------------------------------------------------------------------------

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select throws_ok(
  $$select public.admin_update_public_contact_setting('parfums', now(), '51926390591', '926 390 591', 'dominiocruzial@gmail.com')$$,
  '42501', null, 'anonymous cannot execute the settings mutation'
);
select is(
  (select count(*)::integer from public.settings where key = 'public_contact'),
  2, 'anon can read both is_public settings rows'
);
reset role;

-- Non-public settings stay hidden from anon (defense-in-depth check on the
-- read policy itself, using a throwaway non-public row).
insert into public.settings (business_unit_id, key, value, is_public)
values ('11111111-1111-4111-8111-111111111111', 'zz_test_private', '{}'::jsonb, false);

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select is(
  (select count(*)::integer from public.settings where key = 'zz_test_private'),
  0, 'anon cannot read a non-public settings row'
);
reset role;

select * from finish();
rollback;
