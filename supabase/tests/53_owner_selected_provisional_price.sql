-- Owner-delegated launch merchandising (2026-10-01): owner_selected_provisional.
-- The new price authority is orderable and counted as a commercially ready price,
-- provisional_market stays blocked, and a missing optional Parfums photo no longer
-- blocks launch readiness.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

set local role service_role;
insert into public.products (id, business_unit_id, legacy_id, slug, brand, name,
  description, gender, concentration, production_status, availability_status,
  publication_status, verification_status, specs)
values ('a5300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  'owner-prov-test','owner-prov-test','Owner','Owner Provisional Parfum','Test','unisex','EDP',
  'active','available','published','legacy','{"notes":["test"],"tag":"test"}'::jsonb);
insert into public.product_variants (id, product_id, label, variant_kind, size_ml,
  price_amount, currency, publication_status, price_verification_status, sort_order)
values ('b5300000-0000-4000-8000-000000000001','a5300000-0000-4000-8000-000000000001',
  '100 ml','bottle',100,250.00,'PEN','published','owner_selected_provisional',0);
reset role;

-- 1. constraint accepts the new value and still rejects unknown ones
select lives_ok(
  $$update public.product_variants set price_verification_status='owner_selected_provisional'
    where id='b5300000-0000-4000-8000-000000000001'$$,
  'check constraint accepts owner_selected_provisional');
select throws_ok(
  $$update public.product_variants set price_verification_status='made_up'
    where id='b5300000-0000-4000-8000-000000000001'$$,
  '23514', null, 'check constraint still rejects unknown authority values');

-- 2. orderable through the service-role order RPC, priced from the database
set local role service_role;
select lives_ok(
  $$select * from public.create_parfums_order_request_v2(
    '53000000-0000-4000-8000-000000000001',
    '{"name":"Test User","phone":"999111222"}',
    '{"district":"Lima","delivery":"Lima Metropolitana — Motorizado","note":""}',
    null,
    '[{"product_id":"a5300000-0000-4000-8000-000000000001","product_variant_id":"b5300000-0000-4000-8000-000000000001","product_name":"Owner","variant_label":"100 ml","quantity":1,"variant_snapshot":{"group":"bottle","size_ml":100,"brand":"Owner"}}]'
  )$$,
  'owner_selected_provisional variant is orderable');
reset role;
select is(
  (select ol.unit_price_amount from public.order_lines ol join public.orders o on o.id=ol.order_id
   where o.request_id='53000000-0000-4000-8000-000000000001'),
  250.00::numeric(12,2),
  'order price comes from the database, not the client');

-- 3. provisional_market remains non-orderable
update public.product_variants set price_verification_status='provisional_market'
where id='b5300000-0000-4000-8000-000000000001';
set local role service_role;
select throws_ok(
  $$select * from public.create_parfums_order_request_v2(
    '5b000000-0000-4000-8000-000000000002',
    '{"name":"Test User","phone":"999111222"}',
    '{"district":"Lima","delivery":"Lima Metropolitana — Motorizado","note":""}',
    null,
    '[{"product_id":"a5300000-0000-4000-8000-000000000001","product_variant_id":"b5300000-0000-4000-8000-000000000001","product_name":"Owner","variant_label":"100 ml","quantity":1,"variant_snapshot":{"group":"bottle","size_ml":100,"brand":"Owner"}}]'
  )$$,
  '22023','product/variant pair not found or not orderable',
  'provisional_market is still not orderable');
reset role;
update public.product_variants set price_verification_status='owner_selected_provisional'
where id='b5300000-0000-4000-8000-000000000001';

-- 4. launch readiness: the provisional price is not a commercial blocker and a missing
-- optional Parfums photo is reported but is not a blocker (the fixture product has no media)
select ok(
  (select (app.unit_launch_readiness('11111111-1111-4111-8111-111111111111')->>'missing_primary_media')::int >= 1),
  'missing photo is still counted for the owner');
select ok(
  not (app.unit_launch_readiness('11111111-1111-4111-8111-111111111111')->'blockers' ? 'catalog.missing_primary_media'),
  'a missing optional Parfums photo does not block launch');
select ok(
  not (app.unit_launch_readiness('11111111-1111-4111-8111-111111111111')->'blockers' ? 'catalog.commercial_blockers')
  or (app.unit_launch_readiness('11111111-1111-4111-8111-111111111111')->>'commercial_blockers')::int
     = (select count(*) from public.product_variants v join public.products p on p.id=v.product_id
        where p.business_unit_id='11111111-1111-4111-8111-111111111111' and p.archived_at is null and v.archived_at is null
        and (v.publication_status<>'published' or v.price_amount<=0
             or v.price_verification_status not in ('official_pdf','client_confirmed','owner_selected_provisional')))
        + (select count(*) from public.products p where p.business_unit_id='11111111-1111-4111-8111-111111111111' and p.archived_at is null
           and not exists(select 1 from public.product_variants v where v.product_id=p.id and v.archived_at is null))
        + (select count(*) from public.combos c join public.products p on p.id=c.product_id
           where p.business_unit_id='11111111-1111-4111-8111-111111111111' and p.archived_at is null
           and c.composition_verification_status not in ('official_pdf','client_confirmed')),
  'owner_selected_provisional is not counted as a commercial blocker');

select * from finish();
rollback;
