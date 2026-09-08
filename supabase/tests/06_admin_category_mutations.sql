-- Cruzial Platform V2 — Admin Parfums category CRUD (Phase 4b)
--
-- Covers category mutations, audit, authorization, optimistic concurrency,
-- hierarchy integrity and conservative relation-safe archive semantics.

begin;
create extension if not exists pgtap with schema extensions;
select plan(37);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'categories-parfums-admin@example.test', '', now(), now()),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'categories-import-admin@example.test', '', now(), now()),
  ('ffffffff-ffff-4fff-8fff-ffffffffffff', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'categories-parfums-viewer@example.test', '', now(), now());

insert into public.admin_memberships (user_id, business_unit_id, role) values
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '11111111-1111-4111-8111-111111111111', 'admin'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '22222222-2222-4222-8222-222222222222', 'admin'),
  ('ffffffff-ffff-4fff-8fff-ffffffffffff', '11111111-1111-4111-8111-111111111111', 'viewer');

insert into public.categories (
  id, business_unit_id, kind, slug, name, publication_status
) values (
  '22222222-0000-4000-8000-0000000000c4',
  '22222222-2222-4222-8222-222222222222',
  'import_category',
  'test-import-parent',
  'TEST Import Parent',
  'draft'
);

-- ---------------------------------------------------------------------------
-- Execute privilege and authorized creation
-- ---------------------------------------------------------------------------

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select throws_ok(
  $$select public.admin_create_category(
      'parfums', 'commercial_type', 'anon-category', 'Nope'
    )$$,
  '42501',
  null,
  'anonymous cannot execute admin_create_category'
);

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","role":"authenticated"}';

select lives_ok(
  $$select public.admin_create_category(
      'parfums', 'commercial_type', 'test-parent-category',
      'TEST Parent Category', 'Local pgTAP fixture', null, 'draft', 10
    )$$,
  'Parfums admin creates a root category'
);

select is(
  (select count(*)::int from public.categories where slug = 'test-parent-category'),
  1,
  'create persists exactly one category row'
);

