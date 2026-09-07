-- Cruzial Platform V2 — Commerce
--
-- Shipping, deposits, wholesale, campaigns, customers and orders.
--
-- Tables deliberately NOT created in this phase (docs/supabase-schema-v2.md
-- records the reasoning; the brief asks not to create a table just because it
-- appears on a list):
--   * promotions / promotion_rules / promotion_rewards — the single confirmed
--     promo (2 ml decant gift, bottle-only) is a static editorial rule already
--     centralised in domains/catalog/promotion-eligibility.ts. No admin-managed
--     variability is confirmed, so a rules engine would be speculative.
--   * waitlist — client-decisions.md lists its required fields, consent, and
--     retention as UNKNOWN, and no waitlist form exists in the runtime. The
--     Import home intentionally ships a WhatsApp CTA instead.

-- ---------------------------------------------------------------------------
-- settings
-- ---------------------------------------------------------------------------
--
-- is_public is the switch RLS reads to decide what anon may see. Secrets never
-- belong here — they live in the server environment only.

create table public.settings (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid references public.business_units (id) on delete cascade,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  is_public boolean not null default false,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per (unit, key); a null unit means a platform-wide setting, and
-- NULLS NOT DISTINCT makes that key unique too.
create unique index settings_unit_key_unique on public.settings (business_unit_id, key) nulls not distinct;

create trigger settings_set_updated_at
  before update on public.settings
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- shipping_methods
-- ---------------------------------------------------------------------------
--
-- Per business unit, never shared. client-decisions.md CONFIRMED: Parfums uses
-- Shalom, Import uses private delivery, Olva is not used anywhere in V2.

create table public.shipping_methods (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units (id) on delete cascade,
  code text not null,
  name text not null,
  notes text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shipping_methods_unit_code_unique unique (business_unit_id, code)
);

create trigger shipping_methods_set_updated_at
  before update on public.shipping_methods
  for each row execute function app.set_updated_at();

insert into public.shipping_methods (business_unit_id, code, name, notes) values
  ('11111111-1111-4111-8111-111111111111', 'shalom', 'Shalom',
   'Agencia a todo el Perú; motorizado y contraentrega en Lima.'),
  ('22222222-2222-4222-8222-222222222222', 'private_delivery', 'Delivery privado',
   'Método propio de Cruzial Import; no hereda la agencia de Parfums.');

-- ---------------------------------------------------------------------------
-- deposit_policies
-- ---------------------------------------------------------------------------
--
-- client-decisions.md CONFIRMED: Import cobra 50% de adelanto a cliente nuevo
-- y 70% a cliente con historial. The percentage lives in data so it is not
-- re-hardcoded at every checkout touch point, and an order snapshots the row
-- that applied to it (see orders.deposit_policy_snapshot).

create table public.deposit_policies (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units (id) on delete cascade,
  customer_status text not null,
  deposit_percentage numeric(5, 2) not null,
  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  source text not null default 'client_confirmed',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deposit_policies_customer_status_check check (customer_status in ('new', 'returning')),
  constraint deposit_policies_percentage_check check (deposit_percentage >= 0 and deposit_percentage <= 100),
  constraint deposit_policies_source_check check (source in ('client_confirmed', 'unknown')),
  constraint deposit_policies_window_check check (
    effective_until is null or effective_until > effective_from
  ),
  constraint deposit_policies_unit_status_from_unique unique (business_unit_id, customer_status, effective_from)
);

create trigger deposit_policies_set_updated_at
  before update on public.deposit_policies
  for each row execute function app.set_updated_at();

insert into public.deposit_policies (business_unit_id, customer_status, deposit_percentage, source) values
  ('22222222-2222-4222-8222-222222222222', 'new', 50.00, 'client_confirmed'),
  ('22222222-2222-4222-8222-222222222222', 'returning', 70.00, 'client_confirmed');

-- ---------------------------------------------------------------------------
-- wholesale_policies
-- ---------------------------------------------------------------------------
--
-- Separates the eligibility RULE from the resulting price. `scope` starts as
-- 'unconfirmed' because client-decisions.md still lists wholesaleThresholdScope
-- (40 units combined vs. per SKU) as UNKNOWN — the enum already contains the
-- candidate values so confirming it later is data, not a type migration.
-- No row is seeded: seeding one would fix the very rule that is unconfirmed.

create table public.wholesale_policies (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units (id) on delete cascade,
  name text not null,
  scope text not null default 'unconfirmed',
  min_quantity integer,
  min_amount numeric(12, 2),
  currency char(3) not null default 'PEN',
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint wholesale_policies_scope_check check (scope in ('per_product', 'per_order', 'unconfirmed')),
  constraint wholesale_policies_min_quantity_check check (min_quantity is null or min_quantity > 0),
  constraint wholesale_policies_min_amount_check check (min_amount is null or min_amount >= 0)
);

create trigger wholesale_policies_set_updated_at
  before update on public.wholesale_policies
  for each row execute function app.set_updated_at();

-- Volume pricing per variant. `context` keeps retail and wholesale tiers in one
-- flexible table instead of rigid price_4 / price_10 columns.
create table public.variant_price_tiers (
  id uuid primary key default gen_random_uuid(),
  product_variant_id uuid not null references public.product_variants (id) on delete cascade,
  wholesale_policy_id uuid references public.wholesale_policies (id) on delete set null,
  context text not null default 'wholesale',
  min_quantity integer not null,
  price_amount numeric(12, 2) not null,
  currency char(3) not null default 'PEN',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint variant_price_tiers_context_check check (context in ('retail', 'wholesale')),
  constraint variant_price_tiers_min_quantity_check check (min_quantity > 0),
  constraint variant_price_tiers_price_check check (price_amount >= 0),
  constraint variant_price_tiers_variant_context_qty_unique unique (product_variant_id, context, min_quantity)
);

create index variant_price_tiers_variant_idx on public.variant_price_tiers (product_variant_id);

create trigger variant_price_tiers_set_updated_at
  before update on public.variant_price_tiers
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- campaigns / campaign_products
-- ---------------------------------------------------------------------------
--
-- client-decisions.md CONFIRMED: consolidado states are
-- draft/scheduled/open/paused/closed/fulfilled. Whether opens_at/closes_at
-- change the state automatically is UNKNOWN, so no trigger does it here — the
-- state is whatever an admin set.

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units (id) on delete cascade,
  number integer not null,
  name text not null,
  status text not null default 'draft',
  opens_at timestamptz,
  closes_at timestamptz,
  public_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint campaigns_status_check check (
    status in ('draft', 'scheduled', 'open', 'paused', 'closed', 'fulfilled')
  ),
  constraint campaigns_window_check check (
    opens_at is null or closes_at is null or closes_at > opens_at
  ),
  constraint campaigns_unit_number_unique unique (business_unit_id, number)
);

