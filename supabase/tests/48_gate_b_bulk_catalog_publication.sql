begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) values
 ('48000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','gate-b-bulk@example.test','',now(),now());
insert into public.admin_memberships(user_id,business_unit_id,role) values
 ('48000000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','admin');
insert into public.products(id,business_unit_id,name,slug,publication_status) values
 ('48000000-0000-4000-8000-000000000010','22222222-2222-4222-8222-222222222222','Bulk fixture','bulk-fixture','draft'),
 ('48000000-0000-4000-8000-000000000011','11111111-1111-4111-8111-111111111111','Other unit','bulk-other-unit','draft');
insert into public.import_presentations(id,product_id,stable_key,label,presentation_class) values
 ('48000000-0000-4000-8000-000000000020','48000000-0000-4000-8000-000000000010','gate-b-bulk','Single','single_fixed');
insert into public.campaigns(id,business_unit_id,number,name,status) values
 ('48000000-0000-4000-8000-000000000030','22222222-2222-4222-8222-222222222222',480,'Bulk test','draft');
insert into public.campaign_products(id,campaign_id,product_id,import_presentation_id,price_amount,availability_status) values
 ('48000000-0000-4000-8000-000000000040','48000000-0000-4000-8000-000000000030','48000000-0000-4000-8000-000000000010','48000000-0000-4000-8000-000000000020',100,'unconfirmed');
create temporary table fixture_preview(payload jsonb);
select set_config('request.jwt.claims','{"sub":"48000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select ok(not has_function_privilege('anon','public.admin_bulk_import_catalog(jsonb)','EXECUTE'),'anonymous cannot bulk mutate');
select throws_ok($$select public.admin_bulk_import_catalog('[]')$$,'22023',null,'empty batch denied');
select throws_ok($$select public.admin_bulk_import_catalog('[{"kind":"product","id":"48000000-0000-4000-8000-000000000011"}]')$$,'P0002',null,'cross unit identity denied');
select throws_ok($$select public.admin_bulk_import_catalog('[{"kind":"product","id":"48000000-0000-4000-8000-000000000010"},{"kind":"product","id":"48000000-0000-4000-8000-000000000010"}]')$$,'22023',null,'duplicate identity denied');
select throws_ok($$select public.admin_bulk_import_catalog(jsonb_build_array(
 jsonb_build_object('kind','product','id','48000000-0000-4000-8000-000000000010','updated_at',(select updated_at from public.products where id='48000000-0000-4000-8000-000000000010'),'name','Atomic edit','brand','Client'),
 jsonb_build_object('kind','presentation','id','48000000-0000-4000-8000-000000000020','updated_at',(select updated_at from public.import_presentations where id='48000000-0000-4000-8000-000000000020'),'label','Bad','presentation_class','invented')))
 $$,'22023',null,'invalid mapping rolls back whole batch');
select is((select name from public.products where id='48000000-0000-4000-8000-000000000010'),'Bulk fixture','no partial mutation');
select is(public.admin_bulk_import_catalog(jsonb_build_array(jsonb_build_object('kind','product','id','48000000-0000-4000-8000-000000000010','updated_at',(select updated_at from public.products where id='48000000-0000-4000-8000-000000000010'),'name','Confirmed name','brand','Client','category_id',''))),1,'categoryless factual update succeeds');
select is((select publication_status from public.products where id='48000000-0000-4000-8000-000000000010'),'draft','bulk catalog does not publish');
select is(jsonb_array_length(public.admin_import_publish_candidates('48000000-0000-4000-8000-000000000030')),0,'unconfirmed and missing media are ineligible');
reset role;
update public.campaign_products set availability_status='available' where id='48000000-0000-4000-8000-000000000040';
insert into public.product_media(product_id,provider,public_id,secure_url,is_primary) values
 ('48000000-0000-4000-8000-000000000010','cloudinary','gate-b/bulk-fixture','https://res.cloudinary.com/fixture/image/upload/gate-b/bulk-fixture.png',true);
insert into fixture_preview select public.admin_import_publish_candidates('48000000-0000-4000-8000-000000000030');
grant select on fixture_preview to authenticated;
set local role authenticated;
select is(jsonb_array_length((select payload from fixture_preview)),1,'eligible preview uses media and confirmed offer');
select throws_ok($$select public.admin_bulk_publish_import('48000000-0000-4000-8000-000000000030',now()-interval '1 day',(select payload from fixture_preview))$$,'P2011',null,'stale campaign rejected');
select lives_ok($$select public.admin_bulk_publish_import('48000000-0000-4000-8000-000000000030',(select updated_at from public.campaigns where id='48000000-0000-4000-8000-000000000030'),(select payload from fixture_preview))$$,'explicit eligible bulk publish succeeds');
select is((select publication_status from public.products where id='48000000-0000-4000-8000-000000000010'),'published','product published');
select is((select publication_status from public.import_presentations where id='48000000-0000-4000-8000-000000000020'),'published','presentation published');
select is((select status from public.campaigns where id='48000000-0000-4000-8000-000000000030'),'draft','publication never opens campaign');
select ok(exists(select 1 from public.audit_log where entity_type='bulk_import_publication' and entity_id='48000000-0000-4000-8000-000000000030'),'bulk summary audited');
reset role;
select set_config('request.jwt.claims','{"sub":"48000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select throws_ok($$select public.admin_bulk_import_catalog('[]')$$,'42501',null,'AAL1 blocked before input validation');
reset role;
select * from finish();
rollback;
