-- Cruzial Platform V2 — Admin Parfums combo CRUD (Phase 4c)
--
-- Exercises 20260908040000_admin_parfums_combo_mutations.sql: create on an
-- eligible product, max-one-combo-per-product, archived-product rejection,
-- composition replace atomicity, duplicate-variant/self-reference/archived-
-- reference rejection, cross-unit rejection, verification status change,
-- archive/restore as state changes (never DELETE), the new "cannot archive a
-- variant/product referenced by an active combo" guard, optimistic
-- concurrency on both verification updates and composition replaces, viewer
-- and anonymous rejection, and audit rows for every action.

begin;
create extension if not exists pgtap with schema extensions;
select plan(39);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'parfums-admin-combo@example.test', '', now(), now()),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'import-admin-combo@example.test', '', now(), now()),
  ('ffffffff-ffff-4fff-8fff-ffffffffffff', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'parfums-viewer-combo@example.test', '', now(), now());

insert into public.admin_memberships (user_id, business_unit_id, role) values
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '11111111-1111-4111-8111-111111111111', 'admin'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '22222222-2222-4222-8222-222222222222', 'admin'),
  ('ffffffff-ffff-4fff-8fff-ffffffffffff', '11111111-1111-4111-8111-111111111111', 'viewer');

-- Three Parfums products (A = the combo's own vendible product, B/C =
-- ingredient products) and one Import product, all as the table owner so
-- RLS never gets in the way of fixture setup. A and D start 'published' —
-- not because that is a required state for a combo product, but so the
-- anon/cross-unit assertions below actually exercise assert_admin_for's
-- 42501 (the row is visible, the caller just isn't an admin for its unit)
-- instead of accidentally testing RLS row-invisibility (P0002) by picking a
-- draft row nobody outside Parfums can see in the first place.
insert into public.products (id, business_unit_id, slug, name, publication_status) values
  ('a0000000-0000-4000-8000-00000000000a', '11111111-1111-4111-8111-111111111111', 'combo-test-a', 'TEST Combo Product A', 'published'),
  ('b0000000-0000-4000-8000-00000000000b', '11111111-1111-4111-8111-111111111111', 'combo-test-b', 'TEST Combo Product B', 'draft'),
  ('c0000000-0000-4000-8000-00000000000c', '11111111-1111-4111-8111-111111111111', 'combo-test-c', 'TEST Combo Product C', 'draft'),
  ('d0000000-0000-4000-8000-00000000000d', '22222222-2222-4222-8222-222222222222', 'combo-test-import', 'TEST Import Product', 'published');

-- Variant D is also explicitly 'published' (product_variants_public_read
-- checks the variant's own publication_status, not just its product's) so
-- the cross-unit composition test below finds a visible-but-wrong-unit row
-- and actually reaches the enforce_combo_item_unit trigger, instead of
-- failing earlier on RLS invisibility with an unrelated "not found".
insert into public.product_variants (id, product_id, label, variant_kind, price_amount, sort_order, publication_status) values
  ('a1000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-00000000000a', '3 ml', 'decant', 12.00, 0, 'draft'),
  ('b1000000-0000-4000-8000-00000000000b', 'b0000000-0000-4000-8000-00000000000b', '3 ml', 'decant', 10.00, 0, 'draft'),
  ('c1000000-0000-4000-8000-00000000000c', 'c0000000-0000-4000-8000-00000000000c', '3 ml', 'decant', 11.00, 0, 'draft'),
  ('d1000000-0000-4000-8000-00000000000d', 'd0000000-0000-4000-8000-00000000000d', '3 ml', 'decant', 9.00, 0, 'published');

insert into public.inventory (product_variant_id, inventory_mode, availability_status) values
  ('a1000000-0000-4000-8000-00000000000a', 'status_only', 'available'),
  ('b1000000-0000-4000-8000-00000000000b', 'status_only', 'available'),
  ('c1000000-0000-4000-8000-00000000000c', 'status_only', 'available'),
  ('d1000000-0000-4000-8000-00000000000d', 'status_only', 'available');

-- ---------------------------------------------------------------------------
-- Anonymous cannot call any of these
-- ---------------------------------------------------------------------------

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select throws_ok(
  $$select public.admin_create_combo('a0000000-0000-4000-8000-00000000000a')$$,
  '42501',
  null,
  'anon cannot call admin_create_combo'
);

reset role;

-- ---------------------------------------------------------------------------
-- Parfums admin: create a combo on an eligible product
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","role":"authenticated"}';

select lives_ok(
  $$select public.admin_create_combo('a0000000-0000-4000-8000-00000000000a')$$,
  'Parfums admin creates a combo on Product A'
);

select is(
  (select composition_verification_status from public.combos where product_id = 'a0000000-0000-4000-8000-00000000000a'),
  'pending_reconfirmation',
  'a new combo defaults to pending_reconfirmation, never client_confirmed by inference'
);

select is(
  (select count(*)::int from public.audit_log
     where entity_type = 'combo' and action = 'create'
       and entity_id = (select id from public.combos where product_id = 'a0000000-0000-4000-8000-00000000000a')),
  1,
  'combo creation wrote exactly one audit_log row'
);

-- Max one combo per product.
select throws_ok(
  $$select public.admin_create_combo('a0000000-0000-4000-8000-00000000000a')$$,
  '23505',
  null,
  'a second combo on the same product is rejected'
);

-- Cannot create a combo on an archived product.
select lives_ok(
  $$select public.admin_archive_product(
      'c0000000-0000-4000-8000-00000000000c',
      (select updated_at from public.products where id = 'c0000000-0000-4000-8000-00000000000c')
    )$$,
  'Product C archives cleanly (no combo references it yet)'
);

select throws_ok(
  $$select public.admin_create_combo('c0000000-0000-4000-8000-00000000000c')$$,
  '22023',
  null,
  'cannot create a combo for an archived product'
);

select lives_ok(
  $$select public.admin_restore_product(
      'c0000000-0000-4000-8000-00000000000c',
      (select updated_at from public.products where id = 'c0000000-0000-4000-8000-00000000000c')
    )$$,
  'Product C restored for the rest of the test'
);

-- ---------------------------------------------------------------------------
-- Composition: add B and C, atomically
-- ---------------------------------------------------------------------------

select lives_ok(
  $$select public.admin_set_combo_composition(
      (select id from public.combos where product_id = 'a0000000-0000-4000-8000-00000000000a'),
      (select updated_at from public.combos where product_id = 'a0000000-0000-4000-8000-00000000000a'),
      '[
        {"product_variant_id": "b1000000-0000-4000-8000-00000000000b", "quantity": 2, "sort_order": 0},
        {"product_variant_id": "c1000000-0000-4000-8000-00000000000c", "quantity": 1, "sort_order": 1}
      ]'::jsonb
    )$$,
  'Parfums admin sets a two-item composition atomically'
);