create index campaigns_status_idx on public.campaigns (business_unit_id, status) where archived_at is null;

create trigger campaigns_set_updated_at
  before update on public.campaigns
  for each row execute function app.set_updated_at();

-- Price and availability belong to the campaign, not to the base product.
create table public.campaign_products (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  product_variant_id uuid references public.product_variants (id) on delete restrict,
  price_amount numeric(12, 2) not null,
  currency char(3) not null default 'PEN',
  availability_status text not null default 'available',
  quantity_limit integer,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_products_price_check check (price_amount >= 0),
  constraint campaign_products_availability_check check (availability_status in ('available', 'out_of_stock')),
  constraint campaign_products_quantity_limit_check check (quantity_limit is null or quantity_limit > 0),
  constraint campaign_products_campaign_variant_unique unique (campaign_id, product_id, product_variant_id)
);

create index campaign_products_campaign_id_idx on public.campaign_products (campaign_id);

create trigger campaign_products_set_updated_at
  before update on public.campaign_products
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------------
--
-- Per business unit, never a shared cross-unit profile — the same separation
-- the carts already have. verified_customer_status is the persistent state an
-- admin curates over time; it exists precisely because an order's immutable
-- snapshot cannot carry state forward between orders, and the Import deposit
-- percentage depends on it.

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units (id) on delete restrict,
  full_name text not null,
  phone text,
  email text,
  document_id text,
  verified_customer_status text not null default 'pending_verification',
  verified_by uuid references auth.users (id) on delete set null,
  verified_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint customers_verified_status_check check (
    verified_customer_status in ('pending_verification', 'new', 'returning')
  ),
  -- A verified status must record who verified it and when.
  constraint customers_verified_provenance_check check (
    verified_customer_status = 'pending_verification'
    or (verified_at is not null)
  )
);

