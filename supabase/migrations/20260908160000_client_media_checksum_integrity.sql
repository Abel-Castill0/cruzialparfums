-- Cruzial Platform V2 — client media checksum/provenance integrity hardening
-- (Phase 4F2B correctness patch, section 3)
--
-- 20260908150000_controlled_client_media_import.sql is already applied to
-- staging and is NOT rewritten here — this is a strictly additive migration:
-- a one-time backfill of the already-migrated rows, plus a `create or
-- replace` of the same two operator-only functions (the established pattern
-- in this codebase for hardening an already-shipped function — see how
-- 20260908040000_admin_parfums_combo_mutations.sql re-declares
-- admin_archive_variant/admin_archive_product without touching the earlier
-- migration file that first created them).
--
-- Two independent problems fixed:
-- 1. product_media.checksum was left NULL on every Phase 4F2B insert; the
--    value only ever landed inside metadata.source_sha256. Backfilled here,
--    scoped tightly to rows this phase actually owns (never touches Admin-
--    uploaded Phase 4F1 media or anything else).
-- 2. plan/apply's "unchanged vs conflict" comparison did not look at
--    checksum or provenance metadata at all, so an existing row at the same
--    public_id with a different (or forged) checksum/provenance would have
--    been reported UNCHANGED. It is now part of the comparison, and a
--    mismatch is a CONFLICT — never silently accepted, never silently
--    overwritten (still no UPDATE anywhere in this file).

-- ---------------------------------------------------------------------------
-- 1. One-time backfill — provably Phase-4F2B-owned rows only
-- ---------------------------------------------------------------------------

update public.product_media
set checksum = metadata->>'source_sha256'
where provider = 'cloudinary'
  and metadata->>'migration_source' = 'phase_4f2b_client_media'
  and checksum is null
  -- Validate the stored value actually looks like a sha256 hex digest
  -- before trusting it into a real column; anything else is left alone
  -- rather than backfilled with a value that cannot be verified.
  and metadata->>'source_sha256' ~ '^[0-9a-f]{64}$';

-- ---------------------------------------------------------------------------
-- 2. plan/apply: checksum + provenance now part of unchanged-vs-conflict
-- ---------------------------------------------------------------------------

create or replace function app.plan_parfums_media_import(p_manifest jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_unit_id uuid;
  v_media_json jsonb;
  v_product public.products%rowtype;
  v_existing public.product_media%rowtype;
  v_active_primary public.product_media%rowtype;
  v_expected jsonb;
  v_actual jsonb;
  v_expected_provenance jsonb;
  v_conflicts jsonb := '[]'::jsonb;
  v_insert integer := 0;
  v_unchanged integer := 0;
  v_conflict integer := 0;
begin
  if p_manifest is null
     or jsonb_typeof(p_manifest) <> 'object'
     or p_manifest #>> '{metadata,business_unit_code}' <> 'parfums'
  then
    raise exception 'client media import requires a Parfums media manifest'
      using errcode = '22023';
  end if;

  select id into strict v_business_unit_id
  from public.business_units
  where code = 'parfums';

  -- A manifest that claims two primaries for the same product is a
  -- generation bug in the migration script, not a per-row DB conflict —
  -- catch it once, up front, exactly like the commercial import's
  -- DUPLICATE_MANIFEST_LEGACY_ID guard.
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_manifest->'media', '[]'::jsonb)) item
    where (item->>'is_primary')::boolean
    group by item->>'legacy_id'
    having count(*) > 1
  ) then
    v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
      'entity', 'manifest', 'code', 'DUPLICATE_MANIFEST_PRIMARY', 'identity', 'media'
    ));
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_manifest->'media', '[]'::jsonb)) item
    group by item->>'public_id'
    having count(*) > 1
  ) then
    v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
      'entity', 'manifest', 'code', 'DUPLICATE_MANIFEST_PUBLIC_ID', 'identity', 'media'
    ));
  end if;

  for v_media_json in
    select value from jsonb_array_elements(coalesce(p_manifest->'media', '[]'::jsonb))
    order by value->>'legacy_id', value->>'sort_order'
  loop
    v_product := null;
    select * into v_product
    from public.products
    where business_unit_id = v_business_unit_id
      and legacy_id = v_media_json->>'legacy_id';

    if v_product.id is null then
      v_conflict := v_conflict + 1;
      v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
        'entity', 'media', 'code', 'PRODUCT_NOT_FOUND', 'identity', v_media_json->>'legacy_id'
      ));
      continue;
    end if;

    -- A manifest entry wants to become the product's active primary, but an
    -- active primary already exists at a *different* public_id (e.g. an
    -- admin uploaded one by hand through the Phase 4F1 UI). Inserting would
    -- violate product_media_single_primary_idx — surface it as a plan
    -- conflict instead of letting apply crash on a raw constraint violation.
    if (v_media_json->>'is_primary')::boolean then
      v_active_primary := null;
      select * into v_active_primary
      from public.product_media
      where product_id = v_product.id and is_primary and archived_at is null
        and public_id is distinct from v_media_json->>'public_id';

      if v_active_primary.id is not null then
        v_conflict := v_conflict + 1;
        v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
          'entity', 'media', 'code', 'PRODUCT_ALREADY_HAS_PRIMARY', 'identity', v_media_json->>'legacy_id'
        ));
        continue;
      end if;
    end if;

    v_expected := jsonb_build_object(
      'product_variant_id', null,
      'provider', 'cloudinary',
      'secure_url', v_media_json->>'secure_url',
      'width', (v_media_json->>'width')::integer,
      'height', (v_media_json->>'height')::integer,
      'bytes', (v_media_json->>'bytes')::integer,
      'format', v_media_json->>'format',
      'alt', v_media_json->>'alt',
      'sort_order', (v_media_json->>'sort_order')::integer,
      'is_primary', (v_media_json->>'is_primary')::boolean,
      'archived_at', null,
      'checksum', v_media_json->>'checksum'
    );

    -- Provenance is checked as containment (@>), not full metadata
    -- equality: an existing row is allowed to carry extra, unrelated
    -- metadata keys (e.g. added by a later phase) without that being
    -- treated as a conflict — but it must still agree on these four,
    -- because they are what makes a row provably Phase-4F2B-owned.
    v_expected_provenance := jsonb_build_object(
      'legacy_id', v_media_json->>'legacy_id',
      'media_role', v_media_json->>'media_role',
      'source_sha256', v_media_json->>'checksum',
      'migration_source', 'phase_4f2b_client_media'
    );

    v_existing := null;
    select * into v_existing
    from public.product_media
    where product_id = v_product.id and public_id = v_media_json->>'public_id';

    if v_existing.id is null then
      v_insert := v_insert + 1;
    else
      v_actual := jsonb_build_object(
        'product_variant_id', v_existing.product_variant_id,
        'provider', v_existing.provider,
        'secure_url', v_existing.secure_url,
        'width', v_existing.width,
        'height', v_existing.height,
        'bytes', v_existing.bytes,
        'format', v_existing.format,
        'alt', v_existing.alt,
        'sort_order', v_existing.sort_order,
        'is_primary', v_existing.is_primary,
        'archived_at', v_existing.archived_at,
        'checksum', v_existing.checksum
      );
      if v_actual = v_expected and coalesce(v_existing.metadata, '{}'::jsonb) @> v_expected_provenance then
        v_unchanged := v_unchanged + 1;
      else
        v_conflict := v_conflict + 1;
        v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
          'entity', 'media', 'code', 'MEDIA_STATE_MISMATCH',
          'identity', v_media_json->>'public_id', 'expected', v_expected, 'actual', v_actual,
          'expected_provenance', v_expected_provenance, 'actual_metadata', v_existing.metadata
        ));
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'mode', 'dry_run',
    'applied', false,
    'refused', false,
    'operations', jsonb_build_object(
      'media', jsonb_build_object('insert', v_insert, 'unchanged', v_unchanged, 'conflict', v_conflict)
    ),
    'conflict_count', jsonb_array_length(v_conflicts),
    'conflicts', v_conflicts
  );
