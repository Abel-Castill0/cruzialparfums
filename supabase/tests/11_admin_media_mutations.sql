-- Cruzial Platform V2 — Admin Parfums media mutations (Phase 4F1)
--
-- Exercises 20260908120000_admin_parfums_media_mutations.sql: register (with
-- and without set_primary), variant cross-product/cross-unit rejection,
-- single active primary invariant (register-demotes, set_primary-demotes),
-- refusing to primary an archived row, update (alt/variant), archive clears
-- is_primary without promoting another row, restore never re-primaries,
-- reorder full-replace + cross-product rejection, optimistic concurrency,
-- and admin/viewer/cross-unit/anonymous authorization.

begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('11110000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'parfums-admin-media@example.test', '', now(), now()),
  ('11110000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'import-admin-media@example.test', '', now(), now()),
  ('11110000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'parfums-viewer-media@example.test', '', now(), now());

insert into public.admin_memberships (user_id, business_unit_id, role) values
  ('11110000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'admin'),
  ('11110000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'admin'),
  ('11110000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'viewer');

-- A is 'published' (not because a product needs to be published to carry
-- media, but so the anon/cross-unit assertions below actually exercise
-- assert_admin_for's 42501 — the row is visible, the caller just isn't an
-- admin for its unit — instead of accidentally testing RLS row-invisibility
-- (P0002) on a draft row nobody outside Parfums can see in the first place;
-- same rationale as 07_admin_combo_mutations.sql.
insert into public.products (id, business_unit_id, slug, name, publication_status) values
  ('a2000000-0000-4000-8000-00000000000a', '11111111-1111-4111-8111-111111111111', 'media-test-a', 'TEST Media Product A', 'published'),
  ('b2000000-0000-4000-8000-00000000000b', '11111111-1111-4111-8111-111111111111', 'media-test-b', 'TEST Media Product B', 'draft'),
  ('d2000000-0000-4000-8000-00000000000d', '22222222-2222-4222-8222-222222222222', 'media-test-import', 'TEST Import Media Product', 'draft');

insert into public.product_variants (id, product_id, label, variant_kind, price_amount, sort_order) values
  ('a3000000-0000-4000-8000-00000000000a', 'a2000000-0000-4000-8000-00000000000a', '3 ml', 'decant', 12.00, 0),
  ('b3000000-0000-4000-8000-00000000000b', 'b2000000-0000-4000-8000-00000000000b', '3 ml', 'decant', 10.00, 0);

-- ---------------------------------------------------------------------------
-- Anonymous cannot call any of these
-- ---------------------------------------------------------------------------

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select throws_ok(
  $$select public.admin_register_media('a2000000-0000-4000-8000-00000000000a', 'https://example.test/x.jpg')$$,
  '42501',
  null,
  'anon cannot call admin_register_media'
);

reset role;

-- ---------------------------------------------------------------------------
-- Parfums admin: register two media rows, second as primary
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"11110000-0000-4000-8000-000000000001","role":"authenticated"}';

select lives_ok(
  $$select public.admin_register_media(
      'a2000000-0000-4000-8000-00000000000a', 'https://res.cloudinary.test/img1.jpg',
      'cloudinary', null, 'cruzial/parfums/products/a2/img1', 800, 800, 12345, 'jpg', 'TEST alt 1', false
    )$$,
  'Parfums admin registers the first media row'
);

select is(
  (select count(*)::int from public.audit_log where entity_type = 'product_media' and action = 'create'),
  1,
  'registering media wrote exactly one audit_log row'
);

select lives_ok(
  $$select public.admin_register_media(
      'a2000000-0000-4000-8000-00000000000a', 'https://res.cloudinary.test/img2.jpg',
      'cloudinary', 'a3000000-0000-4000-8000-00000000000a', 'cruzial/parfums/products/a2/img2', 900, 900, 22345, 'jpg', 'TEST alt 2', true
    )$$,
  'Parfums admin registers a second media row as primary, associated to a variant'
);

select is(
  (select count(*)::int from public.product_media
     where product_id = 'a2000000-0000-4000-8000-00000000000a' and is_primary and archived_at is null),
  1,
  'exactly one active primary row exists for the product after register-with-primary'
);

select is(
  (select secure_url from public.product_media
     where product_id = 'a2000000-0000-4000-8000-00000000000a' and is_primary),
  'https://res.cloudinary.test/img2.jpg',
  'the second registered row is the one that ended up primary'
);

-- Variant cross-product rejection.
select throws_ok(
  $$select public.admin_register_media(
      'a2000000-0000-4000-8000-00000000000a', 'https://res.cloudinary.test/bad.jpg',
      'cloudinary', 'b3000000-0000-4000-8000-00000000000b'
    )$$,
  'P2004',
  null,
  'cannot register media on product A associated to a variant of product B'
);

-- ---------------------------------------------------------------------------
-- admin_set_media_primary: demotes the previous primary
-- ---------------------------------------------------------------------------

select lives_ok(
  $$select public.admin_set_media_primary(
      (select id from public.product_media where secure_url = 'https://res.cloudinary.test/img1.jpg'),
      (select updated_at from public.product_media where secure_url = 'https://res.cloudinary.test/img1.jpg')
    )$$,
  'Parfums admin sets the first media row as primary instead'
);

select is(
  (select count(*)::int from public.product_media
     where product_id = 'a2000000-0000-4000-8000-00000000000a' and is_primary and archived_at is null),
  1,
  'still exactly one active primary row after switching primary'
);

select is(
  (select is_primary from public.product_media where secure_url = 'https://res.cloudinary.test/img2.jpg'),
  false,
  'the previously-primary row was demoted'
);

select is(
  (select count(*)::int from public.audit_log where entity_type = 'product_media' and action = 'primary_change'),
  1,
  'set_primary wrote exactly one audit_log row'
);

-- ---------------------------------------------------------------------------
-- admin_update_media: alt + variant association
-- ---------------------------------------------------------------------------

select lives_ok(
  $$select public.admin_update_media(
      (select id from public.product_media where secure_url = 'https://res.cloudinary.test/img2.jpg'),
      (select updated_at from public.product_media where secure_url = 'https://res.cloudinary.test/img2.jpg'),
      'TEST updated alt', 'a3000000-0000-4000-8000-00000000000a'
    )$$,
  'Parfums admin edits alt text and variant association'
);

select is(
  (select alt from public.product_media where secure_url = 'https://res.cloudinary.test/img2.jpg'),
  'TEST updated alt',
  'alt text was actually updated'
);

select throws_ok(
  $$select public.admin_update_media(
      (select id from public.product_media where secure_url = 'https://res.cloudinary.test/img2.jpg'),
      (select updated_at from public.product_media where secure_url = 'https://res.cloudinary.test/img2.jpg'),
      'TEST bad', 'b3000000-0000-4000-8000-00000000000b'
    )$$,
  'P2004',
  null,
  'cannot associate media on product A to a variant of product B'
);

select throws_ok(
  $$select public.admin_update_media(
      (select id from public.product_media where secure_url = 'https://res.cloudinary.test/img2.jpg'),
      '2000-01-01T00:00:00Z'::timestamptz,
      'TEST stale', null
    )$$,
  'P2011',
  null,
  'a stale expected_updated_at on update is rejected as a conflict'
);

-- ---------------------------------------------------------------------------
-- Archive: clears is_primary, never promotes another row; restore never
-- re-primaries.
-- ---------------------------------------------------------------------------

select lives_ok(
  $$select public.admin_archive_media(
      (select id from public.product_media where secure_url = 'https://res.cloudinary.test/img1.jpg'),
      (select updated_at from public.product_media where secure_url = 'https://res.cloudinary.test/img1.jpg')
    )$$,
  'Parfums admin archives the current primary row'
);

select is(
  (select is_primary from public.product_media where secure_url = 'https://res.cloudinary.test/img1.jpg'),
  false,
  'archiving the primary row clears is_primary on that row'
);

select is(
  (select count(*)::int from public.product_media
     where product_id = 'a2000000-0000-4000-8000-00000000000a' and is_primary and archived_at is null),
  0,
  'the product has no active primary now — nothing was auto-promoted'
);

select is(
  (select count(*)::int from public.product_media where secure_url = 'https://res.cloudinary.test/img1.jpg'),
  1,
  'the archived row still physically exists (no DELETE)'
);

select throws_ok(
  $$select public.admin_set_media_primary(
      (select id from public.product_media where secure_url = 'https://res.cloudinary.test/img1.jpg'),
      (select updated_at from public.product_media where secure_url = 'https://res.cloudinary.test/img1.jpg')
    )$$,
  '22023',
  null,
  'cannot set an archived row as primary'
);

select lives_ok(
  $$select public.admin_restore_media(
      (select id from public.product_media where secure_url = 'https://res.cloudinary.test/img1.jpg'),
      (select updated_at from public.product_media where secure_url = 'https://res.cloudinary.test/img1.jpg')
    )$$,
  'Parfums admin restores the archived row'
);

select is(
  (select is_primary from public.product_media where secure_url = 'https://res.cloudinary.test/img1.jpg'),
  false,
  'the restored row comes back as non-primary — restore never steals primary status'
);

-- ---------------------------------------------------------------------------
-- Reorder: full replace, cross-product rejection
-- ---------------------------------------------------------------------------

select lives_ok(
  $$select public.admin_reorder_media(
      'a2000000-0000-4000-8000-00000000000a',
      json_build_array(
        json_build_object('id', (select id from public.product_media where secure_url = 'https://res.cloudinary.test/img2.jpg'), 'sort_order', 0),
        json_build_object('id', (select id from public.product_media where secure_url = 'https://res.cloudinary.test/img1.jpg'), 'sort_order', 1)
      )::jsonb
    )$$,
  'Parfums admin reorders the product media'
);

select is(
  (select sort_order from public.product_media where secure_url = 'https://res.cloudinary.test/img2.jpg'),
  0,
  'sort_order was actually applied'
);

select is(
  (select count(*)::int from public.audit_log where entity_type = 'product_media' and action = 'reorder'),
  1,
  'reorder wrote exactly one audit_log row'
);

select lives_ok(
  $$select public.admin_register_media('b2000000-0000-4000-8000-00000000000b', 'https://res.cloudinary.test/other-product.jpg')$$,
  'a second media row is registered on product B, to exercise cross-product reorder rejection'
);

select throws_ok(
  format(
    $$select public.admin_reorder_media(
        'a2000000-0000-4000-8000-00000000000a',
        json_build_array(json_build_object('id', %L, 'sort_order', 0))::jsonb
      )$$,
    (select id from public.product_media where product_id = 'b2000000-0000-4000-8000-00000000000b' limit 1)
  ),
  'P2004',
  null,
  'reordering with a media id belonging to another product is rejected'
);

-- ---------------------------------------------------------------------------
-- Cross-unit and role rejection
-- ---------------------------------------------------------------------------

set local request.jwt.claims to '{"sub":"11110000-0000-4000-8000-000000000002","role":"authenticated"}';

select throws_ok(
  $$select public.admin_register_media('a2000000-0000-4000-8000-00000000000a', 'https://res.cloudinary.test/bad2.jpg')$$,
  '42501',
  null,
  'an Import admin cannot register media on a Parfums product'
);

set local request.jwt.claims to '{"sub":"11110000-0000-4000-8000-000000000003","role":"authenticated"}';

select throws_ok(
  $$select public.admin_register_media('a2000000-0000-4000-8000-00000000000a', 'https://res.cloudinary.test/bad3.jpg')$$,
  '42501',
  null,
  'a Parfums viewer cannot register media'
);

select throws_ok(
  $$select public.admin_set_media_primary(
      (select id from public.product_media where secure_url = 'https://res.cloudinary.test/img2.jpg'),
      (select updated_at from public.product_media where secure_url = 'https://res.cloudinary.test/img2.jpg')
    )$$,
  '42501',
  null,
  'a Parfums viewer cannot change the primary media'
);

select * from finish();
rollback;
