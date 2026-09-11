-- Cruzial Platform V2, Phase 4J5B1: Import order foundation.

begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

insert into public.categories (
  id, business_unit_id, kind, slug, name, publication_status, sort_order
) values
  ('8b500000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'import_category', 'j5b-arabic', 'J5B Arabic', 'published', 1);

insert into public.products (id, business_unit_id, slug, name, brand, publication_status) values
  ('8b510000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'j5b-product-a', 'J5B Product A', 'Brand A', 'published'),
  ('8b510000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'j5b-product-b', 'J5B Product B', 'Brand B', 'published');

insert into public.product_categories (product_id, category_id) values
  ('8b510000-0000-4000-8000-000000000001', '8b500000-0000-4000-8000-000000000001'),
  ('8b510000-0000-4000-8000-000000000002', '8b500000-0000-4000-8000-000000000001');

insert into public.import_presentations (
  id, product_id, stable_key, label, presentation_class, capacity_ml, publication_status
) values
  ('8b520000-0000-4000-8000-000000000001', '8b510000-0000-4000-8000-000000000001', 'a-100', '100 ml', 'multi_presentation', 100, 'published'),
  ('8b520000-0000-4000-8000-000000000002', '8b510000-0000-4000-8000-000000000001', 'a-pack', 'Pack 3 piezas', 'pack_set', null, 'published'),
  ('8b520000-0000-4000-8000-000000000003', '8b510000-0000-4000-8000-000000000002', 'b-50', '50 ml', 'multi_presentation', 50, 'published');

insert into public.campaigns (id, business_unit_id, number, name, status, opens_at, closes_at) values
  ('8b530000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 961, 'J5B Test', 'open', now() - interval '1 day', now() + interval '1 day');

insert into public.campaign_products (
  campaign_id, product_id, import_presentation_id, price_amount, currency, availability_status, sort_order
) values
  ('8b530000-0000-4000-8000-000000000001', '8b510000-0000-4000-8000-000000000001', '8b520000-0000-4000-8000-000000000001', 210, 'PEN', 'available', 1),
  ('8b530000-0000-4000-8000-000000000001', '8b510000-0000-4000-8000-000000000001', '8b520000-0000-4000-8000-000000000002', 240, 'PEN', 'out_of_stock', 2),
  ('8b530000-0000-4000-8000-000000000001', '8b510000-0000-4000-8000-000000000002', '8b520000-0000-4000-8000-000000000003', 310, 'PEN', 'available', 3);

-- Pre-create a customer for returning-status test
insert into public.customers (
  id, business_unit_id, full_name, phone, email, verified_customer_status, verified_at
) values
  ('8b540000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'Returning Test', '+51999888777', 'ret@test.com', 'returning', now());

-- ---------------------------------------------------------------------------
-- 1. Schema assertions (5 tests)
-- ---------------------------------------------------------------------------

select has_column('public', 'orders', 'deposit_amount_snapshot', 'orders table has deposit_amount_snapshot column');
select col_type_is('public', 'orders', 'deposit_amount_snapshot', 'numeric(12,2)', 'deposit_amount_snapshot is numeric(12,2)');
select has_column('public', 'order_lines', 'import_presentation_id', 'order_lines table has import_presentation_id column');
select col_type_is('public', 'order_lines', 'import_presentation_id', 'uuid', 'import_presentation_id is uuid');
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_deposit_amount_check'
  ),
  'orders has nonnegative deposit check'
);

-- ---------------------------------------------------------------------------
-- 2. Security: anon/authenticated cannot insert orders or order_lines (4 tests)
-- ---------------------------------------------------------------------------

set local role anon;
select throws_ok(
  $$insert into public.orders (request_id, business_unit_id, campaign_id, channel, status, subtotal_amount, currency)
    values (gen_random_uuid(), '22222222-2222-4222-8222-222222222222', '8b530000-0000-4000-8000-000000000001', 'whatsapp', 'pending_whatsapp_confirmation', 100, 'PEN')$$,
  42501, null, 'anon cannot INSERT into orders'
);
select throws_ok(
  $$insert into public.order_lines (order_id, product_id, campaign_product_id, product_name_snapshot, unit_price_amount, currency, quantity, line_total_amount)
    values (gen_random_uuid(), '8b510000-0000-4000-8000-000000000001', gen_random_uuid(), 'test', 100, 'PEN', 1, 100)$$,
  42501, null, 'anon cannot INSERT into order_lines'
);
reset role;

set local role authenticated;
select throws_ok(
  $$insert into public.orders (request_id, business_unit_id, campaign_id, channel, status, subtotal_amount, currency)
    values (gen_random_uuid(), '22222222-2222-4222-8222-222222222222', '8b530000-0000-4000-8000-000000000001', 'whatsapp', 'pending_whatsapp_confirmation', 100, 'PEN')$$,
  42501, null, 'authenticated cannot INSERT into orders'
);
select throws_ok(
  $$insert into public.order_lines (order_id, product_id, campaign_product_id, product_name_snapshot, unit_price_amount, currency, quantity, line_total_amount)
    values (gen_random_uuid(), '8b510000-0000-4000-8000-000000000001', gen_random_uuid(), 'test', 100, 'PEN', 1, 100)$$,
  42501, null, 'authenticated cannot INSERT into order_lines'
);
reset role;

-- ---------------------------------------------------------------------------
-- 3. Security: RPC execute privileges (3 tests)
-- ---------------------------------------------------------------------------

select ok(
  not has_function_privilege('anon', 'public.create_import_order_request(uuid, jsonb, jsonb, jsonb)', 'EXECUTE'),
  'anon cannot execute create_import_order_request'
);
select ok(
  not has_function_privilege('authenticated', 'public.create_import_order_request(uuid, jsonb, jsonb, jsonb)', 'EXECUTE'),
  'authenticated cannot execute create_import_order_request'
);
select ok(
  has_function_privilege('service_role', 'public.create_import_order_request(uuid, jsonb, jsonb, jsonb)', 'EXECUTE'),
  'service_role CAN execute create_import_order_request'
);

-- ---------------------------------------------------------------------------
-- 4. Public read model: offer handle fields present (2 tests)
-- ---------------------------------------------------------------------------

set local role anon;

select ok(
  exists (
    select 1
    from public.public_list_import_catalog()
    where presentations @> (select jsonb_build_array(jsonb_build_object('offerId', cp.id::text))
      from public.campaign_products cp
      where cp.campaign_id = '8b530000-0000-4000-8000-000000000001'
        and cp.availability_status = 'available'
      limit 1)
  ),
  'catalog RPC includes offerId in presentation objects'
);

select ok(
  exists (
    select 1
    from public.public_get_import_product('j5b-product-a')
    where presentations @> (select jsonb_build_array(jsonb_build_object('offerId', cp.id::text))
      from public.campaign_products cp
      where cp.campaign_id = '8b530000-0000-4000-8000-000000000001'
        and cp.availability_status = 'available'
      limit 1)
  ),
  'detail RPC includes offerId in presentation objects'
);

reset role;

-- ---------------------------------------------------------------------------
-- 5. Happy-path: create order via service_role (4 tests)
-- ---------------------------------------------------------------------------

set local role service_role;

select lives_ok(
  (select format(
    $$select * from public.create_import_order_request(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid,
      '{"name":"Test Client","phone":"+51999111222","district":"San Isidro","address":"Av. Principal 123","note":"Test order"}'::jsonb,
      '{"district":"San Isidro","address":"Av. Principal 123","note":"Test order"}'::jsonb,
      '[{"offer_id":"%s","offer_updated_at":"%s","quantity":2}]'::jsonb
    )$$,
    (select cp.id from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.availability_status = 'available' order by cp.sort_order limit 1),
    (select cp.updated_at from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.availability_status = 'available' order by cp.sort_order limit 1)
  )),
  'create_import_order_request succeeds with valid input'
);

select is(
  (select status from public.orders
   where request_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
     and business_unit_id = '22222222-2222-4222-8222-222222222222'),
  'pending_whatsapp_confirmation',
  'created order status is pending_whatsapp_confirmation'
);

select is(
  (select currency from public.orders
   where request_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
     and business_unit_id = '22222222-2222-4222-8222-222222222222'),
  'PEN',
  'order currency is PEN'
);

select matches(
  (select order_number from public.orders
   where request_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
     and business_unit_id = '22222222-2222-4222-8222-222222222222'),
  '^CRI-[0-9]{8}-[A-F0-9]{12}$',
  'order number is CRI-YYYYMMDD-fragment format'
);

-- ---------------------------------------------------------------------------
-- 6. Order lines have import_presentation_id (1 test)
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::integer from public.order_lines ol
   join public.orders o on o.id = ol.order_id
   where o.request_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
     and o.business_unit_id = '22222222-2222-4222-8222-222222222222'
     and ol.import_presentation_id is not null),
  1,
  'order line has import_presentation_id set'
);

-- ---------------------------------------------------------------------------
-- 7. Deposit: new customer = 50% (1 test)
-- ---------------------------------------------------------------------------

select is(
  (select deposit_percentage_snapshot from public.orders
   where request_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
     and business_unit_id = '22222222-2222-4222-8222-222222222222'),
  50::numeric,
  'new customer gets 50% deposit'
);

-- ---------------------------------------------------------------------------
-- 8. Idempotency (1 test)
-- ---------------------------------------------------------------------------

select is(
  (select created from public.create_import_order_request(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid,
    '{"name":"Test Client","phone":"+51999111222","district":"San Isidro","address":"Av. Principal 123","note":"Test order"}'::jsonb,
    '{"district":"San Isidro","address":"Av. Principal 123","note":"Test order"}'::jsonb,
    format('[{"offer_id":"%s","offer_updated_at":"%s","quantity":2}]',
      (select cp.id from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.availability_status = 'available' order by cp.sort_order limit 1),
      (select cp.updated_at from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.availability_status = 'available' order by cp.sort_order limit 1)
    )::jsonb
  )),
  false,
  'idempotency: same request_id returns created=false'
);

-- ---------------------------------------------------------------------------
-- 9. Returning customer = 70% (1 test)
-- ---------------------------------------------------------------------------

select is(
  (select deposit_percentage from public.create_import_order_request(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'::uuid,
    '{"name":"Returning Client","phone":"+51999888777","district":"Miraflores","address":"Calle Real 456","note":""}'::jsonb,
    '{"district":"Miraflores","address":"Calle Real 456","note":""}'::jsonb,
    format('[{"offer_id":"%s","offer_updated_at":"%s","quantity":1}]',
      (select cp.id from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.availability_status = 'available' order by cp.sort_order limit 1),
      (select cp.updated_at from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.availability_status = 'available' order by cp.sort_order limit 1)
    )::jsonb
  )),
  70::numeric,
  'returning customer (phone match) gets 70% deposit'
);

-- ---------------------------------------------------------------------------
-- 10. Broadcast dimensions: channel (1 test)
-- ---------------------------------------------------------------------------

select is(
  (select channel from public.orders
   where request_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
     and business_unit_id = '22222222-2222-4222-8222-222222222222'),
  'whatsapp',
  'order channel is whatsapp'
);

-- ---------------------------------------------------------------------------
-- 11. Stale offer detection (1 test)
-- ---------------------------------------------------------------------------

select throws_ok(
  format(
    $$select * from public.create_import_order_request(
      'cccccccc-cccc-4ccc-8ccc-cccccccccc99'::uuid,
      '{"name":"Stale Test","phone":"+51999000111","district":"San Borja","address":"Calle 1","note":""}'::jsonb,
      '{"district":"San Borja","address":"Calle 1","note":""}'::jsonb,
      '[{"offer_id":"%s","offer_updated_at":"2020-01-01T00:00:00Z","quantity":1}]'::jsonb
    )$$,
    (select cp.id from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.availability_status = 'available' order by cp.sort_order limit 1)
  ),
  'P2011', null,
  'stale offer_updated_at is rejected'
);

-- ---------------------------------------------------------------------------
-- 12. Quantity limit enforcement (1 test)
-- ---------------------------------------------------------------------------

update public.campaign_products
set quantity_limit = 5
where id = (select cp.id from public.campaign_products cp
  where cp.campaign_id = '8b530000-0000-4000-8000-000000000001'
    and cp.availability_status = 'available'
  order by cp.sort_order limit 1);

select throws_ok(
  format(
    $$select * from public.create_import_order_request(
      'dddddddd-dddd-4ddd-8ddd-dddddddddd98'::uuid,
      '{"name":"Limit Test","phone":"+51999000222","district":"La Molina","address":"Av. La Molina","note":""}'::jsonb,
      '{"district":"La Molina","address":"Av. La Molina","note":""}'::jsonb,
      '[{"offer_id":"%s","offer_updated_at":"%s","quantity":10}]'::jsonb
    )$$,
    (select cp.id from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.availability_status = 'available' order by cp.sort_order limit 1),
    (select cp.updated_at from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.availability_status = 'available' order by cp.sort_order limit 1)
  ),
  '22023', null,
  'quantity_limit violation is rejected'
);

update public.campaign_products set quantity_limit = null
where id = (select cp.id from public.campaign_products cp
  where cp.campaign_id = '8b530000-0000-4000-8000-000000000001'
    and cp.availability_status = 'available'
  order by cp.sort_order limit 1);

-- ---------------------------------------------------------------------------
-- 13. Empty lines rejection (1 test)
-- ---------------------------------------------------------------------------

select throws_ok(
  $$select * from public.create_import_order_request(
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee97'::uuid,
    '{"name":"Empty Lines","phone":"+51999000333","district":"San Isidro","address":"Av. 1","note":""}'::jsonb,
    '{"district":"San Isidro","address":"Av. 1","note":""}'::jsonb,
    '[]'::jsonb
  )$$,
  '22023', null,
  'empty lines array is rejected'
);

-- ---------------------------------------------------------------------------
-- 14. Extra field in line rejection (1 test)
-- ---------------------------------------------------------------------------

select throws_ok(
  format(
    $$select * from public.create_import_order_request(
      'ffffffff-ffff-4fff-8fff-ffffffffff96'::uuid,
      '{"name":"Extra Field","phone":"+51999000444","district":"San Isidro","address":"Av. 1","note":""}'::jsonb,
      '{"district":"San Isidro","address":"Av. 1","note":""}'::jsonb,
      '[{"offer_id":"%s","offer_updated_at":"%s","quantity":1,"extra_field":"bad"}]'::jsonb
    )$$,
    (select cp.id from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.availability_status = 'available' order by cp.sort_order limit 1),
    (select cp.updated_at from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.availability_status = 'available' order by cp.sort_order limit 1)
  ),
  '22023', null,
  'line with extra field is rejected'
);

reset role;

select * from finish();
rollback;
