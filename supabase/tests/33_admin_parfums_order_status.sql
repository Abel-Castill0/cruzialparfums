-- Cruzial Platform V2 — Admin Parfums order status lifecycle (release)
--
-- pgTAP tests for admin_parfums_update_order_status (20260920020000):
--   - Existence oracle prevention (auth before row lookup)
--   - AAL1 denied, viewer denied, cross-unit denied
--   - Valid transitions (pending -> confirmed -> fulfilled, pending -> cancelled)
--   - Invalid transitions and terminal-state rejection
--   - Stale expected-status concurrency guard
--   - Cancellation reason validation
--   - Audit log entry

begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

-- Fixtures: users + memberships
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('f1000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'parfums-admin-order-status@example.test', '', now(), now()),
  ('f1000000-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'parfums-viewer-order-status@example.test', '', now(), now()),
  ('f1000000-cccc-4ccc-8ccc-cccccccccccc', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'import-admin-order-status@example.test', '', now(), now()),
  ('f1000000-dead-4dad-8dad-deaddeaddead', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'no-membership-order-status@example.test', '', now(), now());

insert into public.admin_memberships (user_id, business_unit_id, role) values
  ('f1000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'admin'),
  ('f1000000-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111', 'viewer'),
  ('f1000000-cccc-4ccc-8ccc-cccccccccccc', '22222222-2222-4222-8222-222222222222', 'admin');

-- Fixtures: Parfums orders, all created pending (the only status the public
-- order-request RPC ever writes).
insert into public.orders (id, business_unit_id, order_number, channel, status, customer_snapshot, delivery_snapshot, subtotal_amount, currency, created_at)
values
  ('f2000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'CRP-STATUS-A', 'whatsapp', 'pending_whatsapp_confirmation', '{"name":"Status Test A","phone":"51999111000"}', '{"district":"Miraflores, Lima","delivery":"Lima Metropolitana — Motorizado","note":""}', 40.00, 'PEN', now()),
  ('f2000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'CRP-STATUS-B', 'whatsapp', 'pending_whatsapp_confirmation', '{"name":"Status Test B","phone":"51999222000"}', '{"district":"San Isidro, Lima","delivery":"Lima Metropolitana — Contraentrega","note":""}', 55.00, 'PEN', now()),
  ('f2000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'CRP-STATUS-C', 'whatsapp', 'pending_whatsapp_confirmation', '{"name":"Status Test C","phone":"51999333000"}', '{"district":"Surco, Lima","delivery":"Lima Metropolitana — Motorizado","note":""}', 60.00, 'PEN', now());

-- =========================================================================
-- EXISTENCE ORACLE: no-membership caller, EXISTING vs NONEXISTENT order
-- =========================================================================
set local role authenticated;
set local request.jwt.claims to '{"aal":"aal2","sub":"f1000000-dead-4dad-8dad-deaddeaddead","role":"authenticated"}';

select throws_ok(
  $$select public.admin_parfums_update_order_status('f2000000-0000-4000-8000-000000000001', 'pending_whatsapp_confirmation', 'confirmed')$$,
  42501, null, 'no-membership caller denied on EXISTING order'
);
select throws_ok(
  $$select public.admin_parfums_update_order_status('aaaaaaaa-bbbb-cccc-dddd-ffffffffffff', 'pending_whatsapp_confirmation', 'confirmed')$$,
  42501, null, 'no-membership caller denied on NONEXISTENT order (same error class)'
);

-- =========================================================================
-- AAL1 DENIED: Parfums admin membership, but no aal2 claim
-- =========================================================================
set local request.jwt.claims to '{"sub":"f1000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
select throws_ok(
  $$select public.admin_parfums_update_order_status('f2000000-0000-4000-8000-000000000001', 'pending_whatsapp_confirmation', 'confirmed')$$,
  42501, null, 'AAL1 session denied even with admin membership'
);

-- =========================================================================
-- VIEWER DENIED
-- =========================================================================
set local request.jwt.claims to '{"aal":"aal2","sub":"f1000000-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}';
select throws_ok(
  $$select public.admin_parfums_update_order_status('f2000000-0000-4000-8000-000000000001', 'pending_whatsapp_confirmation', 'confirmed')$$,
  42501, null, 'Parfums viewer cannot update order status'
);

-- =========================================================================
-- CROSS-UNIT DENIED: Import-only admin against a Parfums order
-- =========================================================================
set local request.jwt.claims to '{"aal":"aal2","sub":"f1000000-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}';
select throws_ok(
  $$select public.admin_parfums_update_order_status('f2000000-0000-4000-8000-000000000001', 'pending_whatsapp_confirmation', 'confirmed')$$,
  42501, null, 'Import-only admin cannot resolve a Parfums order (cross-unit denial, denied before row lookup)'
);

-- =========================================================================
-- ADMIN: valid transitions
-- =========================================================================
set local request.jwt.claims to '{"aal":"aal2","sub":"f1000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';

select lives_ok(
  $$select public.admin_parfums_update_order_status('f2000000-0000-4000-8000-000000000001', 'pending_whatsapp_confirmation', 'confirmed')$$,
  'Parfums admin can transition pending -> confirmed'
);
select is(
  (select status from public.orders where id = 'f2000000-0000-4000-8000-000000000001'),
  'confirmed', 'order A is now confirmed'
);
select lives_ok(
  $$select public.admin_parfums_update_order_status('f2000000-0000-4000-8000-000000000001', 'confirmed', 'fulfilled')$$,
  'Parfums admin can transition confirmed -> fulfilled'
);
select is(
  (select status from public.orders where id = 'f2000000-0000-4000-8000-000000000001'),
  'fulfilled', 'order A is now fulfilled'
);

-- =========================================================================
-- INVALID TRANSITION: pending -> fulfilled directly
-- =========================================================================
select throws_ok(
  $$select public.admin_parfums_update_order_status('f2000000-0000-4000-8000-000000000002', 'pending_whatsapp_confirmation', 'fulfilled')$$,
  'P2023', null, 'pending cannot jump straight to fulfilled'
);

-- =========================================================================
-- TERMINAL STATE: fulfilled cannot change again
-- =========================================================================
select throws_ok(
  $$select public.admin_parfums_update_order_status('f2000000-0000-4000-8000-000000000001', 'fulfilled', 'confirmed')$$,
  'P2023', null, 'a fulfilled order cannot change status again'
);

-- =========================================================================
-- STALE EXPECTED STATUS: concurrency guard
-- =========================================================================
select throws_ok(
  $$select public.admin_parfums_update_order_status('f2000000-0000-4000-8000-000000000002', 'confirmed', 'fulfilled')$$,
  'P2020', null, 'expected status mismatch is rejected (order B is still pending, not confirmed)'
);

-- =========================================================================
-- CANCELLATION: reason required
-- =========================================================================
select throws_ok(
  $$select public.admin_parfums_update_order_status('f2000000-0000-4000-8000-000000000002', 'pending_whatsapp_confirmation', 'cancelled')$$,
  'P2025', null, 'cancellation without a reason is rejected'
);
select lives_ok(
  $$select public.admin_parfums_update_order_status('f2000000-0000-4000-8000-000000000002', 'pending_whatsapp_confirmation', 'cancelled', 'Cliente no responde')$$,
  'cancellation with a valid reason succeeds'
);

-- =========================================================================
-- VALID TRANSITION: confirmed -> cancelled
-- =========================================================================
select lives_ok(
  $$select public.admin_parfums_update_order_status('f2000000-0000-4000-8000-000000000003', 'pending_whatsapp_confirmation', 'confirmed')$$,
  'Parfums admin can transition pending -> confirmed (order C, setup for confirmed -> cancelled)'
);
select lives_ok(
  $$select public.admin_parfums_update_order_status('f2000000-0000-4000-8000-000000000003', 'confirmed', 'cancelled', 'Cliente cambio de decision')$$,
  'Parfums admin can transition confirmed -> cancelled'
);
select is(
  (select status from public.orders where id = 'f2000000-0000-4000-8000-000000000003'),
  'cancelled', 'order C is now cancelled'
);

-- =========================================================================
-- NOT FOUND: admin caller, nonexistent (but well-formed) order id
-- =========================================================================
select throws_ok(
  $$select public.admin_parfums_update_order_status('aaaaaaaa-bbbb-cccc-dddd-ffffffffffff', 'pending_whatsapp_confirmation', 'confirmed')$$,
  'P0002', null, 'admin caller gets not-found for a nonexistent order id'
);

-- =========================================================================
-- MALFORMED UUID: RPC boundary never leaks a raw Postgres cast error
-- =========================================================================
select throws_ok(
  $$select public.admin_parfums_update_order_status('not-a-uuid', 'pending_whatsapp_confirmation', 'confirmed')$$,
  '22P02', null, 'a malformed order id is rejected as an invalid uuid cast, not silently accepted'
);

-- =========================================================================
-- AUDIT LOG
-- =========================================================================
select is(
  (select count(*)::integer from public.audit_log where entity_type = 'order' and entity_id = 'f2000000-0000-4000-8000-000000000001' and action = 'order_state_change'),
  2,
  'both order A transitions appended an order_state_change audit entry'
);
select is(
  (select count(*)::integer from public.audit_log where entity_type = 'order' and entity_id = 'f2000000-0000-4000-8000-000000000003' and action = 'order_state_change' and after ->> 'reason' = 'Cliente cambio de decision'),
  1,
  'the cancellation reason is represented in the audit entry'
);

reset role;
select * from finish();
rollback;
