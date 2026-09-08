-- Cruzial Platform V2 — Admin Parfums product CRUD (Phase 4a)
--
-- Exercises the RPCs in 20260908000435_admin_parfums_product_mutations.sql:
-- atomicity, cross-unit rejection, viewer-cannot-mutate, anonymous-cannot-
-- mutate, optimistic concurrency, price-change audit tagging, and archive
-- being a state change rather than a DELETE.

begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'parfums-admin@example.test', '', now(), now()),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'import-admin@example.test', '', now(), now()),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'parfums-viewer@example.test', '', now(), now());

insert into public.admin_memberships (user_id, business_unit_id, role) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'admin'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'admin'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '11111111-1111-4111-8111-111111111111', 'viewer');

insert into public.categories (id, business_unit_id, kind, slug, name, publication_status) values
  ('11111111-0000-4000-8000-0000000000c9', '11111111-1111-4111-8111-111111111111',
   'commercial_type', 'test-arab', 'Árabe (test)', 'published');

-- ---------------------------------------------------------------------------
-- Anonymous cannot call any of these
-- ---------------------------------------------------------------------------

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select throws_ok(
  $$select public.admin_create_product('parfums', 'anon-cannot', 'Nope')$$,
  '42501',
  null,
  'anon cannot call admin_create_product'
);

reset role;

-- ---------------------------------------------------------------------------
-- Parfums admin: create a product + variant + inventory, atomically
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';

select lives_ok(
  $$select public.admin_create_product(
      'parfums', 'test-product-crud', 'TEST Product CRUD',
      p_brand => 'Test Brand', p_publication_status => 'draft'
    )$$,
  'Parfums admin creates a product via the RPC'
);

select is(
  (select count(*)::int from public.products where slug = 'test-product-crud'),
  1,
  'exactly one product row was created'
);

-- Scoped to this test's own product id, not a bare global count: audit_log is
-- append-only (by design — see 20260907154355_audit_log.sql) and this file's
-- own BEGIN/ROLLBACK does not un-write rows a *previous*, already-committed
-- session left behind, so a global count here would be fragile against any
-- manual/live testing done against the same local database beforehand.
select is(
  (select count(*)::int from public.audit_log
     where entity_type = 'product' and action = 'create'
       and entity_id = (select id from public.products where slug = 'test-product-crud')),
  1,
  'product creation wrote exactly one audit_log row for this product'
);

-- Duplicate slug in the same unit is rejected, not silently overwritten.
select throws_ok(
  $$select public.admin_create_product('parfums', 'test-product-crud', 'Duplicate Slug')$$,
  '23505',
  null,
  'creating a second product with the same slug in the same unit fails'
);

select throws_ok(
  $$select public.admin_create_product('does-not-exist', 'x', 'X')$$,
  '22023',
  null,
  'creating a product in a nonexistent business unit fails'
);

-- Add a variant + its paired inventory row in one call.
select lives_ok(
  $$select public.admin_create_variant(
      (select id from public.products where slug = 'test-product-crud'),
      '3 ml', 'decant', 3, 12.00
    )$$,
  'Parfums admin creates a variant + inventory row together'
);

select is(
  (select count(*)::int from public.product_variants pv
    join public.products p on p.id = pv.product_id
    where p.slug = 'test-product-crud'),
  1,
  'the product has exactly one variant'
);

select is(
  (select count(*)::int from public.inventory i
    join public.product_variants pv on pv.id = i.product_variant_id
    join public.products p on p.id = pv.product_id
    where p.slug = 'test-product-crud'),
  1,
  'the variant has a paired inventory row created atomically'
);

-- A status_only/quantity mismatch is still rejected by the DB constraint,
-- even when going through the RPC.
select throws_ok(
  $$select public.admin_create_variant(
      (select id from public.products where slug = 'test-product-crud'),
      '5 ml', 'decant', 5, 16.00,
      p_inventory_mode => 'status_only', p_quantity_on_hand => 10
    )$$,
  '23514',
  null,
  'creating a variant with an inconsistent inventory shape is rejected'
);

-- ---------------------------------------------------------------------------
-- Optimistic concurrency
-- ---------------------------------------------------------------------------

select throws_ok(
  $$select public.admin_update_product(
      (select id from public.products where slug = 'test-product-crud'),
      '2000-01-01T00:00:00Z'::timestamptz,
      'test-product-crud', 'TEST Product CRUD Renamed', 'Test Brand', null, null,
      null, null, 'always_available', 'active', 'draft', false, null, null, null
    )$$,
  '40001',
  null,
  'updating with a stale expected_updated_at is rejected as a conflict'
);

select lives_ok(
  $$select public.admin_update_product(
      (select id from public.products where slug = 'test-product-crud'),
      (select updated_at from public.products where slug = 'test-product-crud'),
      'test-product-crud', 'TEST Product CRUD Renamed', 'Test Brand', null, null,
      null, null, 'always_available', 'active', 'draft', false, null, null, null
    )$$,
  'updating with the correct expected_updated_at succeeds'
);