create index customers_unit_phone_idx on public.customers (business_unit_id, phone);
create index customers_business_unit_id_idx on public.customers (business_unit_id);

create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- orders / order_lines
-- ---------------------------------------------------------------------------
--
-- The browser is never the source of truth for a price. An order stores what
-- the server computed at creation time; changing a product's price tomorrow
-- must not alter a historical order, which is why every commercial value on
-- order_lines is a snapshot column rather than a join.
--
-- status starts at pending_whatsapp_confirmation: generating a WhatsApp
-- message is not a confirmed order and the schema must not let the UI pretend
-- otherwise.

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units (id) on delete restrict,
  order_number text not null,
  campaign_id uuid references public.campaigns (id) on delete set null,
  customer_id uuid references public.customers (id) on delete set null,
  shipping_method_id uuid references public.shipping_methods (id) on delete set null,
  channel text not null default 'whatsapp',
  status text not null default 'pending_whatsapp_confirmation',
  customer_snapshot jsonb not null default '{}'::jsonb,
  delivery_snapshot jsonb not null default '{}'::jsonb,
  claimed_customer_status text,
  verified_customer_status_snapshot text,
  deposit_policy_snapshot jsonb,
  deposit_percentage_snapshot numeric(5, 2),
  subtotal_amount numeric(12, 2) not null default 0,
  currency char(3) not null default 'PEN',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint orders_status_check check (
    status in ('draft', 'pending_whatsapp_confirmation', 'confirmed', 'fulfilled', 'cancelled')
  ),
  constraint orders_channel_check check (channel in ('whatsapp', 'admin')),
  constraint orders_claimed_status_check check (
    claimed_customer_status is null or claimed_customer_status in ('new', 'returning')
  ),
  constraint orders_verified_status_snapshot_check check (
    verified_customer_status_snapshot is null
    or verified_customer_status_snapshot in ('pending_verification', 'new', 'returning')
  ),
  constraint orders_deposit_percentage_check check (
    deposit_percentage_snapshot is null
    or (deposit_percentage_snapshot >= 0 and deposit_percentage_snapshot <= 100)
  ),
  constraint orders_subtotal_check check (subtotal_amount >= 0),
  constraint orders_number_unique unique (order_number)
);

create index orders_business_unit_id_idx on public.orders (business_unit_id);
create index orders_customer_id_idx on public.orders (customer_id);
create index orders_status_idx on public.orders (business_unit_id, status);
create index orders_created_at_idx on public.orders (created_at desc);

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function app.set_updated_at();

create table public.order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  -- FKs are traceability only. They are nullable and ON DELETE SET NULL so
  -- archiving a product can never rewrite or delete order history.
  product_id uuid references public.products (id) on delete set null,
  product_variant_id uuid references public.product_variants (id) on delete set null,
  campaign_product_id uuid references public.campaign_products (id) on delete set null,
  product_name_snapshot text not null,
  variant_label_snapshot text not null,
  variant_snapshot jsonb not null default '{}'::jsonb,
  campaign_snapshot jsonb,
  unit_price_amount numeric(12, 2) not null,
  currency char(3) not null default 'PEN',
  quantity integer not null,
  line_total_amount numeric(12, 2) not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint order_lines_quantity_check check (quantity > 0),
  constraint order_lines_unit_price_check check (unit_price_amount >= 0),
  constraint order_lines_line_total_check check (line_total_amount >= 0)
);

create index order_lines_order_id_idx on public.order_lines (order_id);

-- Defence in depth on top of the snapshot columns: once a line exists, its
-- commercial values are frozen. Corrections happen by cancelling and reissuing
-- an order, never by silently editing history.
create or replace function app.freeze_order_line_snapshot()
returns trigger
language plpgsql
as $$
begin
  if new.product_name_snapshot is distinct from old.product_name_snapshot
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

create trigger order_lines_freeze_snapshot
  before update on public.order_lines
  for each row execute function app.freeze_order_line_snapshot();

revoke all on function app.freeze_order_line_snapshot() from public;
