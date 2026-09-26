-- Lock ordering between concurrent Parfums orders that share tracked
-- inventory. Each order line's reservation trigger takes the variant's
-- inventory row FOR UPDATE, so inserting lines in client-supplied order lets
-- two orders {A,B} and {B,A} lock in opposite orders and deadlock (one
-- customer's order then fails). create_parfums_order_request_v2 must take
-- every inventory lock it needs up front, in one deterministic order.
--
-- Deterministic interleaving with dblink: session "first" is an in-flight
-- order that already holds A (the lowest inventory id, i.e. it follows the
-- global order) and will next lock B; session "second" calls v2 with lines
-- [B, A]. Without a global order "second" locks B and then waits on A, and
-- "first" locking B closes the cycle (reproduced before the fix).
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

-- Leftovers of an interrupted earlier run are removed first.
delete from public.inventory where product_variant_id::text like '52000000-0000-4000-8000-00000000000_';
delete from public.product_variants where product_id = '52000000-0000-4000-8000-000000000001';
delete from public.products where id = '52000000-0000-4000-8000-000000000001';

insert into public.products (id, business_unit_id, legacy_id, slug, brand, name, description, gender,
  concentration, production_status, availability_status, publication_status, verification_status, specs)
values ('52000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','gate-b-52','gate-b-52',
  'Gate B','Gate B Lock Order','Test','unisex','EDP','active','available','published','legacy','{}'::jsonb);
insert into public.product_variants (id, product_id, label, variant_kind, size_ml, price_amount, currency,
  publication_status, price_verification_status, sort_order)
values
 ('52000000-0000-4000-8000-00000000000a','52000000-0000-4000-8000-000000000001','3 ml','decant',3,10,'PEN','published','official_pdf',0),
 ('52000000-0000-4000-8000-00000000000b','52000000-0000-4000-8000-000000000001','5 ml','decant',5,15,'PEN','published','official_pdf',1);
-- Explicit inventory ids: A's row sorts before B's in the global lock order
-- (inventory.id), so session "first" below is a protocol-compliant order.
delete from public.inventory where product_variant_id::text like '52000000-0000-4000-8000-00000000000_';
insert into public.inventory (id, product_variant_id, inventory_mode, quantity_on_hand, availability_status)
values ('52000000-0000-4000-8000-0000000000a1','52000000-0000-4000-8000-00000000000a','tracked_quantity',10,'available'),
       ('52000000-0000-4000-8000-0000000000b1','52000000-0000-4000-8000-00000000000b','tracked_quantity',10,'available');

begin;
select plan(5);
select extensions.dblink_connect('lock_first','host=supabase_db_cruzialparfums port=5432 dbname=postgres user=postgres password=postgres');
select extensions.dblink_connect('lock_second','host=supabase_db_cruzialparfums port=5432 dbname=postgres user=postgres password=postgres');

select extensions.dblink_exec('lock_first','begin');
select extensions.dblink_exec('lock_first',$$insert into public.orders(id,business_unit_id,order_number,status)
 values ('52000000-0000-4000-8000-000000000041','11111111-1111-4111-8111-111111111111','GATE-B-52-FIRST','pending_whatsapp_confirmation')$$);
select extensions.dblink_exec('lock_first',$$insert into public.order_lines(order_id,product_id,product_variant_id,
 product_name_snapshot,variant_label_snapshot,unit_price_amount,quantity,line_total_amount)
 values ('52000000-0000-4000-8000-000000000041','52000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-00000000000a',
 'Gate B Lock Order','3 ml',10,1,10)$$);

select extensions.dblink_exec('lock_second','begin; set local role service_role');
select extensions.dblink_send_query('lock_second',$$select order_number from public.create_parfums_order_request_v2(
 '52000000-0000-4000-8000-000000000051','{"name":"Lock Order","phone":"999000052"}',
 '{"district":"Lima","delivery":"Lima Metropolitana — Motorizado","note":""}',null,
 '[{"product_id":"52000000-0000-4000-8000-000000000001","product_variant_id":"52000000-0000-4000-8000-00000000000b","product_name":"Gate B","variant_label":"5 ml","quantity":1,"variant_snapshot":{"group":"decant","size_ml":5,"brand":"Gate B"}},
   {"product_id":"52000000-0000-4000-8000-000000000001","product_variant_id":"52000000-0000-4000-8000-00000000000a","product_name":"Gate B","variant_label":"3 ml","quantity":1,"variant_snapshot":{"group":"decant","size_ml":3,"brand":"Gate B"}}]')$$);
select pg_sleep(0.5);
select ok(extensions.dblink_is_busy('lock_second')=1,'the second order waits for the in-flight order''s inventory lock');

-- The in-flight order now takes its second inventory row. With one global
-- lock order the second order holds nothing it could deadlock on.
select lives_ok($$select extensions.dblink_exec('lock_first',$i$insert into public.order_lines(order_id,product_id,
 product_variant_id,product_name_snapshot,variant_label_snapshot,unit_price_amount,quantity,line_total_amount)
 values ('52000000-0000-4000-8000-000000000041','52000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-00000000000b',
 'Gate B Lock Order','5 ml',15,1,15)$i$)$$,'the in-flight order completes without a deadlock');
-- The in-flight order ends (rolled back: nothing but fixtures is ever
-- committed); its locks release and the waiting order proceeds.
select extensions.dblink_exec('lock_first','rollback');
select is((select count(*)::integer from extensions.dblink_get_result('lock_second') q(order_number text)),1,
 'the concurrent reversed-line order is created once the first ends (no deadlock victim)');
select * from extensions.dblink_get_result('lock_second') q(order_number text);

select is((select n from extensions.dblink('lock_second',$$select reserved_quantity from public.inventory
 where product_variant_id='52000000-0000-4000-8000-00000000000a'$$) q(n integer)),1,
 'variant A reservation is exact for the surviving order');
select is((select n from extensions.dblink('lock_second',$$select reserved_quantity from public.inventory
 where product_variant_id='52000000-0000-4000-8000-00000000000b'$$) q(n integer)),1,
 'variant B reservation is exact for the surviving order');
select extensions.dblink_exec('lock_second','rollback');

select extensions.dblink_disconnect('lock_first');
select extensions.dblink_disconnect('lock_second');
select * from finish();
rollback;

-- Only catalog/inventory fixtures were committed (both order sessions roll
-- back; order lines are immutable history), so the suite stays re-runnable.
delete from public.inventory where product_variant_id::text like '52000000-0000-4000-8000-00000000000_';
delete from public.product_variants where product_id = '52000000-0000-4000-8000-000000000001';
delete from public.products where id = '52000000-0000-4000-8000-000000000001';
