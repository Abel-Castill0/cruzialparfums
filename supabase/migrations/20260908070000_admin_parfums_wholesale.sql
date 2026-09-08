-- Cruzial Platform V2 — Admin Parfums Wholesale (Phase 4d)
--
-- Additive representation of the confirmed threshold scope: bottle quantities
-- accumulate per stable commercial category slug. The resulting unit price is
-- always derived from the variant base price minus the policy discount; no
-- variant_price_tier row duplicates that truth.

alter table public.wholesale_policies
  drop constraint wholesale_policies_scope_check;

alter table public.wholesale_policies
  add column commercial_type text,
  add column discount_amount numeric(12, 2),
  add constraint wholesale_policies_scope_check check (
    scope in ('per_product', 'per_order', 'per_commercial_type', 'unconfirmed')
  ),
  add constraint wholesale_policies_commercial_type_check check (
    commercial_type is null or commercial_type in ('arabic', 'designer', 'niche')
  ),
  add constraint wholesale_policies_discount_check check (
    discount_amount is null or discount_amount > 0
  ),
  add constraint wholesale_policies_commercial_scope_check check (
    scope <> 'per_commercial_type'
    or (
      commercial_type is not null
      and min_quantity is not null
      and min_amount is null
      and discount_amount is not null
      and currency = 'PEN'
    )
  );

create unique index wholesale_policies_commercial_type_active_unique
  on public.wholesale_policies (business_unit_id, commercial_type)
  where scope = 'per_commercial_type' and archived_at is null;

insert into public.wholesale_policies (
  business_unit_id, name, scope, commercial_type, min_quantity,
  discount_amount, currency, notes, is_active
)
values
  ('11111111-1111-4111-8111-111111111111', 'Mayorista Árabe', 'per_commercial_type', 'arabic', 40, 5.00, 'PEN', 'CLIENT_CONFIRMED 2026-09-08', true),
  ('11111111-1111-4111-8111-111111111111', 'Mayorista Diseñador', 'per_commercial_type', 'designer', 40, 7.00, 'PEN', 'CLIENT_CONFIRMED 2026-09-08', true),
  ('11111111-1111-4111-8111-111111111111', 'Mayorista Nicho', 'per_commercial_type', 'niche', 40, 10.00, 'PEN', 'CLIENT_CONFIRMED 2026-09-08', true);

-- A per-commercial-type policy is a fixed discount derived from the variant's
-- base price. Associating a manual variant tier with it would create two
-- incompatible wholesale prices for the same purchase.
create or replace function app.enforce_price_tier_unit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  variant_business_unit uuid;
  policy_business_unit uuid;
  policy_scope text;
begin
  if new.wholesale_policy_id is null then
    return new;
  end if;

  select product.business_unit_id into variant_business_unit
  from public.product_variants variant
  join public.products product on product.id = variant.product_id
  where variant.id = new.product_variant_id;

  select business_unit_id, scope into policy_business_unit, policy_scope
  from public.wholesale_policies where id = new.wholesale_policy_id;

  if variant_business_unit is null
     or policy_business_unit is null
     or variant_business_unit is distinct from policy_business_unit then
    raise exception 'price tier and wholesale policy must belong to the same business unit'
      using errcode = 'check_violation';
  end if;

  if policy_scope = 'per_commercial_type' then
    raise exception 'per-commercial-type wholesale prices are derived from the policy discount'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create or replace function app.wholesale_unit_price(
  p_base_price numeric,
  p_discount numeric
)
returns numeric
language sql
immutable
strict
set search_path = ''
as $$
  select greatest(0::numeric, p_base_price - p_discount)::numeric(12, 2)
$$;

revoke all on function app.wholesale_unit_price(numeric, numeric) from public;
grant execute on function app.wholesale_unit_price(numeric, numeric) to authenticated;

