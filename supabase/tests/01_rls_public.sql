-- Cruzial Platform V2 — RLS: the anonymous storefront surface
--
-- What a visitor with the publishable key may and may not reach. Every
-- assertion here is a security boundary, not a UI preference.

begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

-- ---------------------------------------------------------------------------
-- Fixtures (created as the migration owner, rolled back at the end)
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'parfums-admin@example.test', '', now(), now());

insert into public.admin_memberships (user_id, business_unit_id, role)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'admin');

insert into public.products (id, business_unit_id, slug, name, publication_status)
values
  ('11111111-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
   'published-parfum', 'Published Parfum', 'published'),
  ('11111111-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
   'draft-parfum', 'Draft Parfum', 'draft'),
  ('11111111-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111',
   'hidden-parfum', 'Hidden Parfum', 'hidden');

insert into public.categories (id, business_unit_id, kind, slug, name, publication_status)
values
  ('11111111-0000-4000-8000-000000000031', '11111111-1111-4111-8111-111111111111',
   'commercial_type', 'published-category', 'Published Category', 'published'),
  ('11111111-0000-4000-8000-000000000032', '11111111-1111-4111-8111-111111111111',
   'commercial_type', 'draft-category', 'Draft Category', 'draft');

insert into public.product_categories (product_id, category_id)
values ('11111111-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000032');

insert into public.product_variants (id, product_id, variant_kind, size_ml, label, price_amount, publication_status)
values
  ('11111111-0000-4000-8000-00000000000a', '11111111-0000-4000-8000-000000000001',
   'decant', 3, '3 ml', 12.00, 'published'),
  ('11111111-0000-4000-8000-00000000000b', '11111111-0000-4000-8000-000000000002',
   'decant', 3, '3 ml', 12.00, 'published'),
  ('11111111-0000-4000-8000-00000000000c', '11111111-0000-4000-8000-000000000001',
   'decant', 5, '5 ml draft', 16.00, 'draft');

insert into public.product_media (id, product_id, product_variant_id, secure_url)
values ('11111111-0000-4000-8000-000000000041',
        '11111111-0000-4000-8000-000000000001',
        '11111111-0000-4000-8000-00000000000c',
        '/draft-variant.webp');

insert into public.combos (id, product_id)
values ('11111111-0000-4000-8000-000000000051',
        '11111111-0000-4000-8000-000000000001');

insert into public.wholesale_policies (id, business_unit_id, name, scope)
values ('11111111-0000-4000-8000-000000000061',
        '11111111-1111-4111-8111-111111111111',
        'Unconfirmed threshold', 'unconfirmed');

insert into public.campaigns (id, business_unit_id, number, name, status)
values ('11111111-0000-4000-8000-000000000071',
        '11111111-1111-4111-8111-111111111111', 1, 'Public campaign', 'scheduled');

insert into public.campaign_products (id, campaign_id, product_id, price_amount)
values ('11111111-0000-4000-8000-000000000072',
        '11111111-0000-4000-8000-000000000071',
        '11111111-0000-4000-8000-000000000002', 100.00);

insert into public.customers (id, business_unit_id, full_name, phone)
values ('11111111-0000-4000-8000-0000000000c1', '11111111-1111-4111-8111-111111111111',
        'Cliente Prueba', '999999999');

insert into public.orders (id, business_unit_id, order_number)
values ('11111111-0000-4000-8000-0000000000d1', '11111111-1111-4111-8111-111111111111', 'TEST-0001');

insert into public.audit_log (business_unit_id, actor_user_id, action, entity_type, entity_id)
values ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'create', 'product', '11111111-0000-4000-8000-000000000001');

-- ---------------------------------------------------------------------------
-- Become anonymous
-- ---------------------------------------------------------------------------

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

-- Published storefront data is visible …
select is(
  (select count(*)::int from public.products where slug = 'published-parfum'),
  1,
  'anon reads a published product'
);

select is(
  (select count(*)::int from public.product_variants
    where id = '11111111-0000-4000-8000-00000000000a'),
  1,
  'anon reads a published variant of a published product'
);

select is(
  (select count(*)::int from public.business_units),
  2,
  'anon reads the active business units the gateway needs'
);

select is(
  (select count(*)::int from public.deposit_policies where deposit_percentage in (50.00, 70.00)),
  2,
  'anon reads the public Import deposit terms (50% / 70%)'
);

select is(
  (select count(*)::int from public.shipping_methods where code = 'olva'),
  0,
  'no Olva shipping method exists in any unit'
);

-- … unpublished data is not.
select is(
  (select count(*)::int from public.products where slug = 'draft-parfum'),
  0,
  'anon cannot read a draft product'
);

select is(
  (select count(*)::int from public.products where slug = 'hidden-parfum'),
  0,
  'anon cannot read a hidden product'
);

select is(
  (select count(*)::int from public.product_variants
    where id = '11111111-0000-4000-8000-00000000000b'),
  0,
  'anon cannot read a variant whose product is unpublished'
);

select is(
  (select count(*)::int from public.product_categories
    where category_id = '11111111-0000-4000-8000-000000000032'),
  0,
  'anon cannot read a relation to a draft category'
);

select is(
  (select count(*)::int from public.product_media
    where id = '11111111-0000-4000-8000-000000000041'),
  0,
  'anon cannot read media attached to a draft variant'
);

select is(
  (select count(*)::int from public.combos
    where id = '11111111-0000-4000-8000-000000000051'),
  0,
  'anon cannot read an unconfirmed combo composition'
);

select is(
  (select count(*)::int from public.wholesale_policies
    where id = '11111111-0000-4000-8000-000000000061'),
  0,
  'anon cannot read an unconfirmed wholesale scope'
);

select is(
  (select count(*)::int from public.campaign_products
    where id = '11111111-0000-4000-8000-000000000072'),
  0,
  'anon cannot read a campaign offer for a draft product'
);

-- Private tables are unreachable, not merely filtered.
select throws_ok(
  'select * from public.customers',
  '42501',
  null,
  'anon is denied on customers'
);

select throws_ok(
  'select * from public.orders',
  '42501',
  null,
  'anon is denied on orders'
);

select throws_ok(
  'select * from public.order_lines',
  '42501',
  null,
  'anon is denied on order_lines'
);

select throws_ok(
  'select * from public.audit_log',
  '42501',
  null,
  'anon is denied on audit_log'
);

select throws_ok(
  'select * from public.admin_memberships',
  '42501',
  null,
  'anon is denied on admin_memberships'
);

select throws_ok(
  'select * from public.inventory',
  '42501',
  null,
  'anon is denied on inventory'
);

-- Anonymous mutation is impossible: no INSERT policy exists for anon.
select throws_ok(
  $$insert into public.products (business_unit_id, slug, name)
    values ('11111111-1111-4111-8111-111111111111', 'anon-injected', 'Anon Injected')$$,
  '42501',
  null,
  'anon cannot insert a product'
);

select * from finish();
rollback;
