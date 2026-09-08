-- Cruzial Platform V2 — controlled commercial import (Phase 4H1B1)

begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

select ok(not has_function_privilege('anon', 'app.plan_parfums_commercial_import(jsonb)', 'execute'), 'anon cannot plan commercial import');
select ok(not has_function_privilege('authenticated', 'app.plan_parfums_commercial_import(jsonb)', 'execute'), 'authenticated cannot plan commercial import');
select ok(not has_function_privilege('service_role', 'app.plan_parfums_commercial_import(jsonb)', 'execute'), 'service role cannot plan commercial import');
select ok(not has_function_privilege('anon', 'app.apply_parfums_commercial_import(jsonb)', 'execute'), 'anon cannot apply commercial import');
select ok(not has_function_privilege('authenticated', 'app.apply_parfums_commercial_import(jsonb)', 'execute'), 'authenticated cannot apply commercial import');
select ok(not has_function_privilege('service_role', 'app.apply_parfums_commercial_import(jsonb)', 'execute'), 'service role cannot apply commercial import');
select ok(has_function_privilege('postgres', 'app.apply_parfums_commercial_import(jsonb)', 'execute'), 'database operator can apply commercial import');

create temporary table phase4h1b1_manifest (payload jsonb not null);
insert into phase4h1b1_manifest values (
  jsonb_build_object(
    'metadata', jsonb_build_object('business_unit_code', 'parfums'),
    'conflicts', jsonb_build_array(),
    'category_targets', jsonb_build_array(
      jsonb_build_object(
        'kind', 'commercial_type', 'slug', 'phase-4h1b1-arabic', 'name', 'Árabe (4H1B1 test)',
        'description', null, 'spec_schema', jsonb_build_object(),
        'publication_status', 'draft', 'sort_order', 0
      ),
      jsonb_build_object(
        'kind', 'olfactory_family', 'slug', 'phase-4h1b1-fresco', 'name', 'Fresco (4H1B1 test)',
        'description', null, 'spec_schema', jsonb_build_object(),
        'publication_status', 'draft', 'sort_order', 0
      )
    ),
    'products', jsonb_build_array(
      jsonb_build_object(
        'legacy_id', 'phase-4h1b1-product',
        'migration_status', 'MIGRATABLE_DRAFT',
        'target_product', jsonb_build_object(
          'legacy_id', 'phase-4h1b1-product', 'slug', 'phase-4h1b1-product',
          'name', 'Phase 4H1B1 Product', 'brand', 'Test Brand',
          'short_description', null, 'description', 'Legacy test description',
          'gender', 'unisex', 'concentration', 'EDP',
          'sales_mode', 'always_available', 'production_status', 'active',
          'availability_status', 'available', 'publication_status', 'draft',
          'is_featured', false, 'featured_rank', null, 'featured_from', null,
          'featured_until', null, 'verification_status', 'legacy',
          'specs', jsonb_build_object()
        ),
        'variants', jsonb_build_array(
          jsonb_build_object(
            'variant_kind', 'decant', 'size_ml', 3, 'label', '3 ml',
            'price_amount', 12.50, 'currency', 'PEN',
            'publication_status', 'draft', 'price_verification_status', 'legacy',
            'sort_order', 0
          )
        ),
        'categories', jsonb_build_array(
          jsonb_build_object('kind', 'commercial_type', 'target_slug', 'phase-4h1b1-arabic')
        ),
        'inventory_intent', jsonb_build_object(
          'inventory_mode', 'status_only', 'quantity_on_hand', null,
          'availability_status', 'available'
        )
      )
    )
  )
);

