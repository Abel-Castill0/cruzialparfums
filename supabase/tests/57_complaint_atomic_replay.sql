-- Real overlapping requests, including the legacy rollout caller. Only synthetic
-- complaint/outbox rows commit; exact cleanup makes this re-runnable.
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
begin;
select plan(12);
create function pg_temp.complaint_call(p_unit text, p_name text, p_legacy boolean default false)
returns text language sql as $$
 select format('select %s from public.%s(%L,''53000000-0000-4000-8000-000000000011'',
 ''reclamo'',%L,''dni'',''12345678'',''Synthetic address'',''999000053'',''race@example.test'',
 false,'''','''','''',''Synthetic concurrent complaint'',''Synthetic remedy'')',
 case when p_legacy then 'full_name' else 'entry->>''full_name'',created' end,
 case when p_legacy then 'public_submit_complaint_entry' else 'public_submit_complaint_entry_v2' end,p_unit,p_name);
$$;
select extensions.dblink_connect('complaint_first','host=supabase_db_cruzialparfums port=5432 dbname=postgres user=postgres password=postgres');
select extensions.dblink_connect('complaint_second','host=supabase_db_cruzialparfums port=5432 dbname=postgres user=postgres password=postgres');
select extensions.dblink_connect('complaint_legacy','host=supabase_db_cruzialparfums port=5432 dbname=postgres user=postgres password=postgres');
select extensions.dblink_exec('complaint_first','begin;set local role service_role');
select extensions.dblink_exec('complaint_second','set role service_role');
select extensions.dblink_exec('complaint_legacy','set role service_role');
select is((select created from extensions.dblink('complaint_first',pg_temp.complaint_call('parfums','Original consumer')) r(name text,created boolean)),true,
 'the first transaction reports a newly-created complaint');
select extensions.dblink_send_query('complaint_second',pg_temp.complaint_call('parfums','Changed retry payload'));
select extensions.dblink_send_query('complaint_legacy',pg_temp.complaint_call('parfums','Legacy retry payload',true));
select pg_sleep(0.2);
select ok(extensions.dblink_is_busy('complaint_second')=1,'a concurrent v2 retry waits on the original attempt');
select ok(extensions.dblink_is_busy('complaint_legacy')=1,'a concurrent legacy retry uses the same attempt lock');
select is((select created from extensions.dblink('complaint_first',pg_temp.complaint_call('import','Independent unit')) r(name text,created boolean)),true,
 'the same request UUID in another unit is an independent complaint');
select extensions.dblink_exec('complaint_first','commit');
create temporary table retry_result(name text,created boolean);
insert into retry_result select * from extensions.dblink_get_result('complaint_second') r(name text,created boolean);
select is((select created from retry_result),false,'the overlapping retry is truthfully classified as replay');
select is((select name from retry_result),'Original consumer','changed replay payload never replaces persisted consumer authority');
select * from extensions.dblink_get_result('complaint_second') r(name text,created boolean);
select is((select name from extensions.dblink_get_result('complaint_legacy') r(name text)),'Original consumer',
 'the old application also receives the original instead of a unique-constraint error');
select * from extensions.dblink_get_result('complaint_legacy') r(name text);
select is((select count(*)::integer from public.complaint_book_entries where request_id='53000000-0000-4000-8000-000000000011'),2,
 'exactly one complaint exists in each independent unit');
select is((select count(*)::integer from public.notification_outbox where event_type='complaint_received'
 and entity_id in (select id from public.complaint_book_entries where request_id='53000000-0000-4000-8000-000000000011')),2,
 'each independent complaint emits exactly one notification, with no duplicate replay event');
select ok(not has_function_privilege('anon','public.public_submit_complaint_entry_v2(text,uuid,text,text,text,text,text,text,text,boolean,text,text,text,text,text)','execute'),
 'anon cannot look up or mutate by a known UUID');
select ok(not has_function_privilege('authenticated','public.public_submit_complaint_entry_v2(text,uuid,text,text,text,text,text,text,text,boolean,text,text,text,text,text)','execute'),
 'authenticated clients cannot bypass the server capability boundary');
select ok(has_function_privilege('service_role','public.public_submit_complaint_entry_v2(text,uuid,text,text,text,text,text,text,text,boolean,text,text,text,text,text)','execute'),
 'the server alone may execute the atomic complaint boundary');
select extensions.dblink_disconnect('complaint_first');
select extensions.dblink_disconnect('complaint_second');
select extensions.dblink_disconnect('complaint_legacy');
select * from finish();
rollback;
delete from public.notification_outbox where entity_id in
 (select id from public.complaint_book_entries where request_id='53000000-0000-4000-8000-000000000011');
delete from public.complaint_book_entries where request_id='53000000-0000-4000-8000-000000000011';
