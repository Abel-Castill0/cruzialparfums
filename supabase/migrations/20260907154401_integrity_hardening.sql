-- Cruzial Platform V2 — relational and security hardening
--
-- RLS prevents an administrator from selecting a row owned by another unit,
-- but a child row can carry several foreign keys. Checking only the first
-- parent would still allow a Parfums row to point at an Import parent. These
-- guards make that invalid state impossible independently of application
-- filters.

-- ---------------------------------------------------------------------------
-- Cross-reference integrity
-- ---------------------------------------------------------------------------

create or replace function app.enforce_category_parent_unit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.parent_id is not null and not exists (
    select 1 from public.categories parent
    where parent.id = new.parent_id
      and parent.business_unit_id = new.business_unit_id
  ) then
    raise exception 'category parent must belong to the same business unit'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger categories_enforce_parent_unit
  before insert or update of parent_id, business_unit_id on public.categories
  for each row execute function app.enforce_category_parent_unit();

create or replace function app.enforce_product_category_unit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  product_unit uuid;
  category_unit uuid;
begin
  select business_unit_id into product_unit
  from public.products where id = new.product_id;
  select business_unit_id into category_unit
  from public.categories where id = new.category_id;

  if product_unit is null or category_unit is null or product_unit is distinct from category_unit then
    raise exception 'product and category must belong to the same business unit'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger product_categories_enforce_unit
  before insert or update of product_id, category_id on public.product_categories
  for each row execute function app.enforce_product_category_unit();

create or replace function app.enforce_product_media_variant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.product_variant_id is not null and not exists (
    select 1 from public.product_variants variant
    where variant.id = new.product_variant_id
      and variant.product_id = new.product_id
  ) then
    raise exception 'media variant must belong to its product'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger product_media_enforce_variant
  before insert or update of product_id, product_variant_id on public.product_media
  for each row execute function app.enforce_product_media_variant();

create or replace function app.enforce_combo_item_unit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  combo_business_unit uuid;
  variant_business_unit uuid;
begin
  select product.business_unit_id into combo_business_unit
  from public.combos combo
  join public.products product on product.id = combo.product_id
  where combo.id = new.combo_id;

  select product.business_unit_id into variant_business_unit
  from public.product_variants variant
  join public.products product on product.id = variant.product_id
  where variant.id = new.product_variant_id;

  if combo_business_unit is null
     or variant_business_unit is null
     or combo_business_unit is distinct from variant_business_unit then
    raise exception 'combo item must belong to the combo business unit'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger combo_items_enforce_unit
  before insert or update of combo_id, product_variant_id on public.combo_items
  for each row execute function app.enforce_combo_item_unit();

create or replace function app.enforce_price_tier_unit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  variant_business_unit uuid;
  policy_business_unit uuid;
begin
  if new.wholesale_policy_id is null then
    return new;
  end if;

  select product.business_unit_id into variant_business_unit
  from public.product_variants variant
  join public.products product on product.id = variant.product_id
  where variant.id = new.product_variant_id;

  select business_unit_id into policy_business_unit
  from public.wholesale_policies where id = new.wholesale_policy_id;

  if variant_business_unit is null
     or policy_business_unit is null
     or variant_business_unit is distinct from policy_business_unit then
    raise exception 'price tier and wholesale policy must belong to the same business unit'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger variant_price_tiers_enforce_unit
  before insert or update of product_variant_id, wholesale_policy_id on public.variant_price_tiers
  for each row execute function app.enforce_price_tier_unit();

create or replace function app.enforce_campaign_product_unit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  campaign_business_unit uuid;
  product_business_unit uuid;
begin
  select business_unit_id into campaign_business_unit
  from public.campaigns where id = new.campaign_id;
  select business_unit_id into product_business_unit
  from public.products where id = new.product_id;

  if campaign_business_unit is null
     or product_business_unit is null
     or campaign_business_unit is distinct from product_business_unit then
    raise exception 'campaign product must belong to the campaign business unit'
      using errcode = 'check_violation';
  end if;

  if new.product_variant_id is not null and not exists (
    select 1 from public.product_variants variant
    where variant.id = new.product_variant_id
      and variant.product_id = new.product_id
  ) then
    raise exception 'campaign variant must belong to its product'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger campaign_products_enforce_unit
  before insert or update of campaign_id, product_id, product_variant_id on public.campaign_products
  for each row execute function app.enforce_campaign_product_unit();

