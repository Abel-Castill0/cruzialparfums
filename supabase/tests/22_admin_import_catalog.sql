-- Cruzial Platform V2 — 4J4C Import catalog/read/write security.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) values
 ('4c4c0000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','import-admin-4j4c@example.test','',now(),now()),
 ('4c4c0000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','import-viewer-4j4c@example.test','',now(),now()),
 ('4c4c0000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','parfums-admin-4j4c@example.test','',now(),now());
insert into public.admin_memberships(user_id,business_unit_id,role) values
 ('4c4c0000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','admin'),
 ('4c4c0000-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222','viewer'),
 ('4c4c0000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','admin');
insert into public.categories(id,business_unit_id,kind,slug,name) values
 ('4c4c1000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','import_category','import-test','Import Test');
insert into public.products(id,business_unit_id,legacy_id,slug,name,brand,sales_mode,publication_status,verification_status) values
 ('4c4c2000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','source-immutable','import-immutable','Original','Marca','campaign','draft','official_pdf'),
 ('4c4c2000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','parfums-safe','parfums-safe','Parfums Safe','Marca','always_available','draft','legacy');
insert into public.product_categories(product_id,category_id) values('4c4c2000-0000-4000-8000-000000000001','4c4c1000-0000-4000-8000-000000000001');

set local role authenticated;
set local request.jwt.claims='{"sub":"4c4c0000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok($$select * from public.admin_list_import_products(null,null,null,'active',null,null,1,500)$$,'Import admin can list catalog; server caps page size');
select lives_ok($$select * from public.admin_get_import_catalog_qa()$$,'Import admin can read bounded QA counters');
select lives_ok($$select public.admin_update_import_product('4c4c2000-0000-4000-8000-000000000001',(select updated_at from public.products where id='4c4c2000-0000-4000-8000-000000000001'),'Display edit','Nueva marca','4c4c1000-0000-4000-8000-000000000001','hidden')$$,'Import admin updates safe display/category/publication fields');
reset role;
select is((select name from public.products where id='4c4c2000-0000-4000-8000-000000000001'),'Display edit','product display name changed');
select is((select slug from public.products where id='4c4c2000-0000-4000-8000-000000000001'),'import-immutable','loader slug stays immutable');
select is((select legacy_id from public.products where id='4c4c2000-0000-4000-8000-000000000001'),'source-immutable','loader source identity stays immutable');
select is((select actor_user_id from public.audit_log where entity_type='import_product' order by created_at desc limit 1),'4c4c0000-0000-4000-8000-000000000001'::uuid,'audit actor comes from auth.uid()');

set local role authenticated;
set local request.jwt.claims='{"sub":"4c4c0000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok($$select public.admin_update_import_product('4c4c2000-0000-4000-8000-000000000001','2000-01-01','Stale',null,'4c4c1000-0000-4000-8000-000000000001','draft')$$,'P2011',null,'stale product update fails closed');
select throws_ok($$select public.admin_update_import_product('4c4c2000-0000-4000-8000-000000000001',(select updated_at from public.products where id='4c4c2000-0000-4000-8000-000000000001'),'Bad',null,'4c4c1000-0000-4000-8000-000000000001','open')$$,'22023',null,'invalid publication status fails closed');
select lives_ok($$select public.admin_create_import_presentation('4c4c2000-0000-4000-8000-000000000001','55 ml','multi_presentation',55)$$,'Import admin creates a structural presentation');
reset role;
select is((select publication_status from public.import_presentations where product_id='4c4c2000-0000-4000-8000-000000000001'),'draft','manual presentation defaults to draft');
select matches((select stable_key from public.import_presentations where product_id='4c4c2000-0000-4000-8000-000000000001'),'^manual-[0-9a-f]{24}$','stable key is server-derived');
select is((select source_metadata->>'entry' from public.import_presentations where product_id='4c4c2000-0000-4000-8000-000000000001'),'admin_manual','manual provenance is explicit and read-only');
select hasnt_column('public','import_presentations','price_amount','presentation has no price field');
select hasnt_column('public','import_presentations','availability_status','presentation has no availability field');
select hasnt_column('public','import_presentations','quantity_limit','presentation has no quantity limit field');

insert into public.campaigns(id,business_unit_id,number,name,status) values('4c4c3000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222',6,'Sexto','draft');
insert into public.campaign_products(campaign_id,product_id,import_presentation_id,price_amount,availability_status)
select '4c4c3000-0000-4000-8000-000000000001','4c4c2000-0000-4000-8000-000000000001',id,25,'unconfirmed' from public.import_presentations where product_id='4c4c2000-0000-4000-8000-000000000001';
set local role authenticated;
set local request.jwt.claims='{"sub":"4c4c0000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok($$select public.admin_update_import_presentation((select id from public.import_presentations where product_id='4c4c2000-0000-4000-8000-000000000001'),(select updated_at from public.import_presentations where product_id='4c4c2000-0000-4000-8000-000000000001'),'55 ml edit','single_fixed',55,'published')$$,'presentation safe fields update');
select lives_ok($$select public.admin_archive_import_presentation((select id from public.import_presentations where product_id='4c4c2000-0000-4000-8000-000000000001'),(select updated_at from public.import_presentations where product_id='4c4c2000-0000-4000-8000-000000000001'))$$,'historically referenced presentation archives without destructive deletion');
reset role;
select is((select count(*)::integer from public.campaign_products where campaign_id='4c4c3000-0000-4000-8000-000000000001'),1,'historical offer remains after presentation archive');
select is((select publication_status from public.import_presentations where product_id='4c4c2000-0000-4000-8000-000000000001'),'archived','presentation archive lifecycle is explicit');

set local role authenticated;
set local request.jwt.claims='{"sub":"4c4c0000-0000-4000-8000-000000000002","role":"authenticated"}';
select lives_ok($$select * from public.admin_list_import_products()$$,'Import viewer can read catalog');
select throws_ok($$select public.admin_archive_import_product('4c4c2000-0000-4000-8000-000000000001',(select updated_at from public.products where id='4c4c2000-0000-4000-8000-000000000001'))$$,'42501',null,'Import viewer cannot mutate');
reset role;
set local role authenticated;
set local request.jwt.claims='{"sub":"4c4c0000-0000-4000-8000-000000000003","role":"authenticated"}';
select throws_ok($$select * from public.admin_get_import_catalog_qa()$$,'42501',null,'Parfums-only admin cannot read Import QA');
select throws_ok($$select public.admin_create_import_presentation('4c4c2000-0000-4000-8000-000000000001','Bad','single_fixed',null)$$,'42501',null,'Parfums-only admin cannot mutate Import');
reset role;
set local role anon;set local request.jwt.claims='{"role":"anon"}';
select throws_ok($$select * from public.admin_list_import_products()$$,'42501',null,'anon cannot execute catalog read RPC');
reset role;
set local role authenticated;set local request.jwt.claims='{"sub":"4c4c0000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok($$update public.import_presentations set label=label$$,'42501',null,'direct authenticated presentation writes remain revoked');
reset role;
select is((select name from public.products where id='4c4c2000-0000-4000-8000-000000000002'),'Parfums Safe','Parfums row remains unchanged');
select * from finish();
rollback;