select is(
  (select count(*)::int from public.audit_log
   where entity_type = 'category'
     and entity_id = (select id from public.categories where slug = 'test-parent-category')
     and action = 'create'
     and actor_user_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  1,
  'create writes one audit row with the authenticated actor'
);

select lives_ok(
  $$select public.admin_create_category(
      'parfums', 'commercial_type', 'test-child-category',
      'TEST Child Category', null,
      (select id from public.categories where slug = 'test-parent-category'),
      'draft', 20
    )$$,
  'Parfums admin creates a child category'
);

select is(
  (select parent_id from public.categories where slug = 'test-child-category'),
  (select id from public.categories where slug = 'test-parent-category'),
  'the child references the selected parent'
);

select throws_ok(
  $$select public.admin_create_category(
      'parfums', 'commercial_type', 'test-parent-category', 'Duplicate'
    )$$,
  '23505',
  null,
  'duplicate slug in Parfums is rejected'
);

-- ---------------------------------------------------------------------------
-- Hierarchy integrity
-- ---------------------------------------------------------------------------

select throws_ok(
  $$select public.admin_create_category(
      'parfums', 'olfactory_family', 'test-kind-mismatch', 'Mismatch', null,
      (select id from public.categories where slug = 'test-parent-category')
    )$$,
  'P2001',
  null,
  'a child cannot use a parent of a different category kind'
);

select throws_ok(
  $$select public.admin_create_category(
      'parfums', 'commercial_type', 'test-cross-unit-parent', 'Cross unit', null,
      '22222222-0000-4000-8000-0000000000c4'
    )$$,
  '23514',
  null,
  'a child cannot use a parent from another business unit'
);

select throws_ok(
  $$select public.admin_update_category(
      (select id from public.categories where slug = 'test-parent-category'),
      (select updated_at from public.categories where slug = 'test-parent-category'),
      'commercial_type', 'test-parent-category', 'TEST Parent Category',
      'Local pgTAP fixture',
      (select id from public.categories where slug = 'test-parent-category'),
      'draft', 10
    )$$,
  'P2001',
  null,
  'a category cannot become its own parent'
);

select throws_ok(
  $$select public.admin_update_category(
      (select id from public.categories where slug = 'test-parent-category'),
      (select updated_at from public.categories where slug = 'test-parent-category'),
      'commercial_type', 'test-parent-category', 'TEST Parent Category',
      'Local pgTAP fixture',
      (select id from public.categories where slug = 'test-child-category'),
      'draft', 10
    )$$,
  'P2001',
  null,
  'an indirect parent-child cycle is rejected'
);

select is(
  (select count(*)::int from public.categories
   where slug in ('test-kind-mismatch', 'test-cross-unit-parent')),
  0,
  'failed hierarchy creates are atomic and leave no category rows'
);

-- ---------------------------------------------------------------------------
-- Optimistic update and spec_schema preservation
-- ---------------------------------------------------------------------------

select throws_ok(
  $$select public.admin_update_category(
      (select id from public.categories where slug = 'test-parent-category'),
      '2000-01-01T00:00:00Z'::timestamptz,
      'commercial_type', 'test-parent-category', 'Stale overwrite', null, null,
      'published', 30
    )$$,
  '40001',
  null,
  'stale expected_updated_at is rejected'
);

select lives_ok(
  $$select public.admin_update_category(
      (select id from public.categories where slug = 'test-parent-category'),
      (select updated_at from public.categories where slug = 'test-parent-category'),
      'commercial_type', 'test-parent-category', 'TEST Parent Category Edited',
      'Updated local fixture', null, 'published', 30
    )$$,
  'an update with the current timestamp succeeds'
);

select is(
  (select name || '|' || publication_status || '|' || sort_order::text
   from public.categories where slug = 'test-parent-category'),
  'TEST Parent Category Edited|published|30',
  'name, publication status and integer sort order are updated'
);

select is(
  (select spec_schema from public.categories where slug = 'test-parent-category'),
  '{}'::jsonb,
  'category updates preserve spec_schema untouched'
);

select throws_ok(
  $$select public.admin_archive_category(
      (select id from public.categories where slug = 'test-parent-category'),
      (select updated_at from public.categories where slug = 'test-parent-category')
    )$$,
  'P2002',
  null,
  'a parent with an active child cannot be archived'
);

-- ---------------------------------------------------------------------------
-- Product relations and archive/restore
-- ---------------------------------------------------------------------------

select lives_ok(
  $$select public.admin_create_product(
      'parfums', 'test-category-product', 'TEST Category Product'
    )$$,
  'a local product fixture is created through the existing audited RPC'
);

select lives_ok(
  $$select public.admin_set_product_categories(
      (select id from public.products where slug = 'test-category-product'),
      array[(select id from public.categories where slug = 'test-child-category')]
    )$$,
  'the existing Product CRUD assigns the child category'
);

select throws_ok(
  $$select public.admin_archive_category(
      (select id from public.categories where slug = 'test-child-category'),
      (select updated_at from public.categories where slug = 'test-child-category')
    )$$,
  'P2002',
  null,
  'a category assigned to a product cannot be archived'
);

select is(
  (select count(*)::int from public.product_categories assignment
   join public.categories category on category.id = assignment.category_id
   where category.slug = 'test-child-category'),
  1,
  'a rejected archive preserves the product relation'
);

select lives_ok(
  $$select public.admin_set_product_categories(
      (select id from public.products where slug = 'test-category-product'),
      array[]::uuid[]
    )$$,
  'the product can explicitly unassign its category'
);

select lives_ok(
  $$select public.admin_archive_category(
      (select id from public.categories where slug = 'test-child-category'),
      (select updated_at from public.categories where slug = 'test-child-category')
    )$$,
  'an unassigned child category can be archived'
);

select is(
  (select publication_status || '|' || (archived_at is not null)::text
   from public.categories where slug = 'test-child-category'),
  'archived|true',
  'archive is a recoverable state change and not a DELETE'
);

select lives_ok(
  $$select public.admin_set_product_categories(
      (select id from public.products where slug = 'test-category-product'),
      array[(select id from public.categories where slug = 'test-parent-category')]
    )$$,
  'the active parent remains assignable in Product CRUD'
);

select throws_ok(
  $$select public.admin_set_product_categories(
      (select id from public.products where slug = 'test-category-product'),
      array[
        (select id from public.categories where slug = 'test-parent-category'),
        (select id from public.categories where slug = 'test-child-category')
      ]
    )$$,
  'P2004',
  null,
  'an archived category cannot be newly assigned to a product'
);

select is(
  (select count(*)::int from public.product_categories assignment
   join public.categories category on category.id = assignment.category_id
   where assignment.product_id = (
     select id from public.products where slug = 'test-category-product'
   ) and category.slug = 'test-parent-category'),
  1,
  'failed full-replace assignment rolls back and preserves the prior active relation'
);

select lives_ok(
  $$select public.admin_set_product_categories(
      (select id from public.products where slug = 'test-category-product'),
      array[]::uuid[]
    )$$,
  'the parent is explicitly unassigned before archive'
);

select lives_ok(
  $$select public.admin_archive_category(
      (select id from public.categories where slug = 'test-parent-category'),
      (select updated_at from public.categories where slug = 'test-parent-category')
    )$$,
  'a parent can be archived after its children are archived and relations removed'
);

select throws_ok(
  $$select public.admin_restore_category(
      (select id from public.categories where slug = 'test-child-category'),
      (select updated_at from public.categories where slug = 'test-child-category')
    )$$,
  'P2003',
  null,
  'a child cannot be restored while its parent is archived'
);

select lives_ok(
  $$select public.admin_restore_category(
      (select id from public.categories where slug = 'test-parent-category'),
      (select updated_at from public.categories where slug = 'test-parent-category')
    )$$,
  'the parent category can be restored'
);

select lives_ok(
  $$select public.admin_restore_category(
      (select id from public.categories where slug = 'test-child-category'),
      (select updated_at from public.categories where slug = 'test-child-category')
    )$$,
  'the child category can be restored after its parent'
);

select is(
  (select publication_status || '|' || (archived_at is null)::text
   from public.categories where slug = 'test-child-category'),
  'draft|true',
  'restore returns the category to draft without deleting hierarchy data'
);

select is(
  (select count(*)::int from public.audit_log
   where entity_type = 'category'
     and entity_id in (
       select id from public.categories
       where slug in ('test-parent-category', 'test-child-category')
     )),
  7,
  'successful create/update/archive/restore operations wrote the expected audit rows'
);

select is(
  (select count(*)::int from public.audit_log
   where entity_type = 'category'
     and entity_id in (
       select id from public.categories
       where slug in ('test-parent-category', 'test-child-category')
     )
     and actor_user_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  7,
  'every category audit row records the real authenticated actor'
);

-- ---------------------------------------------------------------------------
-- Role and cross-unit rejection
-- ---------------------------------------------------------------------------

set local request.jwt.claims to '{"sub":"ffffffff-ffff-4fff-8fff-ffffffffffff","role":"authenticated"}';

select throws_ok(
  $$select public.admin_update_category(
      (select id from public.categories where slug = 'test-parent-category'),
      (select updated_at from public.categories where slug = 'test-parent-category'),
      'commercial_type', 'test-parent-category', 'Viewer overwrite', null, null,
      'draft', 0
    )$$,
  '42501',
  null,
  'a Parfums viewer cannot mutate categories'
);

set local request.jwt.claims to '{"sub":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee","role":"authenticated"}';

select throws_ok(
  $$select public.admin_create_category(
      'parfums', 'commercial_type', 'import-admin-parfums-category', 'Nope'
    )$$,
  '42501',
  null,
  'an Import-only admin cannot create a Parfums category'
);

select * from finish();
rollback;
