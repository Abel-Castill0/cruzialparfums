begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
select is(app.peru_easter_date(2026),date '2026-04-05','Gregorian Easter 2026 is correct');
select is(app.peru_easter_date(2027),date '2027-03-28','Gregorian Easter 2027 is correct');
select ok(not app.peru_is_business_day(date '2026-04-02'),'Holy Thursday is excluded');
select ok(not app.peru_is_business_day(date '2026-04-03'),'Good Friday is excluded');
select ok(not app.peru_is_business_day(date '2026-07-23'),'Fuerza Aerea national holiday is excluded');
select ok(app.peru_is_business_day(date '2026-07-27'),'optional public-sector day off does not extend private consumer deadline');
select is(app.complaint_sla_due_at('2026-09-25 18:00:00-05'),timestamptz '2026-10-19 23:59:59-05',
 '15 business days skip weekends and Angamos');
select is(app.complaint_sla_due_at('2026-03-20 18:00:00-05'),timestamptz '2026-04-14 23:59:59-05',
 '15 business days skip Holy Week');
select is(app.complaint_sla_due_at('2026-07-20 18:00:00-05'),timestamptz '2026-08-14 23:59:59-05',
 '15 business days skip July and Junin holidays');
select is(app.complaint_sla_due_at('2026-12-18 18:00:00-05'),timestamptz '2027-01-12 23:59:59-05',
 'deadline crosses the year without counting Christmas or New Year');
select is(app.complaint_reminder_at('2026-10-19 23:59:59-05',3),timestamptz '2026-10-14 00:00:00-05',
 'operational reminder is three business days before the due date');

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at)
values ('47000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','gate-b-sla-admin@example.test','',now(),now());
insert into public.admin_memberships(user_id,business_unit_id,role)
values ('47000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','admin');
insert into public.complaint_book_entries(id,business_unit_id,request_id,complaint_type,full_name,
 document_type,document_number,address,phone,email,detail,consumer_request,created_at)
values ('47000000-0000-4000-8000-000000000041','11111111-1111-4111-8111-111111111111',
 '47000000-0000-4000-8000-000000000051','reclamo','SLA Fixture','dni','12345678','Fixture address',
 '999000047','fixture@example.test','Fixture detail','Fixture request',now()-interval '60 days');
insert into public.complaint_book_entries(id,business_unit_id,request_id,complaint_type,full_name,
 document_type,document_number,address,phone,email,detail,consumer_request,created_at)
select '47000000-0000-4000-8000-000000000042','11111111-1111-4111-8111-111111111111',
 '47000000-0000-4000-8000-000000000052','queja','Approaching fixture','dni','12345678','Fixture address',
 '999000047','fixture@example.test','Fixture detail','Fixture request',candidate
from (select (date_trunc('day',now() at time zone 'America/Lima')-n*interval '1 day'+interval '12 hours')
 at time zone 'America/Lima' as candidate from generate_series(0,60) n) dates
where app.complaint_sla_due_at(candidate)>=now()
 and app.complaint_reminder_at(app.complaint_sla_due_at(candidate),3)<=now()
order by app.complaint_sla_due_at(candidate) limit 1;
select is((select count(*)::integer from public.notification_outbox where entity_type='complaint'
 and entity_id in ('47000000-0000-4000-8000-000000000041','47000000-0000-4000-8000-000000000042')
 and event_type='complaint_received'),2,'both complaint types enqueue acknowledgement');
select throws_ok($$update public.complaint_book_entries set due_at=due_at+interval '1 day'
 where id='47000000-0000-4000-8000-000000000041'$$,'23514',null,'legal deadline cannot be silently extended');
select public.worker_enqueue_complaint_milestones();
select public.worker_enqueue_complaint_milestones();
select is((select count(*)::integer from public.notification_outbox where entity_type='complaint'
 and entity_id in ('47000000-0000-4000-8000-000000000041','47000000-0000-4000-8000-000000000042')
 and event_type in ('complaint_approaching','complaint_overdue')),2,'reminder milestones enqueue exactly once');
select is((select event_type from public.notification_outbox where entity_id='47000000-0000-4000-8000-000000000041'
 and event_type<>'complaint_received'),'complaint_overdue','past deadline queues an overdue alert');
select is((select event_type from public.notification_outbox where entity_id='47000000-0000-4000-8000-000000000042'
 and event_type<>'complaint_received'),'complaint_approaching','upcoming deadline queues a reminder');

set local role authenticated;
set local request.jwt.claims='{"aal":"aal2","sub":"47000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok($$select public.admin_update_operations_settings('import','2000-01-01','999000047',3)$$,
 '42501',null,'cross-unit operations settings are denied');
select lives_ok($$select public.admin_update_operations_settings('parfums',
 (select updated_at from public.settings where business_unit_id='11111111-1111-4111-8111-111111111111'
 and key='operations_automation'),'999000047',3)$$,'unit admin configures factual operations recipient');
reset role;
select is((select count(*)::integer from public.notification_outbox where entity_id in
 ('47000000-0000-4000-8000-000000000041','47000000-0000-4000-8000-000000000042')
 and event_type in ('complaint_approaching','complaint_overdue') and recipient='51999000047' and status='queued'),2,
 'recipient configuration recovers blocked internal reminders');
select lives_ok($$select public.admin_update_complaint_status('47000000-0000-4000-8000-000000000041',
 (select updated_at from public.complaint_book_entries where id='47000000-0000-4000-8000-000000000041'),
 'resolved','Human approved response recorded')$$,'human resolves the complaint');
select is((select status from public.notification_outbox where entity_id='47000000-0000-4000-8000-000000000041'
 and event_type='complaint_overdue'),'cancelled','resolved complaint cancels an unsent deadline alert');
select ok(not (select template_data ? 'admin_notes' from public.notification_outbox
 where entity_id='47000000-0000-4000-8000-000000000041' and event_type='complaint_resolved'),
 'automation does not send the legal substance of the response');
select * from finish();
rollback;
