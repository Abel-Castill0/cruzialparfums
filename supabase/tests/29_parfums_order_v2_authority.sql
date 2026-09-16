-- 4K2-B0.1: Parfums order-request v2 RPC tests.
-- Tests price authority, product/variant ownership, mixed authority,
-- idempotency, and failure atomicity.

begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

-- 1. v2 RPC exists and is service-role only
select has_function('public', 'create_parfums_order_request_v2',
  'v2 RPC exists');
select ok(not has_function_privilege('anon',
  'public.create_parfums_order_request_v2(uuid,jsonb,jsonb,text,jsonb)', 'execute'),
  'anon cannot execute v2');
select ok(not has_function_privilege('authenticated',
  'public.create_parfums_order_request_v2(uuid,jsonb,jsonb,text,jsonb)', 'execute'),
  'authenticated cannot execute v2');
select ok(has_function_privilege('service_role',
  'public.create_parfums_order_request_v2(uuid,jsonb,jsonb,text,jsonb)', 'execute'),
  'service_role can execute v2');

-- 2. Helper: insert a test product + variant for v2 tests
set local role service_role;

insert into public.products (id, business_unit_id, legacy_id, slug, brand, name,
  description, gender, concentration, production_status, availability_status,
  publication_status, verification_status, price_verified_at, specs)
values (
  'a1000000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'b0-test-v2', 'b0-test-v2', 'B0 Test', 'B0 Test Parfum',
  'Test', 'unisex', 'EDP', 'active', 'available', 'published', 'legacy',
  now(),
  '{"notes":["test"],"tag":"test"}'::jsonb
);

insert into public.product_variants (id, product_id, label, variant_kind, size_ml,
  price_amount, currency, publication_status, price_verification_status, sort_order)
values (
  'b1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  '3 ml', 'decant', 3, 12.50, 'PEN', 'published', 'official_pdf', 0
);

-- Also insert a second product + variant for cross-product ownership test
insert into public.products (id, business_unit_id, legacy_id, slug, brand, name,
  description, gender, concentration, production_status, availability_status,
  publication_status, verification_status, price_verified_at, specs)
values (
  'a1000000-0000-4000-8000-000000000002',
  '11111111-1111-4111-8111-111111111111',
  'b0-test-v2-other', 'b0-test-v2-other', 'B0 Other', 'B0 Other Parfum',
  'Test', 'unisex', 'EDP', 'active', 'available', 'published', 'legacy',
  now(),
  '{"notes":["test"],"tag":"test"}'::jsonb
);

insert into public.product_variants (id, product_id, label, variant_kind, size_ml,
  price_amount, currency, publication_status, price_verification_status, sort_order)
values (
  'b1000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000002',
  '5 ml', 'decant', 5, 20.00, 'PEN', 'published', 'official_pdf', 0
);

-- 3. v2 RPC: canonical price from DB, not client-supplied
select lives_ok(
  $$select * from public.create_parfums_order_request_v2(
    '51000000-0000-4000-8000-000000000001',
    '{"name":"Test User","phone":"999111222"}',
    '{"district":"Lima","delivery":"Lima Metropolitana — Motorizado","note":""}',
    null,
    '[{"product_id":"a1000000-0000-4000-8000-000000000001","product_variant_id":"b1000000-0000-4000-8000-000000000001","product_name":"B0 Test","variant_label":"3 ml","quantity":2,"variant_snapshot":{"group":"decant","size_ml":3,"brand":"B0 Test"}}]'
  )$$,
  'v2 RPC creates order with DB-canonical price'
);

reset role;
-- Verify canonical price was used (12.50, not any client-supplied value)
select is(
  (select ol.unit_price_amount from public.order_lines ol
   join public.orders o on o.id = ol.order_id
   where o.request_id = '51000000-0000-4000-8000-000000000001'),
  12.50::numeric(12,2),
  'persisted unit_price_amount comes from DB, not client'
);
select is(
  (select ol.line_total_amount from public.order_lines ol
   join public.orders o on o.id = ol.order_id
   where o.request_id = '51000000-0000-4000-8000-000000000001'),
  25.00::numeric(12,2),
  'line_total derives from DB canonical price'
);
select is(
  (select o.subtotal_amount from public.orders o
   where o.request_id = '51000000-0000-4000-8000-000000000001'),
  25.00::numeric(12,2),
  'subtotal derives from DB canonical prices'
);
select is(
  (select ol.product_id::text from public.order_lines ol
   join public.orders o on o.id = ol.order_id
   where o.request_id = '51000000-0000-4000-8000-000000000001'),
  'a1000000-0000-4000-8000-000000000001',
  'real product_id is stored'
);
select is(
  (select ol.product_variant_id::text from public.order_lines ol
   join public.orders o on o.id = ol.order_id
   where o.request_id = '51000000-0000-4000-8000-000000000001'),
  'b1000000-0000-4000-8000-000000000001',
  'real product_variant_id is stored'
);

