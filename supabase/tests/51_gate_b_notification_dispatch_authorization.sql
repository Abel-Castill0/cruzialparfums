-- Gate B F5: worker_begin_notification is the dispatch commit point for
-- complaint milestones. Real cross-session interleavings via dblink (same
-- pattern as 46/50). Fixtures are committed so the other sessions can see
-- them and are removed at the end so the suite stays re-runnable.
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at)
values ('51000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','gate-b-dispatch-admin@example.test','',now(),now())
on conflict (id) do nothing;
insert into public.admin_memberships(user_id,business_unit_id,role)
select '51000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','admin'
where not exists (select 1 from public.admin_memberships where user_id='51000000-0000-4000-8000-000000000001');
insert into public.complaint_book_entries(id,business_unit_id,request_id,complaint_type,full_name,
 document_type,document_number,address,phone,email,detail,consumer_request,created_at)
select ('51000000-0000-4000-8000-00000000004'||n)::uuid,'11111111-1111-4111-8111-111111111111',
 ('51000000-0000-4000-8000-00000000005'||n)::uuid,'reclamo','Dispatch Fixture','dni','12345678',
 'Fixture address','99900005'||n,'dispatch'||n||'@example.test','Fixture detail','Fixture request',
 now()-interval '1 day'
from generate_series(1,6) n;
insert into public.notification_outbox(id,business_unit_id,event_type,entity_type,entity_id,recipient,
 template_key,status,lease_token,lease_expires_at,attempts,idempotency_key)
select ('51000000-0000-4000-8000-00000000006'||n)::uuid,'11111111-1111-4111-8111-111111111111',
 'complaint_overdue','complaint',('51000000-0000-4000-8000-00000000004'||n)::uuid,'51999000051',
 'complaint_overdue','claimed',('51000000-0000-4000-8000-00000000007'||n)::uuid,
 case when n=5 then now()-interval '1 minute' else now()+interval '10 minutes' end,0,
 'gate-b-51-dispatch-'||n
from generate_series(1,6) n;

create function pg_temp.resolve_sql(p_id text) returns text language sql as $f$
 select format($q$select 1 from (select public.admin_update_complaint_status(%L,
   (select updated_at from public.complaint_book_entries where id=%L),'resolved','Dispatch race')) t$q$,
   p_id,p_id) $f$;
create function pg_temp.begin_sql(p_n integer) returns text language sql as $f$
 select format('select status,coalesce(last_error_safe,''-'') from public.worker_begin_notification(%L,%L)',
   '51000000-0000-4000-8000-00000000006'||p_n,'51000000-0000-4000-8000-00000000007'||p_n) $f$;

begin;
select plan(22);

select extensions.dblink_connect('f5_worker','host=supabase_db_cruzialparfums port=5432 dbname=postgres user=postgres password=postgres');
select extensions.dblink_connect('f5_resolver','host=supabase_db_cruzialparfums port=5432 dbname=postgres user=postgres password=postgres');
select extensions.dblink_connect('f5_claimer','host=supabase_db_cruzialparfums port=5432 dbname=postgres user=postgres password=postgres');
select extensions.dblink_exec('f5_worker','set role service_role');
select extensions.dblink_exec('f5_claimer','set role service_role');
select extensions.dblink_exec('f5_resolver','set role authenticated');
select extensions.dblink_exec('f5_resolver',
 $$set request.jwt.claims='{"aal":"aal2","sub":"51000000-0000-4000-8000-000000000001","role":"authenticated"}'$$);

-- 1. Resolver commits BEFORE the dispatch commit point. Begin blocks on the
--    in-flight resolution, then must refuse to authorize the provider call.
select extensions.dblink_exec('f5_resolver','begin');
select * from extensions.dblink('f5_resolver',pg_temp.resolve_sql('51000000-0000-4000-8000-000000000041')) q(n integer);
select extensions.dblink_send_query('f5_worker',pg_temp.begin_sql(1));
select pg_sleep(0.4);
select ok(extensions.dblink_is_busy('f5_worker')=1,'begin waits for the in-flight resolution (complaint lock first)');
select extensions.dblink_exec('f5_resolver','commit');
select is((select status from extensions.dblink_get_result('f5_worker') q(status text,reason text)),'cancelled',
 'resolution committed first: begin returns cancelled, the worker must not call the provider');
