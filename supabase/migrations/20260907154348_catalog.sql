-- Cruzial Platform V2 — Catalog
--
-- Products, their two independent category axes, variants, media, inventory
-- and combos. No commercial seed data: every price and combo composition in
-- assets/data.js is still CLIENT_PROVIDED_PENDING_RECONFIRMATION
-- (docs/client-decisions.md), so this migration creates structure only.

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------
--
-- `kind` exists because the legacy catalog already carries two orthogonal
-- axes per product: a commercial type (árabe / designer / nicho) and an
-- olfactory family (fresco, ámbar, …). Modelling both as categories of a
-- different kind — instead of two hardcoded columns — is what makes
-- product_categories below a real M2M with a confirmed use case rather than a
-- speculative join table. `parent_id` leaves room for Import subcategories
-- without another table.

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units (id) on delete restrict,
  parent_id uuid references public.categories (id) on delete restrict,
  kind text not null,
  slug text not null,
  name text not null,
  description text,
  spec_schema jsonb not null default '{}'::jsonb,
  publication_status text not null default 'draft',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint categories_kind_check check (kind in ('commercial_type', 'olfactory_family', 'import_category')),
  constraint categories_publication_status_check check (publication_status in ('draft', 'published', 'archived')),
  constraint categories_unit_slug_unique unique (business_unit_id, slug)
);

create index categories_business_unit_id_idx on public.categories (business_unit_id);
create index categories_parent_id_idx on public.categories (parent_id);
create index categories_published_idx on public.categories (business_unit_id, publication_status) where archived_at is null;

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------
--
-- Three independent status axes (client-decisions.md CONFIRMED 2026-09-06:
-- "los descontinuados ya no se fabrican pero nosotros sí lo tenemos"):
--   production_status   — does the house still make it?
--   availability_status — can we ship it right now?
--   publication_status  — is it visible on the storefront?
-- discontinued + available + published is a valid, sellable combination and
-- must stay that way. They are never collapsed back into one enum.
--
-- Featured fields live here rather than in a separate merchandising table:
-- there is exactly one placement today (the Home rail), the admin needs to set
-- a flag/rank/window per product, and the runtime contract already implemented
-- in the legacy adapter uses these same four names. A merchandising table
-- would only earn its keep with multiple named slots, which is not confirmed.

create table public.products (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units (id) on delete restrict,
  legacy_id text,
  slug text not null,
  name text not null,
  brand text,
  short_description text,
  description text,
  gender text,
  concentration text,
  sales_mode text not null default 'always_available',
  production_status text not null default 'active',
  availability_status text not null default 'available',
  publication_status text not null default 'draft',
  is_featured boolean not null default false,
  featured_rank integer,
  featured_from timestamptz,
  featured_until timestamptz,
  verification_status text not null default 'legacy',
  specs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint products_sales_mode_check check (sales_mode in ('campaign', 'always_available', 'catalog_only')),
  constraint products_production_status_check check (production_status in ('active', 'discontinued')),
  constraint products_availability_status_check check (availability_status in ('available', 'out_of_stock')),
  constraint products_publication_status_check check (publication_status in ('draft', 'published', 'archived')),
  constraint products_verification_status_check check (
    verification_status in ('legacy', 'client_confirmed', 'derived_validated', 'official_pdf', 'unknown')
  ),
  constraint products_unit_slug_unique unique (business_unit_id, slug),
  constraint products_unit_legacy_id_unique unique (business_unit_id, legacy_id),
  -- A featured window cannot end before it starts.
  constraint products_featured_window_check check (
    featured_from is null or featured_until is null or featured_until > featured_from
  ),
  -- A rank only means something on a featured product.
  constraint products_featured_rank_check check (
    featured_rank is null or (is_featured and featured_rank >= 0)
  )
);

create index products_business_unit_id_idx on public.products (business_unit_id);
create index products_published_idx on public.products (business_unit_id, publication_status) where archived_at is null;
create index products_sales_mode_idx on public.products (business_unit_id, sales_mode);
create index products_featured_idx on public.products (business_unit_id, featured_rank)
  where is_featured and archived_at is null;
create index products_legacy_id_idx on public.products (legacy_id);

create trigger products_set_updated_at
  before update on public.products
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- product_categories
-- ---------------------------------------------------------------------------

