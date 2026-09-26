begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at)
values ('45000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','gate-b-notification-admin@example.test','',now(),now());
insert into public.admin_memberships(user_id,business_unit_id,role)
values ('45000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','admin');
insert into public.orders(id,business_unit_id,order_number,status,customer_snapshot)
values ('45000000-0000-4000-8000-000000000041','11111111-1111-4111-8111-111111111111',
 'GATE-B-NOTIFICATION','pending_whatsapp_confirmation','{"phone":"999000045"}');
select is((select count(*)::integer from public.notification_outbox where entity_id='45000000-0000-4000-8000-000000000041'),1,
 'order event and notification persist in the same transaction');
select is((select recipient from public.notification_outbox where entity_id='45000000-0000-4000-8000-000000000041'),'51999000045',
 'recipient is canonical');
select app.enqueue_notification('11111111-1111-4111-8111-111111111111','order_received','order',
 '45000000-0000-4000-8000-000000000041','999000045','GATE-B-NOTIFICATION');
select is((select count(*)::integer from public.notification_outbox where entity_id='45000000-0000-4000-8000-000000000041'),1,
 'event idempotency key prevents duplicate jobs');
select ok(not has_table_privilege('authenticated','public.notification_outbox','SELECT'),
 'admin cannot read raw recipients, payload or provider identifiers');
select ok(not has_function_privilege('authenticated','public.worker_claim_notifications(integer)','EXECUTE'),
 'authenticated cannot invoke the worker');
select ok(not has_function_privilege('anon','public.worker_record_delivery(text,text,timestamptz)','EXECUTE'),
 'public callers cannot forge delivery status');

set local role service_role;
select is((select count(*)::integer from public.worker_claim_notifications(5)),1,'worker claims the queued job');
select throws_ok($$select public.worker_begin_notification(
 (select id from public.notification_outbox where entity_id='45000000-0000-4000-8000-000000000041'),
 '00000000-0000-4000-8000-000000000000')$$,'P2036',null,'wrong lease cannot send');
select lives_ok($$select public.worker_begin_notification(
 (select id from public.notification_outbox where entity_id='45000000-0000-4000-8000-000000000041'),
 (select lease_token from public.notification_outbox where entity_id='45000000-0000-4000-8000-000000000041'))$$,
 'valid lease records the send intent');
select lives_ok($$select public.worker_record_delivery('fake-provider-45','delivered',now())$$,
 'verified server path can record a delivery before send completion');
select lives_ok($$select public.worker_finish_notification(
 (select id from public.notification_outbox where entity_id='45000000-0000-4000-8000-000000000041'),
 (select lease_token from public.notification_outbox where entity_id='45000000-0000-4000-8000-000000000041'),
 'sent',null,'fake-provider-45')$$,'worker records provider acceptance');
reset role;
select is((select status from public.notification_outbox where entity_id='45000000-0000-4000-8000-000000000041'),
 'sent','accepted message is sent');
select is((select attempts from public.notification_outbox where entity_id='45000000-0000-4000-8000-000000000041'),1,
 'one provider attempt is recorded');
select is((select delivery_status from public.notification_outbox where entity_id='45000000-0000-4000-8000-000000000041'),
 'delivered','early delivery webhook is reconciled');
select is((select count(*)::integer from public.worker_claim_notifications(5)),0,'sent job cannot be claimed again');

insert into public.notification_outbox(business_unit_id,event_type,entity_type,entity_id,recipient,template_key,
 idempotency_key,status,lease_token,lease_expires_at,attempts)
values ('11111111-1111-4111-8111-111111111111','order_confirmed','order','45000000-0000-4000-8000-000000000041',
 '51999000045','order_confirmed','gate-b-45-expired','sending',gen_random_uuid(),now()-interval '1 minute',1);
select is((select count(*)::integer from public.worker_claim_notifications(5)),0,
 'expired send intent is not automatically retried');
select is((select status from public.notification_outbox where idempotency_key='gate-b-45-expired'),'uncertain',
 'expired send is explicitly uncertain');

set local role authenticated;
set local request.jwt.claims='{"aal":"aal2","sub":"45000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok($$select * from public.admin_list_notifications('parfums',null)$$,'unit admin reads safe notification summary');
select throws_ok($$select * from public.admin_list_notifications('import',null)$$,'42501',null,'cross-unit summary is denied');
reset role;
select throws_ok($$select public.admin_retry_notification('parfums',
 (select id from public.notification_outbox where idempotency_key='gate-b-45-expired'),
 (select updated_at from public.notification_outbox where idempotency_key='gate-b-45-expired'),false)$$,
 '22023',null,'uncertain delivery requires explicit verified-not-sent confirmation');
select lives_ok($$select public.admin_retry_notification('parfums',
 (select id from public.notification_outbox where idempotency_key='gate-b-45-expired'),
 (select updated_at from public.notification_outbox where idempotency_key='gate-b-45-expired'),true)$$,
 'admin can retry after reconciliation');
select is((select count(*)::integer from public.audit_log where entity_type='notification_retry'),1,
 'manual retry is audited without recipient or message body');
select * from finish();
rollback;
