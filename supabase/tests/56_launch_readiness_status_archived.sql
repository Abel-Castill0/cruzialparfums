-- Launch readiness must ignore a product archived only by publication_status
-- (the controlled commercial loader's representation, archived_at NULL), the
-- same as one archived by the Admin (both columns). A draft product must still
-- count, so the readiness gate is not weakened.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

create temporary table readiness_before as
select code, app.unit_launch_readiness(id) r from public.business_units where code in ('parfums','import');

set local role service_role;
-- Parfums: archived by status only, with a draft legacy bottle and no photo.
insert into public.products (id, business_unit_id, legacy_id, slug, brand, name,
  description, gender, concentration, production_status, availability_status,
  publication_status, verification_status, specs)
values ('a5600000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  'status-archived-test','status-archived-test','Test','Status Archived','Test','unisex','EDP',
  'active','available','archived','legacy','{"notes":["test"],"tag":"test"}'::jsonb);
insert into public.product_variants (id, product_id, label, variant_kind, size_ml,
  price_amount, currency, publication_status, price_verification_status, sort_order)
values ('b5600000-0000-4000-8000-000000000001','a5600000-0000-4000-8000-000000000001',
  '100 ml','bottle',100,250.00,'PEN','draft','legacy',0);
reset role;

create temporary table readiness_archived as
select code, app.unit_launch_readiness(id) r from public.business_units where code='parfums';

select is(
  (select (r->>'unpublished_products')::int from readiness_archived),
  (select (r->>'unpublished_products')::int from readiness_before where code='parfums'),
  'a status-archived product is not counted as unpublished');
select is(
  (select (r->>'commercial_blockers')::int from readiness_archived),
  (select (r->>'commercial_blockers')::int from readiness_before where code='parfums'),
  'variants of a status-archived product are not commercial blockers');
select is(
  (select (r->>'missing_primary_media')::int from readiness_archived),
  (select (r->>'missing_primary_media')::int from readiness_before where code='parfums'),
  'a status-archived product is not counted as missing its photo');

-- Positive control: the same product as a draft still blocks readiness.
update public.products set publication_status='draft' where id='a5600000-0000-4000-8000-000000000001';
select is(
  (select (app.unit_launch_readiness(id)->>'unpublished_products')::int from public.business_units where code='parfums'),
  (select (r->>'unpublished_products')::int + 1 from readiness_before where code='parfums'),
  'a draft product is still counted as unpublished');
select ok(
  (select app.unit_launch_readiness(id)->'blockers' ? 'catalog.unpublished_products' from public.business_units where code='parfums'),
  'a draft product still blocks launch readiness');

-- Import is unaffected by a Parfums product either way.
select is(
  (select app.unit_launch_readiness(id) from public.business_units where code='import'),
  (select r from readiness_before where code='import'),
  'Import readiness is unchanged');

select * from finish();
rollback;
