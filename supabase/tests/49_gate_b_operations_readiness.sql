begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) values
 ('49000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','gate-b-operations@example.test','',now(),now());
insert into public.admin_memberships(user_id,business_unit_id,role) values
 ('49000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','admin');
insert into public.customers(id,business_unit_id,full_name,phone) values
 ('49000000-0000-4000-8000-000000000010','22222222-2222-4222-8222-222222222222','Other unit fixture','999000049');
select ok(not has_function_privilege('anon','public.admin_operations_summary(text)','EXECUTE'),'anonymous cannot read operations');
select ok(not has_function_privilege('authenticated','public.worker_automation_health()','EXECUTE'),'service health inaccessible to authenticated');
select ok(not has_function_privilege('authenticated','app.unit_launch_readiness(uuid)','EXECUTE'),'internal readiness is not a direct admin bypass');
select is(public.public_launch_ready(),false,'blank factual/legal truth keeps public launch blocked');
select is((public.worker_automation_health()->>'schema_compatible')::boolean,true,'Gate B schema compatibility probe succeeds');
select set_config('request.jwt.claims','{"sub":"49000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select lives_ok($$select public.admin_operations_summary('parfums')$$,'own unit operational facts readable');
select throws_ok($$select public.admin_operations_summary('import')$$,'42501',null,'other business metrics denied');
select throws_ok($$select public.admin_customer_order_summary('49000000-0000-4000-8000-000000000010')$$,'42501',null,'other customer aggregate denied');
select ok(public.admin_operations_summary('parfums')->'launch'->'blockers' ? 'legal.ruc','launch explains missing RUC without returning legal values');
reset role;
select set_config('request.jwt.claims','{"sub":"49000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select throws_ok($$select public.admin_operations_summary('parfums')$$,'42501',null,'AAL1 cannot read operational facts');
reset role;
select * from finish();
rollback;