-- PostgreSQL UNIQUE treats NULL values as distinct by default. A campaign
-- must not therefore accept the same product-level offer repeatedly merely
-- because product_variant_id is NULL.
alter table public.campaign_products
  drop constraint campaign_products_campaign_variant_unique;
create unique index campaign_products_campaign_variant_unique
  on public.campaign_products (campaign_id, product_id, product_variant_id)
  nulls not distinct;

create or replace function app.enforce_order_unit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.campaign_id is not null and not exists (
    select 1 from public.campaigns related
    where related.id = new.campaign_id
      and related.business_unit_id = new.business_unit_id
  ) then
    raise exception 'order campaign must belong to the order business unit'
      using errcode = 'check_violation';
  end if;

  if new.customer_id is not null and not exists (
    select 1 from public.customers related
    where related.id = new.customer_id
      and related.business_unit_id = new.business_unit_id
  ) then
    raise exception 'order customer must belong to the order business unit'
      using errcode = 'check_violation';
  end if;

  if new.shipping_method_id is not null and not exists (
    select 1 from public.shipping_methods related
    where related.id = new.shipping_method_id
      and related.business_unit_id = new.business_unit_id
  ) then
    raise exception 'order shipping method must belong to the order business unit'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger orders_enforce_unit
  before insert or update of business_unit_id, campaign_id, customer_id, shipping_method_id
  on public.orders
  for each row execute function app.enforce_order_unit();

create or replace function app.enforce_order_line_unit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_business_unit uuid;
  referenced_product uuid;
  referenced_variant uuid;
begin
  select business_unit_id into order_business_unit
  from public.orders where id = new.order_id;
  if order_business_unit is null then
    raise exception 'order line must reference an existing order'
      using errcode = 'check_violation';
  end if;

  if new.product_id is not null and not exists (
    select 1 from public.products product
    where product.id = new.product_id
      and product.business_unit_id = order_business_unit
  ) then
    raise exception 'order line product must belong to the order business unit'
      using errcode = 'check_violation';
  end if;

  if new.product_variant_id is not null then
    select variant.product_id into referenced_product
    from public.product_variants variant
    join public.products product on product.id = variant.product_id
    where variant.id = new.product_variant_id
      and product.business_unit_id = order_business_unit;

    if referenced_product is null
       or (new.product_id is not null and referenced_product is distinct from new.product_id) then
      raise exception 'order line variant must belong to its product and business unit'
        using errcode = 'check_violation';
    end if;
  end if;

  if new.campaign_product_id is not null then
    select offer.product_id, offer.product_variant_id
      into referenced_product, referenced_variant
    from public.campaign_products offer
    join public.campaigns campaign on campaign.id = offer.campaign_id
    where offer.id = new.campaign_product_id
      and campaign.business_unit_id = order_business_unit;

    if referenced_product is null
       or (new.product_id is not null and referenced_product is distinct from new.product_id)
       or (new.product_variant_id is not null and referenced_variant is distinct from new.product_variant_id) then
      raise exception 'order line campaign offer must match its product, variant and business unit'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger order_lines_enforce_unit
  before insert or update of order_id, product_id, product_variant_id, campaign_product_id
  on public.order_lines
  for each row execute function app.enforce_order_line_unit();

-- ---------------------------------------------------------------------------
-- Immutable commercial snapshots
-- ---------------------------------------------------------------------------

-- `hidden` is a publication state, not inventory or production. Keep
-- `archived` for lifecycle history while making the client-confirmed hidden
-- state representable without overloading either of the other axes.
alter table public.products drop constraint products_publication_status_check;
alter table public.products add constraint products_publication_status_check check (
  publication_status in ('draft', 'published', 'hidden', 'archived')
);

alter table public.orders drop constraint orders_status_check;
alter table public.orders add constraint orders_status_check check (
  status in ('draft', 'pending_whatsapp_confirmation')
);

