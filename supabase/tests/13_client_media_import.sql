-- Cruzial Platform V2 — controlled client media import (Phase 4F2B)
--
-- Exercises 20260908150000_controlled_client_media_import.sql: operator-only
-- ACL, product resolution by (business_unit, legacy_id), INSERT-or-verify
-- semantics, primary-collision refusal (never crashes on the unique index),
-- state-mismatch conflict (never overwrites admin-modified media), and
-- idempotency (a second identical apply is 0 insert / all unchanged).

begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

select ok(not has_function_privilege('anon', 'app.plan_parfums_media_import(jsonb)', 'execute'), 'anon cannot plan media import');
select ok(not has_function_privilege('authenticated', 'app.plan_parfums_media_import(jsonb)', 'execute'), 'authenticated cannot plan media import');
select ok(not has_function_privilege('service_role', 'app.plan_parfums_media_import(jsonb)', 'execute'), 'service role cannot plan media import');
select ok(not has_function_privilege('anon', 'app.apply_parfums_media_import(jsonb)', 'execute'), 'anon cannot apply media import');
select ok(not has_function_privilege('authenticated', 'app.apply_parfums_media_import(jsonb)', 'execute'), 'authenticated cannot apply media import');
select ok(not has_function_privilege('service_role', 'app.apply_parfums_media_import(jsonb)', 'execute'), 'service role cannot apply media import');
select ok(has_function_privilege('postgres', 'app.apply_parfums_media_import(jsonb)', 'execute'), 'database operator can apply media import');

-- ---------------------------------------------------------------------------
-- Fixtures: two Parfums products with a legacy_id, one Import product
-- ---------------------------------------------------------------------------

insert into public.products (id, business_unit_id, slug, name, legacy_id, publication_status) values
  ('f2b00000-0000-4000-8000-00000000000a', '11111111-1111-4111-8111-111111111111', 'phase-4f2b-a', 'Phase 4F2B Product A', 'phase-4f2b-a', 'draft'),
  ('f2b00000-0000-4000-8000-00000000000b', '11111111-1111-4111-8111-111111111111', 'phase-4f2b-b', 'Phase 4F2B Product B', 'phase-4f2b-b', 'draft'),
  ('f2b00000-0000-4000-8000-00000000000d', '22222222-2222-4222-8222-222222222222', 'phase-4f2b-import', 'Phase 4F2B Import Product', 'phase-4f2b-import', 'draft');

create temporary table phase4f2b_manifest (payload jsonb not null);
insert into phase4f2b_manifest values (
  jsonb_build_object(
    'metadata', jsonb_build_object('business_unit_code', 'parfums', 'source', 'client-media-cloudinary.json'),
    'media', jsonb_build_array(
      jsonb_build_object(
        'legacy_id', 'phase-4f2b-a', 'media_role', 'set', 'is_primary', true, 'sort_order', 0,
        'public_id', 'cruzial/parfums/catalog/phase-4f2b-a/set',
        'secure_url', 'https://res.cloudinary.test/phase-4f2b-a-set.png',
        'width', 800, 'height', 800, 'bytes', 12345, 'format', 'png',
        'alt', 'Phase 4F2B Product A', 'checksum', 'sha256-set-a'
      ),
      jsonb_build_object(
        'legacy_id', 'phase-4f2b-a', 'media_role', 'bottle', 'is_primary', false, 'sort_order', 1,
        'public_id', 'cruzial/parfums/catalog/phase-4f2b-a/bottle',
        'secure_url', 'https://res.cloudinary.test/phase-4f2b-a-bottle.png',
        'width', 800, 'height', 800, 'bytes', 12000, 'format', 'png',
        'alt', 'Phase 4F2B Product A', 'checksum', 'sha256-bottle-a'
      )
    )
  )
);

-- ---------------------------------------------------------------------------
-- Fresh dry-run: both rows would insert, no conflicts
-- ---------------------------------------------------------------------------