select is((app.plan_parfums_commercial_import(payload)->>'conflict_count')::integer, 0, 'fresh dry-run has no conflicts') from phase4h1b1_manifest;
select is((app.plan_parfums_commercial_import(payload)#>>'{operations,categories,insert}')::integer, 2, 'dry-run plans both categories') from phase4h1b1_manifest;
select is((app.plan_parfums_commercial_import(payload)#>>'{operations,products,insert}')::integer, 1, 'dry-run plans product') from phase4h1b1_manifest;
select is((app.plan_parfums_commercial_import(payload)#>>'{operations,variants,insert}')::integer, 1, 'dry-run plans variant') from phase4h1b1_manifest;
select is((app.plan_parfums_commercial_import(payload)#>>'{operations,relationships,insert}')::integer, 1, 'dry-run plans relationship') from phase4h1b1_manifest;
select is((app.plan_parfums_commercial_import(payload)#>>'{operations,inventory,insert}')::integer, 1, 'dry-run plans inventory') from phase4h1b1_manifest;
select is((select count(*)::integer from public.products where legacy_id = 'phase-4h1b1-product'), 0, 'dry-run writes no product row');

select ok((app.apply_parfums_commercial_import(payload)->>'applied')::boolean, 'operator apply succeeds atomically') from phase4h1b1_manifest;
select is((select count(*)::integer from public.categories where slug in ('phase-4h1b1-arabic', 'phase-4h1b1-fresco')), 2, 'apply creates categories');
select is((select count(*)::integer from public.products where legacy_id = 'phase-4h1b1-product'), 1, 'apply creates product');
select is((select count(*)::integer from public.product_variants variant join public.products product on product.id = variant.product_id where product.legacy_id = 'phase-4h1b1-product'), 1, 'apply creates variant');
select is((select count(*)::integer from public.product_categories relationship join public.products product on product.id = relationship.product_id where product.legacy_id = 'phase-4h1b1-product'), 1, 'apply creates relationship');
select is((select count(*)::integer from public.inventory inventory join public.product_variants variant on variant.id = inventory.product_variant_id join public.products product on product.id = variant.product_id where product.legacy_id = 'phase-4h1b1-product'), 1, 'apply creates inventory');
select results_eq(
  $$select name, publication_status, verification_status from public.products where legacy_id = 'phase-4h1b1-product'$$,
  $$values ('Phase 4H1B1 Product'::text, 'draft'::text, 'legacy'::text)$$,
  'product remains draft and legacy'
);
select results_eq(
  $$select variant.price_amount, variant.publication_status, variant.price_verification_status from public.product_variants variant join public.products product on product.id = variant.product_id where product.legacy_id = 'phase-4h1b1-product'$$,
  $$values (12.50::numeric, 'draft'::text, 'legacy'::text)$$,
  'variant price remains exact, draft and legacy'
);
select results_eq(
  $$select inventory.inventory_mode, inventory.quantity_on_hand, inventory.availability_status from public.inventory inventory join public.product_variants variant on variant.id = inventory.product_variant_id join public.products product on product.id = variant.product_id where product.legacy_id = 'phase-4h1b1-product'$$,
  $$values ('status_only'::text, null::integer, 'available'::text)$$,
  'inventory has status-only state without invented quantity'
);
select is(
  (app.plan_parfums_commercial_import(payload)->'operations')::text,
  '{"inventory": {"insert": 0, "conflict": 0, "unchanged": 1}, "products": {"insert": 0, "conflict": 0, "unchanged": 1}, "variants": {"insert": 0, "conflict": 0, "unchanged": 1}, "categories": {"insert": 0, "conflict": 0, "unchanged": 2}, "relationships": {"insert": 0, "conflict": 0, "unchanged": 1}}'::jsonb::text,
  'second plan is fully unchanged and idempotent'
) from phase4h1b1_manifest;

update public.products set name = 'Human-edited product' where legacy_id = 'phase-4h1b1-product';
delete from public.categories where slug = 'phase-4h1b1-fresco';
select is((app.plan_parfums_commercial_import(payload)->>'conflict_count')::integer, 1, 'human product edit is a conflict') from phase4h1b1_manifest;
select ok((app.apply_parfums_commercial_import(payload)->>'refused')::boolean, 'apply refuses a human product conflict') from phase4h1b1_manifest;
select is((select name from public.products where legacy_id = 'phase-4h1b1-product'), 'Human-edited product', 'human product edit is not overwritten');
select is((select count(*)::integer from public.categories where slug = 'phase-4h1b1-fresco'), 0, 'refused apply performs no independent category insert');
update public.products set name = 'Phase 4H1B1 Product' where legacy_id = 'phase-4h1b1-product';
insert into public.categories (business_unit_id, kind, slug, name, publication_status)
select id, 'olfactory_family', 'phase-4h1b1-fresco', 'Fresco (4H1B1 test)', 'draft' from public.business_units where code = 'parfums';

update public.inventory
set inventory_mode = 'tracked_quantity', quantity_on_hand = 7
where product_variant_id = (
  select variant.id from public.product_variants variant
  join public.products product on product.id = variant.product_id
  where product.legacy_id = 'phase-4h1b1-product'
);
select is((app.plan_parfums_commercial_import(payload)->>'conflict_count')::integer, 1, 'tracked human inventory is a conflict') from phase4h1b1_manifest;
select ok((app.apply_parfums_commercial_import(payload)->>'refused')::boolean, 'apply refuses tracked inventory conflict') from phase4h1b1_manifest;
select results_eq(
  $$select inventory_mode, quantity_on_hand from public.inventory inventory join public.product_variants variant on variant.id = inventory.product_variant_id join public.products product on product.id = variant.product_id where product.legacy_id = 'phase-4h1b1-product'$$,
  $$values ('tracked_quantity'::text, 7::integer)$$,
  'tracked quantity is not overwritten'
);

update public.inventory
set inventory_mode = 'status_only', quantity_on_hand = null
where product_variant_id = (
  select variant.id from public.product_variants variant
  join public.products product on product.id = variant.product_id
  where product.legacy_id = 'phase-4h1b1-product'
);
select is((app.plan_parfums_commercial_import(payload)->>'conflict_count')::integer, 0, 'restored fixture returns to conflict-free idempotency') from phase4h1b1_manifest;

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select is((select count(*)::integer from public.products where legacy_id = 'phase-4h1b1-product'), 0, 'anonymous cannot see imported draft product');
reset role;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('4b1b0000-0000-4000-8000-000000000012', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'commercial-import-admin@example.test', '', now(), now());
insert into public.admin_memberships (user_id, business_unit_id, role)
select '4b1b0000-0000-4000-8000-000000000012', id, 'admin'
from public.business_units where code = 'parfums';
set local role authenticated;
set local request.jwt.claims to '{"sub":"4b1b0000-0000-4000-8000-000000000012","role":"authenticated"}';
select is((select count(*)::integer from public.products where legacy_id = 'phase-4h1b1-product'), 1, 'Parfums Admin can list imported draft product');
reset role;

select * from finish();
rollback;
