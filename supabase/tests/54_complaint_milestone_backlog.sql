begin;
create extension if not exists pgtap with schema extensions;
select plan(5);
insert into public.complaint_book_entries(id,business_unit_id,request_id,complaint_type,full_name,
 document_type,document_number,address,phone,email,detail,consumer_request,created_at)
select ('54000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'11111111-1111-4111-8111-111111111111',
 ('54000001-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'reclamo','Backlog fixture','dni','12345678',
 'Synthetic address','999000054','backlog@example.test','Synthetic complaint detail','Synthetic remedy',
 now()-interval '360 days'+n*interval '1 hour' from generate_series(1,201)n;
select public.worker_enqueue_complaint_milestones();
select is((select count(*)::integer from public.notification_outbox where event_type='complaint_overdue'
 and entity_id::text like '54000000-0000-4000-8000-%'),200,'the first batch respects the bound');
select public.worker_enqueue_complaint_milestones();
select is((select count(*)::integer from public.notification_outbox where event_type='complaint_overdue'
 and entity_id::text like '54000000-0000-4000-8000-%'),201,'already-enqueued open complaints cannot starve the next batch');
select ok(exists(select 1 from public.notification_outbox where event_type='complaint_overdue'
 and entity_id='54000000-0000-4000-8000-000000000201'),'the tail complaint gets its milestone');
select public.worker_enqueue_complaint_milestones();
select is((select count(*)::integer from public.notification_outbox where event_type='complaint_overdue'
 and entity_id::text like '54000000-0000-4000-8000-%'),201,'repeat batches do not duplicate events');
select is((select count(*)::integer from public.complaint_book_entries where id::text like '54000000-0000-4000-8000-%'
 and status<>'resolved'),201,'progress does not require prematurely resolving earlier complaints');
select * from finish();
rollback;
