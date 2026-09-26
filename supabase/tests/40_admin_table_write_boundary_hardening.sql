-- VERIFICATION: Gate A3 — close direct admin table-write bypasses
--
-- Proves that after migration
-- 20260925150000_admin_table_write_boundary_hardening.sql:
--   - anon cannot directly mutate any of the hardened catalog tables
--   - a signed-in user with only a 'viewer' membership cannot directly
--     mutate them either (same as before -- viewer never had this anyway)
--   - a legitimately-scoped 'admin' membership ALSO cannot mutate them via
--     raw table DML any more -- RPC-only is enforced at the grant level,
--     not merely by RLS authorization
--   - the confirmed inventory bypass is closed: a direct UPDATE that sets
--     quantity_on_hand = 0 and availability_status = 'available' (the
--     invariant admin_update_inventory enforces but the table CHECK
--     constraint does not) is refused outright (42501), not merely
--     RLS-filtered
--   - the invariant is STILL enforced when going through the canonical RPC
--     (22023), and the canonical RPC still succeeds for a legitimate call
--   - business_units, which never had an admin-write RLS policy, is now
--     also denied at the grant level

begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

-- =========================================================================
-- Fixtures
-- =========================================================================

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('40000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gate-a3-admin@example.test', '', now(), now()),
  ('40000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gate-a3-viewer@example.test', '', now(), now());

