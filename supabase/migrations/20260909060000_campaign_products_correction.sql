-- Cruzial Platform V2 — 4J4A correction: RPC hard cap + archived presentation fail-closed

-- 1. RPC hard cap: reject non-array and oversized p_items before the loop.
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
  v_presentation_id uuid;
  v_product_archived boolean;
  v_product_unit_id uuid;
  v_variant_product_id uuid;
  v_variant_archived boolean;
  v_presentation_product_id uuid;
  v_presentation_archived boolean;
  v_availability text;
  v_price_text text;
begin
  select id into v_import_unit_id from public.business_units where code = 'import';
  if v_import_unit_id is null then
    raise exception 'import business unit is not provisioned' using errcode = 'P0002';
  end if;

  select * into v_campaign from public.campaigns where id = p_campaign_id;
  if v_campaign.id is null or v_campaign.business_unit_id <> v_import_unit_id then
    raise exception 'campaign not found' using errcode = 'P0002';
  end if;
  perform app.assert_admin_for(v_import_unit_id);
  if v_campaign.archived_at is not null then
    raise exception 'archived campaigns cannot have their products edited' using errcode = 'P2007';
  end if;

  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items must be a JSON array' using errcode = 'P2009';
  end if;
  if jsonb_array_length(p_items) > 1500 then
    raise exception 'a campaign cannot have more than 1500 offers' using errcode = 'P2009';
  end if;

  for item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (item->>'product_id')::uuid;
    select product.archived_at is not null, product.business_unit_id
      into v_product_archived, v_product_unit_id
    from public.products product where product.id = v_product_id;
    if v_product_unit_id is null then raise exception 'product not found' using errcode = 'P0002'; end if;
    if v_product_unit_id <> v_import_unit_id then raise exception 'product does not belong to Cruzial Import' using errcode = 'P2004'; end if;
    if v_product_archived then raise exception 'cannot add an archived product to a campaign' using errcode = '22023'; end if;

    v_variant_id := nullif(item->>'product_variant_id', '')::uuid;
    v_presentation_id := nullif(item->>'import_presentation_id', '')::uuid;
    if v_variant_id is not null and v_presentation_id is not null then
      raise exception 'an offer cannot reference both variant and import presentation' using errcode = 'P2004';
    end if;

    if v_variant_id is not null then
      select variant.product_id, variant.archived_at is not null
        into v_variant_product_id, v_variant_archived
      from public.product_variants variant where variant.id = v_variant_id;
      if v_variant_product_id is null then raise exception 'variant not found' using errcode = 'P0002'; end if;
      if v_variant_product_id <> v_product_id then raise exception 'variant does not belong to the given product' using errcode = 'P2004'; end if;
      if v_variant_archived then raise exception 'cannot add an archived variant to a campaign' using errcode = '22023'; end if;
    end if;

    if v_presentation_id is not null then
      select presentation.product_id, (presentation.archived_at is not null or presentation.publication_status = 'archived')
        into v_presentation_product_id, v_presentation_archived
      from public.import_presentations presentation where presentation.id = v_presentation_id;
      if v_presentation_product_id is null then raise exception 'import presentation not found' using errcode = 'P0002'; end if;
      if v_presentation_product_id <> v_product_id then raise exception 'import presentation does not belong to the given product' using errcode = 'P2004'; end if;
      if v_presentation_archived then raise exception 'cannot add an archived import presentation to a campaign' using errcode = '22023'; end if;
    end if;

    v_price_text := item->>'price_amount';
    if v_price_text is null or v_price_text !~ '^[0-9]{1,10}(\.[0-9]{1,2})?$' then
      raise exception 'price_amount must be a plain decimal string with at most 2 decimals' using errcode = 'P2009';
    end if;
    v_availability := item->>'availability_status';
    if v_availability is null or v_availability not in ('unconfirmed', 'available', 'out_of_stock') then
      raise exception 'availability_status must be unconfirmed, available or out_of_stock' using errcode = 'P2008';
    end if;
  end loop;

  update public.campaigns set updated_at = now()
  where id = p_campaign_id and updated_at = p_expected_updated_at
  returning * into v_campaign;
  if v_campaign.id is null then raise exception 'campaign was modified by another session' using errcode = '40001'; end if;

  select coalesce(jsonb_agg(to_jsonb(offer)), '[]'::jsonb) into v_before
  from public.campaign_products offer where offer.campaign_id = p_campaign_id;

  select coalesce(jsonb_object_agg(
    coalesce(product_id::text, '') || '::' || coalesce(product_variant_id::text, '') || '::' || coalesce(import_presentation_id::text, ''),
    quantity_limit
  ), '{}'::jsonb)
  into v_existing_limits
  from public.campaign_products where campaign_id = p_campaign_id;

  delete from public.campaign_products where campaign_id = p_campaign_id;
  insert into public.campaign_products (
    campaign_id, product_id, product_variant_id, import_presentation_id,
    price_amount, currency, availability_status, quantity_limit, sort_order
  )
  select
    p_campaign_id,
    (element->>'product_id')::uuid,
    nullif(element->>'product_variant_id', '')::uuid,
    nullif(element->>'import_presentation_id', '')::uuid,
    (element->>'price_amount')::numeric,
    'PEN',
    element->>'availability_status',
    (v_existing_limits ->> (
      coalesce(element->>'product_id', '') || '::' || coalesce(element->>'product_variant_id', '') || '::' || coalesce(element->>'import_presentation_id', '')
    ))::integer,
    (element->>'sort_order')::integer
  from jsonb_array_elements(p_items) element;

  select coalesce(jsonb_agg(to_jsonb(offer)), '[]'::jsonb) into v_after
  from public.campaign_products offer where offer.campaign_id = p_campaign_id;
  perform app.write_audit_log(v_import_unit_id, 'composition_update', 'campaign', p_campaign_id, v_before, v_after);
  return query select * from public.campaign_products where campaign_id = p_campaign_id order by sort_order;
end;
$$;

comment on function public.admin_set_campaign_products(uuid, timestamptz, jsonb) is
  '4J4A+correction: audited full-replace for Import campaign offers. Hard cap 1500 items, rejects non-array p_items. Blocks archived presentations (archived_at or publication_status=archived). Supports price-free structural import_presentations; validates exact decimal text and fail-closed availability including unconfirmed.';