alter table public.orders add constraint orders_deposit_snapshot_pair_check check (
  (deposit_policy_snapshot is null and deposit_percentage_snapshot is null)
  or (
    deposit_policy_snapshot is not null
    and deposit_percentage_snapshot is not null
    and verified_customer_status_snapshot in ('new', 'returning')
  )
);

alter table public.order_lines add constraint order_lines_total_check check (
  line_total_amount = unit_price_amount * quantity
);

create or replace function app.validate_order_deposit_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  policy_id uuid;
  policy public.deposit_policies%rowtype;
begin
  if new.deposit_policy_snapshot is null and new.deposit_percentage_snapshot is null then
    return new;
  end if;

  begin
    policy_id := (new.deposit_policy_snapshot ->> 'policy_id')::uuid;
  exception when invalid_text_representation then
    raise exception 'deposit snapshot policy_id must be a UUID'
      using errcode = 'check_violation';
  end;

  if policy_id is null then
    raise exception 'deposit snapshot must include policy_id'
      using errcode = 'check_violation';
  end if;

  select * into policy from public.deposit_policies where id = policy_id;

  if not found
     or policy.business_unit_id is distinct from new.business_unit_id
     or policy.customer_status is distinct from new.verified_customer_status_snapshot
     or policy.deposit_percentage is distinct from new.deposit_percentage_snapshot
     or not policy.is_active
     or policy.effective_from > new.created_at
     or (policy.effective_until is not null and policy.effective_until <= new.created_at) then
    raise exception 'deposit snapshot does not match the verified customer policy'
      using errcode = 'check_violation';
  end if;

  if new.deposit_policy_snapshot ->> 'customer_status' is distinct from policy.customer_status
     or (new.deposit_policy_snapshot ->> 'deposit_percentage')::numeric is distinct from policy.deposit_percentage
     or new.deposit_policy_snapshot ->> 'source' is distinct from policy.source then
    raise exception 'deposit snapshot contents do not match the referenced policy'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger orders_validate_deposit_snapshot
  before insert or update of business_unit_id, verified_customer_status_snapshot,
    deposit_policy_snapshot, deposit_percentage_snapshot, created_at
  on public.orders
  for each row execute function app.validate_order_deposit_snapshot();

create or replace function app.freeze_order_snapshot()
returns trigger
language plpgsql
as $$
begin
  if old.status <> 'draft' and (
       new.status is distinct from old.status
       or new.business_unit_id is distinct from old.business_unit_id
       or new.order_number is distinct from old.order_number
       or new.campaign_id is distinct from old.campaign_id
       or new.customer_id is distinct from old.customer_id
       or new.shipping_method_id is distinct from old.shipping_method_id
       or new.channel is distinct from old.channel
       or new.customer_snapshot is distinct from old.customer_snapshot
       or new.delivery_snapshot is distinct from old.delivery_snapshot
       or new.claimed_customer_status is distinct from old.claimed_customer_status
       or new.verified_customer_status_snapshot is distinct from old.verified_customer_status_snapshot
       or new.deposit_policy_snapshot is distinct from old.deposit_policy_snapshot
       or new.deposit_percentage_snapshot is distinct from old.deposit_percentage_snapshot
       or new.subtotal_amount is distinct from old.subtotal_amount
       or new.currency is distinct from old.currency
  ) then
    raise exception 'order commercial snapshot is immutable after draft (order %)', old.id
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create trigger orders_freeze_snapshot
  before update on public.orders
  for each row execute function app.freeze_order_snapshot();

create or replace function app.reject_order_history_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception '% is historical order data and cannot be deleted', tg_table_name
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger orders_no_delete
  before delete on public.orders
  for each row execute function app.reject_order_history_delete();

create trigger order_lines_no_delete
  before delete on public.order_lines
  for each row execute function app.reject_order_history_delete();