select * from extensions.dblink_get_result('f5_worker') q(status text,reason text);
select is((select dispatch_authorized_at from public.notification_outbox where id='51000000-0000-4000-8000-000000000061'),
 null,'no dispatch authorization was recorded');
select is((select attempts from public.notification_outbox where id='51000000-0000-4000-8000-000000000061'),0,
 'no provider attempt was consumed');

-- 1b. Defense in depth: a claimed row whose complaint is already resolved
--     (not cancelled by the trigger) is cancelled at the commit point.
select extensions.dblink_exec('f5_claimer',$$update public.notification_outbox set status='claimed',
 lease_token='51000000-0000-4000-8000-000000000071',lease_expires_at=now()+interval '10 minutes',last_error_safe=null
 where id='51000000-0000-4000-8000-000000000061'$$);
select is((select reason from extensions.dblink('f5_worker',pg_temp.begin_sql(1)) q(status text,reason text)),
 'resolved_before_dispatch','an already-resolved complaint is cancelled at the commit point');
select is((select status from public.notification_outbox where id='51000000-0000-4000-8000-000000000061'),'cancelled',
 'the cancelled row is terminal');

-- 2. Dispatch authorization commits FIRST. The resolution waits for it, then
--    proceeds without touching the in-flight row; bookkeeping stays truthful.
select extensions.dblink_exec('f5_worker','begin');
select is((select status from extensions.dblink('f5_worker',pg_temp.begin_sql(2)) q(status text,reason text)),'sending',
 'begin authorizes the dispatch while the complaint is open');
select extensions.dblink_exec('f5_resolver','begin');
select extensions.dblink_send_query('f5_resolver',pg_temp.resolve_sql('51000000-0000-4000-8000-000000000042'));
select pg_sleep(0.4);
select ok(extensions.dblink_is_busy('f5_resolver')=1,'resolution waits for the uncommitted dispatch authorization');
select extensions.dblink_exec('f5_worker','commit');
select is((select n from extensions.dblink_get_result('f5_resolver') q(n integer)),1,
 'the resolution completes once authorization commits (no deadlock)');
select * from extensions.dblink_get_result('f5_resolver') q(n integer);
select extensions.dblink_exec('f5_resolver','commit');
select ok((select dispatch_authorized_at is not null and status='sending' from public.notification_outbox
 where id='51000000-0000-4000-8000-000000000062'),'the authorized in-flight row is not faked into cancelled');
select lives_ok($$select extensions.dblink_exec('f5_worker',
 'do $d$ begin perform public.worker_finish_notification(''51000000-0000-4000-8000-000000000062'',''51000000-0000-4000-8000-000000000072'',''sent'',null,''f5-provider-62''); end $d$')$$,
 'the provider outcome of the legitimately in-flight call is still recorded');
select is((select status from public.notification_outbox where id='51000000-0000-4000-8000-000000000062'),'sent',
 'truthful sent state after a later resolution');

-- 5. Lease expiration: an expired claim cannot authorize a dispatch.
select throws_ok(format('select * from extensions.dblink(%L,%L) q(status text,reason text)','f5_worker',pg_temp.begin_sql(5)),
 null,null,'an expired lease cannot reach the dispatch commit point');
select is((select status from public.notification_outbox where id='51000000-0000-4000-8000-000000000065'),'claimed',
 'the expired claim is left for the claim-time sweep, not dispatched');
select throws_ok($$select * from extensions.dblink('f5_worker',
 'select status from public.worker_begin_notification(''51000000-0000-4000-8000-000000000066'',''00000000-0000-4000-8000-000000000000'')') q(status text)$$,
 null,null,'a wrong lease cannot authorize a dispatch');

