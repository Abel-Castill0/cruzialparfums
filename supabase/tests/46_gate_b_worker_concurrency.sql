create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
insert into public.notification_outbox(id,business_unit_id,event_type,entity_type,entity_id,recipient,template_key,idempotency_key)
values ('46000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
 'order_received','order','46000000-0000-4000-8000-000000000041','51999000046','order_received','gate-b-46-concurrency');
begin;
select plan(3);
select extensions.dblink_connect('gate_b_worker_a','host=supabase_db_cruzialparfums port=5432 dbname=postgres user=postgres password=postgres');
select extensions.dblink_connect('gate_b_worker_b','host=supabase_db_cruzialparfums port=5432 dbname=postgres user=postgres password=postgres');
select extensions.dblink_exec('gate_b_worker_a','begin');
select extensions.dblink_exec('gate_b_worker_b','begin');
select is((select n from extensions.dblink('gate_b_worker_a',
 'select count(*)::integer from public.worker_claim_notifications(5)') as q(n integer)),1,
 'first worker claims the queued notification');
select is((select n from extensions.dblink('gate_b_worker_b',
 'select count(*)::integer from public.worker_claim_notifications(5)') as q(n integer)),0,
 'concurrent worker skips the locked notification');
select extensions.dblink_exec('gate_b_worker_b','rollback');
select extensions.dblink_exec('gate_b_worker_a','rollback');
select is((select status from public.notification_outbox where id='46000000-0000-4000-8000-000000000001'),
 'queued','rolled-back claims remain safe to process');
select extensions.dblink_disconnect('gate_b_worker_a');
select extensions.dblink_disconnect('gate_b_worker_b');
select * from finish();
rollback;
delete from public.notification_outbox where id='46000000-0000-4000-8000-000000000001';