select is(
  (select count(*)::int from public.combo_items ci
    join public.combos c on c.id = ci.combo_id
    where c.product_id = 'a0000000-0000-4000-8000-00000000000a'),
  2,
  'the combo now has exactly two items'
);

select is(
  (select count(*)::int from public.audit_log
     where entity_type = 'combo' and action = 'composition_update'
       and entity_id = (select id from public.combos where product_id = 'a0000000-0000-4000-8000-00000000000a')),
  1,
  'the composition replace wrote exactly one audit_log row'
);

-- Duplicate variant within the same submission is rejected by the unique
-- constraint, not silently deduplicated.
select throws_ok(
  $$select public.admin_set_combo_composition(
      (select id from public.combos where product_id = 'a0000000-0000-4000-8000-00000000000a'),
      (select updated_at from public.combos where product_id = 'a0000000-0000-4000-8000-00000000000a'),
      '[
        {"product_variant_id": "b1000000-0000-4000-8000-00000000000b", "quantity": 1, "sort_order": 0},
        {"product_variant_id": "b1000000-0000-4000-8000-00000000000b", "quantity": 1, "sort_order": 1}
      ]'::jsonb
    )$$,
  '23505',
  null,
  'a duplicate variant within one composition submission is rejected'
);

-- The failed submission above must not have partially applied — the combo
-- still has its original two items, not zero and not a partial duplicate set.
select is(
  (select count(*)::int from public.combo_items ci
    join public.combos c on c.id = ci.combo_id
    where c.product_id = 'a0000000-0000-4000-8000-00000000000a'),
  2,
  'a rejected composition replace leaves the previous composition intact (no partial write)'
);

