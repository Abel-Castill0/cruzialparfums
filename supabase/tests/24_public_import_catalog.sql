-- Cruzial Platform V2, Phase 4J5A public Import catalog and RLS.

begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

insert into public.categories (
  id, business_unit_id, kind, slug, name, publication_status, sort_order
) values
  ('8a500000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'import_category', 'arabic-j5a', 'Arabic J5A', 'published', 1),
  ('8a500000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'import_category', 'designer-j5a', 'Designer J5A', 'published', 2);

insert into public.products (id, business_unit_id, slug, name, brand, publication_status) values
  ('8a510000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'j5a-visible', 'Visible J5A', 'Armaf', 'published'),
  ('8a510000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'j5a-draft', 'Draft J5A', 'Draft Brand', 'draft'),
  ('8a510000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', 'j5a-hidden', 'Hidden J5A', 'Hidden Brand', 'hidden'),
  ('8a510000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'j5a-wrong-unit', 'Wrong Unit J5A', 'Parfums', 'published');

insert into public.product_categories (product_id, category_id) values
  ('8a510000-0000-4000-8000-000000000001', '8a500000-0000-4000-8000-000000000001'),
  ('8a510000-0000-4000-8000-000000000002', '8a500000-0000-4000-8000-000000000001'),
  ('8a510000-0000-4000-8000-000000000003', '8a500000-0000-4000-8000-000000000002');

insert into public.import_presentations (
  id, product_id, stable_key, label, presentation_class, capacity_ml, publication_status
) values
  ('8a520000-0000-4000-8000-000000000001', '8a510000-0000-4000-8000-000000000001', '100', '100 ml', 'multi_presentation', 100, 'published'),
  ('8a520000-0000-4000-8000-000000000002', '8a510000-0000-4000-8000-000000000001', 'pack', 'Pack 3 piezas', 'pack_set', null, 'published'),
  ('8a520000-0000-4000-8000-000000000003', '8a510000-0000-4000-8000-000000000001', 'unconfirmed', '50 ml', 'multi_presentation', 50, 'published'),
  ('8a520000-0000-4000-8000-000000000004', '8a510000-0000-4000-8000-000000000001', 'draft', '75 ml', 'single_fixed', 75, 'draft'),
  ('8a520000-0000-4000-8000-000000000005', '8a510000-0000-4000-8000-000000000001', 'archived', '30 ml', 'ambiguous', 30, 'published'),
  ('8a520000-0000-4000-8000-000000000006', '8a510000-0000-4000-8000-000000000002', 'draft-product', '100 ml', 'single_fixed', 100, 'published'),
  ('8a520000-0000-4000-8000-000000000007', '8a510000-0000-4000-8000-000000000003', 'hidden-product', '100 ml', 'single_fixed', 100, 'published');
update public.import_presentations set archived_at = now()
where id = '8a520000-0000-4000-8000-000000000005';

insert into public.campaigns (id, business_unit_id, number, name, status) values
  ('8a530000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 951, 'J5A Draft', 'draft'),
  ('8a530000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 952, 'J5A Parfums Open', 'open');

insert into public.campaign_products (
  campaign_id, product_id, import_presentation_id, price_amount, availability_status, sort_order
) values
  ('8a530000-0000-4000-8000-000000000001', '8a510000-0000-4000-8000-000000000001', '8a520000-0000-4000-8000-000000000001', 210, 'available', 1),
  ('8a530000-0000-4000-8000-000000000001', '8a510000-0000-4000-8000-000000000001', '8a520000-0000-4000-8000-000000000002', 240, 'out_of_stock', 2),
  ('8a530000-0000-4000-8000-000000000001', '8a510000-0000-4000-8000-000000000001', '8a520000-0000-4000-8000-000000000003', 180, 'unconfirmed', 3),
  ('8a530000-0000-4000-8000-000000000001', '8a510000-0000-4000-8000-000000000001', '8a520000-0000-4000-8000-000000000004', 190, 'available', 4),
  ('8a530000-0000-4000-8000-000000000001', '8a510000-0000-4000-8000-000000000001', '8a520000-0000-4000-8000-000000000005', 160, 'available', 5),
  ('8a530000-0000-4000-8000-000000000001', '8a510000-0000-4000-8000-000000000002', '8a520000-0000-4000-8000-000000000006', 200, 'available', 6),
  ('8a530000-0000-4000-8000-000000000001', '8a510000-0000-4000-8000-000000000003', '8a520000-0000-4000-8000-000000000007', 200, 'available', 7);

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select is((select count(*)::integer from public.public_get_import_current_campaign()), 0, 'draft Import campaign is not current');
select is((select count(*)::integer from public.public_list_import_catalog()), 0, 'zero eligible open campaigns returns an empty catalog');
select is((select count(*)::integer from public.campaigns where id = '8a530000-0000-4000-8000-000000000001'), 0, 'draft campaign is hidden by direct RLS');
reset role;

update public.campaigns
set status = 'open', opens_at = now() + interval '1 day'
where id = '8a530000-0000-4000-8000-000000000001';
set local role anon;
select is((select count(*)::integer from public.public_get_import_current_campaign()), 0, 'open campaign before opens_at is hidden');
reset role;

update public.campaigns
set opens_at = now() - interval '1 day', closes_at = now() - interval '1 minute'
where id = '8a530000-0000-4000-8000-000000000001';
set local role anon;
select is((select count(*)::integer from public.public_get_import_current_campaign()), 0, 'open campaign after closes_at is hidden');
reset role;

update public.campaigns
set closes_at = now() + interval '1 day'
where id = '8a530000-0000-4000-8000-000000000001';

set local role anon;
select is((select count(*)::integer from public.public_get_import_current_campaign()), 1, 'exactly one in-window open Import campaign is selected');
select is((select number from public.public_get_import_current_campaign()), 951, 'selected campaign exposes only its public number');
select is((select count(*)::integer from public.public_list_import_catalog()), 1, 'only the eligible published canonical product is listed');
select is((select jsonb_array_length(presentations) from public.public_list_import_catalog()), 2, 'available and out-of-stock presentations are grouped on one product');
select ok((select presentations @> '[{"availability":"available"}]'::jsonb from public.public_list_import_catalog()), 'available offer is visible');
select ok((select presentations @> '[{"availability":"out_of_stock"}]'::jsonb from public.public_list_import_catalog()), 'out-of-stock offer is visible and labeled structurally');
select ok(not (select presentations @> '[{"availability":"unconfirmed"}]'::jsonb from public.public_list_import_catalog()), 'unconfirmed offer is excluded');
select is((select count(*)::integer from public.public_get_import_product('j5a-draft')), 0, 'draft product is excluded from detail');
select is((select count(*)::integer from public.public_get_import_product('j5a-hidden')), 0, 'hidden product is excluded from detail');
select is((select jsonb_array_length(presentations) from public.public_get_import_product('j5a-visible')), 2, 'draft and archived presentations are excluded from detail');
select is((select count(*)::integer from public.public_get_import_product('j5a-wrong-unit')), 0, 'wrong business unit product is excluded');
select is((select count(*)::integer from public.public_list_import_catalog('ARMAF', null, 1, 24)), 1, 'search is case-insensitive across brand');
select is((select count(*)::integer from public.public_list_import_catalog('missing', null, 1, 24)), 0, 'search remains scoped to matching products');
select is((select count(*)::integer from public.public_list_import_catalog(null, 'arabic-j5a', 1, 24)), 1, 'category filter returns a visible related product');
select is((select count(*)::integer from public.public_list_import_catalog(null, 'designer-j5a', 1, 24)), 0, 'category filter excludes unrelated products');
select is((select count(*)::integer from public.public_list_import_categories()), 1, 'only a category with visible offers is returned');
select is((select product_count from public.public_list_import_categories()), 1::bigint, 'category count is based on distinct visible products');
select ok(has_function_privilege('anon', 'public.public_list_import_catalog(text,text,integer,integer)', 'EXECUTE'), 'anon has explicit catalog RPC execute grant');
select ok(has_function_privilege('anon', 'public.public_get_import_product(text)', 'EXECUTE'), 'anon has explicit detail RPC execute grant');
select ok(not has_function_privilege('anon', 'app.public_import_campaign_id()', 'EXECUTE'), 'anon cannot call the internal selector directly');
select ok(not exists (
  select 1 from information_schema.parameters
  where specific_schema = 'public'
    and specific_name like 'public_list_import_catalog_%'
    and parameter_name in ('source_metadata', 'quantity_limit', 'verification_status', 'publication_status', 'archived_at')
), 'catalog RPC exposes no loader, quantity, verification or admin status fields');
reset role;

with inserted_products as (
  insert into public.products (id, business_unit_id, slug, name, brand, publication_status)
  select gen_random_uuid(), '22222222-2222-4222-8222-222222222222',
    'j5a-page-' || g, 'Page Product ' || lpad(g::text, 2, '0'), 'Page Brand', 'published'
  from generate_series(1, 45) g
  returning id, slug
), inserted_presentations as (
  insert into public.import_presentations (id, product_id, stable_key, label, presentation_class, publication_status)
  select gen_random_uuid(), id, 'single', 'Unidad', 'single_fixed', 'published'
  from inserted_products
  returning id, product_id
)
insert into public.campaign_products (
  campaign_id, product_id, import_presentation_id, price_amount, availability_status, sort_order
)
select '8a530000-0000-4000-8000-000000000001', product_id, id, 100, 'available', 100
from inserted_presentations;

set local role anon;
select is((select count(*)::integer from public.public_list_import_catalog(null, null, 1, 500)), 40, 'catalog RPC clamps requested page size to 40');
select is((select count(*)::integer from public.public_list_import_catalog(null, null, 2, 24)), 22, 'pagination is DB-side and bounded by canonical product');
reset role;

insert into public.campaigns (id, business_unit_id, number, name, status) values
  ('8a530000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 953, 'J5A Second Open', 'open');
set local role anon;
select is((select count(*)::integer from public.public_get_import_current_campaign()), 0, 'multiple eligible open Import campaigns fail closed');
select is((select count(*)::integer from public.public_list_import_catalog()), 0, 'catalog fails closed when multiple campaigns are eligible');
select is((select count(*)::integer from public.campaigns where business_unit_id = '22222222-2222-4222-8222-222222222222'), 0, 'direct campaign RLS also fails closed for multiple eligible rows');
reset role;

select * from finish();
rollback;
