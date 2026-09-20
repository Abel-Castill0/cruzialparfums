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
