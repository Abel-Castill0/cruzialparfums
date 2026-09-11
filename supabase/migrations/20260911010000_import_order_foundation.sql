-- Cruzial Platform V2, Phase 4J5B1: Import cart contract + server-authoritative
-- order foundation.
--
-- Additive migration only: adds deposit_amount_snapshot on orders,
-- import_presentation_id on order_lines, updates public read model to expose
-- opaque offer handles, and creates the service-only Import order RPC.

-- ---------------------------------------------------------------------------
-- 1. Schema additions
-- ---------------------------------------------------------------------------

-- Deposit amount snapshot: calculated server-side in PostgreSQL numeric
-- arithmetic, never JS floating point.
alter table public.orders
  add column deposit_amount_snapshot numeric(12, 2);

-- Nonnegative check (matches the numeric(12,2) domain).
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_deposit_amount_check'
  ) then
    alter table public.orders
      add constraint orders_deposit_amount_check
      check (deposit_amount_snapshot is null or deposit_amount_snapshot >= 0);
  end if;
end $$;

-- Import presentation FK on order_lines: nullable, ON DELETE SET NULL so
-- archiving a presentation never rewrites order history.
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'order_lines' and column_name = 'import_presentation_id'
  ) then
    alter table public.order_lines
      add column import_presentation_id uuid
      references public.import_presentations(id) on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Public read model: expose opaque offer handles
-- ---------------------------------------------------------------------------
-- Adds offerId (campaign_products.id) and offerUpdatedAt
-- (campaign_products.updated_at) to every presentation in the public catalog
-- and detail RPCs. These are public-safe opaque purchase identifiers.

create or replace function public.public_get_import_current_campaign()
returns table (
  number integer,
  name text,
  opens_at timestamptz,
  closes_at timestamptz,
  public_message text
)
language sql
stable
security definer
set search_path = ''
as $$
  select campaign.number, campaign.name, campaign.opens_at,
    campaign.closes_at, campaign.public_message
  from public.campaigns campaign
  where campaign.id = app.public_import_campaign_id()
$$;

