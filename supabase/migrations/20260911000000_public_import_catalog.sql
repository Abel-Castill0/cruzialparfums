-- Cruzial Platform V2, Phase 4J5A: public Import campaign/catalog read model.
--
-- The selected campaign is deliberately fail-closed. Exactly one open,
-- non-archived Import campaign whose optional date window contains now() must
-- exist. All public campaign and offer RLS delegates to the same selector.

create or replace function app.public_import_campaign_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case when count(*) = 1 then min(campaign.id::text)::uuid else null end
  from public.campaigns campaign
  join public.business_units unit on unit.id = campaign.business_unit_id
  where unit.code = 'import'
    and campaign.status = 'open'
    and campaign.archived_at is null
    and (campaign.opens_at is null or campaign.opens_at <= now())
    and (campaign.closes_at is null or campaign.closes_at > now())
$$;

revoke all on function app.public_import_campaign_id() from public;

create or replace function app.campaign_is_public(target_campaign uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_campaign is not null
    and target_campaign = app.public_import_campaign_id()
$$;

revoke all on function app.campaign_is_public(uuid) from public;
grant execute on function app.campaign_is_public(uuid) to anon, authenticated;

drop policy if exists campaigns_public_read on public.campaigns;
create policy campaigns_public_read on public.campaigns
  for select to anon, authenticated
  using (app.campaign_is_public(id));

comment on function app.public_import_campaign_id() is
  '4J5A authoritative public Import selector: exactly one open, non-archived campaign inside its optional date window, otherwise null.';
comment on policy campaigns_public_read on public.campaigns is
  '4J5A: direct anonymous campaign reads expose only the single authoritative current Import campaign and fail closed for zero or multiple eligible campaigns.';

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

create or replace function public.public_list_import_categories()
returns table (
  slug text,
  name text,
  product_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with selected_campaign as (
    select app.public_import_campaign_id() as id
  ), eligible_products as (
    select distinct offer.product_id
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
  )
  select category.slug, category.name, count(distinct eligible.product_id)
  from eligible_products eligible
  join public.product_categories link on link.product_id = eligible.product_id
  join public.categories category on category.id = link.category_id
  join public.business_units unit on unit.id = category.business_unit_id
  where unit.code = 'import'
    and category.kind = 'import_category'
    and category.publication_status = 'published'
    and category.archived_at is null
  group by category.id, category.slug, category.name, category.sort_order
  order by category.sort_order, category.name, category.id
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
      offer.sort_order, presentation.label, presentation.presentation_class,
      presentation.capacity_ml
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
      offer.sort_order, presentation.label, presentation.presentation_class,
      presentation.capacity_ml
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

revoke all on function public.public_get_import_current_campaign() from public;
revoke all on function public.public_list_import_categories() from public;
revoke all on function public.public_list_import_catalog(text, text, integer, integer) from public;
revoke all on function public.public_get_import_product(text) from public;

grant execute on function public.public_get_import_current_campaign() to anon, authenticated;
grant execute on function public.public_list_import_categories() to anon, authenticated;
grant execute on function public.public_list_import_catalog(text, text, integer, integer) to anon, authenticated;
grant execute on function public.public_get_import_product(text) to anon, authenticated;

comment on function public.public_get_import_current_campaign() is
  'Public-safe metadata for the single eligible current Import campaign; zero rows when selection fails closed.';
comment on function public.public_list_import_categories() is
  'Public-safe current-campaign Import categories with at least one eligible product offer.';
comment on function public.public_list_import_catalog(text, text, integer, integer) is
  'Bounded 4J5A Import catalog grouped by canonical product. Search, category filtering, pagination and all publication/offer gates execute in PostgreSQL.';
comment on function public.public_get_import_product(text) is
  'Public-safe 4J5A Import product detail for the selected campaign. Source metadata, quantities, audit data and admin statuses are never returned.';
