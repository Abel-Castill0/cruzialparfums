-- VERIFICATION: Gate 2C1 — AAL2 enforcement in app.is_admin_for / app.can_read_unit
--
-- Proves that after migration 20260919205854:
--   - an authenticated user with an active admin membership but an aal1 JWT
--     can still read their own admin_memberships row (needed to reach
--     enrollment/challenge), but app.can_read_unit / app.is_admin_for both
--     return false for that same JWT, and a representative protected read
--     (categories, admin-only draft row) and a representative admin
--     mutation (admin_update_public_contact_setting) are both denied
--   - an aal2 JWT with an active viewer membership can read business data
--     via app.can_read_unit but cannot perform an admin mutation
--   - an aal2 JWT with an active admin membership retains full existing
--     capability (read + mutation)
--   - an aal2 Parfums admin is still denied against the Import unit (no
--     membership there) — AAL2 alone never substitutes for membership
--   - anonymous storefront reads (categories_public_read) are unaffected

begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- Fixtures ------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('ac000000-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gate2c1-parfums-admin@example.test', '', now(), now());

insert into public.admin_memberships (user_id, business_unit_id, role, is_active)
select 'ac000000-aaaa-4aaa-8aaa-aaaaaaaaaaa1', id, 'admin', true
from public.business_units where code = 'parfums';

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('ac000000-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gate2c1-parfums-viewer@example.test', '', now(), now());

insert into public.admin_memberships (user_id, business_unit_id, role, is_active)
select 'ac000000-aaaa-4aaa-8aaa-aaaaaaaaaaa2', id, 'viewer', true
from public.business_units where code = 'parfums';

insert into public.categories (business_unit_id, kind, slug, name, publication_status)
select id, 'commercial_type', 'gate2c1-draft-category', 'Gate 2C1 draft category', 'draft'
from public.business_units where code = 'parfums';

-- =========================================================================
-- A. aal1 admin: own membership readable, everything else denied (6 tests)
-- =========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"ac000000-aaaa-4aaa-8aaa-aaaaaaaaaaa1"}';

select lives_ok(
  $$SELECT * FROM public.admin_memberships WHERE user_id = 'ac000000-aaaa-4aaa-8aaa-aaaaaaaaaaa1'$$,
  'aal1 admin can still read their own admin_memberships row'
);

select is(
  (select count(*)::integer from public.admin_memberships
   where user_id = 'ac000000-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),
  1,
  'aal1 admin sees exactly their own membership row'
);

select ok(
  not exists (
    select 1 from public.business_units b
    where b.code = 'parfums' and app.is_admin_for(b.id)
  ),
  'app.is_admin_for is false for an aal1 admin JWT'
);

select ok(
  not exists (
    select 1 from public.business_units b
    where b.code = 'parfums' and app.can_read_unit(b.id)
  ),
  'app.can_read_unit is false for an aal1 admin JWT'
);

select is(
  (select count(*)::integer from public.categories where slug = 'gate2c1-draft-category'),
  0,
  'aal1 admin cannot read the admin-only draft category (representative protected read denied)'
);

select throws_ok(
  $$SELECT public.admin_update_public_contact_setting('parfums', now(), '51999000000', '999 000 000', 'gate2c1@example.test')$$,
  42501, null,
  'aal1 admin cannot execute admin_update_public_contact_setting (representative admin mutation denied)'
);

reset role;

-- =========================================================================
-- B. aal2 viewer: business read = true, admin mutation = false (3 tests)
-- =========================================================================
set local role authenticated;
set local request.jwt.claims = '{"aal":"aal2","sub":"ac000000-aaaa-4aaa-8aaa-aaaaaaaaaaa2"}';

select ok(
  exists (
    select 1 from public.business_units b
    where b.code = 'parfums' and app.can_read_unit(b.id)
  ),
  'aal2 viewer can read Parfums business data via app.can_read_unit'
);

select is(
  (select count(*)::integer from public.categories where slug = 'gate2c1-draft-category'),
  1,
  'aal2 viewer can read the admin-only draft category'
);

select throws_ok(
  $$SELECT public.admin_update_public_contact_setting('parfums', now(), '51999000000', '999 000 000', 'gate2c1@example.test')$$,
  42501, null,
  'aal2 viewer cannot execute an admin mutation'
);

reset role;

-- =========================================================================
-- C. aal2 admin: full existing capability retained (2 tests)
-- =========================================================================
set local role authenticated;
set local request.jwt.claims = '{"aal":"aal2","sub":"ac000000-aaaa-4aaa-8aaa-aaaaaaaaaaa1"}';

select is(
  (select count(*)::integer from public.categories where slug = 'gate2c1-draft-category'),
  1,
  'aal2 admin retains read access to Parfums business data'
);

-- The expected-updated_at argument must be the row's real value: this RPC
-- also enforces optimistic concurrency (40001) *after* authorization, so
-- passing now() would fail for a reason unrelated to what is under test.
select lives_ok(
  $$SELECT public.admin_update_public_contact_setting(
      'parfums',
      (select s.updated_at
         from public.settings s
         join public.business_units b on b.id = s.business_unit_id
        where b.code = 'parfums' and s.key = 'public_contact'),
      '51999000000', '999 000 000', 'gate2c1@example.test')$$,
  'aal2 admin retains the admin mutation capability'
);

reset role;

-- =========================================================================
-- D. aal2 Parfums admin denied against Import (no membership there) (2 tests)
-- =========================================================================
set local role authenticated;
set local request.jwt.claims = '{"aal":"aal2","sub":"ac000000-aaaa-4aaa-8aaa-aaaaaaaaaaa1"}';

select ok(
  not exists (
    select 1 from public.business_units b
    where b.code = 'import' and app.can_read_unit(b.id)
  ),
  'aal2 Parfums admin cannot read Import business data (no membership there)'
);

select throws_ok(
  $$SELECT public.admin_update_public_contact_setting('import', now(), '51999000000', '999 000 000', 'gate2c1@example.test')$$,
  42501, null,
  'aal2 Parfums admin cannot mutate Import settings (AAL2 never substitutes for membership)'
);

reset role;

-- =========================================================================
-- E. anonymous storefront read is unaffected (1 test)
-- =========================================================================
set local role anon;

select lives_ok(
  $$SELECT count(*) FROM public.categories$$,
  'anon public category read is unaffected by AAL2 enforcement'
);

reset role;

select * from finish();
rollback;
