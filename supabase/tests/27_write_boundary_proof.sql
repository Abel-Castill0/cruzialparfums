-- VERIFICATION: Sensitive commerce write boundary (post-fix)
-- Phase 4J5C1 — Controlled-Mutation Boundary Final Gate
--
-- Proves that after migration 20260911100400:
--   - Authenticated direct writes to customers/orders/order_lines are DENIED
--   - Controlled customer RPCs still work
--   - Admin SELECT remains intact
--   - Cross-BU isolation preserved
--   - Phone helper revoked from authenticated
--
-- Note: order/order_lines RPCs are exhaustively tested in test 26.

begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- Fixtures: Import admin user + membership
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('ff000000-ffff-4fff-8fff-ffffffffffff', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'write-boundary-test@example.test', '', now(), now());

insert into public.admin_memberships (user_id, business_unit_id, role, is_active)
select 'ff000000-ffff-4fff-8fff-ffffffffffff', id, 'admin', true
from public.business_units where code = 'import';

-- Parfums admin (must NOT access Import customers)
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('ff000000-ffff-4fff-8fff-fffffffffff1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'parfums-admin@test.example', '', now(), now());

insert into public.admin_memberships (user_id, business_unit_id, role, is_active)
select 'ff000000-ffff-4fff-8fff-fffffffffff1', id, 'admin', true
from public.business_units where code = 'parfums';

-- Switch to Import admin
set local role authenticated;
set local request.jwt.claims = '{"sub":"ff000000-ffff-4fff-8fff-ffffffffffff","app_metadata":{"business_unit_id":"22222222-2222-4222-8222-222222222222","role":"admin"}}';

-- =========================================================================
-- A. CUSTOMERS — direct writes denied (3 tests)
-- =========================================================================
select throws_ok(
  $$INSERT INTO public.customers (business_unit_id, full_name, phone, verified_customer_status)
    VALUES ('22222222-2222-4222-8222-222222222222', 'Should Fail', '51999111000', 'pending_verification')$$,
  42501, null,
  'customers INSERT denied for authenticated'
);

select throws_ok(
  $$UPDATE public.customers SET full_name = 'Hacked'
    WHERE business_unit_id = '22222222-2222-4222-8222-222222222222'$$,
  42501, null,
  'customers UPDATE denied for authenticated'
);

select throws_ok(
  $$DELETE FROM public.customers
    WHERE business_unit_id = '22222222-2222-4222-8222-222222222222'$$,
  42501, null,
  'customers DELETE denied for authenticated'
);

-- =========================================================================
-- B. ORDERS — direct writes denied (2 tests)
-- =========================================================================
select throws_ok(
  $$UPDATE public.orders SET subtotal_amount = 999
    WHERE id = '00000000-0000-0000-0000-000000000000'$$,
  42501, null,
  'orders UPDATE denied for authenticated'
);

select throws_ok(
  $$DELETE FROM public.orders
    WHERE id = '00000000-0000-0000-0000-000000000000'$$,
  42501, null,
  'orders DELETE denied for authenticated'
);

-- =========================================================================
-- C. ORDER_LINES — direct writes denied (2 tests)
-- =========================================================================
select throws_ok(
  $$UPDATE public.order_lines SET quantity = 999
    WHERE id = '00000000-0000-0000-0000-000000000000'$$,
  42501, null,
  'order_lines UPDATE denied for authenticated'
);

select throws_ok(
  $$DELETE FROM public.order_lines
    WHERE id = '00000000-0000-0000-0000-000000000000'$$,
  42501, null,
  'order_lines DELETE denied for authenticated'
);

-- =========================================================================
-- D. Admin SELECT preserved (3 tests)
-- =========================================================================
select is(
  (SELECT count(*)::integer FROM public.customers WHERE business_unit_id = '22222222-2222-4222-8222-222222222222'),
  0,
  'customers SELECT works (admin read preserved)'
);

select is(
  (SELECT count(*)::integer FROM public.orders WHERE business_unit_id = '22222222-2222-4222-8222-222222222222'),
  0,
  'orders SELECT works (admin read preserved)'
);

select is(
  (SELECT count(*)::integer FROM public.order_lines),
  0,
  'order_lines SELECT works (admin read preserved)'
);

-- =========================================================================
-- E. Controlled customer RPCs still work (4 tests)
-- =========================================================================
select lives_ok(
  $$SELECT public.admin_import_create_customer('RPC Boundary Test', '51999333000', null)$$,
  'RPC: admin_import_create_customer works'
);

select lives_ok(
  $$SELECT public.admin_import_update_customer(
    (SELECT id FROM public.customers WHERE full_name = 'RPC Boundary Test' AND business_unit_id = '22222222-2222-4222-8222-222222222222'),
    'RPC Boundary Test Updated', '51999333000'
  )$$,
  'RPC: admin_import_update_customer works'
);

select lives_ok(
  $$SELECT public.admin_import_verify_customer_status(
    (SELECT id FROM public.customers WHERE full_name = 'RPC Boundary Test Updated' AND business_unit_id = '22222222-2222-4222-8222-222222222222'),
    'returning'
  )$$,
  'RPC: admin_import_verify_customer_status works'
);

select lives_ok(
  $$SELECT public.admin_import_archive_customer(
    (SELECT id FROM public.customers WHERE full_name = 'RPC Boundary Test Updated' AND business_unit_id = '22222222-2222-4222-8222-222222222222')
  )$$,
  'RPC: admin_import_archive_customer works'
);

-- =========================================================================
-- F. Cross-BU isolation (1 test)
-- =========================================================================
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"ff000000-ffff-4fff-8fff-fffffffffff1","app_metadata":{"business_unit_id":"11111111-1111-4111-8111-111111111111","role":"admin"}}';

select is(
  (SELECT count(*)::integer FROM public.customers
   WHERE business_unit_id = '22222222-2222-4222-8222-222222222222'),
  0,
  'Parfums admin sees 0 Import customers (cross-BU isolation)'
);

-- =========================================================================
-- G. Phone helper revoked (1 test)
-- =========================================================================
select throws_ok(
  $$SELECT app.normalize_import_phone('51999111222')$$,
  42501, null,
  'normalize_import_phone denied for authenticated'
);

-- Cleanup
reset role;

select * from finish();
rollback;
