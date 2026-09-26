begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at)
values ('43000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','gate-b-inventory-admin@example.test','',now(),now());
insert into public.admin_memberships(user_id,business_unit_id,role)
values ('43000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','admin');
insert into public.products(id,business_unit_id,slug,name,publication_status) values
 ('43000000-0000-4000-8000-000000000011','11111111-1111-4111-8111-111111111111','gate-b-tracked','Gate B Tracked','draft');
insert into public.product_variants(id,product_id,variant_kind,label,price_amount) values
 ('43000000-0000-4000-8000-000000000021','43000000-0000-4000-8000-000000000011','bottle','Tracked',50),
 ('43000000-0000-4000-8000-000000000022','43000000-0000-4000-8000-000000000011','decant','Status only',20);
insert into public.inventory(id,product_variant_id,inventory_mode,quantity_on_hand,availability_status) values
 ('43000000-0000-4000-8000-000000000031','43000000-0000-4000-8000-000000000021','tracked_quantity',2,'available'),
 ('43000000-0000-4000-8000-000000000032','43000000-0000-4000-8000-000000000022','status_only',null,'available');
insert into public.orders(id,business_unit_id,order_number,status) values
 ('43000000-0000-4000-8000-000000000041','11111111-1111-4111-8111-111111111111','GATE-B-RESERVE-1','pending_whatsapp_confirmation'),
 ('43000000-0000-4000-8000-000000000042','11111111-1111-4111-8111-111111111111','GATE-B-RESERVE-2','pending_whatsapp_confirmation'),
 ('43000000-0000-4000-8000-000000000043','11111111-1111-4111-8111-111111111111','GATE-B-STATUS','pending_whatsapp_confirmation'),
 ('43000000-0000-4000-8000-000000000044','22222222-2222-4222-8222-222222222222','GATE-B-CROSS-UNIT','pending_whatsapp_confirmation');

insert into public.order_lines(order_id,product_id,product_variant_id,product_name_snapshot,
 variant_label_snapshot,unit_price_amount,quantity,line_total_amount)
values ('43000000-0000-4000-8000-000000000041','43000000-0000-4000-8000-000000000011',
 '43000000-0000-4000-8000-000000000021','Tracked','Tracked',50,2,100);
select is((select reserved_quantity from public.inventory where id='43000000-0000-4000-8000-000000000031'),2,
 'acceptance reserves the complete tracked quantity');
select is((select quantity_on_hand from public.inventory where id='43000000-0000-4000-8000-000000000031'),2,
 'reservation does not consume physical stock');
select throws_ok($$update public.inventory set inventory_mode='status_only',quantity_on_hand=null
 where id='43000000-0000-4000-8000-000000000031'$$,'23514',null,
 'active reservations prevent disabling quantitative inventory');
select throws_ok($$insert into public.order_lines(order_id,product_id,product_variant_id,
 product_name_snapshot,variant_label_snapshot,unit_price_amount,quantity,line_total_amount)
 values ('43000000-0000-4000-8000-000000000042','43000000-0000-4000-8000-000000000011',
 '43000000-0000-4000-8000-000000000021','Tracked','Tracked',50,1,50)$$,
 'P2034',null,'an additional reservation cannot oversell');
select is((select count(*)::integer from public.order_lines where order_id='43000000-0000-4000-8000-000000000042'),0,
 'failed reservation rolls back its order line');
select throws_ok($$insert into public.order_lines(order_id,product_id,product_variant_id,
 product_name_snapshot,variant_label_snapshot,unit_price_amount,quantity,line_total_amount)
 values ('43000000-0000-4000-8000-000000000044','43000000-0000-4000-8000-000000000011',
 '43000000-0000-4000-8000-000000000021','Tracked','Tracked',50,1,50)$$,
 '23514',null,'cross-business order line is denied');
insert into public.order_lines(order_id,product_id,product_variant_id,product_name_snapshot,
 variant_label_snapshot,unit_price_amount,quantity,line_total_amount)
values ('43000000-0000-4000-8000-000000000043','43000000-0000-4000-8000-000000000011',
 '43000000-0000-4000-8000-000000000022','Status only','Status only',20,1,20);
select is((select count(*)::integer from public.inventory_reservations where order_id='43000000-0000-4000-8000-000000000043'),0,
 'status_only inventory does not gain a fabricated quantity');

