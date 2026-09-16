-- 4K2-B0.1: Supabase-aware Parfums order-request persistence.
--
-- This v2 RPC accepts real product_id and product_variant_id from the
-- server-revalidated catalog, while preserving legacy identifiers as
-- optional provenance. Historical orders created by the v1 RPC remain
-- valid and readable.
--
-- 4K2-B0.1 corrections:
-- - All lines MUST carry both product_id and product_variant_id (no mixed authority).
-- - variant.product_id = product_id is enforced in a single atomic lookup.
-- - Canonical price_amount is obtained from product_variants in DB, never trusted from client.
-- - unit_price_amount is removed from the v2 input contract.
-- - Subtotal derives exclusively from database canonical prices.
--
-- 4K2-B0.2: currency/unit_price_amount stripped from client before RPC.
-- Storefront eligibility enforced server-side: published, non-archived,
-- available, and price_verified within 24 hours. Discontinued products
-- remain eligible (no business rule blocks discontinued orders).

create or replace function public.create_parfums_order_request_v2(
  p_request_id uuid,
  p_customer_snapshot jsonb,
  p_delivery_snapshot jsonb,
  p_shipping_method_code text,
  p_lines jsonb
)
returns table (
  order_id uuid,
  order_number text,
  created boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  parfums_unit_id constant uuid := '11111111-1111-4111-8111-111111111111';
  existing_order public.orders%rowtype;
  new_order_id uuid;
  new_order_number text;
  shipping_id uuid;
  line jsonb;
  line_quantity integer;
  canonical_price numeric(12, 2);
  line_index integer := 0;
  computed_subtotal numeric(12, 2);
  v_variant record;
begin
  if p_request_id is null then
    raise exception 'request_id is required' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(parfums_unit_id::text || ':' || p_request_id::text, 0)
  );

  select * into existing_order
  from public.orders
  where business_unit_id = parfums_unit_id and request_id = p_request_id;

  if found then
    return query select existing_order.id, existing_order.order_number, false;
    return;
  end if;

  if jsonb_typeof(p_customer_snapshot) <> 'object'
     or p_customer_snapshot ?& array['name', 'phone'] is false
     or exists (
       select 1 from jsonb_object_keys(p_customer_snapshot) key
       where key not in ('name', 'phone')
     ) then
    raise exception 'invalid customer snapshot' using errcode = '22023';
  end if;

  if jsonb_typeof(p_delivery_snapshot) <> 'object'
     or p_delivery_snapshot ?& array['district', 'delivery', 'note'] is false
     or exists (
       select 1 from jsonb_object_keys(p_delivery_snapshot) key
       where key not in ('district', 'delivery', 'note')
     ) then
    raise exception 'invalid delivery snapshot' using errcode = '22023';
  end if;

  if jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) < 1
     or jsonb_array_length(p_lines) > 40 then
    raise exception 'lines must contain between 1 and 40 items' using errcode = '22023';
  end if;

  if p_shipping_method_code is not null then
    select id into shipping_id
    from public.shipping_methods
    where business_unit_id = parfums_unit_id
      and code = p_shipping_method_code
      and is_active;
    if not found then
      raise exception 'shipping method is not available' using errcode = '22023';
    end if;
  end if;

  -- Pre-flight: every line must carry both product_id and product_variant_id.
  -- Mixed legacy/supabase authority within a single request is rejected.
  for line in select value from jsonb_array_elements(p_lines)
  loop
    if coalesce(line ->> 'product_id', '') = ''
       or coalesce(line ->> 'product_variant_id', '') = '' then
      raise exception 'v2 requires product_id and product_variant_id on every line'
        using errcode = '22023';
    end if;
  end loop;

  new_order_number := 'CRP-' || pg_catalog.to_char(current_date, 'YYYYMMDD') || '-'
    || upper(substr(replace(p_request_id::text, '-', ''), 1, 12));

  insert into public.orders (
    request_id,
    order_number,
    business_unit_id,
    shipping_method_id,
    channel,
    status,
    customer_id,
    customer_snapshot,
    delivery_snapshot,
    subtotal_amount,
    currency
  ) values (
    p_request_id,
    new_order_number,
    parfums_unit_id,
    shipping_id,
    'whatsapp',
    'draft',
    null,
    p_customer_snapshot,
    p_delivery_snapshot,
    0,
    'PEN'
  ) returning id into new_order_id;

  for line in select value from jsonb_array_elements(p_lines)
  loop
    if jsonb_typeof(line) <> 'object'
       or line ?& array[
         'product_id', 'product_variant_id', 'product_name',
         'variant_label', 'quantity',
         'variant_snapshot'
       ] is false
       or exists (
         select 1 from jsonb_object_keys(line) key
         where key not in (
           'product_id', 'product_variant_id', 'product_name',
           'variant_label', 'quantity',
           'variant_snapshot', 'legacy_product_id', 'legacy_variant_id', 'source'
         )
       ) then
      raise exception 'invalid order line snapshot' using errcode = '22023';
    end if;

    if coalesce(line ->> 'product_name', '') = ''
       or coalesce(line ->> 'variant_label', '') = ''
       or jsonb_typeof(line -> 'variant_snapshot') <> 'object'
       or exists (
         select 1 from jsonb_object_keys(line -> 'variant_snapshot') key
         where key not in ('group', 'size_ml', 'brand', 'combo_contents')
       )
       or line -> 'variant_snapshot' ->> 'group' not in ('decant', 'bottle')
       or jsonb_typeof(line -> 'variant_snapshot' -> 'size_ml') <> 'number'
       or coalesce(line -> 'variant_snapshot' ->> 'brand', '') = ''
       or (
         line -> 'variant_snapshot' ? 'combo_contents'
         and jsonb_typeof(line -> 'variant_snapshot' -> 'combo_contents') <> 'array'
       )
       or (line ->> 'quantity') !~ '^[1-9][0-9]?$' then
      raise exception 'invalid order line values' using errcode = '22023';
    end if;

    line_quantity := (line ->> 'quantity')::integer;

    -- Single atomic lookup: resolve product + variant, enforce ownership,
    -- enforce storefront eligibility (published, purchasable, fresh price),
    -- obtain canonical price from database truth. Never trust client price.
    -- Discontinued products remain eligible (no business rule blocks them).
    select
      v.id,
      v.price_amount,
      v.currency
    into v_variant
    from public.product_variants v
    join public.products p on p.id = v.product_id
    where v.id = (line ->> 'product_variant_id')::uuid
      and p.id = (line ->> 'product_id')::uuid
      and p.business_unit_id = parfums_unit_id
      and p.archived_at is null
      and v.archived_at is null
      and p.publication_status = 'published'
      and p.purchasable = true
      and p.price_verified_at is not null
      and p.price_verified_at >= now() - interval '24 hours';

    if v_variant.id is null then
      raise exception 'product/variant not found, not published, not purchasable, or price unverified'
        using errcode = '22023';
    end if;

    canonical_price := v_variant.price_amount;
    if v_variant.currency <> 'PEN' then
      raise exception 'variant currency is not PEN' using errcode = '22023';
    end if;

    insert into public.order_lines (
      order_id,
      product_id,
      product_variant_id,
      product_name_snapshot,
      variant_label_snapshot,
      variant_snapshot,
      unit_price_amount,
      currency,
      quantity,
      line_total_amount,
      sort_order
    ) values (
      new_order_id,
      (line ->> 'product_id')::uuid,
      (line ->> 'product_variant_id')::uuid,
      line ->> 'product_name',
      line ->> 'variant_label',
      jsonb_build_object(
        'group', line -> 'variant_snapshot' ->> 'group',
        'size_ml', line -> 'variant_snapshot' ->> 'size_ml',
        'brand', line -> 'variant_snapshot' ->> 'brand'
      )
      || case when line ->> 'legacy_product_id' is not null
           then jsonb_build_object('legacy_product_id', line ->> 'legacy_product_id')
           else '{}'::jsonb end
      || case when line ->> 'legacy_variant_id' is not null
           then jsonb_build_object('legacy_variant_id', line ->> 'legacy_variant_id')
           else '{}'::jsonb end
      || case when line ->> 'source' is not null
           then jsonb_build_object('source', line ->> 'source')
           else '{}'::jsonb end
      || case
        when line -> 'variant_snapshot' ? 'combo_contents'
          then jsonb_build_object('combo_contents', line -> 'variant_snapshot' -> 'combo_contents')
        else '{}'::jsonb
      end,
      canonical_price,
      'PEN',
      line_quantity,
      canonical_price * line_quantity,
      line_index
    );
    line_index := line_index + 1;
  end loop;

  select sum(ol.line_total_amount) into computed_subtotal
  from public.order_lines ol
  where ol.order_id = new_order_id;

  update public.orders
  set subtotal_amount = computed_subtotal,
      status = 'pending_whatsapp_confirmation'
  where id = new_order_id;

  return query select new_order_id, new_order_number, true;
end;
$$;

revoke all on function public.create_parfums_order_request_v2(uuid, jsonb, jsonb, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_parfums_order_request_v2(uuid, jsonb, jsonb, text, jsonb)
  to service_role;

comment on function public.create_parfums_order_request_v2(uuid, jsonb, jsonb, text, jsonb) is
  '4K2-B0.2: Service-only atomic persistence for a Supabase-aware Parfums order request. All lines must carry product_id + product_variant_id. Storefront eligibility enforced server-side. Canonical price from DB, never client-supplied.';