select is((app.plan_parfums_media_import(payload)->>'conflict_count')::integer, 0, 'fresh dry-run has no conflicts') from phase4f2b_manifest;
select is((app.plan_parfums_media_import(payload)#>>'{operations,media,insert}')::integer, 2, 'dry-run plans both media rows') from phase4f2b_manifest;
select is((app.plan_parfums_media_import(payload)#>>'{operations,media,unchanged}')::integer, 0, 'nothing unchanged yet') from phase4f2b_manifest;

-- ---------------------------------------------------------------------------
-- Apply, then verify idempotency
-- ---------------------------------------------------------------------------

select is((app.apply_parfums_media_import(payload)#>>'{operations,media,insert}')::integer, 2, 'apply inserts both media rows') from phase4f2b_manifest;

select is(
  (select count(*)::int from public.product_media where product_id = 'f2b00000-0000-4000-8000-00000000000a'),
  2,
  'both media rows now exist for Product A'
);

select is(
  (select is_primary from public.product_media where public_id = 'cruzial/parfums/catalog/phase-4f2b-a/set'),
  true,
  'the set image is primary'
);

select is(
  (select metadata->>'legacy_id' from public.product_media where public_id = 'cruzial/parfums/catalog/phase-4f2b-a/set'),
  'phase-4f2b-a',
  'metadata records the legacy_id for traceability'
);

select is((app.plan_parfums_media_import(payload)#>>'{operations,media,insert}')::integer, 0, 'second dry-run plans zero inserts') from phase4f2b_manifest;
select is((app.plan_parfums_media_import(payload)#>>'{operations,media,unchanged}')::integer, 2, 'second dry-run: both rows unchanged') from phase4f2b_manifest;

select is((app.apply_parfums_media_import(payload)#>>'{operations,media,insert}')::integer, 0, 'second apply creates no duplicate rows') from phase4f2b_manifest;
select is(
  (select count(*)::int from public.product_media where product_id = 'f2b00000-0000-4000-8000-00000000000a'),
  2,
  'still exactly two media rows after a second apply (no duplication)'
);

-- ---------------------------------------------------------------------------
-- Product resolution: legacy_id not found is a conflict, never a crash
-- ---------------------------------------------------------------------------

create temporary table phase4f2b_missing_product (payload jsonb not null);
insert into phase4f2b_missing_product values (
  jsonb_build_object(
    'metadata', jsonb_build_object('business_unit_code', 'parfums'),
    'media', jsonb_build_array(
      jsonb_build_object(
        'legacy_id', 'phase-4f2b-does-not-exist', 'media_role', 'bottle', 'is_primary', true, 'sort_order', 0,
        'public_id', 'cruzial/parfums/catalog/phase-4f2b-does-not-exist/bottle',
        'secure_url', 'https://res.cloudinary.test/missing.png',
        'width', 800, 'height', 800, 'bytes', 100, 'format', 'png', 'alt', null, 'checksum', 'sha256-missing'
      )
    )
  )
);

select is((app.plan_parfums_media_import(payload)->>'conflict_count')::integer, 1, 'an unresolvable legacy_id is exactly one conflict') from phase4f2b_missing_product;
select is((app.apply_parfums_media_import(payload)->>'refused')::boolean, true, 'apply refuses a manifest with an unresolved product, rather than throwing') from phase4f2b_missing_product;

-- ---------------------------------------------------------------------------
-- Primary collision: an existing admin-set primary blocks a new one rather
-- than crashing on product_media_single_primary_idx.
-- ---------------------------------------------------------------------------

insert into public.product_media (product_id, public_id, secure_url, provider, is_primary, sort_order)
values ('f2b00000-0000-4000-8000-00000000000b', 'cruzial/parfums/catalog/phase-4f2b-b/admin-uploaded', 'https://res.cloudinary.test/admin.png', 'cloudinary', true, 0);

create temporary table phase4f2b_primary_collision (payload jsonb not null);
insert into phase4f2b_primary_collision values (
  jsonb_build_object(
    'metadata', jsonb_build_object('business_unit_code', 'parfums'),
    'media', jsonb_build_array(
      jsonb_build_object(
        'legacy_id', 'phase-4f2b-b', 'media_role', 'set', 'is_primary', true, 'sort_order', 0,
        'public_id', 'cruzial/parfums/catalog/phase-4f2b-b/set',
        'secure_url', 'https://res.cloudinary.test/phase-4f2b-b-set.png',
        'width', 800, 'height', 800, 'bytes', 100, 'format', 'png', 'alt', null, 'checksum', 'sha256-b-set'
      )
    )
  )
);

select is((app.plan_parfums_media_import(payload)->>'conflict_count')::integer, 1, 'a pre-existing admin primary blocks a new primary in the plan') from phase4f2b_primary_collision;
select is(
  (select count(*)::int from public.product_media where product_id = 'f2b00000-0000-4000-8000-00000000000b'),
  1,
  'apply on the primary-collision manifest never inserted a second primary row'
) from (select app.apply_parfums_media_import(payload) from phase4f2b_primary_collision) as _ignore;

-- ---------------------------------------------------------------------------
-- Cross-unit: an Import product's legacy_id is invisible to a Parfums import
-- ---------------------------------------------------------------------------

create temporary table phase4f2b_cross_unit (payload jsonb not null);
insert into phase4f2b_cross_unit values (
  jsonb_build_object(
    'metadata', jsonb_build_object('business_unit_code', 'parfums'),
    'media', jsonb_build_array(
      jsonb_build_object(
        'legacy_id', 'phase-4f2b-import', 'media_role', 'bottle', 'is_primary', true, 'sort_order', 0,
        'public_id', 'cruzial/parfums/catalog/phase-4f2b-import/bottle',
        'secure_url', 'https://res.cloudinary.test/import.png',
        'width', 800, 'height', 800, 'bytes', 100, 'format', 'png', 'alt', null, 'checksum', 'sha256-import'
      )
    )
  )
);

select is((app.plan_parfums_media_import(payload)->>'conflict_count')::integer, 1, 'an Import-unit legacy_id is not resolved by a Parfums media import') from phase4f2b_cross_unit;

select * from finish();
rollback;