end;
$$;

revoke all on function app.plan_parfums_media_import(jsonb) from public, anon, authenticated, service_role;
grant execute on function app.plan_parfums_media_import(jsonb) to postgres;

create or replace function app.apply_parfums_media_import(p_manifest jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan jsonb;
  v_business_unit_id uuid;
  v_media_json jsonb;
  v_product_id uuid;
begin
  -- Serialize the plan/apply boundary against concurrent product_media
  -- writes (an admin using the Phase 4F1 UI, or a concurrent migration run).
  lock table public.product_media in share row exclusive mode;

  v_plan := app.plan_parfums_media_import(p_manifest);
  if (v_plan->>'conflict_count')::integer > 0 then
    return v_plan || jsonb_build_object('mode', 'apply', 'refused', true);
  end if;

  select id into strict v_business_unit_id
  from public.business_units
  where code = 'parfums';

  for v_media_json in
    select value from jsonb_array_elements(coalesce(p_manifest->'media', '[]'::jsonb))
    order by value->>'legacy_id', value->>'sort_order'
  loop
    select id into v_product_id
    from public.products
    where business_unit_id = v_business_unit_id
      and legacy_id = v_media_json->>'legacy_id';

    if not exists (
      select 1 from public.product_media
      where product_id = v_product_id and public_id = v_media_json->>'public_id'
    ) then
      insert into public.product_media (
        product_id, product_variant_id, provider, public_id, secure_url,
        width, height, bytes, format, alt, sort_order, is_primary, checksum, metadata
      ) values (
        v_product_id, null, 'cloudinary', v_media_json->>'public_id', v_media_json->>'secure_url',
        (v_media_json->>'width')::integer, (v_media_json->>'height')::integer,
        (v_media_json->>'bytes')::integer, v_media_json->>'format', v_media_json->>'alt',
        (v_media_json->>'sort_order')::integer, (v_media_json->>'is_primary')::boolean,
        v_media_json->>'checksum',
        jsonb_build_object(
          'legacy_id', v_media_json->>'legacy_id',
          'media_role', v_media_json->>'media_role',
          'source_sha256', v_media_json->>'checksum',
          'migration_source', 'phase_4f2b_client_media'
        )
      );
    end if;
  end loop;

  return v_plan || jsonb_build_object('mode', 'apply', 'applied', true, 'refused', false);
end;
$$;

revoke all on function app.apply_parfums_media_import(jsonb) from public, anon, authenticated, service_role;
grant execute on function app.apply_parfums_media_import(jsonb) to postgres;