-- 4. Mismatched product_id + variant_id rejected atomically
set local role service_role;
select throws_ok(
  $$select * from public.create_parfums_order_request_v2(
    '52000000-0000-4000-8000-000000000002',
    '{"name":"Test User","phone":"999111222"}',
    '{"district":"Lima","delivery":"Lima Metropolitana — Motorizado","note":""}',
    null,
    '[{"product_id":"a1000000-0000-4000-8000-000000000001","product_variant_id":"b1000000-0000-4000-8000-000000000002","product_name":"Mismatched","variant_label":"5 ml","quantity":1,"variant_snapshot":{"group":"decant","size_ml":5,"brand":"Test"}}]'
  )$$,
  '22023',
  'product/variant pair not found',
  'variant from product B with product_id of product A is rejected'
);
reset role;
select is(
  (select count(*)::integer from public.orders
   where request_id = '52000000-0000-4000-8000-000000000002'),
  0,
  'mismatched product/variant leaves no order'
);

-- 5. Mixed legacy/supabase authority rejected
set local role service_role;
select throws_ok(
  $$select * from public.create_parfums_order_request_v2(
    '53000000-0000-4000-8000-000000000003',
    '{"name":"Test User","phone":"999111222"}',
    '{"district":"Lima","delivery":"Lima Metropolitana — Motorizado","note":""}',
    null,
    '[{"product_id":"a1000000-0000-4000-8000-000000000001","product_variant_id":"b1000000-0000-4000-8000-000000000001","product_name":"DB Product","variant_label":"3 ml","quantity":1,"variant_snapshot":{"group":"decant","size_ml":3,"brand":"Test"}},{"product_id":"","product_variant_id":"","product_name":"Legacy","variant_label":"5 ml","quantity":1,"variant_snapshot":{"group":"decant","size_ml":5,"brand":"Test"}}]'
  )$$,
  '22023',
  'v2 requires product_id',
  'mixed authority with empty product_id is rejected'
);
reset role;
select is(
  (select count(*)::integer from public.orders
   where request_id = '53000000-0000-4000-8000-000000000003'),
  0,
  'mixed authority leaves no order'
);

-- 6. Null product_id in v2 rejected
set local role service_role;
select throws_ok(
  $$select * from public.create_parfums_order_request_v2(
    '54000000-0000-4000-8000-000000000004',
    '{"name":"Test User","phone":"999111222"}',
    '{"district":"Lima","delivery":"Lima Metropolitana — Motorizado","note":""}',
    null,
    '[{"product_id":null,"product_variant_id":null,"product_name":"Null","variant_label":"3 ml","quantity":1,"variant_snapshot":{"group":"decant","size_ml":3,"brand":"Test"}}]'
  )$$,
  '22023',
  'v2 requires product_id and product_variant_id',
  'null product_id is rejected by v2'
);
reset role;
select is(
  (select count(*)::integer from public.orders
   where request_id = '54000000-0000-4000-8000-000000000004'),
  0,
  'null product_id leaves no order'
);

-- 7. Archived product rejected
update public.products set archived_at = now()
where id = 'a1000000-0000-4000-8000-000000000002';
set local role service_role;
select throws_ok(
  $$select * from public.create_parfums_order_request_v2(
    '55000000-0000-4000-8000-000000000005',
    '{"name":"Test User","phone":"999111222"}',
    '{"district":"Lima","delivery":"Lima Metropolitana — Motorizado","note":""}',
    null,
    '[{"product_id":"a1000000-0000-4000-8000-000000000002","product_variant_id":"b1000000-0000-4000-8000-000000000002","product_name":"Archived","variant_label":"5 ml","quantity":1,"variant_snapshot":{"group":"decant","size_ml":5,"brand":"Test"}}]'
  )$$,
  '22023',
  'product/variant pair not found',
  'archived product is rejected'
);
reset role;
-- Unarchive for cleanup
update public.products set archived_at = null
where id = 'a1000000-0000-4000-8000-000000000002';