create table public.product_categories (
  product_id uuid not null references public.products (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete restrict,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (product_id, category_id)
);

create index product_categories_category_id_idx on public.product_categories (category_id);

-- ---------------------------------------------------------------------------
-- product_variants
-- ---------------------------------------------------------------------------
--
-- 3 / 5 / 10 ml and the full bottle are rows, never columns. Money is
-- numeric + currency, never float.

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  sku text,
  variant_kind text not null,
  size_ml numeric(8, 2),
  label text not null,
  option_values jsonb not null default '{}'::jsonb,
  price_amount numeric(12, 2) not null,
  currency char(3) not null default 'PEN',
  publication_status text not null default 'draft',
  sort_order integer not null default 0,
  price_verification_status text not null default 'legacy',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint product_variants_kind_check check (variant_kind in ('decant', 'bottle')),
  constraint product_variants_publication_status_check check (publication_status in ('draft', 'published', 'archived')),
  constraint product_variants_price_check check (price_amount >= 0),
  constraint product_variants_size_check check (size_ml is null or size_ml > 0),
  constraint product_variants_price_verification_check check (
    price_verification_status in ('legacy', 'client_confirmed', 'official_pdf', 'unknown')
  ),
  constraint product_variants_sku_unique unique (sku),
  constraint product_variants_product_label_unique unique (product_id, label)
);

create index product_variants_product_id_idx on public.product_variants (product_id);
create index product_variants_published_idx on public.product_variants (product_id, publication_status) where archived_at is null;

create trigger product_variants_set_updated_at
  before update on public.product_variants
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- inventory
-- ---------------------------------------------------------------------------
--
-- client-decisions.md UNKNOWN: "Regla de inventario: cantidad exacta, solo
-- estado, reservas, oversell o backorder." So the table supports both modes
-- and a check constraint makes the impossible states unrepresentable: a
-- status_only row may not carry a quantity, a tracked_quantity row must.
-- Reservations / oversell / backorder are deliberately absent until confirmed.

create table public.inventory (
  id uuid primary key default gen_random_uuid(),
  product_variant_id uuid not null references public.product_variants (id) on delete cascade,
  inventory_mode text not null default 'status_only',
  quantity_on_hand integer,
  availability_status text not null default 'available',
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_mode_check check (inventory_mode in ('status_only', 'tracked_quantity')),
  constraint inventory_availability_status_check check (availability_status in ('available', 'out_of_stock')),
  constraint inventory_quantity_check check (
    (inventory_mode = 'status_only' and quantity_on_hand is null)
    or (inventory_mode = 'tracked_quantity' and quantity_on_hand is not null and quantity_on_hand >= 0)
  ),
  constraint inventory_variant_unique unique (product_variant_id)
);

create trigger inventory_set_updated_at
  before update on public.inventory
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- product_media
-- ---------------------------------------------------------------------------
--
-- Provider-agnostic on purpose. No Cloudinary upload happens in this phase and
-- no original in img/perfumes/ is touched or migrated destructively.

create table public.product_media (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  product_variant_id uuid references public.product_variants (id) on delete set null,
  provider text not null default 'legacy_static',
  public_id text,
  secure_url text not null,
  width integer,
  height integer,
  bytes integer,
  format text,
  checksum text,
  alt text,
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint product_media_provider_check check (provider in ('legacy_static', 'cloudinary')),
  constraint product_media_dimensions_check check (
    (width is null or width > 0) and (height is null or height > 0)
  )
);

create index product_media_product_id_idx on public.product_media (product_id);
create unique index product_media_single_primary_idx on public.product_media (product_id)
  where is_primary and archived_at is null;

create trigger product_media_set_updated_at
  before update on public.product_media
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- combos / combo_items
-- ---------------------------------------------------------------------------
--
-- Structure only. The three legacy sets stay CLIENT_PROVIDED_PENDING_
-- RECONFIRMATION and are NOT seeded here: publishing them from a migration
-- would turn unverified legacy parity into stated commercial fact.

create table public.combos (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  composition_verification_status text not null default 'pending_reconfirmation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint combos_composition_verification_check check (
    composition_verification_status in ('pending_reconfirmation', 'client_confirmed', 'unknown')
  ),
  constraint combos_product_unique unique (product_id)
);

create trigger combos_set_updated_at
  before update on public.combos
  for each row execute function app.set_updated_at();

create table public.combo_items (
  id uuid primary key default gen_random_uuid(),
  combo_id uuid not null references public.combos (id) on delete cascade,
  product_variant_id uuid not null references public.product_variants (id) on delete restrict,
  quantity integer not null default 1,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint combo_items_quantity_check check (quantity > 0),
  constraint combo_items_combo_variant_unique unique (combo_id, product_variant_id)
);

create index combo_items_combo_id_idx on public.combo_items (combo_id);
