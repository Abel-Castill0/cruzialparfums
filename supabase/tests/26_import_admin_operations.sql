-- Cruzial Platform V2 — Import Admin Operations (Phase 4J5C1 + Correction)
--
-- pgTAP tests for:
--   - Order status lifecycle RPCs
--   - Customer CRUD RPCs with canonical phone storage
--   - Verified provenance on admin creation
--   - Authorization enforcement (auth-before-lookup)
--   - Existence oracle prevention
--   - Cross-BU isolation
--   - Snapshot immutability
--   - Phone helper least-privilege

begin;
create extension if not exists pgtap with schema extensions;
select plan(68);

-- Fixtures: users + memberships
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('a1000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'import-admin-ops@example.test', '', now(), now()),
  ('b1000000-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'import-viewer-ops@example.test', '', now(), now()),
  ('c1000000-cccc-4ccc-8ccc-cccccccccccc', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'parfums-admin-ops@example.test', '', now(), now()),
  ('dead0000-dddd-4ddd-8ddd-deaddeaddead', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'no-membership@example.test', '', now(), now());

insert into public.admin_memberships (user_id, business_unit_id, role) values
  ('a1000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'admin'),
  ('b1000000-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'viewer'),
  ('c1000000-cccc-4ccc-8ccc-cccccccccccc', '11111111-1111-4111-8111-111111111111', 'admin');

-- Fixtures: orders (CHECK constraint only allows draft/pending_whatsapp_confirmation)
-- All Import orders inserted as pending; transitions happen via RPC below.
insert into public.orders (id, business_unit_id, order_number, channel, status, customer_snapshot, delivery_snapshot, subtotal_amount, currency, created_at)
values
  ('a1000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'CRI-OPS-PENDING', 'whatsapp', 'pending_whatsapp_confirmation', '{"name":"Ops Test Alpha","phone":"51999111222"}', '{"method":"private_delivery","district":"Miraflores","address":"Av. 123","note":""}', 100.00, 'PEN', now()),
  ('a1000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'CRI-OPS-CONFIRMED', 'whatsapp', 'pending_whatsapp_confirmation', '{"name":"Ops Test Beta","phone":"51999333444"}', '{"method":"private_delivery","district":"Surco","address":"Calle 456","note":"Dejar en portería"}', 200.00, 'PEN', now()),
  ('a1000000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', 'CRI-OPS-FULFILLED', 'whatsapp', 'pending_whatsapp_confirmation', '{"name":"Ops Test Gamma","phone":"51999444555"}', '{"method":"private_delivery","district":"San Isidro","address":"Jr. 789","note":""}', 150.00, 'PEN', now()),
  ('a1000000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-222222222222', 'CRI-OPS-CANCELLED', 'whatsapp', 'pending_whatsapp_confirmation', '{"name":"Ops Test Delta","phone":"51999555666"}', '{"method":"private_delivery","district":"La Molina","address":"Av. 321","note":""}', 80.00, 'PEN', now()),
  ('c3000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'CRI-OPS-CANCEL-TEST', 'whatsapp', 'pending_whatsapp_confirmation', '{"name":"Cancel Test","phone":"51999777888"}', '{"method":"private_delivery","district":"Jesus Maria","address":"Av. 555","note":""}', 60.00, 'PEN', now()),
  ('e4000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'CRI-OPS-LINK-TEST', 'whatsapp', 'pending_whatsapp_confirmation', '{"name":"Link Test","phone":"51999888999"}', '{"method":"private_delivery","district":"Surquillo","address":"Calle 123","note":""}', 120.00, 'PEN', now()),
  ('f5000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'CRI-OPS-FROM-ORDER', 'whatsapp', 'pending_whatsapp_confirmation', '{"name":"From Order Test","phone":"(51) 888-777-666"}', '{"method":"private_delivery","district":"San Borja","address":"Av. 999","note":""}', 95.00, 'PEN', now()),
  ('b2000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'CRP-OPS-PARFUMS', 'whatsapp', 'pending_whatsapp_confirmation', '{"name":"Parfums Customer","phone":"51999666777"}', '{"district":"Barranco","delivery":"Lima Metropolitana — Motorizado","note":""}', 90.00, 'PEN', now());

-- Transition fixtures to desired states via RPC (Import admin context)
set local role authenticated;
set local request.jwt.claims to '{"sub":"a1000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';

-- order002: pending → confirmed
select public.admin_import_update_order_status('a1000000-0000-4000-8000-000000000002', 'pending_whatsapp_confirmation', 'confirmed');

-- order003: pending → confirmed → fulfilled
select public.admin_import_update_order_status('a1000000-0000-4000-8000-000000000003', 'pending_whatsapp_confirmation', 'confirmed');
select public.admin_import_update_order_status('a1000000-0000-4000-8000-000000000003', 'confirmed', 'fulfilled');

-- order004: pending → cancelled
select public.admin_import_update_order_status('a1000000-0000-4000-8000-000000000004', 'pending_whatsapp_confirmation', 'cancelled', 'Cliente no responde');

-- Reset to no session for clean test start
reset role;

-- Fixtures: order lines
insert into public.order_lines (order_id, product_name_snapshot, variant_label_snapshot, variant_snapshot, unit_price_amount, currency, quantity, line_total_amount, sort_order) values
  ('a1000000-0000-4000-8000-000000000001', 'Test Product A', 'Decant 5ml', '{"group":"decant"}', 50.00, 'PEN', 2, 100.00, 0),
  ('a1000000-0000-4000-8000-000000000002', 'Test Product B', 'Frasco 50ml', '{"group":"bottle"}', 100.00, 'PEN', 2, 200.00, 0),
  ('a1000000-0000-4000-8000-000000000003', 'Test Product C', 'Decant 10ml', '{"group":"decant"}', 75.00, 'PEN', 2, 150.00, 0),
  ('a1000000-0000-4000-8000-000000000004', 'Test Product D', 'Decant 5ml', '{"group":"decant"}', 40.00, 'PEN', 2, 80.00, 0);

-- Fixtures: customers
insert into public.customers (id, business_unit_id, full_name, phone, verified_customer_status, verified_by, verified_at)
values
  ('da100000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'Test Customer Alpha', '51999111222', 'new', 'a1000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now()),
  ('da100000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'Test Customer Beta', '51999888999', 'returning', 'a1000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now()),
  ('db100000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Parfums Customer', '51999666777', 'new', null, now());

-- =========================================================================
-- EXISTENCE ORACLE: unauthorized caller + EXISTING Import order
-- =========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub":"dead0000-dddd-4ddd-8ddd-deaddeaddead","role":"authenticated"}';

-- No membership at all — must fail authorization BEFORE revealing row existence
select throws_ok(
  $$select public.admin_import_update_order_status('a1000000-0000-4000-8000-000000000001', 'pending_whatsapp_confirmation', 'confirmed')$$,
  42501, null,
  'no-membership caller denied on EXISTING order'
);

-- =========================================================================
-- EXISTENCE ORACLE: same unauthorized caller + NONEXISTENT order
-- =========================================================================
select throws_ok(
  $$select public.admin_import_update_order_status('aaaaaaaa-bbbb-cccc-dddd-ffffffffffff', 'pending_whatsapp_confirmation', 'confirmed')$$,
  42501, null,
  'no-membership caller denied on NONEXISTENT order (same error class)'
);

-- =========================================================================
-- EXISTENCE ORACLE: customer mutation — existing Import customer
-- =========================================================================
select throws_ok(
  $$select public.admin_import_update_customer('da100000-0000-4000-8000-000000000001', 'Hacked Name')$$,
  42501, null,
  'no-membership caller denied on EXISTING customer'
);

-- =========================================================================
-- EXISTENCE ORACLE: customer mutation — nonexistent customer
-- =========================================================================
select throws_ok(
  $$select public.admin_import_update_customer('aaaaaaaa-bbbb-cccc-dddd-ffffffffffff', 'Hacked Name')$$,
  42501, null,
  'no-membership caller denied on NONEXISTENT customer (same error class)'
);

-- =========================================================================
-- EXISTENCE ORACLE: customer verify — existing
-- =========================================================================
select throws_ok(
  $$select public.admin_import_verify_customer_status('da100000-0000-4000-8000-000000000001', 'returning')$$,
  42501, null,
  'no-membership caller denied verify on EXISTING customer'
);

-- =========================================================================
-- EXISTENCE ORACLE: customer archive — nonexistent
-- =========================================================================
select throws_ok(
  $$select public.admin_import_archive_customer('aaaaaaaa-bbbb-cccc-dddd-ffffffffffff')$$,
  42501, null,
  'no-membership caller denied archive on NONEXISTENT customer'
);

-- =========================================================================
-- 1. Viewer cannot mutate order
-- =========================================================================
set local request.jwt.claims to '{"sub":"b1000000-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}';

select throws_ok(
  $$select public.admin_import_update_order_status('a1000000-0000-4000-8000-000000000001', 'pending_whatsapp_confirmation', 'confirmed')$$,
  42501, null,
  'viewer cannot update order status'
);

-- =========================================================================
-- 2. Viewer cannot mutate customer
-- =========================================================================
select throws_ok(
  $$select public.admin_import_create_customer('New Viewer Customer')$$,
  42501, null,
  'viewer cannot create customer'
);

-- =========================================================================
-- 3. Import admin can update order status (pending → confirmed)
-- =========================================================================
set local request.jwt.claims to '{"sub":"a1000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';

select lives_ok(
  $$select public.admin_import_update_order_status('a1000000-0000-4000-8000-000000000001', 'pending_whatsapp_confirmation', 'confirmed')$$,
  'import admin can transition pending → confirmed'
);

select is(
  (select status from public.orders where id = 'a1000000-0000-4000-8000-000000000001'),
  'confirmed',
  'order status is confirmed after transition'
);

-- =========================================================================
-- 4. Snapshot unchanged after status update
-- =========================================================================
select is(
  (select customer_snapshot ->> 'name' from public.orders where id = 'a1000000-0000-4000-8000-000000000001'),
  'Ops Test Alpha',
  'customer snapshot name unchanged after status update'
);

select is(
  (select deposit_percentage_snapshot from public.orders where id = 'a1000000-0000-4000-8000-000000000001'),
  null,
  'deposit percentage snapshot null (not set in test fixtures)'
);

select is(
  (select deposit_amount_snapshot from public.orders where id = 'a1000000-0000-4000-8000-000000000001'),
  null,
  'deposit amount snapshot null (not set in test fixtures)'
);

-- =========================================================================
-- 5. Order lines unchanged after status update
-- =========================================================================
select is(
  (select count(*)::integer from public.order_lines where order_id = 'a1000000-0000-4000-8000-000000000001'),
  1,
  'order lines count unchanged after status update'
);

-- =========================================================================
-- 6. Audit entry appended
-- =========================================================================
select is(
  (select count(*)::integer from public.audit_log where entity_type = 'order' and entity_id = 'a1000000-0000-4000-8000-000000000001' and action = 'order_state_change'),
  1,
  'audit log entry appended for order status change'
);

-- =========================================================================
-- 7. Confirmed → fulfilled accepted
-- =========================================================================
select lives_ok(
  $$select public.admin_import_update_order_status('a1000000-0000-4000-8000-000000000001', 'confirmed', 'fulfilled')$$,
  'import admin can transition confirmed → fulfilled'
);

select is(
  (select status from public.orders where id = 'a1000000-0000-4000-8000-000000000001'),
  'fulfilled',
  'order status is fulfilled after transition'
);

-- =========================================================================
-- 8. Fulfilled is terminal
-- =========================================================================
select throws_ok(
  $$select public.admin_import_update_order_status('a1000000-0000-4000-8000-000000000001', 'fulfilled', 'confirmed')$$,
  'P2023', null,
  'fulfilled order cannot change status'
);

-- =========================================================================
-- 9. Cancelled is terminal
-- =========================================================================
select throws_ok(
  $$select public.admin_import_update_order_status('a1000000-0000-4000-8000-000000000004', 'cancelled', 'confirmed')$$,
  'P2023', null,
  'cancelled order cannot change status'
);

-- =========================================================================
-- 10. Stale expected status rejected
-- =========================================================================
select throws_ok(
  $$select public.admin_import_update_order_status('a1000000-0000-4000-8000-000000000002', 'pending_whatsapp_confirmation', 'confirmed')$$,
  'P2020', null,
  'stale expected status is rejected'
);

-- =========================================================================
-- 11. Invalid transition rejected (confirmed → pending not allowed)
-- =========================================================================
select throws_ok(
  $$select public.admin_import_update_order_status('a1000000-0000-4000-8000-000000000002', 'confirmed', 'pending_whatsapp_confirmation')$$,
  'P2023', null,
  'invalid backward transition is rejected'
);

-- =========================================================================
-- 12. Pending → cancelled accepted
-- =========================================================================
select lives_ok(
  $$select public.admin_import_update_order_status('c3000000-0000-4000-8000-000000000001', 'pending_whatsapp_confirmation', 'cancelled', 'Cliente no responde')$$,
  'import admin can cancel a pending order with reason'
);

select is(
  (select status from public.orders where id = 'c3000000-0000-4000-8000-000000000001'),
  'cancelled',
  'order status is cancelled after cancellation'
);

-- =========================================================================
-- 13. Parfums admin cannot mutate Import orders
-- =========================================================================
set local request.jwt.claims to '{"sub":"c1000000-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}';

select throws_ok(
  $$select public.admin_import_update_order_status('a1000000-0000-4000-8000-000000000002', 'confirmed', 'fulfilled')$$,
  42501, null,
  'parfums-only admin cannot mutate import orders'
);

-- =========================================================================
-- 14. Customer verification status sets server actor
-- =========================================================================
set local request.jwt.claims to '{"sub":"a1000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';

select lives_ok(
  $$select public.admin_import_verify_customer_status('da100000-0000-4000-8000-000000000001', 'returning')$$,
  'import admin can change customer to returning'
);

select is(
  (select verified_customer_status from public.customers where id = 'da100000-0000-4000-8000-000000000001'),
  'returning',
  'customer status updated to returning'
);

select is(
  (select verified_by from public.customers where id = 'da100000-0000-4000-8000-000000000001'),
  'a1000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
  'verified_by is set to the acting admin'
);

select isnt(
  (select verified_at from public.customers where id = 'da100000-0000-4000-8000-000000000001'),
  null,
  'verified_at is set'
);

-- =========================================================================
-- 15. Admin-created customer: phone stored canonical, provenance set
-- =========================================================================
select lives_ok(
  $$select public.admin_import_create_customer('Canonical Phone Test', '(51) 999-111-333')$$,
  'import admin can create customer with formatted phone'
);

-- Verify the phone is stored as canonical digits, not the raw formatted input
select is(
  (select phone from public.customers where full_name = 'Canonical Phone Test' and business_unit_id = '22222222-2222-4222-8222-222222222222'),
  '51999111333',
  'admin-created customer phone is canonical digits (not raw formatted)'
);

-- Verify provenance: verified_by = acting admin, verified_at IS NOT NULL
select is(
  (select verified_by from public.customers where full_name = 'Canonical Phone Test' and business_unit_id = '22222222-2222-4222-8222-222222222222'),
  'a1000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
  'admin-created customer verified_by is the acting admin'
);

select isnt(
  (select verified_at from public.customers where full_name = 'Canonical Phone Test' and business_unit_id = '22222222-2222-4222-8222-222222222222'),
  null,
  'admin-created customer verified_at is set'
);

select is(
  (select verified_customer_status from public.customers where full_name = 'Canonical Phone Test' and business_unit_id = '22222222-2222-4222-8222-222222222222'),
  'new',
  'admin-created customer status is new (never automatically returning)'
);

-- =========================================================================
-- 16. Admin update: phone stored canonical
-- =========================================================================
select lives_ok(
  $$select public.admin_import_update_customer((select id from public.customers where full_name = 'Canonical Phone Test' and business_unit_id = '22222222-2222-4222-8222-222222222222'), 'Canonical Phone Test Updated', '+51 999 222 444')$$,
  'import admin can update customer with formatted phone'
);

select is(
  (select phone from public.customers where full_name = 'Canonical Phone Test Updated' and business_unit_id = '22222222-2222-4222-8222-222222222222'),
  '51999222444',
  'admin-updated customer phone is canonical digits'
);

-- =========================================================================
-- 17. Too-short phone rejected
-- =========================================================================
select throws_ok(
  $$select public.admin_import_create_customer('Short Phone Test', '123')$$,
  '22023', null,
  'too-short phone (< 9 digits) is rejected'
);

-- =========================================================================
-- 18. Duplicate phone detection
-- =========================================================================
select throws_ok(
  $$select public.admin_import_create_customer('Duplicate Test', '51999111222')$$,
  'P2026', null,
  'duplicate active customer phone is rejected'
);

-- =========================================================================
-- 19. Customer archive
-- =========================================================================
-- Reset to postgres for direct fixture insert (authenticated no longer has INSERT)
reset role;
insert into public.customers (id, business_unit_id, full_name, phone, verified_customer_status, verified_by, verified_at)
values ('dc300000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'Archive Test', '51999000111', 'new', null, now());
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa","app_metadata":{"business_unit_id":"22222222-2222-4222-8222-222222222222","role":"admin"}}';

select lives_ok(
  $$select public.admin_import_archive_customer('dc300000-0000-4000-8000-000000000001')$$,
  'import admin can archive customer'
);

select isnt(
  (select archived_at from public.customers where id = 'dc300000-0000-4000-8000-000000000001'),
  null,
  'archived_at is set after archiving'
);

-- =========================================================================
-- 20. Cannot edit archived customer
-- =========================================================================
select throws_ok(
  $$select public.admin_import_update_customer('dc300000-0000-4000-8000-000000000001', 'New Name')$$,
  'P2027', null,
  'archived customer cannot be edited'
);

-- =========================================================================
-- 21. Link customer to order
-- =========================================================================
select lives_ok(
  $$select public.admin_import_link_customer_order('e4000000-0000-4000-8000-000000000001', 'da100000-0000-4000-8000-000000000002')$$,
  'import admin can link customer to order'
);

select is(
  (select customer_id::text from public.orders where id = 'e4000000-0000-4000-8000-000000000001'),
  'da100000-0000-4000-8000-000000000002'::text,
  'order customer_id is set after linking'
);

-- =========================================================================
-- 22. Cannot link if order already has customer
-- =========================================================================
select throws_ok(
  $$select public.admin_import_link_customer_order('e4000000-0000-4000-8000-000000000001', 'da100000-0000-4000-8000-000000000001')$$,
  'P2029', null,
  'cannot link customer to order that already has one'
);

-- =========================================================================
-- 23. Create-from-order: canonical phone, status = new, provenance
-- =========================================================================
select lives_ok(
  $$select public.admin_import_create_customer_from_order('f5000000-0000-4000-8000-000000000001')$$,
  'import admin can create customer from order'
);

-- Verify phone is canonical digits
select is(
  (select phone from public.customers where full_name = 'From Order Test' and business_unit_id = '22222222-2222-4222-8222-222222222222'),
  '51888777666',
  'create-from-order customer phone is canonical digits'
);

-- Verify status = new
select is(
  (select verified_customer_status from public.customers where full_name = 'From Order Test' and business_unit_id = '22222222-2222-4222-8222-222222222222'),
  'new',
  'create-from-order customer status is new'
);

-- Verify provenance
select is(
  (select verified_by from public.customers where full_name = 'From Order Test' and business_unit_id = '22222222-2222-4222-8222-222222222222'),
  'a1000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
  'create-from-order customer verified_by is the acting admin'
);

select isnt(
  (select verified_at from public.customers where full_name = 'From Order Test' and business_unit_id = '22222222-2222-4222-8222-222222222222'),
  null,
  'create-from-order customer verified_at is set'
);

-- Verify order is linked
select isnt(
  (select customer_id from public.orders where id = 'f5000000-0000-4000-8000-000000000001'),
  null,
  'order customer_id is set after create-from-order'
);

-- =========================================================================
-- Commercial snapshots unchanged after all operations
-- =========================================================================
select is(
  (select customer_snapshot ->> 'phone' from public.orders where id = 'a1000000-0000-4000-8000-000000000002'),
  '51999333444',
  'customer snapshot phone unchanged on unrelated order'
);

select is(
  (select delivery_snapshot ->> 'district' from public.orders where id = 'a1000000-0000-4000-8000-000000000002'),
  'Surco',
  'delivery snapshot district unchanged on unrelated order'
);

-- =========================================================================
-- CONCURRENCY GATE: A. Canonical duplicate → P2026
-- =========================================================================
select lives_ok(
  $$select public.admin_import_create_customer('Concurrency Test A', '51999000222')$$,
  'A: can create customer with raw phone'
);

select throws_ok(
  $$select public.admin_import_create_customer('Concurrency Test A Dup', '(51) 999-000-222')$$,
  'P2026', null,
  'A: formatted duplicate of active customer → P2026'
);

-- =========================================================================
-- CONCURRENCY GATE: B. Different BU allowed
-- =========================================================================
-- The unique index is scoped to Import BU only.
-- Verify the index WHERE clause excludes non-Import BU by checking
-- that the index definition is correct.
select is(
  (SELECT position('22222222-2222-4222-8222-222222222222'::text in indexdef) > 0
   FROM pg_indexes WHERE indexname = 'customers_import_active_phone_uniq'),
  true,
  'B: unique index scoped to Import BU only'
);

-- =========================================================================
-- CONCURRENCY GATE: C. Archived phone reuse
-- =========================================================================
-- Archive the customer from test A, then create a new one with the same phone
select lives_ok(
  $$select public.admin_import_archive_customer((SELECT id FROM public.customers WHERE full_name = 'Concurrency Test A' AND business_unit_id = '22222222-2222-4222-8222-222222222222'))$$,
  'C: archive customer with phone 51999000222'
);

select is(
  (select archived_at IS NOT NULL from public.customers
   WHERE full_name = 'Concurrency Test A' AND business_unit_id = '22222222-2222-4222-8222-222222222222'),
  true,
  'C: archived_at is set'
);

select lives_ok(
  $$select public.admin_import_create_customer('Concurrency Test C New', '51999000222')$$,
  'C: new customer can reuse archived phone'
);

-- =========================================================================
-- CONCURRENCY GATE: D. Update collision → P2026
-- =========================================================================
-- Customer A has phone 51999000222 (Concurrency Test C New)
-- Customer B has phone 51999888999 (Test Customer Beta)
-- Update B to A's phone → must fail
select throws_ok(
  $$select public.admin_import_update_customer(
    (SELECT id FROM public.customers WHERE full_name = 'Test Customer Beta' AND business_unit_id = '22222222-2222-4222-8222-222222222222'),
    'Test Customer Beta', '51999000222'
  )$$,
  'P2026', null,
  'D: update collision → P2026 (cannot overwrite A phone)'
);

-- Self-update to same phone is idempotent (no collision with self)
select lives_ok(
  $$select public.admin_import_update_customer(
    (SELECT id FROM public.customers WHERE full_name = 'Concurrency Test C New' AND business_unit_id = '22222222-2222-4222-8222-222222222222'),
    'Concurrency Test C New', '51999000222'
  )$$,
  'D: self-update to same phone is idempotent (no collision with self)'
);

-- =========================================================================
-- CONCURRENCY GATE: E. Order already linked → cannot overwrite
-- =========================================================================
-- order e4000000 was linked to customer da1000002 in test 21
select throws_ok(
  $$select public.admin_import_link_customer_order(
    'e4000000-0000-4000-8000-000000000001',
    (SELECT id FROM public.customers WHERE full_name = 'Concurrency Test C New' AND business_unit_id = '22222222-2222-4222-8222-222222222222')
  )$$,
  'P2029', null,
  'E: second link attempt on already-linked order → P2029'
);

-- =========================================================================
-- CONCURRENCY GATE: F. Create-from-order on linked order → P2029
-- =========================================================================
select throws_ok(
  $$select public.admin_import_create_customer_from_order('e4000000-0000-4000-8000-000000000001')$$,
  'P2029', null,
  'F: create-from-order on already-linked order → P2029'
);

-- =========================================================================
-- CONCURRENCY GATE: G. Unique index exists and is scoped
-- =========================================================================
select is(
  (SELECT count(*)::integer FROM pg_indexes
   WHERE indexname = 'customers_import_active_phone_uniq'
     AND schemaname = 'public'),
  1,
  'G: partial unique index customers_import_active_phone_uniq exists'
);

-- =========================================================================
-- CONCURRENCY GATE: H. Snapshot unchanged when customer_id is linked
-- =========================================================================
select is(
  (SELECT customer_snapshot ->> 'name' FROM public.orders
   WHERE id = 'e4000000-0000-4000-8000-000000000001'),
  'Link Test',
  'H: customer_snapshot name unchanged after link'
);

select is(
  (SELECT delivery_snapshot ->> 'district' FROM public.orders
   WHERE id = 'e4000000-0000-4000-8000-000000000001'),
  'Surquillo',
  'H: delivery_snapshot district unchanged after link'
);

select is(
  (SELECT subtotal_amount FROM public.orders
   WHERE id = 'e4000000-0000-4000-8000-000000000001'),
  120.00::numeric,
  'H: subtotal_amount unchanged after link'
);

-- =========================================================================
-- CONCURRENCY GATE: I. All auth/viewer/cross-BU tests still green
-- =========================================================================
-- Re-run the existence oracle and auth tests to confirm nothing regressed
set local request.jwt.claims to '{"sub":"dead0000-dddd-4ddd-8ddd-deaddeaddead","role":"authenticated"}';

select throws_ok(
  $$select public.admin_import_create_customer('Should Fail', '51999000333')$$,
  42501, null,
  'I: no-membership caller still denied on customer create'
);

select throws_ok(
  $$select public.admin_import_update_customer(
    (SELECT id FROM public.customers WHERE full_name = 'Test Customer Alpha' AND business_unit_id = '22222222-2222-4222-8222-222222222222'),
    'Hacked'
  )$$,
  42501, null,
  'I: no-membership caller still denied on customer update'
);

-- Viewer still cannot mutate
set local request.jwt.claims to '{"sub":"b1000000-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}';

select throws_ok(
  $$select public.admin_import_create_customer('Viewer Fail', '51999000444')$$,
  42501, null,
  'I: viewer still cannot create customer'
);

select * from finish();
rollback;
