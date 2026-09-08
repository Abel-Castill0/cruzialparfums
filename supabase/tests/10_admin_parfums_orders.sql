-- Cruzial Platform V2 — Admin Parfums Orders Inbox / Detail (Phase 4E2)
--
-- This capability adds no migration, no RPC and no new RLS policy: reads go
-- through the existing `orders_admin_read` / `order_lines_admin_read`
-- policies from supabase/migrations/20260907154358_rls_policies.sql. This
-- file proves those policies actually deliver the Phase 4E2 authorization
-- contract for orders specifically (Parfums admin/viewer read, Import-only
-- denied, anonymous denied) plus the snapshot/aggregation shape the
-- repository depends on.

begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('44444444-dddd-4ddd-8ddd-dddddddddddd', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'parfums-admin-orders@example.test', '', now(), now()),
  ('55555555-eeee-4eee-8eee-eeeeeeeeeeee', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'parfums-viewer-orders@example.test', '', now(), now()),
  ('66666666-ffff-4fff-8fff-ffffffffffff', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'import-admin-orders@example.test', '', now(), now());

insert into public.admin_memberships (user_id, business_unit_id, role) values
  ('44444444-dddd-4ddd-8ddd-dddddddddddd', '11111111-1111-4111-8111-111111111111', 'admin'),
  ('55555555-eeee-4eee-8eee-eeeeeeeeeeee', '11111111-1111-4111-8111-111111111111', 'viewer'),
  ('66666666-ffff-4fff-8fff-ffffffffffff', '22222222-2222-4222-8222-222222222222', 'admin');

-- Two Parfums orders (older + newer) and one Import order, inserted directly
-- (as the migration/seed role, which bypasses RLS) the same way the other
-- Admin CRUD pgTAP fixtures seed their base data.
insert into public.orders (id, business_unit_id, order_number, channel, status, customer_snapshot, delivery_snapshot, subtotal_amount, currency, created_at) values
  ('d1000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'CRP-TEST-OLDER', 'whatsapp', 'pending_whatsapp_confirmation', '{"name":"TEST Customer Alpha","phone":"51999111222"}', '{"district":"Miraflores, Lima","delivery":"Lima Metropolitana — Motorizado","note":""}', 32.00, 'PEN', now() - interval '1 day'),
  ('d1000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'CRP-TEST-NEWER', 'whatsapp', 'pending_whatsapp_confirmation', '{"name":"TEST Customer Beta","phone":"51999333444"}', '{"district":"San Isidro, Lima","delivery":"Lima Metropolitana — Contraentrega","note":"Dejar con recepción"}', 58.50, 'PEN', now()),
  ('d2000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'CRI-TEST-IMPORT', 'whatsapp', 'pending_whatsapp_confirmation', '{"name":"TEST Import Customer","phone":"51999555666"}', '{"district":"Surco, Lima","delivery":"Lima Metropolitana — Motorizado","note":""}', 120.00, 'PEN', now());

insert into public.order_lines (order_id, product_name_snapshot, variant_label_snapshot, variant_snapshot, unit_price_amount, currency, quantity, line_total_amount, sort_order) values
  ('d1000000-0000-4000-8000-000000000001', 'TEST Brand TEST Product', 'Decant 5 ml', '{"group":"decant","size_ml":5,"brand":"TEST Brand"}', 16.00, 'PEN', 2, 32.00, 0),
  ('d1000000-0000-4000-8000-000000000002', 'TEST Brand TEST Product A', 'Decant 5 ml', '{"group":"decant","size_ml":5,"brand":"TEST Brand"}', 16.00, 'PEN', 1, 16.00, 0),
  ('d1000000-0000-4000-8000-000000000002', 'TEST Brand TEST Product B', 'Frasco 50 ml', '{"group":"bottle","size_ml":50,"brand":"TEST Brand"}', 42.50, 'PEN', 1, 42.50, 1);

-- ---------------------------------------------------------------------------
-- Parfums admin: reads both Parfums orders, never the Import one.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"44444444-dddd-4ddd-8ddd-dddddddddddd","role":"authenticated"}';

select is(
  (select count(*)::integer from public.orders where business_unit_id = '11111111-1111-4111-8111-111111111111'),
  2, 'Parfums admin sees both Parfums orders'
);
select is(
  (select count(*)::integer from public.orders where id = 'd2000000-0000-4000-8000-000000000001'),
  0, 'Parfums admin cannot see the Import order (business-unit isolation)'
);
select is(
  (select order_number from public.orders order by created_at desc limit 1),
  'CRP-TEST-NEWER', 'newest-first ordering surfaces the most recent order first'
);
select is(
  (select count(*)::integer from public.order_lines where order_id = 'd1000000-0000-4000-8000-000000000002'),
  2, 'line_count aggregates every line for a multi-line order'
);
select is(
  (select customer_snapshot ->> 'name' from public.orders where id = 'd1000000-0000-4000-8000-000000000001'),
  'TEST Customer Alpha', 'immutable customer snapshot is readable as stored'
);
select is(
  (select count(*)::integer from public.orders where order_number ilike '%CRP-TEST-NEWER%' or customer_snapshot ->> 'name' ilike '%beta%'),
  1, 'search matches both order_number and customer_snapshot->>name via the same filter shape the repository builds'
);
select is(
  (select count(*)::integer from public.orders where id = '00000000-0000-4000-8000-000000000000'),
  0, 'a non-existent order id resolves to no rows (repository maps this to not_found)'
);

-- ---------------------------------------------------------------------------
-- Parfums viewer: read allowed, same visibility as admin.
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"55555555-eeee-4eee-8eee-eeeeeeeeeeee","role":"authenticated"}';
select is(
  (select count(*)::integer from public.orders where business_unit_id = '11111111-1111-4111-8111-111111111111'),
  2, 'Parfums viewer can read Parfums orders'
);
select is(
  (select count(*)::integer from public.order_lines l join public.orders o on o.id = l.order_id where o.id = 'd1000000-0000-4000-8000-000000000001'),
  1, 'Parfums viewer can read order lines for a Parfums order'
);

-- ---------------------------------------------------------------------------
-- Import-only admin/viewer: denied for Parfums orders (cross-unit denial).
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"66666666-ffff-4fff-8fff-ffffffffffff","role":"authenticated"}';
select is(
  (select count(*)::integer from public.orders where business_unit_id = '11111111-1111-4111-8111-111111111111'),
  0, 'Import-only admin sees zero Parfums orders'
);
select is(
  (select count(*)::integer from public.order_lines l join public.orders o on o.id = l.order_id where o.business_unit_id = '11111111-1111-4111-8111-111111111111'),
  0, 'Import-only admin sees zero Parfums order lines'
);
select is(
  (select count(*)::integer from public.orders where business_unit_id = '22222222-2222-4222-8222-222222222222'),
  1, 'Import-only admin still reads its own unit''s order'
);

-- ---------------------------------------------------------------------------
-- Anonymous: denied entirely (no anon grant exists on either table).
-- ---------------------------------------------------------------------------
reset role;
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select throws_ok(
  $$select count(*) from public.orders$$,
  '42501', null, 'anonymous cannot select orders'
);
select throws_ok(
  $$select count(*) from public.order_lines$$,
  '42501', null, 'anonymous cannot select order_lines'
);

reset role;
select * from finish();
rollback;
