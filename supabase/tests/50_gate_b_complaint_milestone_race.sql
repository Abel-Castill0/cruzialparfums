-- Forces the exact two-session interleaving from independent review: a
-- resolution that is mid-transaction (not yet committed) while the worker
-- tries to enqueue a milestone for the same complaint. Uses two real dblink
-- connections (same pattern as 46_gate_b_worker_concurrency.sql) so this is
-- genuine cross-session concurrency, not a single-session simulation.
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at)
values ('50000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','gate-b-race-admin@example.test','',now(),now());
insert into public.admin_memberships(user_id,business_unit_id,role)
values ('50000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','admin');
insert into public.complaint_book_entries(id,business_unit_id,request_id,complaint_type,full_name,
 document_type,document_number,address,phone,email,detail,consumer_request,created_at)
select '50000000-0000-4000-8000-000000000041','11111111-1111-4111-8111-111111111111',
 '50000000-0000-4000-8000-000000000051','reclamo','Race Fixture','dni','12345678','Fixture address',
 '999000050','fixture@example.test','Fixture detail','Fixture request',candidate
from (select (date_trunc('day',now() at time zone 'America/Lima')-n*interval '1 day'+interval '12 hours')
 at time zone 'America/Lima' as candidate from generate_series(0,60) n) dates
where app.complaint_sla_due_at(candidate)>=now()
 and app.complaint_reminder_at(app.complaint_sla_due_at(candidate),3)<=now()
order by app.complaint_sla_due_at(candidate) limit 1;

begin;
select plan(4);

select extensions.dblink_connect('gate_b_race_worker','host=supabase_db_cruzialparfums port=5432 dbname=postgres user=postgres password=postgres');
select extensions.dblink_connect('gate_b_race_resolver','host=supabase_db_cruzialparfums port=5432 dbname=postgres user=postgres password=postgres');

-- The resolver commits the row's admin resolution, but does not commit yet
-- -- it holds the row lock, standing in for "resolution is mid-transaction".
select extensions.dblink_exec('gate_b_race_resolver','begin');
select extensions.dblink_exec('gate_b_race_resolver','set local role authenticated');
select extensions.dblink_exec('gate_b_race_resolver',
 $$set local request.jwt.claims='{"aal":"aal2","sub":"50000000-0000-4000-8000-000000000001","role":"authenticated"}'$$);
select * from extensions.dblink('gate_b_race_resolver',
 $$select 1 from (select public.admin_update_complaint_status('50000000-0000-4000-8000-000000000041',
   (select updated_at from public.complaint_book_entries where id='50000000-0000-4000-8000-000000000041'),
   'resolved','Race test resolution')) t$$) as q(n integer);

-- The worker starts and dispatches its enqueue pass asynchronously: with the
-- fix, its per-row `for update` blocks here on the resolver's held lock.
select extensions.dblink_exec('gate_b_race_worker','begin');
select extensions.dblink_send_query('gate_b_race_worker','select public.worker_enqueue_complaint_milestones()');
select pg_sleep(0.5);
select ok(extensions.dblink_is_busy('gate_b_race_worker')=1,
 'worker blocks on the resolver''s in-flight lock instead of racing past it');

-- Resolver commits; the worker's blocked call can now proceed and must see
-- the fresh, resolved state.
select extensions.dblink_exec('gate_b_race_resolver','commit');
select pg_sleep(0.5);

select is((select status from public.complaint_book_entries where id='50000000-0000-4000-8000-000000000041'),
 'resolved','the complaint is confirmed resolved');
select is((select count(*)::integer from public.notification_outbox where entity_type='complaint'
 and entity_id='50000000-0000-4000-8000-000000000041'
 and event_type in ('complaint_approaching','complaint_overdue')),0,
 'a resolved complaint never ends with a newly-claimable milestone notification');
select is((select count(*)::integer from public.notification_outbox where entity_type='complaint'
 and entity_id='50000000-0000-4000-8000-000000000041' and event_type='complaint_received'),1,
 'the unrelated acknowledgement notification is untouched');

select extensions.dblink_disconnect('gate_b_race_worker');
select extensions.dblink_disconnect('gate_b_race_resolver');
select * from finish();
rollback;
delete from public.complaint_book_entries where id='50000000-0000-4000-8000-000000000041';
