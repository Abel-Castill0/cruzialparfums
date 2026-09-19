-- VERIFICATION: Gate 2A — security boundaries hardening
-- Phase 4K-GATE2A — anon EXECUTE hardening + search_path + anon table-DML
--
-- Proves that after migration 20260919010000:
--   - anon can no longer execute ANY public.admin_* RPC — a catalog-wide
--     assertion over pg_proc/has_function_privilege, not just a sample
--     (a representative sample across create/update/archive/media/audit
--     shapes is also kept for readable failure output)
--   - anon can still execute all four public_* Import storefront RPCs
--   - the five search_path-mutable trigger functions now have a fixed,
--     non-null proconfig
--   - an authenticated user with no admin_memberships row still cannot
--     execute an admin capability (internal app.can_read_unit guard, not
--     just the grant)
--   - a Parfums admin cannot read Import's audit log (cross-unit isolation)
--   - an authorized Import admin can still read Import's audit log
--   - anon has no direct INSERT/UPDATE/DELETE on any of the 16 hardened
--     admin-only catalog/settings tables (one aggregate catalog assertion),
--     and public SELECT on those tables is unaffected

begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- Fixtures: Import admin + membership, Parfums admin + membership.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('fe000000-ffff-4fff-8fff-ffffffffffff', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gate2a-import-admin@example.test', '', now(), now());

insert into public.admin_memberships (user_id, business_unit_id, role, is_active)
select 'fe000000-ffff-4fff-8fff-ffffffffffff', id, 'admin', true
from public.business_units where code = 'import';

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('fe000000-ffff-4fff-8fff-fffffffffff1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gate2a-parfums-admin@example.test', '', now(), now());

insert into public.admin_memberships (user_id, business_unit_id, role, is_active)
select 'fe000000-ffff-4fff-8fff-fffffffffff1', id, 'admin', true
from public.business_units where code = 'parfums';

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('fe000000-ffff-4fff-8fff-fffffffffff2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gate2a-no-membership@example.test', '', now(), now());

-- =========================================================================
-- A. anon cannot execute any admin_* RPC (1 catalog-wide assertion + 5
--    representative-sample tests for readable failure output)
-- =========================================================================
select is(
  (
    select count(*)::integer
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'admin\_%' escape '\'
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  ),
  0,
  'anon cannot execute any public.admin_* function'
);

set local role anon;

select throws_ok(
  $$SELECT public.admin_archive_campaign('00000000-0000-0000-0000-000000000000'::uuid, now())$$,
  42501, null,
  'anon cannot execute admin_archive_campaign'
);

select throws_ok(
  $$SELECT public.admin_update_public_contact_setting('parfums', now(), '51999000000', '999 000 000', 'x@example.test')$$,
  42501, null,
  'anon cannot execute admin_update_public_contact_setting'
);

select throws_ok(
  $$SELECT public.admin_list_audit_log('parfums', 1, 10, null, null)$$,
  42501, null,
  'anon cannot execute admin_list_audit_log'
);

select throws_ok(
  $$SELECT public.admin_register_media('00000000-0000-0000-0000-000000000000'::uuid, 'https://res.cloudinary.com/x/image/upload/y.jpg', 'cloudinary', null, 'x/y', null, null, 1024, 'jpg', null, false)$$,
  42501, null,
  'anon cannot execute admin_register_media'
);

select throws_ok(
  $$SELECT public.admin_set_product_categories('00000000-0000-0000-0000-000000000000'::uuid, array[]::uuid[])$$,
  42501, null,
  'anon cannot execute admin_set_product_categories'
);

-- =========================================================================
-- B. anon can still execute all four public_* Import storefront RPCs
--    (4 tests) — innocuous args, no product/category fixture required; the
--    goal is proving the call reaches execution, not a specific result.
-- =========================================================================
select lives_ok(
  $$SELECT * FROM public.public_list_import_categories()$$,
  'anon can still execute public_list_import_categories'
);

select lives_ok(
  $$SELECT public.public_get_import_current_campaign()$$,
  'anon can still execute public_get_import_current_campaign'
);

select lives_ok(
  $$SELECT public.public_get_import_product('gate2a-nonexistent-slug')$$,
  'anon can still execute public_get_import_product'
);

select lives_ok(
  $$SELECT * FROM public.public_list_import_catalog(null, null, 1, 24)$$,
  'anon can still execute public_list_import_catalog'
);

reset role;

-- =========================================================================
-- C. search_path fixed on the five flagged trigger functions (5 tests)
-- =========================================================================
select ok(
  exists(
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app' and p.proname = 'set_updated_at'
      and p.proconfig @> array['search_path=pg_catalog, pg_temp']
  ),
  'app.set_updated_at has a fixed search_path'
);

select ok(
  exists(
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app' and p.proname = 'reject_audit_log_mutation'
      and p.proconfig @> array['search_path=pg_catalog, pg_temp']
  ),
  'app.reject_audit_log_mutation has a fixed search_path'
);

select ok(
  exists(
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app' and p.proname = 'freeze_order_line_snapshot'
      and p.proconfig @> array['search_path=pg_catalog, pg_temp']
  ),
  'app.freeze_order_line_snapshot has a fixed search_path'
);

select ok(
  exists(
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app' and p.proname = 'freeze_order_snapshot'
      and p.proconfig @> array['search_path=pg_catalog, pg_temp']
  ),
  'app.freeze_order_snapshot has a fixed search_path'
);

select ok(
  exists(
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app' and p.proname = 'reject_order_history_delete'
      and p.proconfig @> array['search_path=pg_catalog, pg_temp']
  ),
  'app.reject_order_history_delete has a fixed search_path'
);

-- =========================================================================
-- D. authenticated with no admin_memberships row cannot use an admin
--    capability — the internal app.can_read_unit guard, not just the grant
--    (1 test)
-- =========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"fe000000-ffff-4fff-8fff-fffffffffff2","app_metadata":{}}';

