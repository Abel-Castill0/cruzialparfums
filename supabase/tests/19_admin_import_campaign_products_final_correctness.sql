-- Cruzial Platform V2 — 4J2 final correctness: exact money read + public RLS

begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('88900000-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'import-admin-4j2f@example.test', '', now(), now()),
  ('88900000-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'import-viewer-4j2f@example.test', '', now(), now()),
  ('88900000-cccc-4ccc-8ccc-cccccccccccc', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'parfums-admin-4j2f@example.test', '', now(), now());

insert into public.admin_memberships (user_id, business_unit_id, role) values
  ('88900000-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'admin'),
  ('88900000-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'viewer'),
  ('88900000-cccc-4ccc-8ccc-cccccccccccc', '11111111-1111-4111-8111-111111111111', 'admin');

insert into public.products (id, business_unit_id, slug, name, publication_status) values
  ('88901000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'final-published', 'Final Published', 'published'),
  ('88901000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'final-hidden', 'Final Hidden', 'hidden');

insert into public.product_variants (id, product_id, variant_kind, label, price_amount, publication_status, sort_order) values
  ('88902000-0000-4000-8000-000000000001', '88901000-0000-4000-8000-000000000001', 'bottle', '0.01', 0.01, 'published', 0),
  ('88902000-0000-4000-8000-000000000002', '88901000-0000-4000-8000-000000000001', 'bottle', '16.00', 16.00, 'published', 1),
  ('88902000-0000-4000-8000-000000000003', '88901000-0000-4000-8000-000000000001', 'bottle', '16.50', 16.50, 'published', 2),
  ('88902000-0000-4000-8000-000000000004', '88901000-0000-4000-8000-000000000001', 'bottle', '129.90', 129.90, 'published', 3),
  ('88902000-0000-4000-8000-000000000005', '88901000-0000-4000-8000-000000000001', 'bottle', '9999999999.99', 9999999999.99, 'published', 4);

insert into public.campaigns (id, business_unit_id, number, name, status) values
  ('88903000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 899, 'Final Correctness', 'open');

insert into public.campaign_products (
  id, campaign_id, product_id, product_variant_id, price_amount, availability_status, sort_order
) values
  ('88904000-0000-4000-8000-000000000001', '88903000-0000-4000-8000-000000000001', '88901000-0000-4000-8000-000000000001', '88902000-0000-4000-8000-000000000001', 0.01, 'available', 0),
  ('88904000-0000-4000-8000-000000000002', '88903000-0000-4000-8000-000000000001', '88901000-0000-4000-8000-000000000001', '88902000-0000-4000-8000-000000000002', 16.00, 'available', 1),
  ('88904000-0000-4000-8000-000000000003', '88903000-0000-4000-8000-000000000001', '88901000-0000-4000-8000-000000000001', '88902000-0000-4000-8000-000000000003', 16.50, 'available', 2),
  ('88904000-0000-4000-8000-000000000004', '88903000-0000-4000-8000-000000000001', '88901000-0000-4000-8000-000000000001', '88902000-0000-4000-8000-000000000004', 129.90, 'out_of_stock', 3),
  ('88904000-0000-4000-8000-000000000005', '88903000-0000-4000-8000-000000000001', '88901000-0000-4000-8000-000000000001', '88902000-0000-4000-8000-000000000005', 9999999999.99, 'available', 4),
  ('88904000-0000-4000-8000-000000000006', '88903000-0000-4000-8000-000000000001', '88901000-0000-4000-8000-000000000002', null, 50.00, 'available', 5);

set local role authenticated;
set local request.jwt.claims to '{"sub":"88900000-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
select is(
  (select array_agg(price_amount order by sort_order) from public.admin_get_import_campaign_products('88903000-0000-4000-8000-000000000001') where sort_order < 5),
  array['0.01','16.00','16.50','129.90','9999999999.99']::text[],
  'DB numeric is returned as canonical exact decimal text, including trailing zeroes'
);
select is(
  (select price_amount from public.admin_get_import_campaign_products('88903000-0000-4000-8000-000000000001') where sort_order = 3),
  '129.90', 'reload/read keeps 129.90 exactly'
);
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"88900000-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}';
select is(
  (select count(*)::integer from public.admin_get_import_campaign_products('88903000-0000-4000-8000-000000000001')),
  6, 'Import viewer can use the read-only exact-decimal RPC'
);
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"88900000-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}';
select is(
  (select count(*)::integer from public.admin_get_import_campaign_products('88903000-0000-4000-8000-000000000001')),
  0, 'Parfums-only admin cannot read Import offers through the RPC'
);
reset role;

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select throws_ok(
  $$select public.admin_get_import_campaign_products('88903000-0000-4000-8000-000000000001')$$,
  '42501', null, 'anonymous cannot execute the admin read RPC'
);
select is(
  (select count(*)::integer from public.campaign_products where id = '88904000-0000-4000-8000-000000000006'),
  0, 'open + hidden product + archived_at null is invisible to anon'
);
select is(
  (select count(*)::integer from public.campaign_products where id = '88904000-0000-4000-8000-000000000004'),
  1, 'open + published + out_of_stock remains visible to anon'
);
select is(
  (select availability_status from public.campaign_products where id = '88904000-0000-4000-8000-000000000004'),
  'out_of_stock', 'availability remains independent from public visibility'
);
reset role;

select * from finish();
rollback;