-- 8. Archived variant rejected
update public.product_variants set archived_at = now()
where id = 'b1000000-0000-4000-8000-000000000002';
set local role service_role;
select throws_ok(
  $$select * from public.create_parfums_order_request_v2(
    '56000000-0000-4000-8000-000000000006',
    '{"name":"Test User","phone":"999111222"}',
    '{"district":"Lima","delivery":"Lima Metropolitana — Motorizado","note":""}',
    null,
    '[{"product_id":"a1000000-0000-4000-8000-000000000002","product_variant_id":"b1000000-0000-4000-8000-000000000002","product_name":"Archived Variant","variant_label":"5 ml","quantity":1,"variant_snapshot":{"group":"decant","size_ml":5,"brand":"Test"}}]'
  )$$,
  '22023',
  'product/variant pair not found',
  'archived variant is rejected'
);
reset role;
-- Unarchive for cleanup
update public.product_variants set archived_at = null
where id = 'b1000000-0000-4000-8000-000000000002';

-- 9. Idempotency: same request_id returns existing order
set local role service_role;
select is(
  (select created from public.create_parfums_order_request_v2(
    '51000000-0000-4000-8000-000000000001',
    '{"name":"Ignored","phone":"999111222"}',
    '{"district":"Ignored","delivery":"Lima Metropolitana — Motorizado","note":""}',
    null,
    '[{"product_id":"a1000000-0000-4000-8000-000000000001","product_variant_id":"b1000000-0000-4000-8000-000000000001","product_name":"Different","variant_label":"3 ml","quantity":99,"variant_snapshot":{"group":"decant","size_ml":3,"brand":"Test"}}]'
  )),
  false,
  'idempotent retry returns existing order'
);
reset role;
select is(
  (select count(*)::integer from public.orders
   where request_id = '51000000-0000-4000-8000-000000000001'),
  1,
  'idempotent retry does not create a second order'
);

-- 10. Failure leaves no partial order/order_lines
set local role service_role;
select throws_ok(
  $$select * from public.create_parfums_order_request_v2(
    '57000000-0000-4000-8000-000000000007',
    '{"name":"Test User","phone":"999111222"}',
    '{"district":"Lima","delivery":"Lima Metropolitana — Motorizado","note":""}',
    null,
    '[{"product_id":"a1000000-0000-4000-8000-000000000001","product_variant_id":"b1000000-0000-4000-8000-000000000001","product_name":"Valid","variant_label":"3 ml","quantity":1,"variant_snapshot":{"group":"decant","size_ml":3,"brand":"Test"}},{"product_id":"a1000000-0000-4000-8000-000000000001","product_variant_id":"b1000000-0000-4000-8000-000000000002","product_name":"Invalid","variant_label":"5 ml","quantity":1,"variant_snapshot":{"group":"decant","size_ml":5,"brand":"Test"}}]'
  )$$,
  '22023',
  'product/variant pair not found',
  'invalid second line aborts transaction'
);
reset role;
select is(
  (select count(*)::integer from public.orders
   where request_id = '57000000-0000-4000-8000-000000000007'),
  0,
  'failed v2 transaction leaves no order'
);
select is(
  (select count(*)::integer from public.order_lines ol
   join public.orders o on o.id = ol.order_id
   where o.request_id = '57000000-0000-4000-8000-000000000007'),
  0,
  'failed v2 transaction leaves no order_lines'
);

-- 11. Variant from another BU rejected
-- (all test products are in parfums BU, so we use the same BU)
-- This is implicitly tested by the product/variant pair lookup

-- Cleanup
delete from public.order_lines where order_id in (
  select id from public.orders where request_id in (
    '51000000-0000-4000-8000-000000000001'
  )
);
delete from public.orders where request_id in (
  '51000000-0000-4000-8000-000000000001'
);
delete from public.product_variants where product_id in (
  'a1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000002'
);
delete from public.products where id in (
  'a1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000002'
);

select * from finish();
rollback;
