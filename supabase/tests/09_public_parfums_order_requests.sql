-- Cruzial Platform V2 — public Parfums order requests (Phase 4E1)

begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

select has_column('public', 'orders', 'request_id', 'orders carries the idempotency request key');
select col_type_is('public', 'orders', 'request_id', 'uuid', 'request key is a UUID');
select ok(not has_function_privilege('anon', 'public.create_parfums_order_request(uuid,jsonb,jsonb,text,jsonb)', 'execute'), 'anon cannot execute the order transaction');
select ok(not has_function_privilege('authenticated', 'public.create_parfums_order_request(uuid,jsonb,jsonb,text,jsonb)', 'execute'), 'authenticated users cannot execute the public order transaction');
select ok(has_function_privilege('service_role', 'public.create_parfums_order_request(uuid,jsonb,jsonb,text,jsonb)', 'execute'), 'service role can execute the narrow transaction');

set local role service_role;

select lives_ok(
  $$select * from public.create_parfums_order_request(
    '41000000-0000-4000-8000-000000000001',
    '{"name":"TEST Ana","phone":"999111222"}',
    '{"district":"Miraflores, Lima","delivery":"Provincias — Agencia Shalom","note":"TEST reference"}',
    'shalom',
    '[{"legacy_product_id":"legacy-test","legacy_variant_id":"decant-5ml","source":"assets/data.js","product_name":"TEST Brand TEST Product","variant_label":"Decant 5 ml","unit_price_amount":"16.00","currency":"PEN","quantity":2,"variant_snapshot":{"group":"decant","size_ml":5,"brand":"TEST Brand"}}]'
  )$$,
  'service path creates a validated request atomically'
);

reset role;

select is((select count(*)::integer from public.orders where request_id = '41000000-0000-4000-8000-000000000001'), 1, 'one order is stored');
select is((select status from public.orders where request_id = '41000000-0000-4000-8000-000000000001'), 'pending_whatsapp_confirmation', 'final transaction status is pending WhatsApp confirmation');
select is((select channel from public.orders where request_id = '41000000-0000-4000-8000-000000000001'), 'whatsapp', 'channel is WhatsApp');
select is((select subtotal_amount from public.orders where request_id = '41000000-0000-4000-8000-000000000001'), 32.00::numeric, 'subtotal is calculated from stored lines');
select is((select count(*)::integer from public.order_lines l join public.orders o on o.id = l.order_id where o.request_id = '41000000-0000-4000-8000-000000000001'), 1, 'all lines are inserted');
select is((select line_total_amount from public.order_lines l join public.orders o on o.id = l.order_id where o.request_id = '41000000-0000-4000-8000-000000000001'), 32.00::numeric, 'line total is calculated in PostgreSQL');
select is((select variant_snapshot ->> 'legacy_product_id' from public.order_lines l join public.orders o on o.id = l.order_id where o.request_id = '41000000-0000-4000-8000-000000000001'), 'legacy-test', 'legacy identity is preserved in the immutable snapshot');
select is((select sm.code from public.orders o join public.shipping_methods sm on sm.id = o.shipping_method_id where o.request_id = '41000000-0000-4000-8000-000000000001'), 'shalom', 'Shalom is resolved server-side when requested');
select matches((select order_number from public.orders where request_id = '41000000-0000-4000-8000-000000000001'), '^CRP-[0-9]{8}-[A-F0-9]{12}$', 'order number is generated in PostgreSQL and support-readable');

set local role service_role;
select is(
  (select created from public.create_parfums_order_request(
    '41000000-0000-4000-8000-000000000001',
    '{"name":"Ignored retry","phone":"999111222"}',
    '{"district":"Ignored","delivery":"Lima Metropolitana — Motorizado","note":""}',
    null,
    '[{"legacy_product_id":"different","legacy_variant_id":"bottle-100ml","source":"assets/data.js","product_name":"Different","variant_label":"Frasco 100 ml","unit_price_amount":"999.00","currency":"PEN","quantity":9,"variant_snapshot":{"group":"bottle","size_ml":100,"brand":"Different"}}]'
  )),
  false,
  'same request key returns the existing order'
);
reset role;
select is((select count(*)::integer from public.orders where request_id = '41000000-0000-4000-8000-000000000001'), 1, 'idempotent retry does not insert a second order');

set local role service_role;
select throws_ok(
  $$select * from public.create_parfums_order_request(
    '42000000-0000-4000-8000-000000000002',
    '{"name":"TEST Ana","phone":"999111222"}',
    '{"district":"Lima","delivery":"Lima Metropolitana — Motorizado","note":""}',
    null,
    '[{"legacy_product_id":"valid-first","legacy_variant_id":"decant-3ml","source":"assets/data.js","product_name":"First","variant_label":"Decant 3 ml","unit_price_amount":"12.00","currency":"PEN","quantity":1,"variant_snapshot":{"group":"decant","size_ml":3,"brand":"TEST"}},{"legacy_product_id":"invalid-second","legacy_variant_id":"decant-5ml","source":"assets/data.js","product_name":"Second","variant_label":"Decant 5 ml","unit_price_amount":"bad","currency":"PEN","quantity":1,"variant_snapshot":{"group":"decant","size_ml":5,"brand":"TEST"}}]'
  )$$,
  '22023',
  'invalid order line values',
  'an invalid line aborts the transaction'
);
reset role;
select is((select count(*)::integer from public.orders where request_id = '42000000-0000-4000-8000-000000000002'), 0, 'failed transaction leaves no order');
select is((select count(*)::integer from public.order_lines l join public.orders o on o.id = l.order_id where o.request_id = '42000000-0000-4000-8000-000000000002'), 0, 'failed transaction leaves no order lines');

set local role anon;
select throws_ok(
  $$insert into public.orders (request_id, business_unit_id, order_number) values ('41000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'FORGED')$$,
  '42501',
  null,
  'anon remains denied direct order inserts'
);
reset role;

select * from finish();
rollback;
