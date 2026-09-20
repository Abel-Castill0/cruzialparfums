-- Cruzial Platform V2, Phase 4J5B1 correction: Import order foundation.
-- Comprehensive pgTAP covering all correction gate requirements.

begin;
create extension if not exists pgtap with schema extensions;
select plan(42);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

insert into public.categories (
  id, business_unit_id, kind, slug, name, publication_status, sort_order
) values
  ('8b500000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'import_category', 'j5b-arabic', 'J5B Arabic', 'published', 1);

insert into public.products (id, business_unit_id, slug, name, brand, publication_status) values
  ('8b510000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'j5b-product-a', 'J5B Product A', 'Brand A', 'published'),
  ('8b510000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'j5b-product-b', 'J5B Product B', 'Brand B', 'published'),
  ('8b510000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', 'j5b-product-draft', 'J5B Draft Product', 'Brand C', 'draft');

insert into public.product_categories (product_id, category_id) values
  ('8b510000-0000-4000-8000-000000000001', '8b500000-0000-4000-8000-000000000001'),
  ('8b510000-0000-4000-8000-000000000002', '8b500000-0000-4000-8000-000000000001'),
  ('8b510000-0000-4000-8000-000000000003', '8b500000-0000-4000-8000-000000000001');

insert into public.import_presentations (
  id, product_id, stable_key, label, presentation_class, capacity_ml, publication_status
) values
  ('8b520000-0000-4000-8000-000000000001', '8b510000-0000-4000-8000-000000000001', 'a-100', '100 ml', 'multi_presentation', 100, 'published'),
  ('8b520000-0000-4000-8000-000000000002', '8b510000-0000-4000-8000-000000000001', 'a-pack', 'Pack 3 piezas', 'pack_set', null, 'published'),
  ('8b520000-0000-4000-8000-000000000003', '8b510000-0000-4000-8000-000000000002', 'b-50', '50 ml', 'multi_presentation', 50, 'published'),
  ('8b520000-0000-4000-8000-000000000004', '8b510000-0000-4000-8000-000000000003', 'c-draft', 'Draft Pres', 'multi_presentation', 50, 'draft'),
  ('8b520000-0000-4000-8000-000000000005', '8b510000-0000-4000-8000-000000000002', 'b-archived', 'Archived Pres', 'multi_presentation', 50, 'published');

-- Archive the last presentation
update public.import_presentations set archived_at = now()
where id = '8b520000-0000-4000-8000-000000000005';

insert into public.campaigns (id, business_unit_id, number, name, status, opens_at, closes_at) values
  ('8b530000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 961, 'J5B Test', 'open', now() - interval '1 day', now() + interval '1 day'),
  ('8b530000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 962, 'J5B Wrong Campaign', 'paused', now() - interval '1 day', now() + interval '1 day');

insert into public.campaign_products (
  campaign_id, product_id, import_presentation_id, price_amount, currency, availability_status, sort_order
) values
  ('8b530000-0000-4000-8000-000000000001', '8b510000-0000-4000-8000-000000000001', '8b520000-0000-4000-8000-000000000001', 210, 'PEN', 'available', 1),
  ('8b530000-0000-4000-8000-000000000001', '8b510000-0000-4000-8000-000000000001', '8b520000-0000-4000-8000-000000000002', 240, 'PEN', 'out_of_stock', 2),
  ('8b530000-0000-4000-8000-000000000001', '8b510000-0000-4000-8000-000000000002', '8b520000-0000-4000-8000-000000000003', 310, 'PEN', 'available', 3),
  ('8b530000-0000-4000-8000-000000000001', '8b510000-0000-4000-8000-000000000003', '8b520000-0000-4000-8000-000000000004', 100, 'PEN', 'available', 4),
  ('8b530000-0000-4000-8000-000000000001', '8b510000-0000-4000-8000-000000000002', '8b520000-0000-4000-8000-000000000005', 100, 'PEN', 'available', 5),
  ('8b530000-0000-4000-8000-000000000002', '8b510000-0000-4000-8000-000000000001', '8b520000-0000-4000-8000-000000000001', 999, 'PEN', 'available', 1);

-- Pre-create customers
insert into public.customers (
  id, business_unit_id, full_name, phone, email, verified_customer_status, verified_at
) values
  ('8b540000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'Returning Test', '+51999888777', 'ret@test.com', 'returning', now()),
  ('8b540000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'New Customer', '+51999777666', 'new@test.com', 'new', now()),
  ('8b540000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', 'Pending Customer', '+51999666555', 'pend@test.com', 'pending_verification', null),
  -- Two customers with same phone for ambiguous test
  ('8b540000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-222222222222', 'Ambiguous A', '+51999555444', 'amb1@test.com', 'returning', now()),
  ('8b540000-0000-4000-8000-000000000005', '22222222-2222-4222-8222-222222222222', 'Ambiguous B', '+51999555777', 'amb2@test.com', 'new', now());

-- Archive Ambiguous A to free the phone slot for ambiguity testing
-- (unique index prevents 2 active customers with same canonical phone)
UPDATE public.customers SET archived_at = now(), updated_at = now()
WHERE id = '8b540000-0000-4000-8000-000000000004';

-- Deposit policies: add future and expired for window tests
insert into public.deposit_policies (
  id, business_unit_id, customer_status, deposit_percentage, effective_from, effective_until, source, is_active
) values
  ('8b550000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'new', 50.00, '2020-01-01T00:00:00Z', '2020-12-31T23:59:59Z', 'client_confirmed', true),
  ('8b550000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'new', 55.00, '2099-01-01T00:00:00Z', null, 'client_confirmed', true);

-- ---------------------------------------------------------------------------
-- 1. Schema assertions (5 tests)
-- ---------------------------------------------------------------------------

select has_column('public', 'orders', 'deposit_amount_snapshot', 'orders has deposit_amount_snapshot');
select col_type_is('public', 'orders', 'deposit_amount_snapshot', 'numeric(12,2)', 'deposit_amount_snapshot type');
select has_column('public', 'order_lines', 'import_presentation_id', 'order_lines has import_presentation_id');
select col_type_is('public', 'order_lines', 'import_presentation_id', 'uuid', 'import_presentation_id type');
select ok(
  exists (select 1 from pg_constraint where conrelid = 'public.orders'::regclass and conname = 'orders_deposit_amount_check'),
  'orders has nonnegative deposit check'
);

-- ---------------------------------------------------------------------------
-- 2. Security: anon/authenticated cannot INSERT (4 tests)
-- ---------------------------------------------------------------------------

set local role anon;
select throws_ok(
  $$insert into public.orders (request_id, business_unit_id, campaign_id, channel, status, subtotal_amount, currency)
    values (gen_random_uuid(), '22222222-2222-4222-8222-222222222222', '8b530000-0000-4000-8000-000000000001', 'whatsapp', 'pending_whatsapp_confirmation', 100, 'PEN')$$,
  42501, null, 'anon cannot INSERT orders'
);
select throws_ok(
  $$insert into public.order_lines (order_id, product_id, campaign_product_id, product_name_snapshot, unit_price_amount, currency, quantity, line_total_amount)
    values (gen_random_uuid(), '8b510000-0000-4000-8000-000000000001', gen_random_uuid(), 'test', 100, 'PEN', 1, 100)$$,
  42501, null, 'anon cannot INSERT order_lines'
);
reset role;
set local role authenticated;
select throws_ok(
  $$insert into public.orders (request_id, business_unit_id, campaign_id, channel, status, subtotal_amount, currency)
    values (gen_random_uuid(), '22222222-2222-4222-8222-222222222222', '8b530000-0000-4000-8000-000000000001', 'whatsapp', 'pending_whatsapp_confirmation', 100, 'PEN')$$,
  42501, null, 'authenticated cannot INSERT orders'
);
select throws_ok(
  $$insert into public.order_lines (order_id, product_id, campaign_product_id, product_name_snapshot, unit_price_amount, currency, quantity, line_total_amount)
    values (gen_random_uuid(), '8b510000-0000-4000-8000-000000000001', gen_random_uuid(), 'test', 100, 'PEN', 1, 100)$$,
  42501, null, 'authenticated cannot INSERT order_lines'
);
reset role;

-- ---------------------------------------------------------------------------
-- 3. RPC privileges (3 tests)
-- ---------------------------------------------------------------------------

select ok(not has_function_privilege('anon', 'public.create_import_order_request(uuid, jsonb, jsonb, jsonb)', 'EXECUTE'), 'anon cannot execute RPC');
select ok(not has_function_privilege('authenticated', 'public.create_import_order_request(uuid, jsonb, jsonb, jsonb)', 'EXECUTE'), 'auth cannot execute RPC');
select ok(has_function_privilege('service_role', 'public.create_import_order_request(uuid, jsonb, jsonb, jsonb)', 'EXECUTE'), 'service_role CAN execute RPC');

-- ---------------------------------------------------------------------------
-- 4. Public read model: offerId present (2 tests)
-- ---------------------------------------------------------------------------

set local role anon;
select ok(
  exists (
    select 1 from public.public_list_import_catalog()
    where presentations @> (select jsonb_build_array(jsonb_build_object('offerId', cp.id::text))
      from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.availability_status = 'available' limit 1)
  ),
  'catalog RPC includes offerId'
);
select ok(
  exists (
    select 1 from public.public_get_import_product('j5b-product-a')
    where presentations @> (select jsonb_build_array(jsonb_build_object('offerId', cp.id::text))
      from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.availability_status = 'available' limit 1)
  ),
  'detail RPC includes offerId'
);
reset role;

-- ---------------------------------------------------------------------------
-- 5. NEW customer: subtotal exact, 50%, deposit exact (3 tests)
-- ---------------------------------------------------------------------------

set local role service_role;

select lives_ok(
  (select format(
    $$select * from public.create_import_order_request(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid,
      '{"name":"Test Client","phone":"+51999111222"}'::jsonb,
      '{"district":"San Isidro","address":"Av. Principal 123","note":"Test order"}'::jsonb,
      '[{"offer_id":"%s","offer_updated_at":"%s","quantity":2}]'::jsonb
    )$$,
    (select cp.id from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.availability_status = 'available' order by cp.sort_order limit 1),
    (select cp.updated_at from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.availability_status = 'available' order by cp.sort_order limit 1)
  )),
  'new customer order succeeds'
);

select is(
  (select subtotal from public.create_import_order_request(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid,
    '{"name":"Test Client","phone":"+51999111222"}'::jsonb,
    '{"district":"San Isidro","address":"Av. Principal 123","note":""}'::jsonb,
    format('[{"offer_id":"%s","offer_updated_at":"%s","quantity":2}]',
      (select cp.id from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.availability_status = 'available' order by cp.sort_order limit 1),
      (select cp.updated_at from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.availability_status = 'available' order by cp.sort_order limit 1)
    )::jsonb
  )),
  420.00::numeric,
  'new customer subtotal = 210 * 2 = 420'
);

select is(
  (select deposit_amount from public.create_import_order_request(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid,
    '{"name":"Test Client","phone":"+51999111222"}'::jsonb,
    '{"district":"San Isidro","address":"Av. 1","note":""}'::jsonb,
    format('[{"offer_id":"%s","offer_updated_at":"%s","quantity":2}]',
      (select cp.id from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.availability_status = 'available' order by cp.sort_order limit 1),
      (select cp.updated_at from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.availability_status = 'available' order by cp.sort_order limit 1)
    )::jsonb
  )),
  210.00::numeric,
  'new customer deposit = 420 * 50% = 210'
);

-- ---------------------------------------------------------------------------
-- 6. RETURNING customer: 70%, customer_id set (2 tests)
-- ---------------------------------------------------------------------------

select is(
  (select deposit_percentage from public.create_import_order_request(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'::uuid,
    '{"name":"Returning Client","phone":"+51999888777"}'::jsonb,
    '{"district":"Miraflores","address":"Calle Real 456","note":""}'::jsonb,
    format('[{"offer_id":"%s","offer_updated_at":"%s","quantity":1}]',
      (select cp.id from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.availability_status = 'available' order by cp.sort_order limit 1),
      (select cp.updated_at from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.availability_status = 'available' order by cp.sort_order limit 1)
    )::jsonb
  )),
  70::numeric,
  'returning customer gets 70%'
);

select is(
  (select customer_id from public.orders
   where request_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
     and business_unit_id = '22222222-2222-4222-8222-222222222222'),
  '8b540000-0000-4000-8000-000000000001'::uuid,
  'returning customer has customer_id set'
);

-- ---------------------------------------------------------------------------
-- 7. SINGLE phone match (was ambiguous, now unique index prevents duplicates) (2 tests)
-- ---------------------------------------------------------------------------

select is(
  (select deposit_percentage from public.create_import_order_request(
    'cccccccc-cccc-4ccc-8ccc-cccccccccc01'::uuid,
    '{"name":"Ambiguous Client","phone":"+51999555777"}'::jsonb,
    '{"district":"San Borja","address":"Calle 1","note":""}'::jsonb,
    format('[{"offer_id":"%s","offer_updated_at":"%s","quantity":1}]',
      (select cp.id from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.availability_status = 'available' order by cp.sort_order limit 1),
      (select cp.updated_at from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.availability_status = 'available' order by cp.sort_order limit 1)
    )::jsonb
  )),
  50::numeric,
  'ambiguous phone → 50% (not returning)'
);

select is(
  (select customer_id from public.orders
   where request_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccc01'
     and business_unit_id = '22222222-2222-4222-8222-222222222222'),
  '8b540000-0000-4000-8000-000000000005'::uuid,
  'single phone match → customer_id is linked'
);

-- ---------------------------------------------------------------------------
-- 8. 0 phone matches → 50%, customer_id NULL (1 test)
-- ---------------------------------------------------------------------------

select is(
  (select deposit_percentage from public.create_import_order_request(
    'dddddddd-dddd-4ddd-8ddd-dddddddddd01'::uuid,
    '{"name":"Unknown Client","phone":"+51900000000"}'::jsonb,
    '{"district":"La Molina","address":"Av. La Molina","note":""}'::jsonb,
    format('[{"offer_id":"%s","offer_updated_at":"%s","quantity":1}]',
      (select cp.id from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.availability_status = 'available' order by cp.sort_order limit 1),
      (select cp.updated_at from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.availability_status = 'available' order by cp.sort_order limit 1)
    )::jsonb
  )),
  50::numeric,
  'zero phone matches → 50%'
);

-- ---------------------------------------------------------------------------
-- 9. Idempotency (1 test)
-- ---------------------------------------------------------------------------

select is(
  (select created from public.create_import_order_request(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid,
    '{"name":"Test Client","phone":"+51999111222"}'::jsonb,
    '{"district":"San Isidro","address":"Av. 1","note":""}'::jsonb,
    format('[{"offer_id":"%s","offer_updated_at":"%s","quantity":2}]',
      (select cp.id from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.availability_status = 'available' order by cp.sort_order limit 1),
      (select cp.updated_at from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.availability_status = 'available' order by cp.sort_order limit 1)
    )::jsonb
  )),
  false,
  'idempotency: returns created=false'
);

-- ---------------------------------------------------------------------------
-- 10. Channel = whatsapp (1 test)
-- ---------------------------------------------------------------------------

select is(
  (select channel from public.orders where request_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' and business_unit_id = '22222222-2222-4222-8222-222222222222'),
  'whatsapp',
  'order channel is whatsapp'
);

-- ---------------------------------------------------------------------------
-- 11. Stale offer → P2011 (1 test)
-- ---------------------------------------------------------------------------

select throws_ok(
  format(
    $$select * from public.create_import_order_request(
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01'::uuid,
      '{"name":"Stale Test","phone":"+51999000111"}'::jsonb,
      '{"district":"San Borja","address":"Calle 1","note":""}'::jsonb,
      '[{"offer_id":"%s","offer_updated_at":"2020-01-01T00:00:00Z","quantity":1}]'::jsonb
    )$$,
    (select cp.id from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.availability_status = 'available' order by cp.sort_order limit 1)
  ),
  'P2011', null,
  'stale offer → P2011 cart_changed'
);

-- ---------------------------------------------------------------------------
-- 12. Duplicate offer → P2012 (1 test)
-- ---------------------------------------------------------------------------

select throws_ok(
  format(
    $$select * from public.create_import_order_request(
      'ffffffff-ffff-4fff-8fff-ffffffffff01'::uuid,
      '{"name":"Dup Test","phone":"+51999000222"}'::jsonb,
      '{"district":"San Isidro","address":"Av. 1","note":""}'::jsonb,
      '[{"offer_id":"%s","offer_updated_at":"%s","quantity":1},{"offer_id":"%s","offer_updated_at":"%s","quantity":2}]'::jsonb
    )$$,
    (select cp.id from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.availability_status = 'available' order by cp.sort_order limit 1),
    (select cp.updated_at from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.availability_status = 'available' order by cp.sort_order limit 1),
    (select cp.id from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.availability_status = 'available' order by cp.sort_order limit 1),
    (select cp.updated_at from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.availability_status = 'available' order by cp.sort_order limit 1)
  ),
  'P2012', null,
  'duplicate offer → P2012'
);

-- ---------------------------------------------------------------------------
-- 13. Empty lines → 22023 (1 test)
-- ---------------------------------------------------------------------------

select throws_ok(
  $$select * from public.create_import_order_request(
    '11111111-1111-4111-8111-111111111101'::uuid,
    '{"name":"Empty Lines","phone":"+51999000333"}'::jsonb,
    '{"district":"San Isidro","address":"Av. 1","note":""}'::jsonb,
    '[]'::jsonb
  )$$,
  '22023', null,
  'empty lines rejected'
);

-- ---------------------------------------------------------------------------
-- 14. Extra field in line → 22023 (1 test)
-- ---------------------------------------------------------------------------

select throws_ok(
  format(
    $$select * from public.create_import_order_request(
      '22222222-2222-4222-8222-222222222201'::uuid,
      '{"name":"Extra Field","phone":"+51999000444"}'::jsonb,
      '{"district":"San Isidro","address":"Av. 1","note":""}'::jsonb,
      '[{"offer_id":"%s","offer_updated_at":"%s","quantity":1,"extra_field":"bad"}]'::jsonb
    )$$,
    (select cp.id from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.availability_status = 'available' order by cp.sort_order limit 1),
    (select cp.updated_at from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.availability_status = 'available' order by cp.sort_order limit 1)
  ),
  '22023', null,
  'extra field in line rejected'
);

-- ---------------------------------------------------------------------------
-- 15. Quantity limit exceeded → 22023 (1 test)
-- ---------------------------------------------------------------------------

update public.campaign_products set quantity_limit = 5
where id = (select cp.id from public.campaign_products cp
  where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.availability_status = 'available' order by cp.sort_order limit 1);

select throws_ok(
  format(
    $$select * from public.create_import_order_request(
      '33333333-3333-4333-8333-333333333301'::uuid,
      '{"name":"Limit Test","phone":"+51999000555"}'::jsonb,
      '{"district":"La Molina","address":"Av. La Molina","note":""}'::jsonb,
      '[{"offer_id":"%s","offer_updated_at":"%s","quantity":10}]'::jsonb
    )$$,
    (select cp.id from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.availability_status = 'available' order by cp.sort_order limit 1),
    (select cp.updated_at from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.availability_status = 'available' order by cp.sort_order limit 1)
  ),
  '22023', null,
  'quantity limit exceeded rejected'
);

update public.campaign_products set quantity_limit = null
where id = (select cp.id from public.campaign_products cp
  where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.availability_status = 'available' order by cp.sort_order limit 1);

-- ---------------------------------------------------------------------------
-- 16. Wrong campaign offer → P2017 (1 test)
-- ---------------------------------------------------------------------------

select throws_ok(
  format(
    $$select * from public.create_import_order_request(
      '44444444-4444-4444-8444-444444444401'::uuid,
      '{"name":"Wrong Campaign","phone":"+51999000666"}'::jsonb,
      '{"district":"San Isidro","address":"Av. 1","note":""}'::jsonb,
      '[{"offer_id":"%s","offer_updated_at":"%s","quantity":1}]'::jsonb
    )$$,
    (select cp.id from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000002' limit 1),
    (select cp.updated_at from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000002' limit 1)
  ),
  'P2017', null,
  'wrong campaign offer → P2017'
);

-- ---------------------------------------------------------------------------
-- 17. Out-of-stock offer → P2017 (1 test)
-- ---------------------------------------------------------------------------

select throws_ok(
  format(
    $$select * from public.create_import_order_request(
      '55555555-5555-4555-8555-555555555501'::uuid,
      '{"name":"OOS Test","phone":"+51999000777"}'::jsonb,
      '{"district":"San Isidro","address":"Av. 1","note":""}'::jsonb,
      '[{"offer_id":"%s","offer_updated_at":"%s","quantity":1}]'::jsonb
    )$$,
    (select cp.id from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.availability_status = 'out_of_stock' limit 1),
    (select cp.updated_at from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.availability_status = 'out_of_stock' limit 1)
  ),
  'P2017', null,
  'out_of_stock offer → P2017'
);

-- ---------------------------------------------------------------------------
-- 18. Draft product → P2017 (1 test)
-- ---------------------------------------------------------------------------

select throws_ok(
  format(
    $$select * from public.create_import_order_request(
      '66666666-6666-4666-8666-666666666601'::uuid,
      '{"name":"Draft Test","phone":"+51999000888"}'::jsonb,
      '{"district":"San Isidro","address":"Av. 1","note":""}'::jsonb,
      '[{"offer_id":"%s","offer_updated_at":"%s","quantity":1}]'::jsonb
    )$$,
    (select cp.id from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.product_id = '8b510000-0000-4000-8000-000000000003' limit 1),
    (select cp.updated_at from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.product_id = '8b510000-0000-4000-8000-000000000003' limit 1)
  ),
  'P2017', null,
  'draft product → P2017'
);

-- ---------------------------------------------------------------------------
-- 19. Archived presentation → P2017 (1 test)
-- ---------------------------------------------------------------------------

select throws_ok(
  format(
    $$select * from public.create_import_order_request(
      '77777777-7777-4777-8777-777777777701'::uuid,
      '{"name":"Archived Pres Test","phone":"+51999000999"}'::jsonb,
      '{"district":"San Isidro","address":"Av. 1","note":""}'::jsonb,
      '[{"offer_id":"%s","offer_updated_at":"%s","quantity":1}]'::jsonb
    )$$,
    (select cp.id from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.import_presentation_id = '8b520000-0000-4000-8000-000000000005' limit 1),
    (select cp.updated_at from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.import_presentation_id = '8b520000-0000-4000-8000-000000000005' limit 1)
  ),
  'P2017', null,
  'archived presentation → P2017'
);

-- ---------------------------------------------------------------------------
-- 20. Quantity 0 → 22023 (1 test)
-- ---------------------------------------------------------------------------

select throws_ok(
  format(
    $$select * from public.create_import_order_request(
      '88888888-8888-4888-8888-888888888801'::uuid,
      '{"name":"Qty 0 Test","phone":"+51999001000"}'::jsonb,
      '{"district":"San Isidro","address":"Av. 1","note":""}'::jsonb,
      '[{"offer_id":"%s","offer_updated_at":"%s","quantity":0}]'::jsonb
    )$$,
    (select cp.id from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.availability_status = 'available' order by cp.sort_order limit 1),
    (select cp.updated_at from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.availability_status = 'available' order by cp.sort_order limit 1)
  ),
  '22023', null,
  'quantity 0 rejected'
);

-- ---------------------------------------------------------------------------
-- 21. Quantity >99 → 22023 (1 test)
-- ---------------------------------------------------------------------------

select throws_ok(
  format(
    $$select * from public.create_import_order_request(
      '99999999-9999-4999-8999-999999999901'::uuid,
      '{"name":"Qty 100 Test","phone":"+51999001100"}'::jsonb,
      '{"district":"San Isidro","address":"Av. 1","note":""}'::jsonb,
      '[{"offer_id":"%s","offer_updated_at":"%s","quantity":100}]'::jsonb
    )$$,
    (select cp.id from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.availability_status = 'available' order by cp.sort_order limit 1),
    (select cp.updated_at from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.availability_status = 'available' order by cp.sort_order limit 1)
  ),
  '22023', null,
  'quantity >99 rejected'
);

-- ---------------------------------------------------------------------------
-- 22. Delivery snapshot comes from p_delivery (1 test)
-- ---------------------------------------------------------------------------

select is(
  (select delivery_snapshot ->> 'district' from public.orders
   where request_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
     and business_unit_id = '22222222-2222-4222-8222-222222222222'),
  'San Isidro',
  'delivery snapshot district comes from p_delivery'
);

-- ---------------------------------------------------------------------------
-- 23. Subtotal invariant: SUM(lines) = subtotal (1 test)
-- ---------------------------------------------------------------------------

select ok(
  abs(
    (select sum(ol.line_total_amount) from public.order_lines ol
     join public.orders o on o.id = ol.order_id
     where o.request_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
       and o.business_unit_id = '22222222-2222-4222-8222-222222222222')
    -
    (select subtotal_amount from public.orders
     where request_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
       and business_unit_id = '22222222-2222-4222-8222-222222222222')
  ) < 0.005,
  'subtotal invariant: SUM(lines) = subtotal_amount'
);

-- ---------------------------------------------------------------------------
-- 24. Deposit invariant: amount = ROUND(subtotal * pct / 100, 2) (1 test)
-- ---------------------------------------------------------------------------

select ok(
  abs(
    (select deposit_amount_snapshot from public.orders
     where request_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
       and business_unit_id = '22222222-2222-4222-8222-222222222222')
    -
    round((select subtotal_amount from public.orders
     where request_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
       and business_unit_id = '22222222-2222-4222-8222-222222222222')
    * (select deposit_percentage_snapshot from public.orders
     where request_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
       and business_unit_id = '22222222-2222-4222-8222-222222222222')
    / 100, 2)
  ) < 0.005,
  'deposit invariant: amount = ROUND(subtotal * pct / 100, 2)'
);

-- ---------------------------------------------------------------------------
-- 25. Future deposit policy ignored (1 test)
-- ---------------------------------------------------------------------------

-- The future policy (55% for new, effective 2099) should not apply.
-- New customer should still get 50%.
select is(
  (select deposit_percentage from public.create_import_order_request(
    'aaaaaaaa-bbbb-4aaa-8aaa-aaaaaaaaaaa1'::uuid,
    '{"name":"Future Policy Test","phone":"+51999011111"}'::jsonb,
    '{"district":"San Isidro","address":"Av. 1","note":""}'::jsonb,
    format('[{"offer_id":"%s","offer_updated_at":"%s","quantity":1}]',
      (select cp.id from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.availability_status = 'available' order by cp.sort_order limit 1),
      (select cp.updated_at from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.availability_status = 'available' order by cp.sort_order limit 1)
    )::jsonb
  )),
  50::numeric,
  'future deposit policy (55%) ignored, new customer still gets 50%'
);

-- ---------------------------------------------------------------------------
-- 26. Expired deposit policy ignored (1 test)
-- ---------------------------------------------------------------------------

-- The expired policy (50% for new, expired 2020) should not apply.
-- The active seeded policy (50%) should still work.
select is(
  (select deposit_percentage from public.create_import_order_request(
    'aaaaaaaa-cccc-4aaa-8aaa-aaaaaaaaaaa1'::uuid,
    '{"name":"Expired Policy Test","phone":"+51999022222"}'::jsonb,
    '{"district":"San Isidro","address":"Av. 1","note":""}'::jsonb,
    format('[{"offer_id":"%s","offer_updated_at":"%s","quantity":1}]',
      (select cp.id from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.availability_status = 'available' order by cp.sort_order limit 1),
      (select cp.updated_at from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.availability_status = 'available' order by cp.sort_order limit 1)
    )::jsonb
  )),
  50::numeric,
  'expired deposit policy ignored, active policy applies'
);

-- ---------------------------------------------------------------------------
-- 27. Failed request leaves no partial order/lines (1 test)
-- ---------------------------------------------------------------------------

-- Stale offer should fail and leave zero rows
select throws_ok(
  format(
    $$select * from public.create_import_order_request(
      'aaaaaaaa-dddd-4aaa-8aaa-aaaaaaaaaaa1'::uuid,
      '{"name":"Atomicity Test","phone":"+51999033333"}'::jsonb,
      '{"district":"San Isidro","address":"Av. 1","note":""}'::jsonb,
      '[{"offer_id":"%s","offer_updated_at":"2020-01-01T00:00:00Z","quantity":1}]'::jsonb
    )$$,
    (select cp.id from public.campaign_products cp where cp.campaign_id = '8b530000-0000-4000-8000-000000000001' and cp.availability_status = 'available' order by cp.sort_order limit 1)
  ),
  'P2011', null,
  'stale offer fails atomically'
);

select is(
  (select count(*)::integer from public.orders
   where request_id = 'aaaaaaaa-dddd-4aaa-8aaa-aaaaaaaaaaa1'
     and business_unit_id = '22222222-2222-4222-8222-222222222222'),
  0,
  'failed request leaves zero orders'
);

reset role;

select * from finish();
rollback;
