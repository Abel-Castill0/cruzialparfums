-- Cruzial Platform V2 — Operations Foundation V1 (Task 6)
--
-- Automatic Import customer linking via create_import_order_request:
--
-- A. Zero phone matches: atomically creates a pending_verification customer,
--    links it, still under new-customer (50%) deposit semantics
-- B. Existing customer with status='pending_verification' (single match):
--    linked, still 50% (not returning)
-- C. Existing customer with status='new' (single match): linked, 50%
-- D. Existing customer with status='returning' (single match): linked, 70%
-- E. Race/duplicate defense: the unique index rejects a second active
--    customer with the same normalized phone in the same business unit
-- F. Ambiguous safety (reachable only via pre-existing dirty data, since E
--    proves customers_import_active_phone_uniq prevents new ambiguity
--    going forward): temporarily drop that index within this transaction
--    to construct that dirty state, and prove the function still fails
--    closed — no link, 50%, never an arbitrary choice
-- G. Deposit snapshot is immutable: promoting the auto-created customer to
--    'returning' afterward does not change the already-created order's
--    deposit_percentage_snapshot
-- H. Codex P1 #3 atomicity correction — explicit status-mapping fail-closed:
--    an active customer whose verified_customer_status is NOT one of the
--    three recognized values (reachable only via pre-existing dirty data,
--    since customers_verified_status_check normally prevents it — same
--    "temporarily loosen a constraint within this transaction" technique
--    as F's dirty duplicate) makes the exactly-one path raise P2033 rather
--    than silently collapsing an unrecognized status to 'new'.

begin;
select plan(13);

-- =========================================================================
-- Fixtures
-- =========================================================================

insert into public.categories(id,business_unit_id,kind,name,slug,publication_status) values
 ('9c9c3000-0000-4000-8000-000000000001',(select id from public.business_units where code='import'),'import_category','Cat Link','cat-link','published');

insert into public.products(id,business_unit_id,name,brand,slug,publication_status) values
 ('9c9c1000-0000-4000-8000-000000000001',(select id from public.business_units where code='import'),'Link Product','Brand L','link-product','published');

insert into public.product_categories(product_id,category_id) values
 ('9c9c1000-0000-4000-8000-000000000001','9c9c3000-0000-4000-8000-000000000001');

insert into public.import_presentations(id,product_id,stable_key,label,presentation_class,publication_status) values
 ('9c9c4000-0000-4000-8000-000000000001','9c9c1000-0000-4000-8000-000000000001','link-stable-1','Link Pres','single_fixed','published');

-- The single currently-open, in-window Import campaign.
insert into public.campaigns(id,business_unit_id,number,name,status,opens_at,closes_at) values
 ('9c9c2000-0000-4000-8000-000000000001',(select id from public.business_units where code='import'),971,'Link Campaign','open',now()-interval '1 day',now()+interval '1 day');

insert into public.campaign_products(id,campaign_id,product_id,import_presentation_id,price_amount,currency,availability_status,sort_order) values
 ('9c9c6000-0000-4000-8000-000000000001','9c9c2000-0000-4000-8000-000000000001','9c9c1000-0000-4000-8000-000000000001','9c9c4000-0000-4000-8000-000000000001',100.00,'PEN','available',1);

-- Pre-existing customers for B/C/D.
insert into public.customers(id,business_unit_id,full_name,phone,verified_customer_status,verified_at) values
 ('9c9c5000-0000-4000-8000-000000000001',(select id from public.business_units where code='import'),'Pending Existing','+51900100001','pending_verification',null),
 ('9c9c5000-0000-4000-8000-000000000002',(select id from public.business_units where code='import'),'New Existing','+51900100002','new',now()),
 ('9c9c5000-0000-4000-8000-000000000003',(select id from public.business_units where code='import'),'Returning Existing','+51900100003','returning',now());

set local role service_role;

-- =========================================================================
-- A. Zero phone matches — atomically creates + links a new customer
-- =========================================================================

select lives_ok(
  format(
    $$select * from public.create_import_order_request(
      '9c9c7000-a000-4000-8000-000000000001'::uuid,
      '{"name":"Brand New Client","phone":"+51900200001"}'::jsonb,
      '{"district":"San Isidro","address":"Av. 1","note":""}'::jsonb,
      '[{"offer_id":"%s","offer_updated_at":"%s","quantity":1}]'::jsonb
    )$$,
    (select id from public.campaign_products where campaign_id='9c9c2000-0000-4000-8000-000000000001'),
    (select updated_at from public.campaign_products where campaign_id='9c9c2000-0000-4000-8000-000000000001')
  ),
  'A1: order for a brand-new phone succeeds'
);

select ok(
  exists(select 1 from public.customers where business_unit_id=(select id from public.business_units where code='import') and phone='+51900200001' and verified_customer_status='pending_verification'),
  'A2: a pending_verification customer was created for the new phone'
);

select is(
  (select c.id from public.orders o join public.customers c on c.id=o.customer_id where o.request_id='9c9c7000-a000-4000-8000-000000000001'),
  (select id from public.customers where phone='+51900200001'),
  'A3: the new order is linked to the newly created customer'
);

select is(
  (select deposit_percentage_snapshot from public.orders where request_id='9c9c7000-a000-4000-8000-000000000001'),
  50.00::numeric,
  'A4: new-customer deposit semantics (50%) apply to the auto-created customer'
);

-- =========================================================================
-- B/C/D. Existing single-match customers: linked, deposit by ACTUAL status
-- =========================================================================

select is(
  (select deposit_percentage from public.create_import_order_request(
    '9c9c7000-b000-4000-8000-000000000001'::uuid,
    '{"name":"Pending Existing","phone":"+51900100001"}'::jsonb,
    '{"district":"San Isidro","address":"Av. 1","note":""}'::jsonb,
    format('[{"offer_id":"%s","offer_updated_at":"%s","quantity":1}]',
      (select id from public.campaign_products where campaign_id='9c9c2000-0000-4000-8000-000000000001'),
      (select updated_at from public.campaign_products where campaign_id='9c9c2000-0000-4000-8000-000000000001'))::jsonb
  )),
  50.00::numeric,
  'B1: existing pending_verification customer -> 50% (not returning)'
);

select is(
  (select deposit_percentage from public.create_import_order_request(
    '9c9c7000-c000-4000-8000-000000000001'::uuid,
    '{"name":"New Existing","phone":"+51900100002"}'::jsonb,
    '{"district":"San Isidro","address":"Av. 1","note":""}'::jsonb,
    format('[{"offer_id":"%s","offer_updated_at":"%s","quantity":1}]',
      (select id from public.campaign_products where campaign_id='9c9c2000-0000-4000-8000-000000000001'),
      (select updated_at from public.campaign_products where campaign_id='9c9c2000-0000-4000-8000-000000000001'))::jsonb
  )),
  50.00::numeric,
  'C1: existing new customer -> 50%'
);

select is(
  (select deposit_percentage from public.create_import_order_request(
    '9c9c7000-d000-4000-8000-000000000001'::uuid,
    '{"name":"Returning Existing","phone":"+51900100003"}'::jsonb,
    '{"district":"San Isidro","address":"Av. 1","note":""}'::jsonb,
    format('[{"offer_id":"%s","offer_updated_at":"%s","quantity":1}]',
      (select id from public.campaign_products where campaign_id='9c9c2000-0000-4000-8000-000000000001'),
      (select updated_at from public.campaign_products where campaign_id='9c9c2000-0000-4000-8000-000000000001'))::jsonb
  )),
  70.00::numeric,
  'D1: existing returning customer -> 70%'
);

reset role;

-- =========================================================================
-- E. Race/duplicate defense — the unique index blocks a second active
-- customer with the same normalized phone in the same business unit
-- =========================================================================

select throws_ok(
  format(
    $$insert into public.customers(business_unit_id,full_name,phone,verified_customer_status)
      values ('%s','Duplicate Phone','+51900100002','pending_verification')$$,
    (select id from public.business_units where code='import')
  ),
  '23505', null,
  'E1: a second active customer with the same normalized phone is rejected'
);

-- =========================================================================
-- F. Ambiguous safety — reachable only via pre-existing dirty data (drop
-- the index within this transaction to construct it), function fails
-- closed: no link, new-customer semantics.
-- =========================================================================

drop index public.customers_import_active_phone_uniq;

insert into public.customers(id,business_unit_id,full_name,phone,verified_customer_status,verified_at) values
 ('9c9c5000-0000-4000-8000-000000000004',(select id from public.business_units where code='import'),'Dirty Duplicate','+51900100002','returning',now());

set local role service_role;

select is(
  (select deposit_percentage from public.create_import_order_request(
    '9c9c7000-f000-4000-8000-000000000001'::uuid,
    '{"name":"New Existing","phone":"+51900100002"}'::jsonb,
    '{"district":"San Isidro","address":"Av. 1","note":""}'::jsonb,
    format('[{"offer_id":"%s","offer_updated_at":"%s","quantity":1}]',
      (select id from public.campaign_products where campaign_id='9c9c2000-0000-4000-8000-000000000001'),
      (select updated_at from public.campaign_products where campaign_id='9c9c2000-0000-4000-8000-000000000001'))::jsonb
  )),
  50.00::numeric,
  'F1: ambiguous phone (dirty pre-existing duplicate) fails closed -> 50%, no arbitrary link'
);

select is(
  (select customer_id from public.orders where request_id='9c9c7000-f000-4000-8000-000000000001'),
  null::uuid,
  'F2: ambiguous phone -> customer_id stays NULL, never an arbitrary choice'
);

reset role;

-- =========================================================================
-- G. Deposit snapshot is immutable: promoting the auto-created customer to
-- returning afterward never changes the already-created order.
-- =========================================================================

update public.customers set verified_customer_status='returning', verified_at=now()
where phone='+51900200001';

select is(
  (select deposit_percentage_snapshot from public.orders where request_id='9c9c7000-a000-4000-8000-000000000001'),
  50.00::numeric,
  'G1: promoting the customer to returning after the fact does not change the immutable deposit snapshot'
);

-- =========================================================================
-- H. Explicit status-mapping fail-closed (exactly-one path)
-- =========================================================================

alter table public.customers drop constraint customers_verified_status_check;

insert into public.customers(id,business_unit_id,full_name,phone,verified_customer_status,verified_at) values
 ('9c9c5000-0000-4000-8000-000000000005',(select id from public.business_units where code='import'),'Unrecognized Status','+51900100005','vip_unrecognized',now());

set local role service_role;

select throws_ok(
  format(
    $$select * from public.create_import_order_request(
      '9c9c7000-e000-4000-8000-000000000001'::uuid,
      '{"name":"Unrecognized Status","phone":"+51900100005"}'::jsonb,
      '{"district":"San Isidro","address":"Av. 1","note":""}'::jsonb,
      '[{"offer_id":"%s","offer_updated_at":"%s","quantity":1}]'::jsonb
    )$$,
    (select id from public.campaign_products where campaign_id='9c9c2000-0000-4000-8000-000000000001'),
    (select updated_at from public.campaign_products where campaign_id='9c9c2000-0000-4000-8000-000000000001')
  ),
  'P2033', null,
  'H1: an active customer with an unrecognized verified_customer_status fails closed (P2033), never silently mapped to new'
);

select ok(
  not exists(select 1 from public.orders where request_id='9c9c7000-e000-4000-8000-000000000001'),
  'H2: the failed-closed request creates no order row at all (function raised before insert)'
);

reset role;

select * from finish();
rollback;
