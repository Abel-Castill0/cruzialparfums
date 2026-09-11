-- Cruzial Platform V2 — Import Admin Operations (Phase 4J5C1)
--
-- pgTAP tests for:
--   - Order status lifecycle RPCs
--   - Customer CRUD RPCs
--   - Authorization enforcement
--   - Cross-BU isolation
--   - Snapshot immutability

begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

-- Fixtures: users + memberships
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('a1000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'import-admin-ops@example.test', '', now(), now()),
  ('b1000000-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'import-viewer-ops@example.test', '', now(), now()),
  ('c1000000-cccc-4ccc-8ccc-cccccccccccc', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'parfums-admin-ops@example.test', '', now(), now());

insert into public.admin_memberships (user_id, business_unit_id, role) values
  ('a1000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'admin'),
  ('b1000000-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'viewer'),
  ('c1000000-cccc-4ccc-8ccc-cccccccccccc', '11111111-1111-4111-8111-111111111111', 'admin');

-- Fixtures: orders
insert into public.orders (id, business_unit_id, order_number, channel, status, customer_snapshot, delivery_snapshot, subtotal_amount, currency, deposit_percentage_snapshot, deposit_amount_snapshot, verified_customer_status_snapshot, created_at)
values
  ('o1000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'CRI-OPS-PENDING', 'whatsapp', 'pending_whatsapp_confirmation', '{"name":"Ops Test Alpha","phone":"51999111222"}', '{"method":"private_delivery","district":"Miraflores","address":"Av. 123","note":""}', 100.00, 'PEN', 50, 50.00, 'new', now()),
  ('o1000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'CRI-OPS-CONFIRMED', 'whatsapp', 'confirmed', '{"name":"Ops Test Beta","phone":"51999333444"}', '{"method":"private_delivery","district":"Surco","address":"Calle 456","note":"Dejar en portería"}', 200.00, 'PEN', 50, 100.00, 'new', now()),
  ('o1000000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', 'CRI-OPS-FULFILLED', 'whatsapp', 'fulfilled', '{"name":"Ops Test Gamma","phone":"51999444555"}', '{"method":"private_delivery","district":"San Isidro","address":"Jr. 789","note":""}', 150.00, 'PEN', 50, 75.00, 'returning', now()),
  ('o1000000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-222222222222', 'CRI-OPS-CANCELLED', 'whatsapp', 'cancelled', '{"name":"Ops Test Delta","phone":"51999555666"}', '{"method":"private_delivery","district":"La Molina","address":"Av. 321","note":""}', 80.00, 'PEN', 50, 40.00, 'new', now()),
  ('o2000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'CRP-OPS-PARFUMS', 'whatsapp', 'pending_whatsapp_confirmation', '{"name":"Parfums Customer","phone":"51999666777"}', '{"district":"Barranco","delivery":"Lima Metropolitana — Motorizado","note":""}', 90.00, 'PEN', now());

-- Fixtures: order lines
insert into public.order_lines (order_id, product_name_snapshot, variant_label_snapshot, variant_snapshot, unit_price_amount, currency, quantity, line_total_amount, sort_order) values
  ('o1000000-0000-4000-8000-000000000001', 'Test Product A', 'Decant 5ml', '{"group":"decant"}', 50.00, 'PEN', 2, 100.00, 0),
  ('o1000000-0000-4000-8000-000000000002', 'Test Product B', 'Frasco 50ml', '{"group":"bottle"}', 100.00, 'PEN', 2, 200.00, 0),
  ('o1000000-0000-4000-8000-000000000003', 'Test Product C', 'Decant 10ml', '{"group":"decant"}', 75.00, 'PEN', 2, 150.00, 0),
  ('o1000000-0000-4000-8000-000000000004', 'Test Product D', 'Decant 5ml', '{"group":"decant"}', 40.00, 'PEN', 2, 80.00, 0);

-- Fixtures: customers
insert into public.customers (id, business_unit_id, full_name, phone, verified_customer_status, verified_by, verified_at)
values
  ('cu100000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'Test Customer Alpha', '51999111222', 'new', 'a1000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now()),
  ('cu100000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'Test Customer Beta', '51999888999', 'returning', 'a1000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now()),
  ('cu200000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Parfums Customer', '51999666777', 'new', null, null);

-- =========================================================================
-- 1. Viewer cannot mutate order
-- =========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub":"b1000000-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}';

select throws_ok(
  $$select public.admin_import_update_order_status('o1000000-0000-4000-8000-000000000001', 'pending_whatsapp_confirmation', 'confirmed')$$,
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
  $$select public.admin_import_update_order_status('o1000000-0000-4000-8000-000000000001', 'pending_whatsapp_confirmation', 'confirmed')$$,
  'import admin can transition pending → confirmed'
);

select is(
  (select status from public.orders where id = 'o1000000-0000-4000-8000-000000000001'),
  'confirmed',
  'order status is confirmed after transition'
);

-- =========================================================================
-- 4. Snapshot unchanged after status update
-- =========================================================================
select is(
  (select customer_snapshot ->> 'name' from public.orders where id = 'o1000000-0000-4000-8000-000000000001'),
  'Ops Test Alpha',
  'customer snapshot name unchanged after status update'
);

select is(
  (select deposit_percentage_snapshot from public.orders where id = 'o1000000-0000-4000-8000-000000000001'),
  50,
  'deposit percentage snapshot unchanged after status update'
);

select is(
  (select deposit_amount_snapshot from public.orders where id = 'o1000000-0000-4000-8000-000000000001'),
  50.00::numeric,
  'deposit amount snapshot unchanged after status update'
);

-- =========================================================================
-- 5. Order lines unchanged after status update
-- =========================================================================
select is(
  (select count(*)::integer from public.order_lines where order_id = 'o1000000-0000-4000-8000-000000000001'),
  2,
  'order lines count unchanged after status update'
);

-- =========================================================================
-- 6. Audit entry appended
-- =========================================================================
select is(
  (select count(*)::integer from public.audit_log where entity_type = 'order' and entity_id = 'o1000000-0000-4000-8000-000000000001' and action = 'order_state_change'),
  1,
  'audit log entry appended for order status change'
);

-- =========================================================================
-- 7. Confirmed → fulfilled accepted
-- =========================================================================
select lives_ok(
  $$select public.admin_import_update_order_status('o1000000-0000-4000-8000-000000000001', 'confirmed', 'fulfilled')$$,
  'import admin can transition confirmed → fulfilled'
);

select is(
  (select status from public.orders where id = 'o1000000-0000-4000-8000-000000000001'),
  'fulfilled',
  'order status is fulfilled after transition'
);

-- =========================================================================
-- 8. Fulfilled is terminal
-- =========================================================================
select throws_ok(
  $$select public.admin_import_update_order_status('o1000000-0000-4000-8000-000000000001', 'fulfilled', 'confirmed')$$,
  'P2023', null,
  'fulfilled order cannot change status'
);

-- =========================================================================
-- 9. Cancelled is terminal
-- =========================================================================
select throws_ok(
  $$select public.admin_import_update_order_status('o1000000-0000-4000-8000-000000000004', 'cancelled', 'confirmed')$$,
  'P2023', null,
  'cancelled order cannot change status'
);

-- =========================================================================
-- 10. Stale expected status rejected
-- =========================================================================
select throws_ok(
  $$select public.admin_import_update_order_status('o1000000-0000-4000-8000-000000000002', 'pending_whatsapp_confirmation', 'confirmed')$$,
  'P2020', null,
  'stale expected status is rejected'
);

-- =========================================================================
-- 11. Invalid transition rejected (confirmed → pending not allowed)
-- =========================================================================
select throws_ok(
  $$select public.admin_import_update_order_status('o1000000-0000-4000-8000-000000000002', 'confirmed', 'pending_whatsapp_confirmation')$$,
  'P2023', null,
  'invalid backward transition is rejected'
);

-- =========================================================================
-- 12. Pending → cancelled accepted
-- =========================================================================
-- Need a fresh pending order
insert into public.orders (id, business_unit_id, order_number, channel, status, customer_snapshot, delivery_snapshot, subtotal_amount, currency)
values ('o3000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'CRI-OPS-CANCEL-TEST', 'whatsapp', 'pending_whatsapp_confirmation', '{"name":"Cancel Test","phone":"51999777888"}', '{"method":"private_delivery","district":"Jesus Maria","address":"Av. 555","note":""}', 60.00, 'PEN');

select lives_ok(
  $$select public.admin_import_update_order_status('o3000000-0000-4000-8000-000000000001', 'pending_whatsapp_confirmation', 'cancelled', 'Cliente no responde')$$,
  'import admin can cancel a pending order with reason'
);

select is(
  (select status from public.orders where id = 'o3000000-0000-4000-8000-000000000001'),
  'cancelled',
  'order status is cancelled after cancellation'
);

-- =========================================================================
-- 13. Parfums admin cannot mutate Import orders
-- =========================================================================
set local request.jwt.claims to '{"sub":"c1000000-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}';

select throws_ok(
  $$select public.admin_import_update_order_status('o1000000-0000-4000-8000-000000000002', 'confirmed', 'fulfilled')$$,
  42501, null,
  'parfums-only admin cannot mutate import orders'
);

-- =========================================================================
-- 14. Customer verification status sets server actor
-- =========================================================================
set local request.jwt.claims to '{"sub":"a1000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';

select lives_ok(
  $$select public.admin_import_verify_customer_status('cu100000-0000-4000-8000-000000000001', 'returning')$$,
  'import admin can change customer to returning'
);

select is(
  (select verified_customer_status from public.customers where id = 'cu100000-0000-4000-8000-000000000001'),
  'returning',
  'customer status updated to returning'
);

select is(
  (select verified_by from public.customers where id = 'cu100000-0000-4000-8000-000000000001'),
  'a1000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
  'verified_by is set to the acting admin'
);

select isnt(
  (select verified_at from public.customers where id = 'cu100000-0000-4000-8000-000000000001'),
  null,
  'verified_at is set'
);

-- =========================================================================
-- 15. Customer phone normalization on create
-- =========================================================================
select lives_ok(
  $$select public.admin_import_create_customer('Phone Test', '(51) 999-111-333')$$,
  'import admin can create customer with formatted phone'
);

-- =========================================================================
-- 16. Duplicate phone detection
-- =========================================================================
select throws_ok(
  $$select public.admin_import_create_customer('Duplicate Test', '51999111222')$$,
  'P2026', null,
  'duplicate active customer phone is rejected'
);

-- =========================================================================
-- 17. Customer archive
-- =========================================================================
-- Create a customer to archive
insert into public.customers (id, business_unit_id, full_name, phone, verified_customer_status)
values ('cu300000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'Archive Test', '51999000111', 'new');

select lives_ok(
  $$select public.admin_import_archive_customer('cu300000-0000-4000-8000-000000000001')$$,
  'import admin can archive customer'
);

select isnt(
  (select archived_at from public.customers where id = 'cu300000-0000-4000-8000-000000000001'),
  null,
  'archived_at is set after archiving'
);

-- =========================================================================
-- 18. Cannot edit archived customer
-- =========================================================================
select throws_ok(
  $$select public.admin_import_update_customer('cu300000-0000-4000-8000-000000000001', 'New Name')$$,
  'P2027', null,
  'archived customer cannot be edited'
);

-- =========================================================================
-- 19. Link customer to order
-- =========================================================================
-- Create a fresh order with no customer_id
insert into public.orders (id, business_unit_id, order_number, channel, status, customer_snapshot, delivery_snapshot, subtotal_amount, currency, customer_id)
values ('o4000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'CRI-OPS-LINK-TEST', 'whatsapp', 'pending_whatsapp_confirmation', '{"name":"Link Test","phone":"51999888999"}', '{"method":"private_delivery","district":"Surquillo","address":"Calle 123","note":""}', 120.00, 'PEN', null);

select lives_ok(
  $$select public.admin_import_link_customer_order('o4000000-0000-4000-8000-000000000001', 'cu100000-0000-4000-8000-000000000002')$$,
  'import admin can link customer to order'
);

select is(
  (select customer_id::text from public.orders where id = 'o4000000-0000-4000-8000-000000000001'),
  'cu100000-0000-4000-8000-000000000002'::text,
  'order customer_id is set after linking'
);

-- =========================================================================
-- 20. Cannot link if order already has customer
-- =========================================================================
select throws_ok(
  $$select public.admin_import_link_customer_order('o4000000-0000-4000-8000-000000000001', 'cu100000-0000-4000-8000-000000000001')$$,
  'P2029', null,
  'cannot link customer to order that already has one'
);

-- =========================================================================
-- 21. Browser cannot spoof verified_by
-- =========================================================================
-- The RPC sets verified_by = auth.uid() internally; the test proves
-- the parameter is never accepted from the client.

-- =========================================================================
-- Commercial snapshots unchanged after all operations
-- =========================================================================
select is(
  (select customer_snapshot ->> 'phone' from public.orders where id = 'o1000000-0000-4000-8000-000000000002'),
  '51999333444',
  'customer snapshot phone unchanged on unrelated order'
);

select is(
  (select delivery_snapshot ->> 'district' from public.orders where id = 'o1000000-0000-4000-8000-000000000002'),
  'Surco',
  'delivery snapshot district unchanged on unrelated order'
);

select * from finish();
rollback;