-- Admin read model. security_invoker keeps every base-table RLS policy in
-- force. Only bottle variants enter this surface; classification is derived
-- from categories.kind + stable slug, never from translated display labels.
create view public.admin_parfums_wholesale_catalog
with (security_invoker = true)
as
with classifications as (
  select
    product.id as product_id,
    count(category.id) filter (where category.kind = 'commercial_type') as commercial_category_count,
    min(category.slug) filter (where category.kind = 'commercial_type') as commercial_type
  from public.products product
  left join public.product_categories assignment on assignment.product_id = product.id
  left join public.categories category on category.id = assignment.category_id
  group by product.id
)
select
  product.business_unit_id,
  product.id as product_id,
  product.name as product_name,
  product.brand,
  product.publication_status as product_publication_status,
  product.archived_at as product_archived_at,
  variant.id as variant_id,
  variant.label as variant_label,
  variant.price_amount as base_price_amount,
  variant.currency,
  variant.publication_status as variant_publication_status,
  variant.archived_at as variant_archived_at,
  inventory.availability_status,
  classification.commercial_type,
  policy.id as policy_id,
  policy.min_quantity,
  policy.discount_amount,
  policy.is_active as policy_is_active,
  case
    when classification.commercial_category_count = 0 then 'missing_classification'
    when classification.commercial_category_count <> 1 then 'ambiguous_classification'
    when policy.id is null then 'unsupported_classification'
    when not policy.is_active then 'policy_disabled'
    else 'eligible'
  end as eligibility_status,
  case
    when classification.commercial_category_count = 1
      and policy.id is not null
      and policy.is_active
    then app.wholesale_unit_price(variant.price_amount, policy.discount_amount)
    else null
  end as wholesale_price_amount
from public.products product
join public.product_variants variant
  on variant.product_id = product.id and variant.variant_kind = 'bottle'
join classifications classification on classification.product_id = product.id
left join public.inventory inventory on inventory.product_variant_id = variant.id
left join public.wholesale_policies policy
  on policy.business_unit_id = product.business_unit_id
  and policy.scope = 'per_commercial_type'
  and policy.commercial_type = classification.commercial_type
  and policy.archived_at is null;

grant select on public.admin_parfums_wholesale_catalog to authenticated;

-- Authoritative quote calculation for server-side revalidation. The caller
-- supplies only variant ids and quantities. Unit, classification, bottle kind,
-- base price, threshold and discount all come from the database.
create or replace function public.calculate_parfums_wholesale_quote(p_lines jsonb)
returns table (
  product_variant_id uuid,
  quantity integer,
  commercial_type text,
  bottle_group_quantity bigint,
  threshold_reached boolean,
  base_unit_price numeric,
  discount_per_unit numeric,
  final_unit_price numeric,
  line_total numeric,
  currency char(3),
  eligibility_status text
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'wholesale lines must be a JSON array' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_lines) line
    where jsonb_typeof(line) <> 'object'
      or coalesce(line->>'variant_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or coalesce(line->>'quantity', '') !~ '^[1-9][0-9]*$'
      or (line->>'quantity')::numeric > 2147483647
  ) then
    raise exception 'each wholesale line requires a valid variant_id and positive integer quantity'
      using errcode = '22023';
  end if;

  return query
  with input_lines as (
    select
      (line->>'variant_id')::uuid as variant_id,
      sum((line->>'quantity')::integer)::integer as requested_quantity
    from jsonb_array_elements(p_lines) line
    group by (line->>'variant_id')::uuid
  ),
  resolved as (
    select
      input.variant_id,
      input.requested_quantity,
      variant.variant_kind,
      variant.price_amount,
      variant.currency as variant_currency,
      product.business_unit_id,
      classification.commercial_category_count,
      classification.commercial_type,
      policy.id as policy_id,
      policy.min_quantity,
      policy.discount_amount,
      policy.is_active
    from input_lines input
    left join public.product_variants variant on variant.id = input.variant_id
    left join public.products product on product.id = variant.product_id
    left join lateral (
      select
        count(category.id) as commercial_category_count,
        min(category.slug) as commercial_type
      from public.product_categories assignment
      join public.categories category
        on category.id = assignment.category_id and category.kind = 'commercial_type'
      where assignment.product_id = product.id
    ) classification on true
    left join public.wholesale_policies policy
      on policy.business_unit_id = product.business_unit_id
      and policy.scope = 'per_commercial_type'
      and policy.commercial_type = classification.commercial_type
      and policy.archived_at is null
  ),
  group_totals as (
    select resolved.commercial_type, sum(resolved.requested_quantity)::bigint as bottle_quantity
    from resolved
    where resolved.variant_kind = 'bottle'
      and resolved.commercial_category_count = 1
      and resolved.policy_id is not null
      and resolved.is_active
    group by resolved.commercial_type
  )
  select
    resolved.variant_id,
    resolved.requested_quantity,
    case when resolved.commercial_category_count = 1 then resolved.commercial_type else null end,
    coalesce(group_totals.bottle_quantity, 0),
    coalesce(group_totals.bottle_quantity >= resolved.min_quantity, false),
    resolved.price_amount,
    case
      when group_totals.bottle_quantity >= resolved.min_quantity then resolved.discount_amount
      else 0::numeric
    end,
    case
      when resolved.price_amount is null then null
      when group_totals.bottle_quantity >= resolved.min_quantity
        then app.wholesale_unit_price(resolved.price_amount, resolved.discount_amount)
      else resolved.price_amount
    end,
    case
      when resolved.price_amount is null then null
      when group_totals.bottle_quantity >= resolved.min_quantity
        then app.wholesale_unit_price(resolved.price_amount, resolved.discount_amount) * resolved.requested_quantity
      else resolved.price_amount * resolved.requested_quantity
    end,
    resolved.variant_currency,
    case
      when resolved.price_amount is null then 'variant_not_found'
      when resolved.variant_kind <> 'bottle' then 'not_bottle'
      when resolved.commercial_category_count = 0 then 'missing_classification'
      when resolved.commercial_category_count <> 1 then 'ambiguous_classification'
      when resolved.policy_id is null then 'unsupported_classification'
      when not resolved.is_active then 'policy_disabled'
      when group_totals.bottle_quantity >= resolved.min_quantity then 'qualified'
      else 'below_threshold'
    end
  from resolved
  left join group_totals on group_totals.commercial_type = resolved.commercial_type
  order by resolved.variant_id;
