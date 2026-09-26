-- VERIFICATION: Gate A correction — inventory invariant holds on CREATE too
--
-- Proves that after migration
-- 20260925170000_inventory_availability_invariant_at_create.sql:
--   - admin_create_variant rejects tracked_quantity + qty=0 + available
--   - tracked_quantity + qty=0 + out_of_stock still succeeds
--   - tracked_quantity + qty>0 + available still succeeds
--   - the invariant is a real table CHECK constraint: even a direct INSERT
--     as service_role (which bypasses RLS/grants entirely) cannot create
--     the forbidden state — this is not merely an RPC-layer guard

begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('42000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'gate-a-correction-admin@example.test', '', now(), now());

insert into public.admin_memberships (user_id, business_unit_id, role) values
  ('42000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'admin');

insert into public.products (id, business_unit_id, slug, name, publication_status) values
  ('42000000-0000-4000-8000-0000000000a1', '11111111-1111-4111-8111-111111111111',
   'gate-a-correction-product', 'TEST Gate A Correction Product', 'draft');

set local role authenticated;
set local request.jwt.claims to '{"aal":"aal2","sub":"42000000-0000-4000-8000-000000000001","role":"authenticated"}';

-- =========================================================================
-- A. admin_create_variant enforces the invariant at creation time
-- =========================================================================
select throws_ok(
  $$select public.admin_create_variant(
      '42000000-0000-4000-8000-0000000000a1'::uuid, '5 ml', 'decant', 5, 20.00,
      'PEN', null, 'draft', 0, 'tracked_quantity', 'available', 0)$$,
  22023, null,
  'admin_create_variant rejects tracked_quantity + qty=0 + available'
);

select lives_ok(
  $$select public.admin_create_variant(
      '42000000-0000-4000-8000-0000000000a1'::uuid, '10 ml', 'bottle', 10, 60.00,
      'PEN', null, 'draft', 0, 'tracked_quantity', 'out_of_stock', 0)$$,
  'admin_create_variant allows tracked_quantity + qty=0 + out_of_stock'
);

select lives_ok(
  $$select public.admin_create_variant(
      '42000000-0000-4000-8000-0000000000a1'::uuid, '15 ml', 'bottle', 15, 90.00,
      'PEN', null, 'draft', 0, 'tracked_quantity', 'available', 5)$$,
  'admin_create_variant allows tracked_quantity + qty>0 + available'
);

reset role;

-- =========================================================================
-- B. The invariant is a real table CHECK constraint, not just an RPC guard
-- =========================================================================
set local role service_role;

select throws_ok(
  $$insert into public.inventory (product_variant_id, inventory_mode, quantity_on_hand, availability_status)
    select id, 'tracked_quantity', 0, 'available' from public.product_variants
    where product_id = '42000000-0000-4000-8000-0000000000a1'::uuid limit 1$$,
  23514, null,
  'even service_role (which bypasses RLS/grants entirely) cannot create the forbidden state — it is a table CHECK constraint'
);

select throws_ok(
  $$update public.inventory set inventory_mode = 'tracked_quantity', quantity_on_hand = 0, availability_status = 'available'
    where product_variant_id = (
      select pv.id from public.product_variants pv
      where pv.product_id = '42000000-0000-4000-8000-0000000000a1'::uuid and pv.label = '15 ml'
    )$$,
  23514, null,
  'the CHECK constraint also blocks a direct UPDATE into the forbidden state, independent of admin_update_inventory'
);

reset role;

select is(
  (select count(*)::integer from public.inventory i
    join public.product_variants pv on pv.id = i.product_variant_id
    where pv.product_id = '42000000-0000-4000-8000-0000000000a1'::uuid),
  2,
  'only the two successful creates persisted (the rejected create left no orphan variant/inventory pair)'
);

select * from finish();
rollback;
