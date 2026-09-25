-- Cruzial Platform V2 — Operations Foundation V1 (Task 2)
--
-- Exposes the immutable campaign id alongside the campaign number on the two
-- public Import RPCs that describe "the current consolidado". The Import
-- cart is browser-persisted (localStorage) and must be able to tell whether
-- a stored cart still belongs to the currently active consolidado. Campaign
-- number alone is not a safe identity to key that comparison on long-term
-- (it is a human-facing sequence, not a uniqueness guarantee), so the client
-- needs the real uuid when one is available.
--
-- Additive: both functions already select `campaign.id` internally to
-- resolve the row — this only adds it to the returned column list.
--
-- public_get_import_product's body below is rebased on its TRUE latest
-- already-applied definition from 20260911010000_import_order_foundation.sql
-- (which added the offerId/offerUpdatedAt jsonb fields on top of
-- 20260911000000's original body) — not on the older 20260911000000 body.
--
-- SECTION 3 (P1 correction, Codex review): public_list_import_catalog is
-- also rebased on its TRUE latest already-applied body from that same
-- 20260911010000 migration, additionally stamping every returned row with
-- the campaign_id/campaign_number that PRODUCED that row (same
-- selected_campaign CTE, same statement) — see that section's own header
-- comment for the race this closes. Input signature (p_query/p_category_
-- slug/p_page/p_page_size) is unchanged — only output columns are added, so
-- this stays backward compatible with any caller still on the old row
-- shape (extra columns are additive, never observed by a caller that
-- doesn't ask for them).

drop function if exists public.public_get_import_current_campaign();

create function public.public_get_import_current_campaign()
returns table (
  id uuid,
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
  select campaign.id, campaign.number, campaign.name, campaign.opens_at,
    campaign.closes_at, campaign.public_message
  from public.campaigns campaign
  where campaign.id = app.public_import_campaign_id()
$$;

revoke all on function public.public_get_import_current_campaign() from public;
grant execute on function public.public_get_import_current_campaign() to anon, authenticated;

comment on function public.public_get_import_current_campaign() is
  'Public read of the single currently-open Import consolidado (id included so clients can key stale-cart detection on an immutable identity, not just the display number).';

drop function if exists public.public_get_import_product(text);

create function public.public_get_import_product(p_slug text)
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
  campaign_id uuid,
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
    selected.id,
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
    selected.id, selected.number, selected.name, selected.closes_at
$$;

revoke all on function public.public_get_import_product(text) from public;
grant execute on function public.public_get_import_product(text) to anon, authenticated;

comment on function public.public_get_import_product(text) is
  'Public read of one published Import product under the current consolidado (campaign_id included so clients can key stale-cart detection on an immutable identity, not just the display number).';

-- =========================================================================
-- SECTION 3: public_list_import_catalog — stamp rows with their own
-- campaign identity (P1 correction, Codex review)
--
-- readCatalog() previously read the "current campaign" (this function's
-- sibling above) and the catalog page as two INDEPENDENT statements. If the
-- consolidado rolled over between them, the UI could stamp campaign B's
-- offers with campaign A's uuid (Add-to-cart writes that id into the cart).
-- Fix: every catalog row now carries the campaign_id/campaign_number that
-- produced it, from the SAME selected_campaign CTE as the offers
-- themselves — never a second, separately-resolved lookup. The repository
-- layer (PublicImportRepository.readCatalog) compares this against the
-- separately-read "current campaign" display context and fails closed
-- (one bounded retry, then a safe error state) on a genuine mismatch.
-- =========================================================================

drop function if exists public.public_list_import_catalog(text, text, integer, integer);

create function public.public_list_import_catalog(
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
  campaign_id uuid,
  campaign_number integer,
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
    select campaign.id, campaign.number
    from public.campaigns campaign
    where campaign.id = app.public_import_campaign_id()
  ), eligible_offers as (
    select offer.id, offer.product_id, offer.import_presentation_id,
      offer.price_amount, offer.currency::text, offer.availability_status,
      offer.sort_order, offer.updated_at, presentation.label,
      presentation.presentation_class, presentation.capacity_ml,
      selected.id as campaign_id, selected.number as campaign_number
    from selected_campaign selected
    join public.campaign_products offer on offer.campaign_id = selected.id
    join public.products product on product.id = offer.product_id
    join public.import_presentations presentation
      on presentation.id = offer.import_presentation_id
      and presentation.product_id = product.id
    join public.business_units unit on unit.id = product.business_unit_id
    where unit.code = 'import'
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
      offer.campaign_id,
      offer.campaign_number,
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
      category.slug, category.name, media.secure_url, media.alt,
      offer.campaign_id, offer.campaign_number
  ), counted as (
    select grouped.*, count(*) over () as total_count
    from grouped
  )
  select counted.product_id, counted.slug, counted.name, counted.brand,
    counted.category_slug, counted.category_name, counted.media_url,
    counted.media_alt, counted.presentations,
    counted.campaign_id, counted.campaign_number, counted.total_count
  from counted
  cross join params
  order by counted.first_sort_order, counted.name, counted.product_id
  limit least(greatest(coalesce(p_page_size, 24), 1), 40)
  offset (
    (least(greatest(coalesce(p_page, 1), 1), 100) - 1)
    * least(greatest(coalesce(p_page_size, 24), 1), 40)
  )
$$;

revoke all on function public.public_list_import_catalog(text, text, integer, integer) from public;
grant execute on function public.public_list_import_catalog(text, text, integer, integer) to anon, authenticated;

comment on function public.public_list_import_catalog(text, text, integer, integer) is
  'Public read of the Import catalog page for the current consolidado. Every row carries the campaign_id/campaign_number that produced it (same statement as the offers), so callers can detect a campaign rollover between this read and a separately-read "current campaign" display context instead of stamping an offer with the wrong campaign identity.';
