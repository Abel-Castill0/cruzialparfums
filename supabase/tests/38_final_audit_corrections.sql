-- Final correction gate: no silent complaint text loss and one-call campaign
-- save feedback. Each test runs inside this rolled-back transaction.
begin;
select plan(12);

set local role service_role;

select lives_ok(
  $$select public.public_submit_complaint_entry(
    'parfums','38380000-0000-4000-8000-000000000001','reclamo',
    'Ana Test','dni','12345678','Av. Lima 123','987654321','ana@example.test',
    false,null,null,null,repeat('D',4000),'Solicito una respuesta')$$,
  'A1: a 4000-character detail is accepted'
);
select is(
  (select detail from public.complaint_book_entries where request_id='38380000-0000-4000-8000-000000000001'),
  repeat('D',4000),
  'A2: the full accepted detail is persisted'
);

select throws_ok(
  $$select public.public_submit_complaint_entry(
    'parfums','38380000-0000-4000-8000-000000000002','reclamo',
    'Ana Test','dni','12345678','Av. Lima 123','987654321','ana@example.test',
    false,null,null,null,repeat('D',4001),'Solicito una respuesta')$$,
  '22023','detail exceeds 4000 characters',
  'A3: a 4001-character detail is rejected'
);
select is(
  (select count(*)::integer from public.complaint_book_entries where request_id='38380000-0000-4000-8000-000000000002'),
  0, 'A4: rejected overlong detail creates no complaint row'
);

select lives_ok(
  $$select public.public_submit_complaint_entry(
    'import','38380000-0000-4000-8000-000000000003','queja',
    'Ana Test','dni','12345678','Av. Lima 123','987654321','ana@example.test',
    false,null,null,null,'Detalle suficiente',repeat('R',2000))$$,
  'B1: a 2000-character requested remedy is accepted'
);
select is(
  (select consumer_request from public.complaint_book_entries where request_id='38380000-0000-4000-8000-000000000003'),
  repeat('R',2000),
  'B2: the full accepted requested remedy is persisted'
);

select throws_ok(
  $$select public.public_submit_complaint_entry(
    'import','38380000-0000-4000-8000-000000000004','queja',
    'Ana Test','dni','12345678','Av. Lima 123','987654321','ana@example.test',
    false,null,null,null,'Detalle suficiente',repeat('R',2001))$$,
  '22023','consumer_request exceeds 2000 characters',
  'B3: a 2001-character requested remedy is rejected'
);
select is(
  (select count(*)::integer from public.complaint_book_entries where request_id='38380000-0000-4000-8000-000000000004'),
  0, 'B4: rejected overlong remedy creates no complaint row'
);

reset role;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) values
 ('38380000-0000-4000-8000-000000000010','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','bulk-save-38@test','',now(),now());
insert into public.admin_memberships(user_id,business_unit_id,role) values
 ('38380000-0000-4000-8000-000000000010',(select id from public.business_units where code='import'),'admin');
insert into public.campaigns(id,business_unit_id,number,name,status,updated_at) values
 ('38380000-0000-4000-8000-000000000011',(select id from public.business_units where code='import'),9838,
  'Bulk save 38','draft',now()-interval '1 hour');

select ok(
  to_regprocedure('public.admin_set_campaign_products(uuid,timestamptz,jsonb)') is not null,
  'C1: the old campaign-save RPC remains available for DB-first rollout and rollback'
);

select set_config('request.jwt.claims', '{"aal":"aal2","sub":"38380000-0000-4000-8000-000000000010","role":"authenticated"}', true);
set role authenticated;

select ok(
  (select campaign_updated_at is not null and item_count=0
   from public.admin_set_campaign_products_with_version(
     '38380000-0000-4000-8000-000000000011',
     (select updated_at from public.campaigns where id='38380000-0000-4000-8000-000000000011'),
     '[]'::jsonb)),
  'C2: one atomic write call returns the new campaign version and item count'
);
select ok(
  (select updated_at > now()-interval '1 hour' from public.campaigns where id='38380000-0000-4000-8000-000000000011'),
  'C3: the campaign version was updated by the wrapped audited write'
);
select throws_ok(
  $$select * from public.admin_set_campaign_products_with_version(
    '38380000-0000-4000-8000-000000000011','2000-01-01T00:00:00Z','[]'::jsonb)$$,
  'P2011',null,
  'C4: a stale campaign version still fails with a conflict'
);

select * from finish();
rollback;
