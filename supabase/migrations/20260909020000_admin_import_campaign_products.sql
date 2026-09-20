-- Cruzial Platform V2 — Admin Import: Campaign Products / Prices /
-- Availability (Phase 4J2)
--
-- campaign_products is the per-campaign line-item table: price, currency,
-- availability and quantity_limit all belong to the CAMPAIGN, never to the
-- base product (client-decisions.md, Import/Consolidados: "products/prices/
-- availability may differ by campaign"). This migration adds the sole write
-- path for that table — a full-replace RPC, exactly the same shape as
-- admin_set_combo_composition (20260908040000_admin_parfums_combo_mutations.sql)
-- for combo_items: the admin UI holds the whole desired line-item set
-- client-side and submits it as one array on save.
--
-- Unlike admin_set_combo_composition, this one must be SECURITY DEFINER:
-- authenticated has no table-level write grant on campaign_products at all
-- (revoked in 20260909000000_admin_import_consolidados.sql, Phase 4J1,
-- specifically so 4J2 could not inherit an unaudited bypass). The parent
-- campaign's own updated_at is still the optimistic-concurrency token,
-- bumped by this call — same reasoning as the combo composition RPC:
-- campaign_products has no independent version column of its own to check
-- against the client's stale-or-not belief.
--
-- Intrinsically Import-scoped exactly like the 4J1 correction
-- (20260909010000_admin_import_consolidados_unit_scope_fix.sql): the Import
-- business_unit_id is resolved server-side, never trusted from a parameter,
-- and a campaign_id belonging to another unit is rejected identically to a
-- nonexistent one (P0002) — no cross-unit enumeration.

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
  item jsonb;
  v_product_id uuid;
  v_variant_id uuid;
  v_product_archived boolean;
  v_product_unit_id uuid;
  v_variant_product_id uuid;
  v_variant_archived boolean;
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
  -- same product and not be archived either. Mirrors
  -- admin_set_combo_composition's per-item guard loop.
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
    coalesce(elem->>'availability_status', 'available'),
    nullif(elem->>'quantity_limit', '')::integer,
    (elem->>'sort_order')::integer
  from jsonb_array_elements(p_items) as elem;

  select coalesce(jsonb_agg(to_jsonb(cp)), '[]'::jsonb) into v_after
  from public.campaign_products cp where cp.campaign_id = p_campaign_id;

  perform app.write_audit_log(v_import_unit_id, 'composition_update', 'campaign', p_campaign_id, v_before, v_after);

  return query select * from public.campaign_products where campaign_id = p_campaign_id order by sort_order;
end;
$$;

revoke all on function public.admin_set_campaign_products(uuid, timestamptz, jsonb) from public;
grant execute on function public.admin_set_campaign_products(uuid, timestamptz, jsonb) to authenticated;

comment on function public.admin_set_campaign_products is
  'Sole write path for campaign_products — full replace, one transaction, '
  'exactly like admin_set_combo_composition for combo_items. SECURITY '
  'DEFINER because authenticated has no table-level write grant on '
  'campaign_products (revoked in Phase 4J1). Intrinsically Import-scoped: '
  'resolves the Import business_unit_id itself and rejects a campaign_id '
  'belonging to another unit identically to a nonexistent one (P0002). '
  'currency is always ''PEN'' — never a parameter, since Import '
  'currency/price-display policy is UNKNOWN. The parent campaign''s '
  'updated_at is the concurrency token, bumped by this call.';