-- 3. Provider failure after resolution: the attempt returns to retry, but the
--    next claim cycle cancels it; it is never retried.
select * from extensions.dblink('f5_worker',pg_temp.begin_sql(3)) q(status text,reason text);
select * from extensions.dblink('f5_resolver',pg_temp.resolve_sql('51000000-0000-4000-8000-000000000043')) q(n integer);
select extensions.dblink_exec('f5_worker',
 'do $d$ begin perform public.worker_finish_notification(''51000000-0000-4000-8000-000000000063'',''51000000-0000-4000-8000-000000000073'',''retry'',''provider_unavailable'',null); end $d$');
select is((select count(*)::integer from extensions.dblink('f5_claimer',
 'select id from public.worker_claim_notifications(10)') q(id uuid) where id='51000000-0000-4000-8000-000000000063'),0,
 'a failed attempt for a resolved complaint is not claimed again');
select is((select status from public.notification_outbox where id='51000000-0000-4000-8000-000000000063'),'cancelled',
 'it is cancelled, not stranded in retry');

-- 4. Provider uncertain: stays uncertain, never blindly resent.
select * from extensions.dblink('f5_worker',pg_temp.begin_sql(4)) q(status text,reason text);
select * from extensions.dblink('f5_resolver',pg_temp.resolve_sql('51000000-0000-4000-8000-000000000044')) q(n integer);
select extensions.dblink_exec('f5_worker',
 'do $d$ begin perform public.worker_finish_notification(''51000000-0000-4000-8000-000000000064'',''51000000-0000-4000-8000-000000000074'',''uncertain'',''provider_timeout'',null); end $d$');
select * from extensions.dblink('f5_claimer','select id from public.worker_claim_notifications(10)') q(id uuid);
select is((select status from public.notification_outbox where id='51000000-0000-4000-8000-000000000064'),'uncertain',
 'an uncertain provider outcome remains uncertain');
select is((select attempts from public.notification_outbox where id='51000000-0000-4000-8000-000000000064'),1,
 'no blind resend attempt was made');

-- 6. Concurrent resolve / enqueue+claim / begin: nothing deadlocks and the
--    claimer never waits on the complaint lock.
select extensions.dblink_exec('f5_resolver','begin');
select * from extensions.dblink('f5_resolver',pg_temp.resolve_sql('51000000-0000-4000-8000-000000000046')) q(n integer);
select extensions.dblink_send_query('f5_worker',pg_temp.begin_sql(6));
select extensions.dblink_send_query('f5_claimer',
 'select count(*)::integer from (select public.worker_enqueue_complaint_milestones()) e, public.worker_claim_notifications(10)');
select pg_sleep(0.6);
select ok(extensions.dblink_is_busy('f5_claimer')=0,'enqueue+claim is not blocked by the in-flight resolution');
select * from extensions.dblink_get_result('f5_claimer') q(n integer);
select * from extensions.dblink_get_result('f5_claimer') q(n integer);
select extensions.dblink_exec('f5_resolver','commit');
select is((select status from extensions.dblink_get_result('f5_worker') q(status text,reason text)),'cancelled',
 'the blocked begin resolves to cancelled after the resolution commits');
select * from extensions.dblink_get_result('f5_worker') q(status text,reason text);

-- 7. ACL: only service_role may reach the commit point.
select ok(not has_function_privilege('authenticated','public.worker_begin_notification(uuid,uuid)','EXECUTE')
 and not has_function_privilege('anon','public.worker_begin_notification(uuid,uuid)','EXECUTE'),
 'public roles cannot invoke the dispatch commit point');

select extensions.dblink_disconnect('f5_worker');
select extensions.dblink_disconnect('f5_resolver');
select extensions.dblink_disconnect('f5_claimer');
select * from finish();
rollback;

delete from public.notification_outbox where entity_id::text like '51000000-0000-4000-8000-00000000004_';
delete from public.complaint_book_entries where id::text like '51000000-0000-4000-8000-00000000004_';
-- The fixture admin and membership stay (append-only audit rows reference
-- the user); their inserts above are idempotent so the suite re-runs.