select is(
  (select name from public.products where slug = 'test-product-crud'),
  'TEST Product CRUD Renamed',
  'the product name actually changed'
);

-- A price change on a variant is tagged distinctly from a cosmetic edit.
select lives_ok(
  $$select public.admin_update_variant(
      (select pv.id from public.product_variants pv join public.products p
         on p.id = pv.product_id where p.slug = 'test-product-crud' and pv.label = '3 ml'),
      (select pv.updated_at from public.product_variants pv join public.products p
         on p.id = pv.product_id where p.slug = 'test-product-crud' and pv.label = '3 ml'),
      '3 ml', 'decant', 3, 15.00, 'PEN', null, 'draft', 0
    )$$,
  'Parfums admin updates a variant price'
);

-- Postgres now() is stable for the whole transaction (equivalent to
-- transaction_timestamp()), so every audit_log row inserted by this test file
-- shares one created_at — "the most recent row" is not a meaningful query
-- here. Assert directly that the price_change row exists for this variant,
-- rather than ordering by a timestamp that cannot distinguish them.
select is(
  (select count(*)::int from public.audit_log
     where entity_type = 'product_variant' and action = 'price_change'
       and entity_id = (select pv.id from public.product_variants pv join public.products p
         on p.id = pv.product_id where p.slug = 'test-product-crud' and pv.label = '3 ml')),
  1,
  'the price-changing variant update wrote a price_change audit row'
);

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------

select lives_ok(
  $$select public.admin_set_product_categories(
      (select id from public.products where slug = 'test-product-crud'),
      array['11111111-0000-4000-8000-0000000000c9']::uuid[]
    )$$,
  'Parfums admin assigns an existing category to the product'
);

select is(
  (select count(*)::int from public.product_categories pc
    join public.products p on p.id = pc.product_id
    where p.slug = 'test-product-crud'),
  1,
  'the product now has exactly one category link'
);

-- ---------------------------------------------------------------------------
-- Archive is a state change, never a delete
-- ---------------------------------------------------------------------------

select lives_ok(
  $$select public.admin_archive_variant(
      (select pv.id from public.product_variants pv join public.products p
         on p.id = pv.product_id where p.slug = 'test-product-crud' and pv.label = '3 ml'),
      (select pv.updated_at from public.product_variants pv join public.products p
         on p.id = pv.product_id where p.slug = 'test-product-crud' and pv.label = '3 ml')
    )$$,
  'Parfums admin archives a variant'
);

select is(
  (select count(*)::int from public.product_variants pv
    join public.products p on p.id = pv.product_id
    where p.slug = 'test-product-crud' and pv.label = '3 ml'),
  1,
  'the archived variant row still physically exists (no DELETE)'
);

select is(
  (select pv.publication_status from public.product_variants pv
    join public.products p on p.id = pv.product_id
    where p.slug = 'test-product-crud' and pv.label = '3 ml'),
  'archived',
  'the archived variant is marked archived, not deleted'
);

select lives_ok(
  $$select public.admin_archive_product(
      (select id from public.products where slug = 'test-product-crud'),
      (select updated_at from public.products where slug = 'test-product-crud')
    )$$,
  'Parfums admin archives the product'
);

-- production_status/availability_status must be untouched by archiving —
-- the exact "archived -> discontinued/out_of_stock" collapse the brief
-- forbids.
select is(
  (select production_status from public.products where slug = 'test-product-crud'),
  'active',
  'archiving a product does not touch production_status'
);

select is(
  (select availability_status from public.products where slug = 'test-product-crud'),
  'available',
  'archiving a product does not touch availability_status'
);

select lives_ok(
  $$select public.admin_restore_product(
      (select id from public.products where slug = 'test-product-crud'),
      (select updated_at from public.products where slug = 'test-product-crud')
    )$$,
  'Parfums admin restores the archived product'
);

select is(
  (select publication_status from public.products where slug = 'test-product-crud'),
  'draft',
  'restoring a product lands on draft, never silently back on published'
);

-- ---------------------------------------------------------------------------
-- Cross-unit and role rejection
-- ---------------------------------------------------------------------------

set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}';

select throws_ok(
  $$select public.admin_create_product('parfums', 'import-admin-cannot', 'Nope')$$,
  '42501',
  null,
  'an Import admin cannot create a Parfums product'
);

select throws_ok(
  $$select public.admin_update_product(
      (select id from public.products where slug = 'test-product-crud'),
      now(), 'test-product-crud', 'Hijacked', null, null, null, null, null,
      'always_available', 'active', 'draft', false, null, null, null
    )$$,
  'P0002',
  null,
  'an Import admin cannot update a Parfums product it cannot even see'
);

set local request.jwt.claims to '{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}';

select throws_ok(
  $$select public.admin_update_product(
      (select id from public.products where slug = 'test-product-crud'),
      (select updated_at from public.products where slug = 'test-product-crud'),
      'test-product-crud', 'Viewer Cannot Write', null, null, null, null, null,
      'always_available', 'active', 'draft', false, null, null, null
    )$$,
  '42501',
  null,
  'a Parfums viewer can see the product but cannot mutate it'
);

select * from finish();
rollback;