-- Self-reference: a combo cannot include a variant of its own product.
select throws_ok(
  $$select public.admin_set_combo_composition(
      (select id from public.combos where product_id = 'a0000000-0000-4000-8000-00000000000a'),
      (select updated_at from public.combos where product_id = 'a0000000-0000-4000-8000-00000000000a'),
      '[
        {"product_variant_id": "b1000000-0000-4000-8000-00000000000b", "quantity": 2, "sort_order": 0},
        {"product_variant_id": "c1000000-0000-4000-8000-00000000000c", "quantity": 1, "sort_order": 1},
        {"product_variant_id": "a1000000-0000-4000-8000-00000000000a", "quantity": 1, "sort_order": 2}
      ]'::jsonb
    )$$,
  '23514',
  null,
  'a combo cannot include a variant of its own product (self-reference)'
);

-- Cross-unit: an Import variant cannot enter a Parfums combo's composition.
select throws_ok(
  $$select public.admin_set_combo_composition(
      (select id from public.combos where product_id = 'a0000000-0000-4000-8000-00000000000a'),
      (select updated_at from public.combos where product_id = 'a0000000-0000-4000-8000-00000000000a'),
      '[
        {"product_variant_id": "d1000000-0000-4000-8000-00000000000d", "quantity": 1, "sort_order": 0}
      ]'::jsonb
    )$$,
  '23514',
  null,
  'an Import variant cannot be added to a Parfums combo (cross-unit)'
);

-- Archived-product-variant rejection for a *new* addition: archive Product C
-- (and its variant is untouched, but the product itself going archived means
-- a *new* combo could not add it) — actually exercised via a fresh product.
insert into public.products (id, business_unit_id, slug, name, publication_status, archived_at) values
  ('e0000000-0000-4000-8000-00000000000e', '11111111-1111-4111-8111-111111111111', 'combo-test-archived-product', 'TEST Archived Product', 'archived', now());
insert into public.product_variants (id, product_id, label, variant_kind, price_amount, sort_order) values
  ('e1000000-0000-4000-8000-00000000000e', 'e0000000-0000-4000-8000-00000000000e', '3 ml', 'decant', 8.00, 0);
insert into public.inventory (product_variant_id, inventory_mode, availability_status) values
  ('e1000000-0000-4000-8000-00000000000e', 'status_only', 'available');

select throws_ok(
  $$select public.admin_set_combo_composition(
      (select id from public.combos where product_id = 'a0000000-0000-4000-8000-00000000000a'),
      (select updated_at from public.combos where product_id = 'a0000000-0000-4000-8000-00000000000a'),
      '[
        {"product_variant_id": "b1000000-0000-4000-8000-00000000000b", "quantity": 2, "sort_order": 0},
        {"product_variant_id": "c1000000-0000-4000-8000-00000000000c", "quantity": 1, "sort_order": 1},
        {"product_variant_id": "e1000000-0000-4000-8000-00000000000e", "quantity": 1, "sort_order": 2}
      ]'::jsonb
    )$$,
  '22023',
  null,
  'cannot add a variant of an archived product to a combo'
);

-- ---------------------------------------------------------------------------
-- Optimistic concurrency
-- ---------------------------------------------------------------------------

select throws_ok(
  $$select public.admin_set_combo_composition(
      (select id from public.combos where product_id = 'a0000000-0000-4000-8000-00000000000a'),
      '2000-01-01T00:00:00Z'::timestamptz,
      '[{"product_variant_id": "b1000000-0000-4000-8000-00000000000b", "quantity": 5, "sort_order": 0}]'::jsonb
    )$$,
  '40001',
  null,
  'a stale expected_updated_at on composition replace is rejected as a conflict'
);

