-- Cruzial Platform V2 — Admin Import: 4J2 correctness correction
--
-- Additive correction over 20260909020000_admin_import_campaign_products.sql
-- (never edited — already applied to staging). Fixes three confirmed 4J2
-- defects in admin_set_campaign_products and adds the deferred
-- admin_duplicate_campaign RPC.
--
--   1. EXACT DECIMAL MONEY — the RPC already cast price_amount from jsonb
--      TEXT straight to numeric (no float ever involved on this side); the
--      bug was entirely in the TypeScript layer above it (fixed separately
--      in campaign-products-schema.ts). This migration adds a defense-in-
--      depth syntax guard here too, since this SECURITY DEFINER RPC is
--      reachable directly through supabase-js by any Import admin, not only
--      through the Next.js server action that already validates.
--
--   2. AVAILABILITY FAIL-CLOSED — coalesce(elem->>'availability_status',
--      'available') silently turned a missing/unsupported value into
--      available. Replaced with an explicit allow-list check that raises
--      instead.
--
--   3. QUANTITY_LIMIT — quantity_limit is not a confirmed Import business
--      feature (docs/client-decisions.md) and the browser must never be
--      able to set or overwrite it. The RPC no longer reads quantity_limit
--      from p_items at all: it preserves each existing association's
--      current value (matched by product_id + product_variant_id) across
--      the full-replace, and a brand-new association always gets NULL.

create or replace function public.admin_set_campaign_products(
  p_campaign_id uuid,
  p_expected_updated_at timestamptz,
  p_items jsonb
)
returns setof public.campaign_products
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import_unit_id uuid;
  v_campaign public.campaigns;
  v_before jsonb;
  v_after jsonb;
  v_existing_limits jsonb;
  item jsonb;
  v_product_id uuid;
  v_variant_id uuid;
  v_product_archived boolean;
  v_product_unit_id uuid;
  v_variant_product_id uuid;
  v_variant_archived boolean;
  v_availability text;
  v_price_text text;