create or replace function public.public_list_import_catalog(
  p_query text default null,
  p_category_slug text default null,
  p_page integer default 1,
  p_page_size integer default 24
)
returns table (
  product_id uuid,
  slug text,
  name text,
  brand text,
  category_slug text,
  category_name text,
  media_url text,
  media_alt text,
  presentations jsonb,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with params as (
    select
      left(btrim(coalesce(p_query, '')), 120) as query,
      nullif(left(btrim(coalesce(p_category_slug, '')), 80), '') as category_slug,
      least(greatest(coalesce(p_page, 1), 1), 100) as page,
      least(greatest(coalesce(p_page_size, 24), 1), 40) as page_size
  ), selected_campaign as (
    select app.public_import_campaign_id() as id
  ), eligible_offers as (
    select offer.id, offer.product_id, offer.import_presentation_id,
      offer.price_amount, offer.currency::text, offer.availability_status,
      offer.sort_order, offer.updated_at, presentation.label,
      presentation.presentation_class, presentation.capacity_ml
    from selected_campaign selected
    join public.campaign_products offer on offer.campaign_id = selected.id
    join public.products product on product.id = offer.product_id
    join public.import_presentations presentation
      on presentation.id = offer.import_presentation_id
      and presentation.product_id = product.id
    join public.business_units unit on unit.id = product.business_unit_id
    where selected.id is not null
      and unit.code = 'import'
      and product.publication_status = 'published'
      and product.archived_at is null
      and presentation.publication_status = 'published'
      and presentation.archived_at is null
      and offer.availability_status in ('available', 'out_of_stock')
      and offer.price_amount > 0
  ), grouped as (
    select
      product.id as product_id,
      product.slug,
      product.name,
      product.brand,
      category.slug as category_slug,
      category.name as category_name,
      media.secure_url as media_url,
      media.alt as media_alt,
      min(offer.sort_order) as first_sort_order,
      jsonb_agg(
        jsonb_build_object(
          'id', offer.import_presentation_id,
          'offerId', offer.id,
          'offerUpdatedAt', offer.updated_at,
          'label', offer.label,
          'class', offer.presentation_class,
          'capacityMl', offer.capacity_ml,
          'price', offer.price_amount::text,
          'currency', offer.currency,
          'availability', offer.availability_status
        ) order by offer.sort_order, offer.label, offer.id
      ) as presentations
    from eligible_offers offer
    join public.products product on product.id = offer.product_id
    cross join params
    left join lateral (
      select c.slug, c.name
      from public.product_categories pc
      join public.categories c on c.id = pc.category_id
      join public.business_units cu on cu.id = c.business_unit_id
      where pc.product_id = product.id
        and cu.code = 'import'
        and c.kind = 'import_category'
        and c.publication_status = 'published'
        and c.archived_at is null
      order by pc.sort_order, c.sort_order, c.id
      limit 1
    ) category on true
    left join lateral (
      select pm.secure_url, pm.alt
      from public.product_media pm
      where pm.product_id = product.id
        and pm.archived_at is null
      order by pm.is_primary desc, pm.sort_order, pm.id
      limit 1
    ) media on true
    where (params.query = ''
      or strpos(lower(product.name), lower(params.query)) > 0
      or strpos(lower(coalesce(product.brand, '')), lower(params.query)) > 0)
      and (params.category_slug is null or exists (
        select 1
        from public.product_categories filter_link
        join public.categories filter_category on filter_category.id = filter_link.category_id
        join public.business_units filter_unit on filter_unit.id = filter_category.business_unit_id
        where filter_link.product_id = product.id
          and filter_unit.code = 'import'
          and filter_category.kind = 'import_category'
          and filter_category.publication_status = 'published'
          and filter_category.archived_at is null
          and filter_category.slug = params.category_slug
      ))
    group by product.id, product.slug, product.name, product.brand,
      category.slug, category.name, media.secure_url, media.alt
  ), counted as (
    select grouped.*, count(*) over () as total_count
    from grouped
  )
  select counted.product_id, counted.slug, counted.name, counted.brand,
    counted.category_slug, counted.category_name, counted.media_url,
    counted.media_alt, counted.presentations, counted.total_count
  from counted
  cross join params
  order by counted.first_sort_order, counted.name, counted.product_id
  limit least(greatest(coalesce(p_page_size, 24), 1), 40)
  offset (
    (least(greatest(coalesce(p_page, 1), 1), 100) - 1)
    * least(greatest(coalesce(p_page_size, 24), 1), 40)
  )
$$;

create or replace function public.public_get_import_product(p_slug text)
returns table (
  product_id uuid,
  slug text,
  name text,
  brand text,
  category_slug text,
  category_name text,
  media_url text,
  media_alt text,
  presentations jsonb,
  campaign_number integer,
  campaign_name text,
  campaign_closes_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with selected_campaign as (
    select campaign.id, campaign.number, campaign.name, campaign.closes_at
    from public.campaigns campaign
    where campaign.id = app.public_import_campaign_id()
  ), eligible_offers as (
    select offer.id, offer.product_id, offer.import_presentation_id,
      offer.price_amount, offer.currency::text, offer.availability_status,
      offer.sort_order, offer.updated_at, presentation.label,
      presentation.presentation_class, presentation.capacity_ml
    from selected_campaign selected
    join public.campaign_products offer on offer.campaign_id = selected.id
    join public.products product on product.id = offer.product_id
    join public.import_presentations presentation
      on presentation.id = offer.import_presentation_id
      and presentation.product_id = product.id
    join public.business_units unit on unit.id = product.business_unit_id
    where unit.code = 'import'
      and product.slug = left(btrim(coalesce(p_slug, '')), 180)
      and product.publication_status = 'published'
      and product.archived_at is null
      and presentation.publication_status = 'published'
      and presentation.archived_at is null
      and offer.availability_status in ('available', 'out_of_stock')
      and offer.price_amount > 0
  )
  select
    product.id,
    product.slug,
    product.name,
    product.brand,
    category.slug,
    category.name,
    media.secure_url,
    media.alt,
    jsonb_agg(
      jsonb_build_object(
        'id', offer.import_presentation_id,
        'offerId', offer.id,
        'offerUpdatedAt', offer.updated_at,
        'label', offer.label,
        'class', offer.presentation_class,
        'capacityMl', offer.capacity_ml,
        'price', offer.price_amount::text,
        'currency', offer.currency,
        'availability', offer.availability_status
      ) order by offer.sort_order, offer.label, offer.id
    ),
    selected.number,
    selected.name,
    selected.closes_at
  from eligible_offers offer
  join public.products product on product.id = offer.product_id
  join selected_campaign selected on true
  left join lateral (
    select c.slug, c.name
    from public.product_categories pc
    join public.categories c on c.id = pc.category_id
    join public.business_units cu on cu.id = c.business_unit_id
    where pc.product_id = product.id
      and cu.code = 'import'
      and c.kind = 'import_category'
      and c.publication_status = 'published'
      and c.archived_at is null
    order by pc.sort_order, c.sort_order, c.id
    limit 1
  ) category on true
  left join lateral (
    select pm.secure_url, pm.alt
    from public.product_media pm
    where pm.product_id = product.id and pm.archived_at is null
    order by pm.is_primary desc, pm.sort_order, pm.id
    limit 1
  ) media on true
  group by product.id, product.slug, product.name, product.brand,
    category.slug, category.name, media.secure_url, media.alt,
    selected.number, selected.name, selected.closes_at
$$;

-- ---------------------------------------------------------------------------
-- 3. Service-only Import order request RPC
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

  -- Validate customer input shape
  if jsonb_typeof(p_customer) <> 'object'
     or p_customer ?& array['name', 'phone'] is false
     or exists (
       select 1 from jsonb_object_keys(p_customer) key
       where key not in ('name', 'phone', 'district', 'address', 'note')
     ) then
    raise exception 'invalid customer input' using errcode = '22023';
  end if;

  customer_name := left(btrim(coalesce(p_customer ->> 'name', '')), 120);
  customer_phone := left(btrim(coalesce(p_customer ->> 'phone', '')), 30);
  delivery_district := left(btrim(coalesce(p_customer ->> 'district', '')), 120);
  delivery_address := left(btrim(coalesce(p_customer ->> 'address', '')), 200);
  delivery_note := left(btrim(coalesce(p_customer ->> 'note', '')), 500);

  if length(customer_name) < 2 then
    raise exception 'name is required' using errcode = '22023';
  end if;

  -- Normalize phone: strip non-digits
  normalized_phone := regexp_replace(customer_phone, '[^0-9]', '', 'g');
  if length(normalized_phone) < 9 or length(normalized_phone) > 15 then
    raise exception 'phone is required (9-15 digits)' using errcode = '22023';
  end if;

  if length(delivery_district) < 2 then
    raise exception 'district is required' using errcode = '22023';
  end if;

  -- Validate delivery input shape
  if jsonb_typeof(p_delivery) <> 'object'
     or p_delivery ?& array['district', 'address', 'note'] is false
     or exists (
       select 1 from jsonb_object_keys(p_delivery) key
       where key not in ('district', 'address', 'note')
     ) then
    raise exception 'invalid delivery input' using errcode = '22023';
  end if;

  -- Validate lines
  if jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) < 1
     or jsonb_array_length(p_lines) > 40 then
    raise exception 'lines must contain between 1 and 40 items' using errcode = '22023';
  end if;

  -- Resolve current Import campaign
  select id, number into resolved_campaign_id, resolved_campaign_number
  from public.campaigns
  where id = app.public_import_campaign_id();

  if resolved_campaign_id is null then
    raise exception 'no current Import campaign available' using errcode = '22023';
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

  -- Resolve customer by normalized phone (exact Import match only)
  select c.id into resolved_customer_id
  from public.customers c
  where c.business_unit_id = import_unit_id
    and regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g') = normalized_phone
    and c.archived_at is null
  limit 1;

  -- Determine server-side customer status
  if resolved_customer_id is not null then
    select verified_customer_status into v_customer_status
    from public.customers
    where id = resolved_customer_id;
    if v_customer_status is distinct from 'returning' then
      v_customer_status := 'new';
    end if;
  else
    v_customer_status := 'new';
  end if;

  -- Order number: CRI-YYYYMMDD-{requestIdFragment}
  new_order_number := 'CRI-' || pg_catalog.to_char(current_date, 'YYYYMMDD') || '-'
    || upper(substr(replace(p_request_id::text, '-', ''), 1, 12));

  -- Build customer snapshot
  -- Build delivery snapshot
  -- (both stored as-is from validated input; commercial truth is server-resolved)

  -- Validate and process each line
  computed_subtotal := 0;

  -- First pass: validate all lines and compute subtotal (no writes yet)
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

    -- Re-resolve the offer server-side
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

    if not found then
      raise exception 'one or more products are no longer available. Update your cart.' using errcode = '22023';
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

  -- Resolve deposit policy
  select jsonb_build_object(
    'policy_id', dp.id,
    'customer_status', dp.customer_status,
    'deposit_percentage', dp.deposit_percentage,
    'source', dp.source,
    'basis', case
      when btrim(v_customer_status) = 'returning' then 'admin_verified_returning'
      else 'default_new'
    end
  ), dp.deposit_percentage
  into resolved_deposit_policy, resolved_deposit_percentage
  from public.deposit_policies dp
  where dp.business_unit_id = import_unit_id
    and dp.customer_status = btrim(v_customer_status)
    and dp.is_active
    and (dp.effective_until is null or dp.effective_until > now())
  order by dp.effective_from desc
  limit 1;

  if resolved_deposit_percentage is null then
    raise exception 'deposit policy not configured' using errcode = '22023';
  end if;

  -- Calculate deposit amount in PostgreSQL numeric arithmetic
  computed_deposit_amount := round(computed_subtotal * resolved_deposit_percentage / 100, 2);

  -- Insert order (with computed values, before lines)
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

  -- Second pass: insert order_lines now that we have the order_id
  line_index := 0;
  for line in select value from jsonb_array_elements(p_lines)
  loop
    line_quantity := (line ->> 'quantity')::integer;
    offer_updated_at_input := (line ->> 'offer_updated_at')::timestamptz;

    -- Re-resolve the offer (already validated in first pass, so this always succeeds)
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

-- Security: service-role only. Anon and authenticated cannot execute directly.
revoke all on function public.create_import_order_request(uuid, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_import_order_request(uuid, jsonb, jsonb, jsonb)
  to service_role;

comment on function public.create_import_order_request(uuid, jsonb, jsonb, jsonb) is
  '4J5B1: service-only atomic Import order request. Revalidates campaign, offers, customer status, and deposit server-side.';

-- ---------------------------------------------------------------------------
-- 4. Direct table write security
-- ---------------------------------------------------------------------------
-- Ensure anon/authenticated cannot insert orders or order_lines directly.
-- The existing RLS already denies this; these are defence-in-depth.

-- Revoke direct INSERT on orders from anon/authenticated if any grant exists
revoke insert on public.orders from anon, authenticated;
revoke insert on public.order_lines from anon, authenticated;