select throws_ok(
  $$select public.admin_update_combo_verification(
      (select id from public.combos where product_id = 'a0000000-0000-4000-8000-00000000000a'),
      '2000-01-01T00:00:00Z'::timestamptz,
      'client_confirmed'
    )$$,
  '40001',
  null,
  'a stale expected_updated_at on verification update is rejected as a conflict'
);

-- ---------------------------------------------------------------------------
-- Verification status: explicit admin action only, never inferred
-- ---------------------------------------------------------------------------

select lives_ok(
  $$select public.admin_update_combo_verification(
      (select id from public.combos where product_id = 'a0000000-0000-4000-8000-00000000000a'),
      (select updated_at from public.combos where product_id = 'a0000000-0000-4000-8000-00000000000a'),
      'client_confirmed'
    )$$,
  'Parfums admin explicitly confirms the composition'
);

select is(
  (select composition_verification_status from public.combos where product_id = 'a0000000-0000-4000-8000-00000000000a'),
  'client_confirmed',
  'the verification status actually changed'
);

select is(
  (select count(*)::int from public.audit_log
     where entity_type = 'combo' and action = 'verification_update'
       and entity_id = (select id from public.combos where product_id = 'a0000000-0000-4000-8000-00000000000a')),
  1,
  'the verification change wrote exactly one audit_log row'
);

-- ---------------------------------------------------------------------------
-- Archive guard: a variant/product referenced by an *active* combo cannot be
-- archived — the admin must archive the combo (or drop the item) first.
-- ---------------------------------------------------------------------------

select throws_ok(
  $$select public.admin_archive_variant(
      'b1000000-0000-4000-8000-00000000000b',
      (select updated_at from public.product_variants where id = 'b1000000-0000-4000-8000-00000000000b')
    )$$,
  'P2006',
  null,
  'cannot archive a variant referenced by an active combo'
);

select throws_ok(
  $$select public.admin_archive_product(
      'a0000000-0000-4000-8000-00000000000a',
      (select updated_at from public.products where id = 'a0000000-0000-4000-8000-00000000000a')
    )$$,
  'P2006',
  null,
  'cannot archive a product that has an active combo'
);

-- ---------------------------------------------------------------------------
-- Archive is a state change, never a delete
-- ---------------------------------------------------------------------------

select lives_ok(
  $$select public.admin_archive_combo(
      (select id from public.combos where product_id = 'a0000000-0000-4000-8000-00000000000a'),
      (select updated_at from public.combos where product_id = 'a0000000-0000-4000-8000-00000000000a')
    )$$,
  'Parfums admin archives the combo'
);

select is(
  (select count(*)::int from public.combos where product_id = 'a0000000-0000-4000-8000-00000000000a'),
  1,
  'the archived combo row still physically exists (no DELETE)'
);

select is(
  (select count(*)::int from public.combo_items ci
    join public.combos c on c.id = ci.combo_id
    where c.product_id = 'a0000000-0000-4000-8000-00000000000a'),
  2,
  'the archived combo keeps its full composition (no cascade)'
);

select is(
  (select publication_status from public.products where id = 'a0000000-0000-4000-8000-00000000000a'),
  'published',
  'archiving a combo does not touch its product publication_status'
);

-- Now that the combo is archived, its ingredient variant and its own
-- product can both be archived without the P2006 guard firing.
select lives_ok(
  $$select public.admin_archive_variant(
      'b1000000-0000-4000-8000-00000000000b',
      (select updated_at from public.product_variants where id = 'b1000000-0000-4000-8000-00000000000b')
    )$$,
  'once the combo is archived, its ingredient variant can be archived too'
);

select lives_ok(
  $$select public.admin_restore_variant(
      'b1000000-0000-4000-8000-00000000000b',
      (select updated_at from public.product_variants where id = 'b1000000-0000-4000-8000-00000000000b')
    )$$,
  'restore Product B variant so later fixtures/regression checks see it active'
);

