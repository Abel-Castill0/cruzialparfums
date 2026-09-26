-- Committed fixture identities are required so two real connections can see
-- them. Both competing transactions roll back; no reservation/audit survives.
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
insert into public.products(id,business_unit_id,slug,name)
values ('44000000-0000-4000-8000-000000000011','11111111-1111-4111-8111-111111111111','gate-b-concurrency','Concurrency fixture');
insert into public.product_variants(id,product_id,variant_kind,label,price_amount)
values ('44000000-0000-4000-8000-000000000021','44000000-0000-4000-8000-000000000011','bottle','Tracked',50);
insert into public.inventory(product_variant_id,inventory_mode,quantity_on_hand,availability_status)
values ('44000000-0000-4000-8000-000000000021','tracked_quantity',1,'available');
begin;
select plan(3);
-- The Docker network address uses password authentication. The loopback
-- trust rule is intentionally rejected by dblink for non-superusers.
select extensions.dblink_connect('gate_b_a','host=supabase_db_cruzialparfums port=5432 dbname=postgres user=postgres password=postgres');
select extensions.dblink_connect('gate_b_b','host=supabase_db_cruzialparfums port=5432 dbname=postgres user=postgres password=postgres');
select extensions.dblink_exec('gate_b_a','begin');
select extensions.dblink_exec('gate_b_b','begin; set local lock_timeout=''250ms''');
select extensions.dblink_exec('gate_b_a',$$insert into public.orders(id,business_unit_id,order_number,status)
 values ('44000000-0000-4000-8000-000000000041','11111111-1111-4111-8111-111111111111','GATE-B-CONCURRENT-A','pending_whatsapp_confirmation')$$);
select extensions.dblink_exec('gate_b_b',$$insert into public.orders(id,business_unit_id,order_number,status)
 values ('44000000-0000-4000-8000-000000000042','11111111-1111-4111-8111-111111111111','GATE-B-CONCURRENT-B','pending_whatsapp_confirmation')$$);
select is(extensions.dblink_exec('gate_b_a',$$insert into public.order_lines(order_id,product_id,product_variant_id,
 product_name_snapshot,variant_label_snapshot,unit_price_amount,quantity,line_total_amount)
 values ('44000000-0000-4000-8000-000000000041','44000000-0000-4000-8000-000000000011',
 '44000000-0000-4000-8000-000000000021','Tracked','Tracked',50,1,50)$$),
 'INSERT 0 1','first transaction reserves the only unit');
select throws_ok($$select extensions.dblink_exec('gate_b_b','insert into public.order_lines(order_id,product_id,product_variant_id,
 product_name_snapshot,variant_label_snapshot,unit_price_amount,quantity,line_total_amount)
 values (''44000000-0000-4000-8000-000000000042'',''44000000-0000-4000-8000-000000000011'',
 ''44000000-0000-4000-8000-000000000021'',''Tracked'',''Tracked'',50,1,50)')$$,
 '55P03',null,'concurrent reservation waits on the authoritative stock row and cannot double-reserve');
select extensions.dblink_exec('gate_b_b','rollback');
select extensions.dblink_exec('gate_b_a','rollback');
select is((select reserved_quantity from public.inventory where product_variant_id='44000000-0000-4000-8000-000000000021'),0,
 'rolled-back concurrent transactions leave stock unchanged');
select extensions.dblink_disconnect('gate_b_a');
select extensions.dblink_disconnect('gate_b_b');
select * from finish();
rollback;
delete from public.inventory where product_variant_id='44000000-0000-4000-8000-000000000021';
delete from public.product_variants where id='44000000-0000-4000-8000-000000000021';
delete from public.products where id='44000000-0000-4000-8000-000000000011';