select throws_ok(
  $$SELECT public.admin_list_audit_log('parfums', 1, 10, null, null)$$,
  42501, null,
  'authenticated user without any membership cannot read audit log'
);

reset role;

-- =========================================================================
-- E. cross-unit: Parfums admin cannot read Import's audit log (1 test)
-- =========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"fe000000-ffff-4fff-8fff-fffffffffff1","app_metadata":{"role":"admin"}}';

select throws_ok(
  $$SELECT public.admin_list_audit_log('import', 1, 10, null, null)$$,
  42501, null,
  'Parfums admin cannot read Import audit log (cross-unit isolation)'
);

reset role;

-- =========================================================================
-- F. authorized Import admin can still read Import's audit log (1 test)
-- =========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"fe000000-ffff-4fff-8fff-ffffffffffff","app_metadata":{"role":"admin"}}';

select lives_ok(
  $$SELECT public.admin_list_audit_log('import', 1, 10, null, null)$$,
  'authorized Import admin can still read Import audit log'
);

reset role;

-- =========================================================================
-- G. anon has no direct DML on admin-only catalog tables; public SELECT on
--    those tables is unaffected (1 aggregate catalog assertion covering all
--    16 hardened tables + 3 representative tests)
-- =========================================================================
select is(
  (
    select count(*)::integer
    from pg_tables t
    where t.schemaname = 'public'
      and t.tablename in (
        'admin_parfums_wholesale_catalog', 'business_units', 'campaign_products',
        'campaigns', 'categories', 'combo_items', 'combos', 'deposit_policies',
        'product_categories', 'product_media', 'product_variants', 'products',
        'settings', 'shipping_methods', 'variant_price_tiers', 'wholesale_policies'
      )
      and (
        has_table_privilege('anon', format('public.%I', t.tablename), 'INSERT')
        or has_table_privilege('anon', format('public.%I', t.tablename), 'UPDATE')
        or has_table_privilege('anon', format('public.%I', t.tablename), 'DELETE')
      )
  ),
  0,
  'anon has no INSERT/UPDATE/DELETE on any of the 16 hardened admin-only tables'
);

set local role anon;

select throws_ok(
  $$INSERT INTO public.products (business_unit_id, slug, name) VALUES ('11111111-1111-4111-8111-111111111111', 'gate2a-anon-insert', 'Should fail')$$,
  42501, null,
  'anon cannot INSERT into products'
);

select throws_ok(
  $$INSERT INTO public.categories (business_unit_id, kind, slug, name) VALUES ('11111111-1111-4111-8111-111111111111', 'product', 'gate2a-anon-insert', 'Should fail')$$,
  42501, null,
  'anon cannot INSERT into categories'
);

select lives_ok(
  $$SELECT count(*) FROM public.products$$,
  'anon public SELECT on products still works'
);

reset role;

select * from finish();
rollback;
