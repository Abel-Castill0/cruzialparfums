-- Cruzial Platform V2 — Row Level Security
--
-- Enforcement model
-- -----------------
-- Supabase's cloud default (config.toml `auto_expose_new_tables`, unset = true)
-- means every new public table is reachable by the anon/authenticated roles
-- without an explicit GRANT. That is deliberately left at the cloud default so
-- these policies are tested against the same exposure production will have:
-- RLS is the real enforcement layer, not table grants.
--
-- Two rules decide every policy below:
--   public  (anon + authenticated) may read published storefront rows only.
--   admin   may touch a row only in a business unit it holds a membership for.
--
-- A `.eq('business_unit_id', ...)` filter in application code is a convenience,
-- never the boundary. Cross-unit access has to be impossible at the database.
--
-- Sensitive tables additionally get an explicit REVOKE from anon: a missing
-- policy already denies, but the REVOKE means a future accidentally-permissive
-- policy still cannot expose customers, orders, audit history or memberships.

-- ---------------------------------------------------------------------------
-- Ownership helpers
-- ---------------------------------------------------------------------------
--
-- Child tables (variants, media, order lines…) carry no business_unit_id; it
-- is reachable only through their parent. These SECURITY DEFINER helpers
-- resolve it while bypassing the parent's own RLS, so a policy expresses
-- "which unit owns this row" directly instead of depending on what the current
-- role happens to be able to see through a nested join.