-- Include traceability FKs in the existing line freeze. Otherwise a caller
-- could preserve the copied text while silently repointing its provenance.
create or replace function app.freeze_order_line_snapshot()
returns trigger
language plpgsql
as $$
begin
  if new.order_id is distinct from old.order_id
     or new.product_id is distinct from old.product_id
     or new.product_variant_id is distinct from old.product_variant_id
     or new.campaign_product_id is distinct from old.campaign_product_id
     or new.product_name_snapshot is distinct from old.product_name_snapshot
     or new.variant_label_snapshot is distinct from old.variant_label_snapshot
     or new.variant_snapshot is distinct from old.variant_snapshot
     or new.campaign_snapshot is distinct from old.campaign_snapshot
     or new.unit_price_amount is distinct from old.unit_price_amount
     or new.currency is distinct from old.currency
     or new.quantity is distinct from old.quantity
     or new.line_total_amount is distinct from old.line_total_amount
  then
    raise exception 'order_lines snapshot columns are immutable (order_line %)', old.id
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

revoke all on function app.enforce_category_parent_unit() from public;
revoke all on function app.enforce_product_category_unit() from public;
revoke all on function app.enforce_product_media_variant() from public;
revoke all on function app.enforce_combo_item_unit() from public;
revoke all on function app.enforce_price_tier_unit() from public;
revoke all on function app.enforce_campaign_product_unit() from public;
revoke all on function app.enforce_order_unit() from public;
revoke all on function app.enforce_order_line_unit() from public;
revoke all on function app.validate_order_deposit_snapshot() from public;
revoke all on function app.freeze_order_snapshot() from public;
revoke all on function app.freeze_order_line_snapshot() from public;
revoke all on function app.reject_order_history_delete() from public;

-- ---------------------------------------------------------------------------
-- Public-child visibility and audit actor integrity
-- ---------------------------------------------------------------------------

create or replace function app.category_is_public(target_category uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.categories category
    where category.id = target_category
      and category.publication_status = 'published'
      and category.archived_at is null
  )
$$;

create or replace function app.combo_is_public(target_combo uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.combos combo
    join public.products product on product.id = combo.product_id
    where combo.id = target_combo
      and combo.archived_at is null
      and combo.composition_verification_status = 'client_confirmed'
      and product.publication_status = 'published'
      and product.archived_at is null
  )
$$;

revoke all on function app.category_is_public(uuid) from public;
grant execute on function app.category_is_public(uuid) to anon, authenticated;

drop policy product_categories_public_read on public.product_categories;
create policy product_categories_public_read on public.product_categories
  for select to anon, authenticated
  using (app.product_is_public(product_id) and app.category_is_public(category_id));

drop policy product_media_public_read on public.product_media;
create policy product_media_public_read on public.product_media
  for select to anon, authenticated
  using (
    archived_at is null
    and app.product_is_public(product_id)
    and (product_variant_id is null or app.variant_is_public(product_variant_id))
  );

drop policy combos_public_read on public.combos;
create policy combos_public_read on public.combos
  for select to anon, authenticated
  using (app.combo_is_public(id));

drop policy combo_items_public_read on public.combo_items;
create policy combo_items_public_read on public.combo_items
  for select to anon, authenticated
  using (app.combo_is_public(combo_id) and app.variant_is_public(product_variant_id));

drop policy wholesale_policies_public_read on public.wholesale_policies;
create policy wholesale_policies_public_read on public.wholesale_policies
  for select to anon, authenticated
  using (is_active and scope <> 'unconfirmed' and archived_at is null);

drop policy campaign_products_public_read on public.campaign_products;
create policy campaign_products_public_read on public.campaign_products
  for select to anon, authenticated
  using (
    app.campaign_is_public(campaign_id)
    and app.product_is_public(product_id)
    and (product_variant_id is null or app.variant_is_public(product_variant_id))
  );

drop policy audit_log_admin_insert on public.audit_log;
create policy audit_log_admin_insert on public.audit_log
  for insert to authenticated
  with check (
    business_unit_id is not null
    and actor_user_id = (select auth.uid())
    and app.is_admin_for(business_unit_id)
  );

-- `FOR ALL` also grants DELETE. Orders are historical records, so replace the
-- broad policy with the only two mutations this foundation permits.
drop policy orders_admin_write on public.orders;
create policy orders_admin_insert on public.orders
  for insert to authenticated
  with check (app.is_admin_for(business_unit_id));

create policy orders_admin_update on public.orders
  for update to authenticated
  using (app.is_admin_for(business_unit_id))
  with check (app.is_admin_for(business_unit_id));