begin
  select id into v_import_unit_id from public.business_units where code = 'import';
  if v_import_unit_id is null then
    raise exception 'import business unit is not provisioned' using errcode = 'P0002';
  end if;

  select * into v_campaign from public.campaigns where id = p_campaign_id;
  if v_campaign.id is null or v_campaign.business_unit_id <> v_import_unit_id then
    -- Not found, and "found but belongs to another unit", look identical —
    -- same posture as admin_update_campaign after the 4J1 correction.
    raise exception 'campaign not found' using errcode = 'P0002';
  end if;

  perform app.assert_admin_for(v_import_unit_id);

  if v_campaign.archived_at is not null then
    raise exception 'archived campaigns cannot have their products edited' using errcode = 'P2007';
  end if;

  -- Validate every item up front: each product must exist, belong to
  -- Import, and not be archived; an included variant must belong to that
  -- same product and not be archived either. availability_status and
  -- price_amount syntax are validated here too (defense in depth — the app
  -- layer already validates, but this RPC is independently callable).
  -- Mirrors admin_set_combo_composition's per-item guard loop.
  for item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (item->>'product_id')::uuid;

    select p.archived_at is not null, p.business_unit_id
      into v_product_archived, v_product_unit_id
    from public.products p
    where p.id = v_product_id;

    if v_product_unit_id is null then
      raise exception 'product not found' using errcode = 'P0002';
    end if;
    if v_product_unit_id <> v_import_unit_id then
      raise exception 'product does not belong to Cruzial Import' using errcode = 'P2004';
    end if;
    if v_product_archived then
      raise exception 'cannot add an archived product to a campaign' using errcode = '22023';
    end if;

    v_variant_id := nullif(item->>'product_variant_id', '')::uuid;
    if v_variant_id is not null then
      select v.product_id, v.archived_at is not null
        into v_variant_product_id, v_variant_archived
      from public.product_variants v
      where v.id = v_variant_id;

      if v_variant_product_id is null then
        raise exception 'variant not found' using errcode = 'P0002';
      end if;
      if v_variant_product_id <> v_product_id then
        raise exception 'variant does not belong to the given product' using errcode = 'P2004';
      end if;
      if v_variant_archived then
        raise exception 'cannot add an archived variant to a campaign' using errcode = '22023';
      end if;
    end if;

    -- Exact decimal money: 1-10 integer digits (numeric(12,2) max), an
    -- optional '.', 1-2 fraction digits. No sign, no scientific notation.
    -- Never cast through float — this regex + the later ::numeric cast on
    -- the same jsonb text is the only arithmetic path.
    v_price_text := item->>'price_amount';
    if v_price_text is null or v_price_text !~ '^[0-9]{1,10}(\.[0-9]{1,2})?$' then
      raise exception 'price_amount must be a plain decimal string with at most 2 decimals' using errcode = 'P2009';
    end if;

    -- Fail-closed availability: only exactly 'available' or 'out_of_stock'
    -- is valid. Never silently default a missing/unsupported value.
    v_availability := item->>'availability_status';
    if v_availability is null or v_availability not in ('available', 'out_of_stock') then
      raise exception 'availability_status must be available or out_of_stock' using errcode = 'P2008';
    end if;
  end loop;

  -- The concurrency gate doubles as the atomicity boundary: if this UPDATE
  -- matches zero rows, nothing below it runs either.
  update public.campaigns
  set updated_at = now()
  where id = p_campaign_id and updated_at = p_expected_updated_at
  returning * into v_campaign;

  if v_campaign.id is null then
    raise exception 'campaign was modified by another session' using errcode = '40001';
  end if;

  select coalesce(jsonb_agg(to_jsonb(cp)), '[]'::jsonb) into v_before
  from public.campaign_products cp where cp.campaign_id = p_campaign_id;

  -- Snapshot quantity_limit per (product_id, product_variant_id) BEFORE the
  -- delete below erases the rows, so it can be preserved across the
  -- replace. quantity_limit is never read from p_items — the browser has no
  -- path to set or overwrite it. A brand-new association (key absent from
  -- this map) gets NULL, exactly as a fresh insert always has.
  select coalesce(
    jsonb_object_agg(
      coalesce(product_id::text, '') || '::' || coalesce(product_variant_id::text, ''),
      quantity_limit
    ),
    '{}'::jsonb
  )
  into v_existing_limits
  from public.campaign_products
  where campaign_id = p_campaign_id;

  delete from public.campaign_products where campaign_id = p_campaign_id;

  insert into public.campaign_products (
    campaign_id, product_id, product_variant_id, price_amount, currency,
    availability_status, quantity_limit, sort_order
  )
  select
    p_campaign_id,
    (elem->>'product_id')::uuid,
    nullif(elem->>'product_variant_id', '')::uuid,
    (elem->>'price_amount')::numeric,
    -- Currency is never a client parameter: Import price-display/currency
    -- policy is UNKNOWN in docs/client-decisions.md, so this never lets a
    -- caller pick one — it is always the same 'PEN' default the column
    -- itself already carries.
    'PEN',
    elem->>'availability_status',
    (v_existing_limits ->> (
      coalesce(elem->>'product_id', '') || '::' || coalesce(elem->>'product_variant_id', '')
    ))::integer,
    (elem->>'sort_order')::integer
  from jsonb_array_elements(p_items) as elem;

  select coalesce(jsonb_agg(to_jsonb(cp)), '[]'::jsonb) into v_after
  from public.campaign_products cp where cp.campaign_id = p_campaign_id;

  perform app.write_audit_log(v_import_unit_id, 'composition_update', 'campaign', p_campaign_id, v_before, v_after);

  return query select * from public.campaign_products where campaign_id = p_campaign_id order by sort_order;
end;
$$;