set local role authenticated;
set local request.jwt.claims='{"aal":"aal2","sub":"43000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok($$select public.admin_parfums_update_order_status('43000000-0000-4000-8000-000000000041',
 'pending_whatsapp_confirmation','cancelled','Customer cancelled')$$,'cancellation succeeds');
select lives_ok($$select public.admin_parfums_update_order_status('43000000-0000-4000-8000-000000000041',
 'pending_whatsapp_confirmation','cancelled','Customer cancelled')$$,'cancellation replay succeeds without a second release');
reset role;
select is((select reserved_quantity from public.inventory where id='43000000-0000-4000-8000-000000000031'),0,
 'cancellation releases once');
select is((select status from public.inventory_reservations where order_id='43000000-0000-4000-8000-000000000041'),
 'released','reservation ledger records release');
select throws_ok($$update public.orders set status='confirmed' where id='43000000-0000-4000-8000-000000000041'$$,
 'P2023',null,'terminal order cannot reopen');

insert into public.orders(id,business_unit_id,order_number,status)
values ('43000000-0000-4000-8000-000000000045','11111111-1111-4111-8111-111111111111',
 'GATE-B-CONSUME','pending_whatsapp_confirmation');
insert into public.order_lines(order_id,product_id,product_variant_id,product_name_snapshot,
 variant_label_snapshot,unit_price_amount,quantity,line_total_amount)
values ('43000000-0000-4000-8000-000000000045','43000000-0000-4000-8000-000000000011',
 '43000000-0000-4000-8000-000000000021','Tracked','Tracked',50,2,100);
set local role authenticated;
set local request.jwt.claims='{"aal":"aal2","sub":"43000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok($$select public.admin_parfums_update_order_status('43000000-0000-4000-8000-000000000045',
 'pending_whatsapp_confirmation','confirmed')$$,'confirmation preserves reservation');
select lives_ok($$select public.admin_parfums_update_order_status('43000000-0000-4000-8000-000000000045',
 'confirmed','fulfilled')$$,'fulfillment consumes reservation');
select lives_ok($$select public.admin_parfums_update_order_status('43000000-0000-4000-8000-000000000045',
 'confirmed','fulfilled')$$,'fulfillment replay succeeds without a second consumption');
reset role;
select is((select quantity_on_hand from public.inventory where id='43000000-0000-4000-8000-000000000031'),0,
 'fulfillment decrements physical stock once');
select is((select reserved_quantity from public.inventory where id='43000000-0000-4000-8000-000000000031'),0,
 'fulfillment clears reserved quantity');
select is((select status from public.inventory_reservations where order_id='43000000-0000-4000-8000-000000000045'),
 'consumed','reservation ledger records consumption');
select is((select availability_status from public.inventory where id='43000000-0000-4000-8000-000000000031'),
 'out_of_stock','tracked zero is not available');
select is((select count(*)::integer from public.audit_log where entity_type='inventory_reservation'
 and entity_id='43000000-0000-4000-8000-000000000031'),4,'reservation and terminal changes are audited');

update public.products set publication_status='published' where id='43000000-0000-4000-8000-000000000011';
update public.product_variants set publication_status='published',price_verification_status='client_confirmed'
 where id='43000000-0000-4000-8000-000000000021';
update public.inventory set quantity_on_hand=1,availability_status='available'
 where id='43000000-0000-4000-8000-000000000031';
select throws_ok($$select public.create_parfums_order_request_v2(
 '43000000-0000-4000-8000-000000000099', '{"name":"Rollback fixture","phone":"51999123456"}',
 '{"district":"Lima","delivery":"Coordinar","note":""}',null,
 '[{"product_id":"43000000-0000-4000-8000-000000000011",
    "product_variant_id":"43000000-0000-4000-8000-000000000021",
    "product_name":"Tracked","variant_label":"Tracked","quantity":2,
    "variant_snapshot":{"group":"bottle","size_ml":100,"brand":"Fixture"}}]')$$,
 'P2034',null,'public request fails atomically when tracked stock is insufficient');
select is((select count(*)::integer from public.orders where request_id='43000000-0000-4000-8000-000000000099'),0,
 'failed request leaves no half-created order');
select is((select reserved_quantity from public.inventory where id='43000000-0000-4000-8000-000000000031'),0,
 'failed request leaves no half-created reservation');

