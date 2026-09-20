-- Phase 4E1: public Parfums order-request persistence.
--
-- The public catalogue still lives in assets/data.js. Next.js revalidates the
-- submitted legacy identities and builds immutable snapshots before calling
-- this service-only transaction. Browsers never receive INSERT privileges.

alter table public.orders
  add column request_id uuid;

create unique index orders_business_unit_request_id_unique
  on public.orders (business_unit_id, request_id)
  where request_id is not null;

create or replace function public.create_parfums_order_request(
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
  unit_price numeric(12, 2);
  line_index integer := 0;
  computed_subtotal numeric(12, 2);
begin
  if p_request_id is null then
    raise exception 'request_id is required' using errcode = '22023';
  end if;

  -- Serialize every attempt for the same business unit/request key. This
  -- closes the race where two network retries both observe no existing row.
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
         'legacy_product_id', 'legacy_variant_id', 'source', 'product_name',
         'variant_label', 'unit_price_amount', 'currency', 'quantity',
         'variant_snapshot'
       ] is false
       or exists (
         select 1 from jsonb_object_keys(line) key
         where key not in (
           'legacy_product_id', 'legacy_variant_id', 'source', 'product_name',
           'variant_label', 'unit_price_amount', 'currency', 'quantity',
           'variant_snapshot'
         )
       ) then
      raise exception 'invalid order line snapshot' using errcode = '22023';
    end if;

    if line ->> 'currency' <> 'PEN'
       or line ->> 'source' <> 'assets/data.js'
       or coalesce(line ->> 'legacy_product_id', '') = ''
       or coalesce(line ->> 'legacy_variant_id', '') = ''
       or coalesce(line ->> 'product_name', '') = ''
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
       or (line ->> 'unit_price_amount') !~ '^[0-9]{1,10}(\.[0-9]{1,2})?$'
       or (line ->> 'quantity') !~ '^[1-9][0-9]?$' then
      raise exception 'invalid order line values' using errcode = '22023';
    end if;

    line_quantity := (line ->> 'quantity')::integer;
    unit_price := (line ->> 'unit_price_amount')::numeric(12, 2);
    if unit_price < 0 then
      raise exception 'unit price cannot be negative' using errcode = '22023';
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
      null,
      null,
      line ->> 'product_name',
      line ->> 'variant_label',
      jsonb_build_object(
        'group', line -> 'variant_snapshot' ->> 'group',
        'size_ml', line -> 'variant_snapshot' -> 'size_ml',
        'brand', line -> 'variant_snapshot' ->> 'brand',
        'legacy_product_id', line ->> 'legacy_product_id',
        'legacy_variant_id', line ->> 'legacy_variant_id',
        'source', line ->> 'source'
      ) || case
        when line -> 'variant_snapshot' ? 'combo_contents'
          then jsonb_build_object('combo_contents', line -> 'variant_snapshot' -> 'combo_contents')
        else '{}'::jsonb
      end,
      unit_price,
      'PEN',
      line_quantity,
      unit_price * line_quantity,
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

revoke all on function public.create_parfums_order_request(uuid, jsonb, jsonb, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_parfums_order_request(uuid, jsonb, jsonb, text, jsonb)
  to service_role;

comment on function public.create_parfums_order_request(uuid, jsonb, jsonb, text, jsonb) is
  'Service-only atomic persistence for a Next.js-revalidated legacy Parfums order request.';
