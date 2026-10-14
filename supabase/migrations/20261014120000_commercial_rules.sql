-- Commercial rules (2026-10-14): shipping agencies, motorcycle delivery zones and promotion rules,
-- plus the two order columns they need. docs/commercial-rules.md explains every decision.
--
-- What this migration does NOT do, on purpose:
--   * It does not load the 43 districts. The list is proposed in docs/commercial-rules.md and
--     supabase/provisioning/delivery-zones-PROPOSED.sql and is applied only after the owner validates it.
--     While delivery_zones is empty the checkout enforces nothing, so deploying this is a no-op for customers.
--   * It does not load the gift exclusion (it needs the product id of "Club de Nuit Precieux I", which differs per
--     environment): supabase/provisioning/commercial-rules-seed.sql resolves it by name and fails loudly if it is not
--     found exactly once.
--   * It does not touch create_parfums_order_request_v2 (the order authority function). The gift is attached with a
--     separate, narrow function after the order exists.
--   * It does not extend audit_log_action_check (other pending branches extend it too; creating, updating and deleting
--     use 'create', 'update' and 'settings_change').

-- ---------------------------------------------------------------------------------------------------------------
-- shipping_agencies: the carriers the business ships with (Shalom today). Pickup points stay in code.
-- ---------------------------------------------------------------------------------------------------------------
create table public.shipping_agencies (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units (id) on delete restrict,
  name text not null,
  coverage text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shipping_agencies_name_check check (char_length(btrim(name)) between 1 and 80),
  constraint shipping_agencies_coverage_check check (char_length(btrim(coverage)) between 1 and 120),
  constraint shipping_agencies_description_check check (description is null or char_length(description) <= 240)
);

create unique index shipping_agencies_unit_name_unique
  on public.shipping_agencies (business_unit_id, lower(btrim(name)));

create trigger shipping_agencies_set_updated_at
  before update on public.shipping_agencies
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------------------------------------------
-- delivery_zones: one row per Lima district. is_restricted only turns the motorcycle option off for that district;
-- it never blocks an order (Shalom stays available).
-- ---------------------------------------------------------------------------------------------------------------
create table public.delivery_zones (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units (id) on delete restrict,
  district text not null,
  is_restricted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_zones_district_check check (char_length(btrim(district)) between 2 and 80)
);

create unique index delivery_zones_unit_district_unique
  on public.delivery_zones (business_unit_id, lower(btrim(district)));

create trigger delivery_zones_set_updated_at
  before update on public.delivery_zones
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------------------------------------------
-- promotion_rules: closed registry of rule types, one row per type and business unit, shape-checked by a trigger.
--   gift_exclusion  conditions {"excluded_product_ids": [uuid, ...]}            actions {}
--   wholesale_mixed conditions {"min_units": n, "count": "bottles"}              actions {"discount_per_unit":
--                   {"arabic": n, "designer": n, "niche": n}, "currency": "PEN"}
-- ---------------------------------------------------------------------------------------------------------------
create table public.promotion_rules (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units (id) on delete restrict,
  rule_type text not null,
  conditions jsonb not null default '{}'::jsonb,
  actions jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promotion_rules_type_check check (rule_type in ('gift_exclusion', 'wholesale_mixed')),
  constraint promotion_rules_unit_type_unique unique (business_unit_id, rule_type)
);

create trigger promotion_rules_set_updated_at
  before update on public.promotion_rules
  for each row execute function app.set_updated_at();

create or replace function app.validate_promotion_rule()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_element jsonb;
  v_key text;
  v_seen text[] := '{}';
