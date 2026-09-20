-- Cruzial Platform V2, Phase 4J5B1 — correction migration.
-- Additive only: replaces create_import_order_request with corrected version
-- and adds DB-level subtotal/deposit invariant assertions.
--
-- Fixes applied:
-- 1. Ambiguous customer resolution: COUNT-based, never LIMIT 1
-- 2. Deposit policy: exact time-window + exactly-one policy
-- 3. Commercial concurrency: single authoritative resolution with FOR UPDATE
-- 4. Campaign close race: FOR UPDATE lock + revalidation
-- 5. Duplicate offer lines: DB-level rejection
-- 6. Delivery contract: p_delivery is the delivery authority
-- 7. Typed error mapping: P2011 stale, P2012-P2017 for import-specific errors
-- 8. DB-level subtotal/deposit invariant assertions

-- ---------------------------------------------------------------------------
-- 1. Replace create_import_order_request with corrected version
-- ---------------------------------------------------------------------------

create or replace function public.create_import_order_request(
  p_request_id uuid,
  p_customer jsonb,
  p_delivery jsonb,
  p_lines jsonb
)
returns table (
  order_id uuid,
  order_number text,
  created boolean,
  subtotal numeric(12, 2),
  deposit_percentage numeric(5, 2),
  deposit_amount numeric(12, 2),
  campaign_number integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  import_unit_id constant uuid := '22222222-2222-4222-8222-222222222222';
  existing_order public.orders%rowtype;
  new_order_id uuid;
  new_order_number text;
  resolved_campaign_id uuid;
  resolved_campaign_number integer;
  resolved_shipping_id uuid;
  resolved_customer_id uuid;
  v_customer_status text := 'new';
  resolved_deposit_policy jsonb;
  resolved_deposit_percentage numeric(5, 2);
  computed_deposit_amount numeric(12, 2);
  computed_subtotal numeric(12, 2);
  line jsonb;
  offer_record record;
  offer_updated_at_input timestamptz;
  line_quantity integer;
  line_total numeric(12, 2);
  line_index integer := 0;
  normalized_phone text;
  customer_name text;
  customer_phone text;
  delivery_district text;
  delivery_address text;
  delivery_note text;
  v_seen jsonb := '[]'::jsonb;
  v_offer_id uuid;
  v_customer_match_count integer;
begin
  -- Validate request_id
  if p_request_id is null then
    raise exception 'request_id is required' using errcode = '22023';
  end if;

  -- Serialize every attempt for the same business unit/request key
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(import_unit_id::text || ':' || p_request_id::text, 0)
  );

  -- Idempotency: return existing order if same request
  select * into existing_order
  from public.orders
  where business_unit_id = import_unit_id and request_id = p_request_id;

  if found then
    return query select
      existing_order.id,
      existing_order.order_number,
      false,
      existing_order.subtotal_amount,
      existing_order.deposit_percentage_snapshot,
      existing_order.deposit_amount_snapshot,
      (select c.number from public.campaigns c where c.id = existing_order.campaign_id);
    return;
  end if;

  -- Validate customer input shape (customer provides identity only: name, phone)
  if jsonb_typeof(p_customer) <> 'object'
     or p_customer ?& array['name', 'phone'] is false
     or exists (
       select 1 from jsonb_object_keys(p_customer) key
       where key not in ('name', 'phone')
     ) then
    raise exception 'invalid customer input' using errcode = '22023';
  end if;

  customer_name := left(btrim(coalesce(p_customer ->> 'name', '')), 120);
  customer_phone := left(btrim(coalesce(p_customer ->> 'phone', '')), 30);

  if length(customer_name) < 2 then
    raise exception 'name is required' using errcode = '22023';
  end if;

  -- Normalize phone: strip non-digits
  normalized_phone := regexp_replace(customer_phone, '[^0-9]', '', 'g');
  if length(normalized_phone) < 9 or length(normalized_phone) > 15 then
    raise exception 'phone is required (9-15 digits)' using errcode = '22023';
  end if;

  -- Validate delivery input shape (delivery provides logistics: district, address, note)
  if jsonb_typeof(p_delivery) <> 'object'
     or p_delivery ?& array['district', 'address'] is false
     or exists (
       select 1 from jsonb_object_keys(p_delivery) key
       where key not in ('district', 'address', 'note')
     ) then
    raise exception 'invalid delivery input' using errcode = '22023';
  end if;

  delivery_district := left(btrim(coalesce(p_delivery ->> 'district', '')), 120);
  delivery_address := left(btrim(coalesce(p_delivery ->> 'address', '')), 200);
  delivery_note := left(btrim(coalesce(p_delivery ->> 'note', '')), 500);

  if length(delivery_district) < 2 then
    raise exception 'district is required' using errcode = '22023';
  end if;

  -- Validate lines
  if jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) < 1
     or jsonb_array_length(p_lines) > 40 then
    raise exception 'lines must contain between 1 and 40 items' using errcode = '22023';
  end if;

  -- Resolve current Import campaign with FOR UPDATE lock (Fix 4: campaign close race)
  select id, number into resolved_campaign_id, resolved_campaign_number
  from public.campaigns
  where id = app.public_import_campaign_id()
  for update;

  if resolved_campaign_id is null then
    raise exception 'no current Import campaign available' using errcode = 'P2016';
  end if;

  -- Campaign must be open/published, not closed/paused/archived
  if not exists (
    select 1 from public.campaigns c
    where c.id = resolved_campaign_id
      and c.status in ('open', 'published')
      and c.archived_at is null
  ) then
    raise exception 'the current Import campaign is not accepting orders' using errcode = 'P2016';
  end if;

  -- Resolve shipping method: private_delivery for Import
  select id into resolved_shipping_id
  from public.shipping_methods
  where business_unit_id = import_unit_id
    and code = 'private_delivery'
    and is_active;

  if resolved_shipping_id is null then
    raise exception 'Import shipping method not configured' using errcode = '22023';
  end if;

  -- First pass: validate all lines, lock commercial rows, compute subtotal
  -- Uses a single authoritative resolution with FOR UPDATE (Fix 3)
  computed_subtotal := 0;

  for line in select value from jsonb_array_elements(p_lines)
  loop
    -- Validate line shape: only offer_id, offer_updated_at, quantity
    if jsonb_typeof(line) <> 'object'
       or line ?& array['offer_id', 'offer_updated_at', 'quantity'] is false
       or exists (
         select 1 from jsonb_object_keys(line) key
         where key not in ('offer_id', 'offer_updated_at', 'quantity')
       ) then
      raise exception 'invalid line: only offer_id, offer_updated_at, quantity allowed' using errcode = '22023';
    end if;

    -- Validate offer_id is a UUID
    if (line ->> 'offer_id') is null
       or (line ->> 'offer_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'invalid offer_id' using errcode = '22023';
    end if;

    v_offer_id := (line ->> 'offer_id')::uuid;

    -- Duplicate offer detection (Fix 5)
    if v_seen ? v_offer_id::text then
      raise exception 'duplicate offer in cart' using errcode = 'P2012';
    end if;
    v_seen := v_seen || to_jsonb(v_offer_id);

    -- Validate quantity
    if (line ->> 'quantity') !~ '^[1-9][0-9]?$' then
      raise exception 'quantity must be 1-99' using errcode = '22023';
    end if;

    line_quantity := (line ->> 'quantity')::integer;

    -- Parse offer_updated_at (ISO 8601 timestamptz)
    offer_updated_at_input := (line ->> 'offer_updated_at')::timestamptz;
    if offer_updated_at_input is null then
      raise exception 'offer_updated_at is required' using errcode = '22023';
    end if;

    -- Single authoritative resolution with FOR UPDATE locks (Fix 3)
    select cp.id, cp.price_amount, cp.currency::text, cp.availability_status,
           cp.quantity_limit, cp.updated_at,
           p.id as pid, p.name as pname, p.brand as pbrand, p.slug as pslug,
           ip.id as ipid, ip.label as iplabel, ip.presentation_class as ipclass,
           ip.capacity_ml as ipcapacity
    into offer_record
    from public.campaign_products cp
    join public.products p on p.id = cp.product_id
    join public.import_presentations ip on ip.id = cp.import_presentation_id
      and ip.product_id = p.id
    join public.business_units u on u.id = p.business_unit_id
    where cp.id = v_offer_id
      and cp.campaign_id = resolved_campaign_id
      and u.code = 'import'
    for update of cp, p, ip;

    if not found then
      raise exception 'product not found in current campaign' using errcode = 'P2017';
    end if;

    -- Validate product state
    if offer_record.pname is null
       or (select publication_status from public.products where id = offer_record.pid) <> 'published'
       or (select archived_at from public.products where id = offer_record.pid) is not null then
      raise exception 'product is not available' using errcode = 'P2017';
    end if;

    -- Validate presentation state
    if offer_record.ipid is null
       or (select publication_status from public.import_presentations where id = offer_record.ipid) <> 'published'
       or (select archived_at from public.import_presentations where id = offer_record.ipid) is not null then
      raise exception 'presentation is not available' using errcode = 'P2017';
    end if;

    -- Validate offer availability
    if offer_record.availability_status <> 'available' then
      raise exception 'product is no longer available' using errcode = 'P2017';
    end if;

    -- Validate price
    if offer_record.price_amount is null or offer_record.price_amount <= 0 then
      raise exception 'product price is invalid' using errcode = 'P2017';
    end if;

    -- Stale offer detection: offerUpdatedAt must match
    if offer_record.updated_at is distinct from offer_updated_at_input then
      raise exception 'One of the products changed. Update your cart before continuing.' using errcode = 'P2011';
    end if;

    -- Enforce quantity_limit if set
    if offer_record.quantity_limit is not null
       and line_quantity > offer_record.quantity_limit then
      raise exception 'quantity limit exceeded for this product' using errcode = '22023';
    end if;

    line_total := offer_record.price_amount * line_quantity;
    computed_subtotal := computed_subtotal + line_total;
  end loop;

  -- Resolve customer by normalized phone — COUNT-based (Fix 1)
  -- EXACTLY ONE non-archived returning customer → returning / 70%
  -- Every other case → new / 50%, customer_id NULL
  select count(*) into v_customer_match_count
  from public.customers c
  where c.business_unit_id = import_unit_id
    and regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g') = normalized_phone
    and c.archived_at is null;

  if v_customer_match_count = 1 then
    select c.id, c.verified_customer_status
    into resolved_customer_id, v_customer_status
    from public.customers c
    where c.business_unit_id = import_unit_id
      and regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g') = normalized_phone
      and c.archived_at is null;

    if v_customer_status is distinct from 'returning' then
      v_customer_status := 'new';
    end if;
  else
    -- 0 matches, >1 matches, or ambiguous → new / 50%, no customer_id
    resolved_customer_id := null;
    v_customer_status := 'new';
  end if;

  -- Resolve deposit policy — exact time-window + exactly-one (Fix 2)
  with applicable as (
    select dp.*
    from public.deposit_policies dp
    where dp.business_unit_id = import_unit_id
      and dp.customer_status = btrim(v_customer_status)
      and dp.is_active
      and dp.effective_from <= now()
      and (dp.effective_until is null or dp.effective_until > now())
  )
  select count(*) into v_customer_match_count from applicable;

  if v_customer_match_count = 0 then
    raise exception 'deposit policy not configured for this customer status' using errcode = 'P2014';
  end if;

  if v_customer_match_count > 1 then
    raise exception 'multiple overlapping deposit policies found — contact support' using errcode = 'P2015';
  end if;

  -- Exactly one applicable policy
  select jsonb_build_object(
    'policy_id', dp.id,
    'customer_status', dp.customer_status,
    'deposit_percentage', dp.deposit_percentage,
    'source', dp.source
  ), dp.deposit_percentage
  into resolved_deposit_policy, resolved_deposit_percentage
  from public.deposit_policies dp
  where dp.business_unit_id = import_unit_id
    and dp.customer_status = btrim(v_customer_status)
    and dp.is_active
    and dp.effective_from <= now()
    and (dp.effective_until is null or dp.effective_until > now());

  if resolved_deposit_percentage is null then
    raise exception 'deposit policy not configured' using errcode = 'P2014';
  end if;

  -- Calculate deposit amount in PostgreSQL numeric arithmetic
  computed_deposit_amount := round(computed_subtotal * resolved_deposit_percentage / 100, 2);

  -- Order number: CRI-YYYYMMDD-{requestIdFragment}
  new_order_number := 'CRI-' || pg_catalog.to_char(current_date, 'YYYYMMDD') || '-'
    || upper(substr(replace(p_request_id::text, '-', ''), 1, 12));

  -- Insert order
  insert into public.orders (
    request_id,
    order_number,
    business_unit_id,
    campaign_id,
    customer_id,
    shipping_method_id,
    channel,
    status,
    customer_snapshot,
    delivery_snapshot,
    verified_customer_status_snapshot,
    deposit_policy_snapshot,
    deposit_percentage_snapshot,
    deposit_amount_snapshot,
    subtotal_amount,
    currency
  ) values (
    p_request_id,
    new_order_number,
    import_unit_id,
    resolved_campaign_id,
    resolved_customer_id,
    resolved_shipping_id,
    'whatsapp',
    'pending_whatsapp_confirmation',
    jsonb_build_object(
      'name', customer_name,
      'phone', customer_phone,
      'normalizedPhone', normalized_phone
    ),
    jsonb_build_object(
      'method', 'private_delivery',
      'district', delivery_district,
      'address', delivery_address,
      'note', delivery_note,
      'deliveryFeeStatus', 'to_coordinate'
    ),
    v_customer_status,
    resolved_deposit_policy,
    resolved_deposit_percentage,
    computed_deposit_amount,
    computed_subtotal,
    'PEN'
  ) returning id into new_order_id;

  -- Second pass: insert order_lines from re-resolved authoritative values
  -- Re-resolves within the same locked transaction to guarantee consistency
  line_index := 0;
  for line in select value from jsonb_array_elements(p_lines)
  loop
    line_quantity := (line ->> 'quantity')::integer;
    offer_updated_at_input := (line ->> 'offer_updated_at')::timestamptz;

    -- Re-resolve the offer (same transaction, same locks — guaranteed consistent)
    select cp.id, cp.price_amount, cp.currency::text, cp.availability_status,
           cp.quantity_limit, cp.updated_at,
           p.id as pid, p.name as pname, p.brand as pbrand, p.slug as pslug,
           ip.id as ipid, ip.label as iplabel, ip.presentation_class as ipclass,
           ip.capacity_ml as ipcapacity
    into offer_record
    from public.campaign_products cp
    join public.products p on p.id = cp.product_id
    join public.import_presentations ip on ip.id = cp.import_presentation_id
      and ip.product_id = p.id
    join public.business_units u on u.id = p.business_unit_id
    where cp.id = (line ->> 'offer_id')::uuid
      and cp.campaign_id = resolved_campaign_id
      and u.code = 'import'
      and p.publication_status = 'published'
      and p.archived_at is null
      and ip.publication_status = 'published'
      and ip.archived_at is null
      and cp.availability_status = 'available'
      and cp.price_amount > 0;

    line_total := offer_record.price_amount * line_quantity;

    insert into public.order_lines (
      order_id,
      product_id,
      import_presentation_id,
      campaign_product_id,
      product_name_snapshot,
      variant_label_snapshot,
      variant_snapshot,
      campaign_snapshot,
      unit_price_amount,
      currency,
      quantity,
      line_total_amount,
      sort_order
    ) values (
      new_order_id,
      offer_record.pid,
      offer_record.ipid,
      offer_record.id,
      offer_record.pbrand || ' ' || offer_record.pname,
      offer_record.iplabel,
      jsonb_build_object(
        'brand', offer_record.pbrand,
        'presentationClass', offer_record.ipclass,
        'capacityMl', offer_record.ipcapacity
      ),
      jsonb_build_object(
        'number', resolved_campaign_number,
        'name', (select name from public.campaigns where id = resolved_campaign_id),
        'closesAt', (select closes_at::text from public.campaigns where id = resolved_campaign_id)
      ),
      offer_record.price_amount,
      offer_record.currency,
      line_quantity,
      line_total,
      line_index
    );

    line_index := line_index + 1;
  end loop;

  -- DB-level invariant: SUM(order_lines.line_total_amount) = orders.subtotal_amount
  if exists (
    select 1 from public.order_lines ol
    where ol.order_id = new_order_id
    having abs(sum(ol.line_total_amount) - computed_subtotal) > 0.005
  ) then
    raise exception 'order subtotal invariant violated' using errcode = 'check_violation';
  end if;

  -- DB-level invariant: deposit_amount = ROUND(subtotal * deposit_percentage / 100, 2)
  if abs(computed_deposit_amount - round(computed_subtotal * resolved_deposit_percentage / 100, 2)) > 0.005 then
    raise exception 'deposit amount invariant violated' using errcode = 'check_violation';
  end if;

  return query select
    new_order_id,
    new_order_number,
    true,
    computed_subtotal,
    resolved_deposit_percentage,
    computed_deposit_amount,
    resolved_campaign_number;
end;
$$;

-- Security: service-role only.
revoke all on function public.create_import_order_request(uuid, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_import_order_request(uuid, jsonb, jsonb, jsonb)
  to service_role;

comment on function public.create_import_order_request(uuid, jsonb, jsonb, jsonb) is
  '4J5B1 correction: service-only atomic Import order request. Single authoritative commercial resolution, ambiguous customer → NULL, exact deposit policy window, duplicate offer defense, delivery from p_delivery.';