create or replace function app.product_unit(target_product uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.business_unit_id from public.products p where p.id = target_product
$$;

create or replace function app.product_is_public(target_product uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.products p
    where p.id = target_product
      and p.publication_status = 'published'
      and p.archived_at is null
  )
$$;

create or replace function app.variant_unit(target_variant uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.business_unit_id
  from public.product_variants v
  join public.products p on p.id = v.product_id
  where v.id = target_variant
$$;

create or replace function app.variant_is_public(target_variant uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.product_variants v
    join public.products p on p.id = v.product_id
    where v.id = target_variant
      and v.publication_status = 'published'
      and v.archived_at is null
      and p.publication_status = 'published'
      and p.archived_at is null
  )
$$;

create or replace function app.combo_unit(target_combo uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.business_unit_id
  from public.combos c
  join public.products p on p.id = c.product_id
  where c.id = target_combo
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
    from public.combos c
    join public.products p on p.id = c.product_id
    where c.id = target_combo
      and c.archived_at is null
      and p.publication_status = 'published'
      and p.archived_at is null
  )
$$;

create or replace function app.campaign_unit(target_campaign uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.business_unit_id from public.campaigns c where c.id = target_campaign
$$;

-- Draft and archived campaigns are never public. Closed/fulfilled history is
-- also kept admin-only for now: which past consolidado a storefront should
-- surface is still UNKNOWN in docs/client-decisions.md.
create or replace function app.campaign_is_public(target_campaign uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.campaigns c
    where c.id = target_campaign
      and c.status in ('scheduled', 'open', 'paused')
      and c.archived_at is null
  )
$$;

create or replace function app.order_unit(target_order uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select o.business_unit_id from public.orders o where o.id = target_order
$$;

revoke all on function app.product_unit(uuid) from public;
revoke all on function app.product_is_public(uuid) from public;
revoke all on function app.variant_unit(uuid) from public;
revoke all on function app.variant_is_public(uuid) from public;
revoke all on function app.combo_unit(uuid) from public;
revoke all on function app.combo_is_public(uuid) from public;
revoke all on function app.campaign_unit(uuid) from public;
revoke all on function app.campaign_is_public(uuid) from public;
revoke all on function app.order_unit(uuid) from public;

grant execute on function app.product_unit(uuid) to anon, authenticated;
grant execute on function app.product_is_public(uuid) to anon, authenticated;
grant execute on function app.variant_unit(uuid) to anon, authenticated;
grant execute on function app.variant_is_public(uuid) to anon, authenticated;
grant execute on function app.combo_unit(uuid) to anon, authenticated;
grant execute on function app.combo_is_public(uuid) to anon, authenticated;
grant execute on function app.campaign_unit(uuid) to anon, authenticated;
grant execute on function app.campaign_is_public(uuid) to anon, authenticated;
grant execute on function app.order_unit(uuid) to authenticated;
grant usage on schema app to anon;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------

alter table public.business_units      enable row level security;
alter table public.admin_memberships   enable row level security;
alter table public.categories          enable row level security;
alter table public.products            enable row level security;
alter table public.product_categories  enable row level security;
alter table public.product_variants    enable row level security;
alter table public.product_media       enable row level security;
alter table public.inventory           enable row level security;
alter table public.combos              enable row level security;
alter table public.combo_items         enable row level security;
alter table public.settings            enable row level security;
alter table public.shipping_methods    enable row level security;
alter table public.deposit_policies    enable row level security;
alter table public.wholesale_policies  enable row level security;
alter table public.variant_price_tiers enable row level security;
alter table public.campaigns           enable row level security;
alter table public.campaign_products   enable row level security;
alter table public.customers           enable row level security;
alter table public.orders              enable row level security;
alter table public.order_lines         enable row level security;
alter table public.audit_log           enable row level security;

-- Crown jewels: no anon access at any level, policy or not.
revoke all on public.customers        from anon;
revoke all on public.orders           from anon;
revoke all on public.order_lines      from anon;
revoke all on public.audit_log        from anon;
revoke all on public.admin_memberships from anon;
revoke all on public.inventory        from anon;

-- ---------------------------------------------------------------------------
-- business_units
-- ---------------------------------------------------------------------------

create policy business_units_public_read on public.business_units
  for select to anon, authenticated
  using (is_active);

-- Units themselves are provisioned by migration, not by the application.

-- ---------------------------------------------------------------------------
-- admin_memberships — read own only, never writable through the Data API
-- ---------------------------------------------------------------------------
--
-- There is intentionally no INSERT/UPDATE/DELETE policy: if an admin could
-- write this table, an admin of Parfums could grant themselves Import, which
-- is the privilege-escalation path this whole model exists to prevent.
-- Memberships are provisioned server-side (secret key / SQL) under the
-- bootstrap procedure, which is still UNKNOWN in docs/client-decisions.md.

create policy admin_memberships_read_own on public.admin_memberships
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------

create policy categories_public_read on public.categories
  for select to anon, authenticated
  using (publication_status = 'published' and archived_at is null);

create policy categories_admin_read on public.categories
  for select to authenticated
  using (app.can_read_unit(business_unit_id));

create policy categories_admin_write on public.categories
  for all to authenticated
  using (app.is_admin_for(business_unit_id))
  with check (app.is_admin_for(business_unit_id));

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------

create policy products_public_read on public.products
  for select to anon, authenticated
  using (publication_status = 'published' and archived_at is null);

create policy products_admin_read on public.products
  for select to authenticated
  using (app.can_read_unit(business_unit_id));

create policy products_admin_write on public.products
  for all to authenticated
  using (app.is_admin_for(business_unit_id))
  with check (app.is_admin_for(business_unit_id));

-- ---------------------------------------------------------------------------
-- product_categories
-- ---------------------------------------------------------------------------

create policy product_categories_public_read on public.product_categories
  for select to anon, authenticated
  using (app.product_is_public(product_id));

create policy product_categories_admin_read on public.product_categories
  for select to authenticated
  using (app.can_read_unit(app.product_unit(product_id)));

create policy product_categories_admin_write on public.product_categories
  for all to authenticated
  using (app.is_admin_for(app.product_unit(product_id)))
  with check (app.is_admin_for(app.product_unit(product_id)));

-- ---------------------------------------------------------------------------
-- product_variants
-- ---------------------------------------------------------------------------

create policy product_variants_public_read on public.product_variants
  for select to anon, authenticated
  using (
    publication_status = 'published'
    and archived_at is null
    and app.product_is_public(product_id)
  );

create policy product_variants_admin_read on public.product_variants
  for select to authenticated
  using (app.can_read_unit(app.product_unit(product_id)));

create policy product_variants_admin_write on public.product_variants
  for all to authenticated
  using (app.is_admin_for(app.product_unit(product_id)))
  with check (app.is_admin_for(app.product_unit(product_id)));

-- ---------------------------------------------------------------------------
-- product_media
-- ---------------------------------------------------------------------------

create policy product_media_public_read on public.product_media
  for select to anon, authenticated
  using (archived_at is null and app.product_is_public(product_id));

create policy product_media_admin_read on public.product_media
  for select to authenticated
  using (app.can_read_unit(app.product_unit(product_id)));

create policy product_media_admin_write on public.product_media
  for all to authenticated
  using (app.is_admin_for(app.product_unit(product_id)))
  with check (app.is_admin_for(app.product_unit(product_id)));

-- ---------------------------------------------------------------------------
-- inventory — admin only, no public policy at all
-- ---------------------------------------------------------------------------
--
-- The storefront reads availability from products.availability_status; exact
-- quantities never leave the admin surface.

create policy inventory_admin_read on public.inventory
  for select to authenticated
  using (app.can_read_unit(app.variant_unit(product_variant_id)));

create policy inventory_admin_write on public.inventory
  for all to authenticated
  using (app.is_admin_for(app.variant_unit(product_variant_id)))
  with check (app.is_admin_for(app.variant_unit(product_variant_id)));

-- ---------------------------------------------------------------------------
-- combos / combo_items
-- ---------------------------------------------------------------------------

create policy combos_public_read on public.combos
  for select to anon, authenticated
  using (archived_at is null and app.product_is_public(product_id));

create policy combos_admin_read on public.combos
  for select to authenticated
  using (app.can_read_unit(app.product_unit(product_id)));

create policy combos_admin_write on public.combos
  for all to authenticated
  using (app.is_admin_for(app.product_unit(product_id)))
  with check (app.is_admin_for(app.product_unit(product_id)));

create policy combo_items_public_read on public.combo_items
  for select to anon, authenticated
  using (app.combo_is_public(combo_id));

create policy combo_items_admin_read on public.combo_items
  for select to authenticated
  using (app.can_read_unit(app.combo_unit(combo_id)));

create policy combo_items_admin_write on public.combo_items
  for all to authenticated
  using (app.is_admin_for(app.combo_unit(combo_id)))
  with check (app.is_admin_for(app.combo_unit(combo_id)));

-- ---------------------------------------------------------------------------
-- settings
-- ---------------------------------------------------------------------------
--
-- Public reads are limited to rows explicitly flagged is_public. Admin writes
-- are limited to that admin's own unit: platform-wide rows (business_unit_id
-- null) stay owner/server-managed so one unit's admin cannot change global
-- configuration.

create policy settings_public_read on public.settings
  for select to anon, authenticated
  using (is_public);

create policy settings_admin_read on public.settings
  for select to authenticated
  using (business_unit_id is not null and app.can_read_unit(business_unit_id));

create policy settings_admin_write on public.settings
  for all to authenticated
  using (business_unit_id is not null and app.is_admin_for(business_unit_id))
  with check (business_unit_id is not null and app.is_admin_for(business_unit_id));

-- ---------------------------------------------------------------------------
-- shipping_methods / deposit_policies / wholesale_policies / price tiers
-- ---------------------------------------------------------------------------
--
-- These carry public commercial terms (Shalom vs. delivery privado, the 50/70
-- deposit, mayorista tiers), so the active rows are readable by anon.

create policy shipping_methods_public_read on public.shipping_methods
  for select to anon, authenticated
  using (is_active);

create policy shipping_methods_admin_read on public.shipping_methods
  for select to authenticated
  using (app.can_read_unit(business_unit_id));

create policy shipping_methods_admin_write on public.shipping_methods
  for all to authenticated
  using (app.is_admin_for(business_unit_id))
  with check (app.is_admin_for(business_unit_id));

create policy deposit_policies_public_read on public.deposit_policies
  for select to anon, authenticated
  using (is_active);

create policy deposit_policies_admin_read on public.deposit_policies
  for select to authenticated
  using (app.can_read_unit(business_unit_id));

create policy deposit_policies_admin_write on public.deposit_policies
  for all to authenticated
  using (app.is_admin_for(business_unit_id))
  with check (app.is_admin_for(business_unit_id));

create policy wholesale_policies_public_read on public.wholesale_policies
  for select to anon, authenticated
  using (is_active and archived_at is null);

create policy wholesale_policies_admin_read on public.wholesale_policies
  for select to authenticated
  using (app.can_read_unit(business_unit_id));

create policy wholesale_policies_admin_write on public.wholesale_policies
  for all to authenticated
  using (app.is_admin_for(business_unit_id))
  with check (app.is_admin_for(business_unit_id));

create policy variant_price_tiers_public_read on public.variant_price_tiers
  for select to anon, authenticated
  using (archived_at is null and app.variant_is_public(product_variant_id));

create policy variant_price_tiers_admin_read on public.variant_price_tiers
  for select to authenticated
  using (app.can_read_unit(app.variant_unit(product_variant_id)));

create policy variant_price_tiers_admin_write on public.variant_price_tiers
  for all to authenticated
  using (app.is_admin_for(app.variant_unit(product_variant_id)))
  with check (app.is_admin_for(app.variant_unit(product_variant_id)));

-- ---------------------------------------------------------------------------
-- campaigns / campaign_products
-- ---------------------------------------------------------------------------

create policy campaigns_public_read on public.campaigns
  for select to anon, authenticated
  using (status in ('scheduled', 'open', 'paused') and archived_at is null);

create policy campaigns_admin_read on public.campaigns
  for select to authenticated
  using (app.can_read_unit(business_unit_id));

create policy campaigns_admin_write on public.campaigns
  for all to authenticated
  using (app.is_admin_for(business_unit_id))
  with check (app.is_admin_for(business_unit_id));

create policy campaign_products_public_read on public.campaign_products
  for select to anon, authenticated
  using (app.campaign_is_public(campaign_id));

create policy campaign_products_admin_read on public.campaign_products
  for select to authenticated
  using (app.can_read_unit(app.campaign_unit(campaign_id)));

create policy campaign_products_admin_write on public.campaign_products
  for all to authenticated
  using (app.is_admin_for(app.campaign_unit(campaign_id)))
  with check (app.is_admin_for(app.campaign_unit(campaign_id)));

-- ---------------------------------------------------------------------------
-- customers / orders / order_lines — never public
-- ---------------------------------------------------------------------------
--
-- There is no customer-facing account in V1, so no self-service policy exists.
-- Order creation from the storefront will run server-side in a later phase and
-- is not granted to anon here.

create policy customers_admin_read on public.customers
  for select to authenticated
  using (app.can_read_unit(business_unit_id));

create policy customers_admin_write on public.customers
  for all to authenticated
  using (app.is_admin_for(business_unit_id))
  with check (app.is_admin_for(business_unit_id));

create policy orders_admin_read on public.orders
  for select to authenticated
  using (app.can_read_unit(business_unit_id));

create policy orders_admin_write on public.orders
  for all to authenticated
  using (app.is_admin_for(business_unit_id))
  with check (app.is_admin_for(business_unit_id));

create policy order_lines_admin_read on public.order_lines
  for select to authenticated
  using (app.can_read_unit(app.order_unit(order_id)));

-- Insert/update are allowed for the owning unit's admin, but the snapshot
-- columns stay frozen by app.freeze_order_line_snapshot(); deletes are not
-- granted, so history cannot be quietly removed line by line.
create policy order_lines_admin_insert on public.order_lines
  for insert to authenticated
  with check (app.is_admin_for(app.order_unit(order_id)));

create policy order_lines_admin_update on public.order_lines
  for update to authenticated
  using (app.is_admin_for(app.order_unit(order_id)))
  with check (app.is_admin_for(app.order_unit(order_id)));

-- ---------------------------------------------------------------------------
-- audit_log — insert + read own unit, never update or delete
-- ---------------------------------------------------------------------------

create policy audit_log_admin_read on public.audit_log
  for select to authenticated
  using (business_unit_id is not null and app.can_read_unit(business_unit_id));

create policy audit_log_admin_insert on public.audit_log
  for insert to authenticated
  with check (business_unit_id is not null and app.is_admin_for(business_unit_id));