end;
$$;

revoke all on function public.calculate_parfums_wholesale_quote(jsonb) from public;
grant execute on function public.calculate_parfums_wholesale_quote(jsonb) to authenticated;

alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check check (
  action in (
    'create', 'update', 'archive', 'restore', 'publish', 'unpublish',
    'price_change', 'inventory_change', 'campaign_state_change',
    'order_state_change', 'settings_change', 'membership_change',
    'customer_verification_change', 'composition_update', 'verification_update',
    'wholesale.policy_update', 'wholesale.enable', 'wholesale.disable'
  )
);

create or replace function public.admin_update_wholesale_policy(
  p_policy_id uuid,
  p_expected_updated_at timestamptz,
  p_min_quantity integer,
  p_discount_amount numeric,
  p_is_active boolean
)
returns public.wholesale_policies
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_before public.wholesale_policies;
  v_after public.wholesale_policies;
  v_action text;
begin
  select * into v_before from public.wholesale_policies where id = p_policy_id;
  if v_before.id is null then
    raise exception 'wholesale policy not found' using errcode = 'P0002';
  end if;

  perform app.assert_admin_for(v_before.business_unit_id);

  if v_before.scope <> 'per_commercial_type' or v_before.commercial_type is null then
    raise exception 'policy is not a per-commercial-type wholesale rule' using errcode = '22023';
  end if;
  if p_min_quantity is null or p_min_quantity <= 0 then
    raise exception 'minimum quantity must be positive' using errcode = '22023';
  end if;
  if p_discount_amount is null or p_discount_amount <= 0 then
    raise exception 'discount amount must be positive' using errcode = '22023';
  end if;

  update public.wholesale_policies
  set min_quantity = p_min_quantity,
      discount_amount = p_discount_amount,
      is_active = p_is_active
  where id = p_policy_id and updated_at = p_expected_updated_at
  returning * into v_after;

  if v_after.id is null then
    raise exception 'wholesale policy was modified by another session' using errcode = '40001';
  end if;

  v_action := case
    when not v_before.is_active and v_after.is_active then 'wholesale.enable'
    when v_before.is_active and not v_after.is_active then 'wholesale.disable'
    else 'wholesale.policy_update'
  end;

  perform app.write_audit_log(
    v_before.business_unit_id,
    v_action,
    'wholesale_policy',
    v_after.id,
    jsonb_build_object(
      'min_quantity', v_before.min_quantity,
      'discount_amount', v_before.discount_amount,
      'is_active', v_before.is_active
    ),
    jsonb_build_object(
      'min_quantity', v_after.min_quantity,
      'discount_amount', v_after.discount_amount,
      'is_active', v_after.is_active
    )
  );

  return v_after;
end;
$$;

revoke all on function public.admin_update_wholesale_policy(uuid, timestamptz, integer, numeric, boolean) from public;
grant execute on function public.admin_update_wholesale_policy(uuid, timestamptz, integer, numeric, boolean) to authenticated;