comment on function public.admin_set_campaign_products is
  '4J2 correction: fail-closed availability_status (no default), exact '
  'decimal price_amount syntax guard, and quantity_limit preserved '
  'server-side by (product_id, product_variant_id) across the full replace '
  '— never read from p_items, so the browser cannot set or overwrite it. '
  'New associations always get quantity_limit = NULL. Sole write path for '
  'campaign_products — full replace, one transaction, exactly like '
  'admin_set_combo_composition for combo_items. SECURITY DEFINER because '
  'authenticated has no table-level write grant on campaign_products '
  '(revoked in Phase 4J1). Intrinsically Import-scoped. currency is always '
  '''PEN''.';

-- ---------------------------------------------------------------------------
-- admin_duplicate_campaign — deferred 4J1 scope, implemented now.
-- ---------------------------------------------------------------------------
--
-- One atomic SECURITY DEFINER RPC: creates a new draft campaign in Import
-- and copies every campaign_product row from the source campaign exactly
-- (price_amount, currency, availability_status, quantity_limit, sort_order).
-- Never accepts business_unit_id / status / actor_user_id / currency —
-- intrinsically Import-scoped and always lands on draft with dates and
-- public_message reset, exactly like admin_create_campaign never accepting
-- a create-as-open shortcut. public_message is reset to NULL, not copied:
-- no confirmed rule exists for reusing stale campaign-facing marketing text
-- across consolidados (docs/client-decisions.md gap) — copying it forward
-- would risk publishing stale/wrong copy under a new campaign, so NULL is
-- the safer default and the admin re-enters it deliberately if needed.

create or replace function public.admin_duplicate_campaign(
  p_source_campaign_id uuid,
  p_new_number integer,
  p_new_name text
)
returns public.campaigns
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import_unit_id uuid;
  v_source public.campaigns;
  v_new public.campaigns;
  v_new_name text;
  v_copied_count integer;
begin
  select id into v_import_unit_id from public.business_units where code = 'import';
  if v_import_unit_id is null then
    raise exception 'import business unit is not provisioned' using errcode = 'P0002';
  end if;

  select * into v_source from public.campaigns where id = p_source_campaign_id;
  if v_source.id is null or v_source.business_unit_id <> v_import_unit_id then
    -- Not found, and "found but belongs to another unit", look identical.
    raise exception 'source campaign not found' using errcode = 'P0002';
  end if;

  perform app.assert_admin_for(v_import_unit_id);

  if p_new_number is null or p_new_number <= 0 then
    raise exception 'new_number must be greater than 0' using errcode = 'P2010';
  end if;

  v_new_name := btrim(coalesce(p_new_name, ''));
  if v_new_name = '' then
    raise exception 'new_name must not be blank' using errcode = 'P2010';
  end if;

  -- Destination always draft, never auto-open: dates and public_message
  -- reset, not copied. The campaigns_unit_number_unique constraint
  -- (business_unit_id, number) enforces new_number uniqueness — a
  -- collision surfaces as an ordinary 23505 the caller already handles.
  insert into public.campaigns (
    business_unit_id, number, name, status, opens_at, closes_at, public_message
  ) values (
    v_import_unit_id, p_new_number, v_new_name, 'draft', null, null, null
  )
  returning * into v_new;

  insert into public.campaign_products (
    campaign_id, product_id, product_variant_id, price_amount, currency,
    availability_status, quantity_limit, sort_order
  )
  select
    v_new.id, cp.product_id, cp.product_variant_id, cp.price_amount, cp.currency,
    cp.availability_status, cp.quantity_limit, cp.sort_order
  from public.campaign_products cp
  where cp.campaign_id = p_source_campaign_id;

  get diagnostics v_copied_count = row_count;

  -- Bounded audit metadata only — never the copied product array.
  perform app.write_audit_log(
    v_import_unit_id,
    'create',
    'campaign',
    v_new.id,
    jsonb_build_object(
      'source_campaign_id', v_source.id,
      'source_number', v_source.number
    ),
    jsonb_build_object(
      'destination_campaign_id', v_new.id,
      'destination_number', v_new.number,
      'copied_offer_count', v_copied_count
    )
  );

  return v_new;
end;
$$;

revoke all on function public.admin_duplicate_campaign(uuid, integer, text) from public;
grant execute on function public.admin_duplicate_campaign(uuid, integer, text) to authenticated;

comment on function public.admin_duplicate_campaign is
  'Duplicates a source Import campaign into a new draft campaign, copying '
  'every campaign_product row exactly (price/currency/availability/'
  'quantity_limit/sort_order). Dates and public_message are reset — no '
  'confirmed rule exists for carrying stale marketing text forward. Never '
  'accepts business_unit_id/status/actor_user_id/currency; intrinsically '
  'Import-scoped and SECURITY DEFINER for the same reasons as '
  'admin_set_campaign_products. Wrong-unit or missing source looks '
  'identical (P0002). Whole operation is one transaction: any failure '
  '(duplicate number, blank name, missing source) rolls back the entire '
  'insert, leaving no partial destination campaign. Audit metadata is '
  'bounded (source/destination id+number, copied offer count) — never the '
  'full product array.';