-- Independent-review finding: a status_only variant admins have flagged
-- out_of_stock must not be orderable, either at the trigger level or through
-- the real public order-request RPC (which never joins public.inventory in
-- its own eligibility check -- the trigger is the only authoritative gate).
insert into public.product_variants(id,product_id,variant_kind,label,price_amount,
 publication_status,price_verification_status) values
 ('43000000-0000-4000-8000-000000000023','43000000-0000-4000-8000-000000000011','decant',
  'Status only OOS',15,'published','client_confirmed');
insert into public.inventory(id,product_variant_id,inventory_mode,availability_status) values
 ('43000000-0000-4000-8000-000000000033','43000000-0000-4000-8000-000000000023','status_only','out_of_stock');
select throws_ok($$insert into public.order_lines(order_id,product_id,product_variant_id,
 product_name_snapshot,variant_label_snapshot,unit_price_amount,quantity,line_total_amount)
 values ('43000000-0000-4000-8000-000000000043','43000000-0000-4000-8000-000000000011',
 '43000000-0000-4000-8000-000000000023','Status only OOS','Status only OOS',15,1,15)$$,
 'P2034',null,'status_only out_of_stock is rejected at the trigger');

update public.products set availability_status='available' where id='43000000-0000-4000-8000-000000000011';
select throws_ok($$select public.create_parfums_order_request_v2(
 '43000000-0000-4000-8000-000000000098', '{"name":"OOS fixture","phone":"51999123457"}',
 '{"district":"Lima","delivery":"Coordinar","note":""}',null,
 '[{"product_id":"43000000-0000-4000-8000-000000000011",
    "product_variant_id":"43000000-0000-4000-8000-000000000023",
    "product_name":"Status only OOS","variant_label":"Status only OOS","quantity":1,
    "variant_snapshot":{"group":"decant","size_ml":3,"brand":"Fixture"}}]')$$,
 'P2034',null,'the public order-request RPC also rejects a status_only out_of_stock variant');
select is((select count(*)::integer from public.orders where request_id='43000000-0000-4000-8000-000000000098'),0,
 'the rejected status_only request leaves no half-created order');

-- A status_only variant marked available (the common case) still orders
-- correctly and still gains no fabricated reservation.
insert into public.orders(id,business_unit_id,order_number,status) values
 ('43000000-0000-4000-8000-000000000046','11111111-1111-4111-8111-111111111111','GATE-B-STATUS-OK','pending_whatsapp_confirmation');
insert into public.order_lines(order_id,product_id,product_variant_id,product_name_snapshot,
 variant_label_snapshot,unit_price_amount,quantity,line_total_amount)
values ('43000000-0000-4000-8000-000000000046','43000000-0000-4000-8000-000000000011',
 '43000000-0000-4000-8000-000000000022','Status only','Status only',20,1,20);
select is((select count(*)::integer from public.inventory_reservations where order_id='43000000-0000-4000-8000-000000000046'),0,
 'status_only available still gains no fabricated reservation after the fix');

-- public.variant_effective_availability: the PostgREST computed-column
-- function the public storefront actually reads (anon has no SELECT grant
-- on public.inventory itself -- this proves the SECURITY DEFINER function
-- works for anon without one, and that its logic matches the reservation
-- trigger's own rules exactly).
set local role anon;
select is(public.variant_effective_availability(v),true,'tracked with uncommitted stock is available to anon')
 from public.product_variants v where v.id='43000000-0000-4000-8000-000000000021';
select is(public.variant_effective_availability(v),true,'status_only available is available to anon')
 from public.product_variants v where v.id='43000000-0000-4000-8000-000000000022';
select is(public.variant_effective_availability(v),false,'status_only out_of_stock is unavailable to anon')
 from public.product_variants v where v.id='43000000-0000-4000-8000-000000000023';
select throws_ok($$select count(*) from public.inventory$$,'42501',null,
 'anon still cannot select from public.inventory directly (unchanged; only the boolean crosses the API)');
reset role;
-- quantity_on_hand is 1 at this point (set by the fulfillment test above).
update public.inventory set reserved_quantity=1 where id='43000000-0000-4000-8000-000000000031';
select is((select public.variant_effective_availability(v) from public.product_variants v
 where v.id='43000000-0000-4000-8000-000000000021'),false,
 'tracked fully reserved is unavailable even though availability_status still says available');
update public.inventory set reserved_quantity=0 where id='43000000-0000-4000-8000-000000000031';

select * from finish();
rollback;