insert into public.admin_memberships (user_id, business_unit_id, role) values
  ('40000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'admin'),
  ('40000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'viewer');

insert into public.categories (id, business_unit_id, kind, slug, name, publication_status) values
  ('40000000-0000-4000-8000-0000000000c1', '11111111-1111-4111-8111-111111111111',
   'olfactory_family', 'gate-a3-category', 'TEST Gate A3 Category', 'draft');

insert into public.products (id, business_unit_id, slug, name, publication_status) values
  ('40000000-0000-4000-8000-0000000000a1', '11111111-1111-4111-8111-111111111111',
   'gate-a3-product', 'TEST Gate A3 Product', 'draft');

insert into public.product_variants (id, product_id, label, variant_kind, price_amount, sort_order) values
  ('40000000-0000-4000-8000-0000000000a2', '40000000-0000-4000-8000-0000000000a1',
   '5 ml', 'decant', 20.00, 0);

insert into public.inventory (product_variant_id, inventory_mode, availability_status, quantity_on_hand) values
  ('40000000-0000-4000-8000-0000000000a2', 'tracked_quantity', 'out_of_stock', 0);

insert into public.combos (product_id, composition_verification_status) values
  ('40000000-0000-4000-8000-0000000000a1', 'pending_reconfirmation');

insert into public.wholesale_policies (id, business_unit_id, name, scope, min_quantity, discount_amount, currency, is_active) values
  ('40000000-0000-4000-8000-0000000000a3', '11111111-1111-4111-8111-111111111111',
   'TEST Gate A3 Wholesale Policy', 'per_product', 12, 3.00, 'PEN', true);

-- =========================================================================
-- A. anon: direct DML denied outright on every hardened table
-- =========================================================================
set local role anon;

select throws_ok(
  $$insert into public.business_units (code, name, is_active) values ('gate_a3', 'Gate A3', true)$$,
  42501, null, 'anon cannot insert into business_units'
);
select throws_ok(
  $$update public.categories set name = 'x' where id = '40000000-0000-4000-8000-0000000000c1'$$,
  42501, null, 'anon cannot update categories'
);
select throws_ok(
  $$update public.products set name = 'x' where id = '40000000-0000-4000-8000-0000000000a1'$$,
  42501, null, 'anon cannot update products'
);
select throws_ok(
  $$update public.product_variants set price_amount = 1 where id = '40000000-0000-4000-8000-0000000000a2'$$,
  42501, null, 'anon cannot update product_variants'
);
select throws_ok(
  $$update public.inventory set quantity_on_hand = 99 where product_variant_id = '40000000-0000-4000-8000-0000000000a2'$$,
  42501, null, 'anon cannot update inventory'
);
select throws_ok(
  $$update public.combos set composition_verification_status = 'confirmed' where product_id = '40000000-0000-4000-8000-0000000000a1'$$,
  42501, null, 'anon cannot update combos'
);
select throws_ok(
  $$update public.wholesale_policies set discount_amount = 99 where id = '40000000-0000-4000-8000-0000000000a3'$$,
  42501, null, 'anon cannot update wholesale_policies'
);

reset role;

-- =========================================================================
-- B. viewer: direct DML denied (never had write access; still doesn't)
-- =========================================================================
set local role authenticated;
set local request.jwt.claims to '{"aal":"aal2","sub":"40000000-0000-4000-8000-000000000002","role":"authenticated"}';

select throws_ok(
  $$update public.inventory set quantity_on_hand = 99 where product_variant_id = '40000000-0000-4000-8000-0000000000a2'$$,
  42501, null, 'a viewer membership cannot directly update inventory'
);

reset role;

-- =========================================================================
-- C. A legitimately-scoped ADMIN: RPC-only is a grant-level fact, not just
--    an RLS/authorization outcome
-- =========================================================================
set local role authenticated;
set local request.jwt.claims to '{"aal":"aal2","sub":"40000000-0000-4000-8000-000000000001","role":"authenticated"}';

select throws_ok(
  $$insert into public.business_units (code, name, is_active) values ('gate_a3', 'Gate A3', true)$$,
  42501, null, 'an admin cannot directly insert into business_units'
);
select throws_ok(
  $$update public.categories set name = 'Renamed directly' where id = '40000000-0000-4000-8000-0000000000c1'$$,
  42501, null, 'an admin cannot directly update categories (RPC-only: admin_update_category)'
);
select throws_ok(
  $$update public.product_variants set price_amount = 1 where id = '40000000-0000-4000-8000-0000000000a2'$$,
  42501, null, 'an admin cannot directly update product_variants (RPC-only: admin_update_variant)'
);
select throws_ok(
  $$update public.combos set composition_verification_status = 'confirmed' where product_id = '40000000-0000-4000-8000-0000000000a1'$$,
  42501, null, 'an admin cannot directly update combos (RPC-only: admin_update_combo_verification)'
);
select throws_ok(
  $$update public.wholesale_policies set discount_amount = 99 where id = '40000000-0000-4000-8000-0000000000a3'$$,
  42501, null, 'an admin cannot directly update wholesale_policies (RPC-only: admin_update_wholesale_policy)'
);

-- =========================================================================
-- D. The confirmed inventory bypass: direct DML cannot reproduce the
--    invariant violation admin_update_inventory blocks, because direct DML
--    is refused outright
-- =========================================================================
select throws_ok(
  $$update public.inventory set inventory_mode = 'tracked_quantity', quantity_on_hand = 0, availability_status = 'available'
    where product_variant_id = '40000000-0000-4000-8000-0000000000a2'$$,
  42501, null, 'the confirmed inventory bypass is closed: direct DML is refused, not merely RLS-filtered'
);

-- =========================================================================
-- E. The canonical RPC path: invariant still enforced, legitimate calls
--    still succeed (proves the SECURITY DEFINER conversion changed nothing
--    observable about correct usage)
-- =========================================================================
select throws_ok(
  $$select public.admin_update_inventory(
      '40000000-0000-4000-8000-0000000000a2'::uuid,
      (select updated_at from public.inventory where product_variant_id = '40000000-0000-4000-8000-0000000000a2'),
      'tracked_quantity', 'available', 0)$$,
  22023, null, 'admin_update_inventory still enforces the zero-quantity/available invariant'
);

select lives_ok(
  $$select public.admin_update_inventory(
      '40000000-0000-4000-8000-0000000000a2'::uuid,
      (select updated_at from public.inventory where product_variant_id = '40000000-0000-4000-8000-0000000000a2'),
      'tracked_quantity', 'available', 5)$$,
  'the canonical admin_update_inventory RPC still succeeds for a legitimate mutation'
);

select is(
  (select quantity_on_hand from public.inventory where product_variant_id = '40000000-0000-4000-8000-0000000000a2'),
  5,
  'the legitimate RPC mutation actually persisted'
);

select is(
  (select count(*)::integer from public.audit_log
    where entity_type = 'inventory' and entity_id = (
      select id from public.inventory where product_variant_id = '40000000-0000-4000-8000-0000000000a2'
    )),
  1,
  'the RPC path still writes exactly one audit_log entry (unreachable via the closed direct-DML bypass)'
);

reset role;

select * from finish();
rollback;
