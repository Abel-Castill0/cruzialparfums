-- Cruzial Platform V2 — RLS: business-unit isolation
--
-- The core cross-tenant guarantee: an admin of one Cruzial business may not
-- read or write the other's rows, and no admin may grant themselves access.
-- A `.eq('business_unit_id', …)` filter in application code is not what makes
-- this true — these assertions are run against the database itself.

begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'parfums-admin@example.test', '', now(), now()),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'import-admin@example.test', '', now(), now()),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'both-admin@example.test', '', now(), now()),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'no-membership@example.test', '', now(), now());

insert into public.admin_memberships (user_id, business_unit_id, role) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'admin'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'admin'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '11111111-1111-4111-8111-111111111111', 'admin'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '22222222-2222-4222-8222-222222222222', 'admin');

insert into public.products (id, business_unit_id, slug, name, publication_status) values
  ('11111111-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
   'draft-parfum', 'Draft Parfum', 'draft'),
  ('22222222-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222',
   'draft-import', 'Draft Import', 'draft');

insert into public.customers (id, business_unit_id, full_name) values
  ('11111111-0000-4000-8000-0000000000c1', '11111111-1111-4111-8111-111111111111', 'Cliente Parfums'),
  ('22222222-0000-4000-8000-0000000000c2', '22222222-2222-4222-8222-222222222222', 'Cliente Import');

-- ---------------------------------------------------------------------------
-- Parfums admin
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';

select is(
  (select count(*)::int from public.products where slug = 'draft-parfum'),
  1,
  'Parfums admin reads its own unpublished product'
);

select is(
  (select count(*)::int from public.products where slug = 'draft-import'),
  0,
  'Parfums admin cannot read an Import unpublished product'
);

select is(
  (select count(*)::int from public.customers where full_name = 'Cliente Import'),
  0,
  'Parfums admin cannot read Import customers'
);

-- An UPDATE blocked by a USING clause is not an error: it silently matches no
-- row. Asserting that from inside the same role would prove nothing, because
-- the row is invisible to it either way — so the attempt is made here and the
-- product's real name is checked from the owner's context at the end of the
-- file, where nothing is filtered.
update public.products set name = 'Renamed by Parfums admin'
where slug = 'draft-import';

select throws_ok(
  $$insert into public.products (business_unit_id, slug, name)
    values ('22222222-2222-4222-8222-222222222222', 'cross-unit-insert', 'Cross Unit')$$,
  '42501',
  null,
  'Parfums admin cannot insert a product into Import'
);

-- Privilege escalation: no write policy exists on admin_memberships at all.
select throws_ok(
  $$insert into public.admin_memberships (user_id, business_unit_id, role)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'admin')$$,
  '42501',
  null,
  'Parfums admin cannot grant itself an Import membership'
);

update public.admin_memberships set business_unit_id = '22222222-2222-4222-8222-222222222222'
where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select is(
  (select count(*)::int from public.admin_memberships
    where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and business_unit_id = '22222222-2222-4222-8222-222222222222'),
  0,
  'Parfums admin cannot repoint its own membership at Import'
);

select is(
  (select count(*)::int from public.admin_memberships),
  1,
  'an admin sees only its own membership rows'
);

-- Audit: direct INSERT is denied outright as of Phase 4G2 — the only path
-- that may add a row is app.write_audit_log(), called atomically by the
-- admin mutation RPCs (see supabase/tests/15_admin_audit_log.sql for the
-- full integrity-fix coverage). This is no longer a business-unit isolation
-- question — even the admin's OWN unit is denied — so both assertions below
-- are throws_ok now, not a lives_ok/throws_ok pair.
select throws_ok(
  $$insert into public.audit_log (business_unit_id, actor_user_id, action, entity_type)
    values ('11111111-1111-4111-8111-111111111111',
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'update', 'product')$$,
  '42501',
  null,
  'Parfums admin cannot write an audit entry directly, even for its own unit (Phase 4G2)'
);

select throws_ok(
  $$insert into public.audit_log (business_unit_id, actor_user_id, action, entity_type)
    values ('22222222-2222-4222-8222-222222222222',
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'update', 'product')$$,
  '42501',
  null,
  'Parfums admin cannot write an audit entry against Import either'
);

-- ---------------------------------------------------------------------------
-- Import admin — the mirror image
-- ---------------------------------------------------------------------------

set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}';

select is(
  (select count(*)::int from public.products where slug = 'draft-import'),
  1,
  'Import admin reads its own unpublished product'
);

select is(
  (select count(*)::int from public.products where slug = 'draft-parfum'),
  0,
  'Import admin cannot read a Parfums unpublished product'
);

select is(
  (select count(*)::int from public.customers where full_name = 'Cliente Parfums'),
  0,
  'Import admin cannot read Parfums customers'
);

update public.products set name = 'Renamed by Import admin'
where slug = 'draft-parfum';

select throws_ok(
  $$insert into public.products (business_unit_id, slug, name)
    values ('11111111-1111-4111-8111-111111111111', 'cross-unit-insert-2', 'Cross Unit 2')$$,
  '42501',
  null,
  'Import admin cannot insert a product into Parfums'
);

-- ---------------------------------------------------------------------------
-- Admin of both units
-- ---------------------------------------------------------------------------

set local request.jwt.claims to '{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}';

select is(
  (select count(*)::int from public.products where slug in ('draft-parfum', 'draft-import')),
  2,
  'an admin with both memberships reads both units, from one account'
);

select lives_ok(
  $$update public.products set name = 'Renamed by multi-unit admin' where slug = 'draft-import'$$,
  'an admin with both memberships can write in either unit'
);

-- ---------------------------------------------------------------------------
-- Authenticated user with no membership — same surface as anonymous
-- ---------------------------------------------------------------------------

set local request.jwt.claims to '{"sub":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","role":"authenticated"}';

select is(
  (select count(*)::int from public.products where slug in ('draft-parfum', 'draft-import')),
  0,
  'a signed-in user without a membership sees no unpublished product'
);

select is(
  (select count(*)::int from public.customers),
  0,
  'a signed-in user without a membership sees no customers'
);

select throws_ok(
  $$insert into public.products (business_unit_id, slug, name)
    values ('11111111-1111-4111-8111-111111111111', 'no-membership-insert', 'Nope')$$,
  '42501',
  null,
  'a signed-in user without a membership cannot insert a product'
);

-- ---------------------------------------------------------------------------
-- Ground truth, with no RLS filtering in the way
-- ---------------------------------------------------------------------------
--
-- The cross-unit UPDATE attempts above are only meaningful if the target rows
-- really did survive untouched. Checked here as the owner, which sees
-- everything.

reset role;

select is(
  (select name from public.products where id = '11111111-0000-4000-8000-000000000002'),
  'Draft Parfum',
  'the Parfums product was never renamed by the Import admin'
);

select is(
  (select name from public.products where id = '22222222-0000-4000-8000-000000000002'),
  'Renamed by multi-unit admin',
  'the Import product changed only through the admin that holds an Import membership'
);

select * from finish();
rollback;