begin
  if jsonb_typeof(new.conditions) <> 'object' or jsonb_typeof(new.actions) <> 'object' then
    raise exception 'conditions and actions must be JSON objects' using errcode = '22023';
  end if;

  if new.rule_type = 'gift_exclusion' then
    if exists (select 1 from jsonb_object_keys(new.conditions) k where k <> 'excluded_product_ids')
       or not (new.conditions ? 'excluded_product_ids')
       or jsonb_typeof(new.conditions -> 'excluded_product_ids') <> 'array'
       or jsonb_array_length(new.conditions -> 'excluded_product_ids') > 50
       or new.actions <> '{}'::jsonb then
      raise exception 'gift_exclusion needs conditions {"excluded_product_ids": [...]} (max 50) and empty actions'
        using errcode = '22023';
    end if;
    for v_element in select value from jsonb_array_elements(new.conditions -> 'excluded_product_ids')
    loop
      if jsonb_typeof(v_element) <> 'string'
         or (v_element #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'excluded_product_ids must be product UUIDs' using errcode = '22023';
      end if;
      if (v_element #>> '{}') = any (v_seen) then
        raise exception 'excluded_product_ids must not repeat a product' using errcode = '22023';
      end if;
      v_seen := v_seen || (v_element #>> '{}');
      if not exists (
        select 1 from public.products p
        where p.id = (v_element #>> '{}')::uuid and p.business_unit_id = new.business_unit_id
      ) then
        raise exception 'excluded product % does not exist in this business unit', v_element #>> '{}'
          using errcode = '23503';
      end if;
    end loop;

  elsif new.rule_type = 'wholesale_mixed' then
    if exists (select 1 from jsonb_object_keys(new.conditions) k where k not in ('min_units', 'count'))
       or coalesce(new.conditions ->> 'min_units', '') !~ '^[1-9][0-9]{0,3}$'
       or jsonb_typeof(new.conditions -> 'min_units') <> 'number'
       or new.conditions ->> 'count' is distinct from 'bottles' then
      raise exception 'wholesale_mixed needs conditions {"min_units": 1-9999, "count": "bottles"}' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_object_keys(new.actions) k where k not in ('discount_per_unit', 'currency'))
       or new.actions ->> 'currency' is distinct from 'PEN'
       or jsonb_typeof(new.actions -> 'discount_per_unit') is distinct from 'object' then
      raise exception 'wholesale_mixed needs actions {"discount_per_unit": {...}, "currency": "PEN"}' using errcode = '22023';
    end if;
    for v_key in select k from jsonb_object_keys(new.actions -> 'discount_per_unit') k
    loop
      if v_key not in ('arabic', 'designer', 'niche') then
        raise exception 'discount_per_unit accepts only arabic, designer and niche' using errcode = '22023';
      end if;
    end loop;
    foreach v_key in array array['arabic', 'designer', 'niche']
    loop
      if jsonb_typeof(new.actions -> 'discount_per_unit' -> v_key) is distinct from 'number'
         or (new.actions -> 'discount_per_unit' ->> v_key)::numeric <= 0
         or (new.actions -> 'discount_per_unit' ->> v_key)::numeric > 1000 then
        raise exception 'discount_per_unit.% must be a number between 0 (exclusive) and 1000', v_key using errcode = '22023';
      end if;
    end loop;
  end if;

  return new;
end;
$$;

create trigger promotion_rules_validate
  before insert or update on public.promotion_rules
  for each row execute function app.validate_promotion_rule();

-- ---------------------------------------------------------------------------------------------------------------
-- orders: the shipping fee the operator quotes and the 2 ml gift the customer chose.
-- Neither column is part of the frozen commercial snapshot (app.freeze_order_snapshot lists its columns).
-- ---------------------------------------------------------------------------------------------------------------
alter table public.orders
  add column shipping_cost_cents integer,
  add column gift_product_id uuid references public.products (id) on delete set null,
  add constraint orders_shipping_cost_cents_check check (
    shipping_cost_cents is null or (shipping_cost_cents >= 0 and shipping_cost_cents <= 100000000)
  );

create index orders_gift_product_id_idx on public.orders (gift_product_id) where gift_product_id is not null;

-- ---------------------------------------------------------------------------------------------------------------
-- RLS and grants. Reads: zones and active agencies are public (the checkout needs them); every table is readable by
-- the unit's staff. Writes: only through the admin_* functions below (no table write grant).
-- ---------------------------------------------------------------------------------------------------------------
alter table public.shipping_agencies enable row level security;
alter table public.delivery_zones enable row level security;
alter table public.promotion_rules enable row level security;

create policy shipping_agencies_public_read on public.shipping_agencies
  for select to anon, authenticated
  using (is_active);

create policy shipping_agencies_admin_read on public.shipping_agencies
  for select to authenticated
  using (app.can_read_unit(business_unit_id));

create policy delivery_zones_public_read on public.delivery_zones
  for select to anon, authenticated
  using (true);

create policy promotion_rules_admin_read on public.promotion_rules
  for select to authenticated
  using (app.can_read_unit(business_unit_id));

revoke all on public.shipping_agencies, public.delivery_zones, public.promotion_rules from anon, authenticated;
grant select on public.shipping_agencies, public.delivery_zones to anon, authenticated;
grant select on public.promotion_rules to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Admin functions (SECURITY DEFINER, empty search_path, explicit admin check, optimistic concurrency, audit log).
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.admin_save_delivery_zone(
  p_unit_code text,
  p_id uuid,
  p_expected_updated_at timestamptz,
  p_district text,
  p_is_restricted boolean
)
returns public.delivery_zones
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit uuid;
  v_before public.delivery_zones;
  v_after public.delivery_zones;
begin
  select id into v_unit from public.business_units where code = p_unit_code;
  perform app.assert_admin_for(v_unit);

  if p_id is null then
    insert into public.delivery_zones (business_unit_id, district, is_restricted)
    values (v_unit, btrim(p_district), coalesce(p_is_restricted, false))
    returning * into v_after;
    perform app.write_audit_log(v_unit, 'create', 'delivery_zone', v_after.id, null,
      jsonb_build_object('district', v_after.district, 'is_restricted', v_after.is_restricted));
    return v_after;
  end if;

  select * into v_before from public.delivery_zones where id = p_id and business_unit_id = v_unit;
  if v_before.id is null then
    raise exception 'delivery zone not found' using errcode = 'P0002';
  end if;
  update public.delivery_zones
     set district = btrim(p_district), is_restricted = coalesce(p_is_restricted, false)
   where id = p_id and business_unit_id = v_unit and updated_at = p_expected_updated_at
  returning * into v_after;
  if v_after.id is null then
    raise exception 'delivery zone was modified by another session' using errcode = '40001';
  end if;
  perform app.write_audit_log(v_unit, 'update', 'delivery_zone', v_after.id,
    jsonb_build_object('district', v_before.district, 'is_restricted', v_before.is_restricted),
    jsonb_build_object('district', v_after.district, 'is_restricted', v_after.is_restricted));
  return v_after;
end;
$$;

create or replace function public.admin_delete_delivery_zone(p_unit_code text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit uuid;
  v_before public.delivery_zones;
begin
  select id into v_unit from public.business_units where code = p_unit_code;
  perform app.assert_admin_for(v_unit);
  delete from public.delivery_zones where id = p_id and business_unit_id = v_unit returning * into v_before;
  if v_before.id is null then
    raise exception 'delivery zone not found' using errcode = 'P0002';
  end if;
  perform app.write_audit_log(v_unit, 'settings_change', 'delivery_zone', v_before.id,
    jsonb_build_object('district', v_before.district, 'is_restricted', v_before.is_restricted), null);
end;
$$;

create or replace function public.admin_save_shipping_agency(
  p_unit_code text,
  p_id uuid,
  p_expected_updated_at timestamptz,
  p_name text,
  p_coverage text,
  p_description text,
  p_is_active boolean
)
returns public.shipping_agencies
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit uuid;
  v_before public.shipping_agencies;
  v_after public.shipping_agencies;
begin
  select id into v_unit from public.business_units where code = p_unit_code;
  perform app.assert_admin_for(v_unit);

  if p_id is null then
    insert into public.shipping_agencies (business_unit_id, name, coverage, description, is_active)
    values (v_unit, btrim(p_name), btrim(p_coverage), nullif(btrim(coalesce(p_description, '')), ''), coalesce(p_is_active, true))
    returning * into v_after;
    perform app.write_audit_log(v_unit, 'create', 'shipping_agency', v_after.id, null,
      jsonb_build_object('name', v_after.name, 'coverage', v_after.coverage, 'description', v_after.description, 'is_active', v_after.is_active));
    return v_after;
  end if;

  select * into v_before from public.shipping_agencies where id = p_id and business_unit_id = v_unit;
  if v_before.id is null then
    raise exception 'shipping agency not found' using errcode = 'P0002';
  end if;
  update public.shipping_agencies
     set name = btrim(p_name), coverage = btrim(p_coverage),
         description = nullif(btrim(coalesce(p_description, '')), ''), is_active = coalesce(p_is_active, true)
   where id = p_id and business_unit_id = v_unit and updated_at = p_expected_updated_at
  returning * into v_after;
  if v_after.id is null then
    raise exception 'shipping agency was modified by another session' using errcode = '40001';
  end if;
  perform app.write_audit_log(v_unit, 'update', 'shipping_agency', v_after.id,
    jsonb_build_object('name', v_before.name, 'coverage', v_before.coverage, 'description', v_before.description, 'is_active', v_before.is_active),
    jsonb_build_object('name', v_after.name, 'coverage', v_after.coverage, 'description', v_after.description, 'is_active', v_after.is_active));
  return v_after;
end;
$$;

create or replace function public.admin_delete_shipping_agency(p_unit_code text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit uuid;
  v_before public.shipping_agencies;
begin
  select id into v_unit from public.business_units where code = p_unit_code;
  perform app.assert_admin_for(v_unit);
  delete from public.shipping_agencies where id = p_id and business_unit_id = v_unit returning * into v_before;
  if v_before.id is null then
    raise exception 'shipping agency not found' using errcode = 'P0002';
  end if;
  perform app.write_audit_log(v_unit, 'settings_change', 'shipping_agency', v_before.id,
    jsonb_build_object('name', v_before.name, 'coverage', v_before.coverage, 'is_active', v_before.is_active), null);
end;
$$;

create or replace function public.admin_save_promotion_rule(
  p_unit_code text,
  p_id uuid,
  p_expected_updated_at timestamptz,
  p_rule_type text,
  p_conditions jsonb,
  p_actions jsonb,
  p_is_active boolean
)
returns public.promotion_rules
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit uuid;
  v_before public.promotion_rules;
  v_after public.promotion_rules;
begin
  select id into v_unit from public.business_units where code = p_unit_code;
  perform app.assert_admin_for(v_unit);

  if p_id is null then
    insert into public.promotion_rules (business_unit_id, rule_type, conditions, actions, is_active)
    values (v_unit, p_rule_type, coalesce(p_conditions, '{}'::jsonb), coalesce(p_actions, '{}'::jsonb), coalesce(p_is_active, true))
    returning * into v_after;
    perform app.write_audit_log(v_unit, 'create', 'promotion_rule', v_after.id, null,
      jsonb_build_object('rule_type', v_after.rule_type, 'conditions', v_after.conditions, 'actions', v_after.actions, 'is_active', v_after.is_active));
    return v_after;
  end if;

  select * into v_before from public.promotion_rules where id = p_id and business_unit_id = v_unit;
  if v_before.id is null then
    raise exception 'promotion rule not found' using errcode = 'P0002';
  end if;
  if p_rule_type is distinct from v_before.rule_type then
    raise exception 'the type of a rule cannot change' using errcode = '22023';
  end if;
  update public.promotion_rules
     set conditions = coalesce(p_conditions, '{}'::jsonb), actions = coalesce(p_actions, '{}'::jsonb), is_active = coalesce(p_is_active, true)
   where id = p_id and business_unit_id = v_unit and updated_at = p_expected_updated_at
  returning * into v_after;
  if v_after.id is null then
    raise exception 'promotion rule was modified by another session' using errcode = '40001';
  end if;
  perform app.write_audit_log(v_unit, 'update', 'promotion_rule', v_after.id,
    jsonb_build_object('rule_type', v_before.rule_type, 'conditions', v_before.conditions, 'actions', v_before.actions, 'is_active', v_before.is_active),
    jsonb_build_object('rule_type', v_after.rule_type, 'conditions', v_after.conditions, 'actions', v_after.actions, 'is_active', v_after.is_active));
  return v_after;
end;
$$;

create or replace function public.admin_delete_promotion_rule(p_unit_code text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit uuid;
  v_before public.promotion_rules;
begin
  select id into v_unit from public.business_units where code = p_unit_code;
  perform app.assert_admin_for(v_unit);
  delete from public.promotion_rules where id = p_id and business_unit_id = v_unit returning * into v_before;
  if v_before.id is null then
    raise exception 'promotion rule not found' using errcode = 'P0002';
  end if;
  perform app.write_audit_log(v_unit, 'settings_change', 'promotion_rule', v_before.id,
    jsonb_build_object('rule_type', v_before.rule_type, 'conditions', v_before.conditions, 'actions', v_before.actions, 'is_active', v_before.is_active), null);
end;
$$;

-- The operator-quoted shipping fee of an order (null clears it). Not part of the frozen snapshot, so it can be set at
-- any status; an archived order is left alone.
create or replace function public.admin_parfums_set_order_shipping_cost(p_order_id uuid, p_shipping_cost_cents integer)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit uuid;
  v_before public.orders;
  v_after public.orders;
begin
  select id into v_unit from public.business_units where code = 'parfums';
  perform app.assert_admin_for(v_unit);
  if p_shipping_cost_cents is not null and (p_shipping_cost_cents < 0 or p_shipping_cost_cents > 100000000) then
    raise exception 'shipping cost must be between 0 and 100000000 cents' using errcode = '22023';
  end if;
  select * into v_before from public.orders where id = p_order_id and business_unit_id = v_unit for update;
  if v_before.id is null then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  if v_before.archived_at is not null then
    raise exception 'archived order cannot change its shipping cost' using errcode = 'P2024';
  end if;
  update public.orders set shipping_cost_cents = p_shipping_cost_cents where id = p_order_id returning * into v_after;
  perform app.write_audit_log(v_unit, 'update', 'order', p_order_id,
    jsonb_build_object('order_number', v_before.order_number, 'shipping_cost_cents', v_before.shipping_cost_cents),
    jsonb_build_object('order_number', v_after.order_number, 'shipping_cost_cents', v_after.shipping_cost_cents));
  return v_after;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Gift (2 ml decant): attached to an existing order, after validating the rule in the database too.
-- Service role only: the storefront calls it from the order action, never the browser.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.attach_parfums_order_gift(p_request_id uuid, p_gift_product_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  parfums_unit_id constant uuid := '11111111-1111-4111-8111-111111111111';
  v_order public.orders;
  v_excluded jsonb;
begin
  select * into v_order from public.orders
   where business_unit_id = parfums_unit_id and request_id = p_request_id for update;
  if v_order.id is null then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  if v_order.gift_product_id is not null then
    if v_order.gift_product_id = p_gift_product_id then
      return v_order;
    end if;
    raise exception 'the order already has a different gift' using errcode = 'P2041';
  end if;

  -- The gift needs at least one full bottle in the order (decants and sets do not qualify).
  if not exists (
    select 1 from public.order_lines l
     where l.order_id = v_order.id and l.variant_snapshot ->> 'group' = 'bottle'
  ) then
    raise exception 'the 2 ml gift needs a full bottle in the order' using errcode = 'P2042';
  end if;

  -- The gift is an Arabic perfume that is on sale and not excluded.
  if not exists (
    select 1
      from public.products p
      join public.product_categories pc on pc.product_id = p.id
      join public.categories c on c.id = pc.category_id and c.kind = 'commercial_type' and c.slug in ('arab', 'arabic')
     where p.id = p_gift_product_id
       and p.business_unit_id = parfums_unit_id
       and p.publication_status = 'published'
       and p.archived_at is null
  ) then
    raise exception 'the gift must be a published Arabic perfume' using errcode = 'P2043';
  end if;

  select conditions -> 'excluded_product_ids' into v_excluded
    from public.promotion_rules
   where business_unit_id = parfums_unit_id and rule_type = 'gift_exclusion' and is_active;
  if v_excluded is not null and v_excluded @> to_jsonb(p_gift_product_id::text) then
    raise exception 'this perfume is excluded from the gift' using errcode = 'P2044';
  end if;

  update public.orders set gift_product_id = p_gift_product_id where id = v_order.id returning * into v_order;
  return v_order;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Mixed wholesale quote: full bottles of ANY commercial type add up to the threshold; the discount is per type.
-- Read-only; the order total is not rewritten (wholesale orders are coordinated by WhatsApp).
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.calculate_mixed_wholesale_quote(p_unit_code text, p_lines jsonb)
returns table (
  product_variant_id uuid,
  quantity integer,
  commercial_type text,
  mix_units bigint,
  min_units integer,
  threshold_reached boolean,
  base_unit_price numeric,
  discount_per_unit numeric,
  final_unit_price numeric,
  line_total numeric,
  currency char(3),
  eligibility_status text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_unit uuid;
  v_rule public.promotion_rules;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'wholesale lines must be a JSON array' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_lines) line
    where jsonb_typeof(line) <> 'object'
      or coalesce(line ->> 'variant_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or coalesce(line ->> 'quantity', '') !~ '^[1-9][0-9]{0,8}$'
  ) then
    raise exception 'each wholesale line requires a valid variant_id and positive integer quantity' using errcode = '22023';
  end if;

  select id into v_unit from public.business_units where code = p_unit_code;
  if v_unit is null then
    raise exception 'unknown business unit' using errcode = '22023';
  end if;
  select * into v_rule from public.promotion_rules
   where business_unit_id = v_unit and rule_type = 'wholesale_mixed' and is_active;

  return query
  with input_lines as (
    select (line ->> 'variant_id')::uuid as variant_id, sum((line ->> 'quantity')::integer)::integer as requested_quantity
      from jsonb_array_elements(p_lines) line
     group by (line ->> 'variant_id')::uuid
  ),
  resolved as (
    select
      input.variant_id,
      input.requested_quantity,
      variant.variant_kind,
      variant.price_amount,
      variant.currency as variant_currency,
      classification.commercial_category_count,
      classification.commercial_type,
      (variant.id is not null and product.business_unit_id = v_unit) as in_unit
    from input_lines input
    left join public.product_variants variant on variant.id = input.variant_id
    left join public.products product on product.id = variant.product_id
    left join lateral (
      select count(category.id) as commercial_category_count, min(category.slug) as commercial_type
        from public.product_categories assignment
        join public.categories category on category.id = assignment.category_id and category.kind = 'commercial_type'
       where assignment.product_id = product.id
    ) classification on true
  ),
  mix as (
    select coalesce(sum(r.requested_quantity), 0)::bigint as units
      from resolved r
     where r.in_unit and r.variant_kind = 'bottle'
       and r.commercial_category_count = 1 and r.commercial_type in ('arabic', 'designer', 'niche')
  )
  select
    r.variant_id,
    r.requested_quantity,
    case when r.commercial_category_count = 1 then r.commercial_type else null end,
    mix.units,
    (v_rule.conditions ->> 'min_units')::integer,
    (v_rule.id is not null and mix.units >= (v_rule.conditions ->> 'min_units')::integer),
    r.price_amount,
    case
      when v_rule.id is not null and r.in_unit and r.variant_kind = 'bottle' and r.commercial_category_count = 1
           and r.commercial_type in ('arabic', 'designer', 'niche')
           and mix.units >= (v_rule.conditions ->> 'min_units')::integer
        then (v_rule.actions -> 'discount_per_unit' ->> r.commercial_type)::numeric
      else 0::numeric
    end,
    case
      when r.price_amount is null then null
      when v_rule.id is not null and r.in_unit and r.variant_kind = 'bottle' and r.commercial_category_count = 1
           and r.commercial_type in ('arabic', 'designer', 'niche')
           and mix.units >= (v_rule.conditions ->> 'min_units')::integer
        then app.wholesale_unit_price(r.price_amount, (v_rule.actions -> 'discount_per_unit' ->> r.commercial_type)::numeric)
      else r.price_amount
    end,
    case
      when r.price_amount is null then null
      when v_rule.id is not null and r.in_unit and r.variant_kind = 'bottle' and r.commercial_category_count = 1
           and r.commercial_type in ('arabic', 'designer', 'niche')
           and mix.units >= (v_rule.conditions ->> 'min_units')::integer
        then app.wholesale_unit_price(r.price_amount, (v_rule.actions -> 'discount_per_unit' ->> r.commercial_type)::numeric) * r.requested_quantity
      else r.price_amount * r.requested_quantity
    end,
    r.variant_currency,
    case
      when r.price_amount is null or not r.in_unit then 'variant_not_found'
      when r.variant_kind <> 'bottle' then 'not_bottle'
      when r.commercial_category_count = 0 then 'missing_classification'
      when r.commercial_category_count <> 1 or r.commercial_type not in ('arabic', 'designer', 'niche') then 'ambiguous_classification'
      when v_rule.id is null then 'rule_inactive'
      when mix.units >= (v_rule.conditions ->> 'min_units')::integer then 'qualified'
      else 'below_threshold'
    end
  from resolved r
  cross join mix
  order by r.variant_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Execution grants: admin functions to authenticated (each checks admin itself), the gift and the quote to the
-- server only.
-- ---------------------------------------------------------------------------------------------------------------
revoke all on function public.admin_save_delivery_zone(text, uuid, timestamptz, text, boolean) from public;
revoke all on function public.admin_delete_delivery_zone(text, uuid) from public;
revoke all on function public.admin_save_shipping_agency(text, uuid, timestamptz, text, text, text, boolean) from public;
revoke all on function public.admin_delete_shipping_agency(text, uuid) from public;
revoke all on function public.admin_save_promotion_rule(text, uuid, timestamptz, text, jsonb, jsonb, boolean) from public;
revoke all on function public.admin_delete_promotion_rule(text, uuid) from public;
revoke all on function public.admin_parfums_set_order_shipping_cost(uuid, integer) from public;
revoke all on function public.attach_parfums_order_gift(uuid, uuid) from public;
revoke all on function public.calculate_mixed_wholesale_quote(text, jsonb) from public;
revoke all on function app.validate_promotion_rule() from public;

-- Supabase grants EXECUTE on new functions to anon and authenticated by default: take it away where it does not belong.
revoke all on function public.admin_save_delivery_zone(text, uuid, timestamptz, text, boolean) from anon;
revoke all on function public.admin_delete_delivery_zone(text, uuid) from anon;
revoke all on function public.admin_save_shipping_agency(text, uuid, timestamptz, text, text, text, boolean) from anon;
revoke all on function public.admin_delete_shipping_agency(text, uuid) from anon;
revoke all on function public.admin_save_promotion_rule(text, uuid, timestamptz, text, jsonb, jsonb, boolean) from anon;
revoke all on function public.admin_delete_promotion_rule(text, uuid) from anon;
revoke all on function public.admin_parfums_set_order_shipping_cost(uuid, integer) from anon;
revoke all on function public.attach_parfums_order_gift(uuid, uuid) from anon, authenticated;
revoke all on function public.calculate_mixed_wholesale_quote(text, jsonb) from anon;
revoke all on function app.validate_promotion_rule() from anon, authenticated;

grant execute on function public.admin_save_delivery_zone(text, uuid, timestamptz, text, boolean) to authenticated;
grant execute on function public.admin_delete_delivery_zone(text, uuid) to authenticated;
grant execute on function public.admin_save_shipping_agency(text, uuid, timestamptz, text, text, text, boolean) to authenticated;
grant execute on function public.admin_delete_shipping_agency(text, uuid) to authenticated;
grant execute on function public.admin_save_promotion_rule(text, uuid, timestamptz, text, jsonb, jsonb, boolean) to authenticated;
grant execute on function public.admin_delete_promotion_rule(text, uuid) to authenticated;
grant execute on function public.admin_parfums_set_order_shipping_cost(uuid, integer) to authenticated;
grant execute on function public.attach_parfums_order_gift(uuid, uuid) to service_role;
grant execute on function public.calculate_mixed_wholesale_quote(text, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- Confirmed data (owner, 2026-10-14). Idempotent.
-- ---------------------------------------------------------------------------------------------------------------
insert into public.shipping_agencies (business_unit_id, name, coverage, description, is_active)
values ('11111111-1111-4111-8111-111111111111', 'Shalom', 'Todo Perú', 'Cotización por WhatsApp', true)
on conflict do nothing;

-- 40 mixed units, discount per type over the mix (S/5 Arabic, S/7 designer, S/10 niche). No tier above 40 (T28).
-- Import is where wholesale lives today (docs/wholesale-tiers.md); the Parfums unit gets no wholesale rule.
insert into public.promotion_rules (business_unit_id, rule_type, conditions, actions, is_active)
values (
  '22222222-2222-4222-8222-222222222222',
  'wholesale_mixed',
  '{"min_units": 40, "count": "bottles"}'::jsonb,
  '{"discount_per_unit": {"arabic": 5, "designer": 7, "niche": 10}, "currency": "PEN"}'::jsonb,
  true
)
on conflict (business_unit_id, rule_type) do nothing;