select lives_ok(
  $$select public.admin_archive_product(
      'a0000000-0000-4000-8000-00000000000a',
      (select updated_at from public.products where id = 'a0000000-0000-4000-8000-00000000000a')
    )$$,
  'once its combo is archived, Product A itself can be archived'
);

select lives_ok(
  $$select public.admin_restore_product(
      'a0000000-0000-4000-8000-00000000000a',
      (select updated_at from public.products where id = 'a0000000-0000-4000-8000-00000000000a')
    )$$,
  'Product A restored'
);

select lives_ok(
  $$select public.admin_restore_combo(
      (select id from public.combos where product_id = 'a0000000-0000-4000-8000-00000000000a'),
      (select updated_at from public.combos where product_id = 'a0000000-0000-4000-8000-00000000000a')
    )$$,
  'Parfums admin restores the archived combo'
);

select is(
  (select archived_at from public.combos where product_id = 'a0000000-0000-4000-8000-00000000000a'),
  null,
  'the combo is active again'
);

select is(
  (select publication_status from public.products where id = 'a0000000-0000-4000-8000-00000000000a'),
  'draft',
  'restoring a combo does not silently change the product publication_status either'
);

-- ---------------------------------------------------------------------------
-- Cross-unit and role rejection
-- ---------------------------------------------------------------------------

-- Fixture tweak, not an RPC call: admin_restore_product always lands on
-- 'draft' (see the assertions above), which would make Product A invisible
-- to a non-Parfums caller under RLS and turn the next negative assertion
-- into an accidental "row not found" (P0002) test instead of a real
-- "wrong unit, forbidden" (42501) one.
reset role;
update public.products set publication_status = 'published' where id = 'a0000000-0000-4000-8000-00000000000a';
set local role authenticated;
set local request.jwt.claims to '{"sub":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee","role":"authenticated"}';

-- The RPC is unit-agnostic by design (it resolves the unit from the product,
-- not from a hardcoded 'parfums'): an Import admin can create a combo on
-- their own Import product...
select lives_ok(
  $$select public.admin_create_combo('d0000000-0000-4000-8000-00000000000d')$$,
  'an Import admin can create a combo on their own Import product'
);

-- ...but not on a Parfums product.
select throws_ok(
  $$select public.admin_create_combo('a0000000-0000-4000-8000-00000000000a')$$,
  '42501',
  null,
  'an Import admin cannot create a combo on a Parfums product'
);

-- Product A is published and this combo is client_confirmed, so it is
-- actually public-visible at this point (combo_is_public) — the Import
-- admin CAN see the row here, so the correct rejection is assert_admin_for's
-- 42501, not a P0002 row-invisibility case (that path is exercised by the
-- viewer/anonymous assertions instead).
select throws_ok(
  $$select public.admin_update_combo_verification(
      (select id from public.combos where product_id = 'a0000000-0000-4000-8000-00000000000a'),
      now(), 'client_confirmed'
    )$$,
  '42501',
  null,
  'an Import admin cannot update a Parfums combo even when they can see it'
);

set local request.jwt.claims to '{"sub":"ffffffff-ffff-4fff-8fff-ffffffffffff","role":"authenticated"}';

select throws_ok(
  $$select public.admin_update_combo_verification(
      (select id from public.combos where product_id = 'a0000000-0000-4000-8000-00000000000a'),
      (select updated_at from public.combos where product_id = 'a0000000-0000-4000-8000-00000000000a'),
      'client_confirmed'
    )$$,
  '42501',
  null,
  'a Parfums viewer can see the combo but cannot mutate it'
);

select throws_ok(
  $$select public.admin_set_combo_composition(
      (select id from public.combos where product_id = 'a0000000-0000-4000-8000-00000000000a'),
      (select updated_at from public.combos where product_id = 'a0000000-0000-4000-8000-00000000000a'),
      '[]'::jsonb
    )$$,
  '42501',
  null,
  'a Parfums viewer cannot replace a combo composition either'
);

select * from finish();
rollback;
