-- Prepare Cruzial Import's next owner-editable consolidado and public preview.
-- The Sixth Consolidado source supplies only reference prices and identity;
-- availability remains unconfirmed, so this scheduled campaign cannot accept
-- orders. Its estimated opening date came from the owner and is editable.

begin;

-- Production-only campaign and policy rows are provisioned separately after
-- the reviewed source-state precheck; keep this migration schema-only.

-- Public-safe identity for the next scheduled Import consolidado.
create or replace function app.public_import_upcoming_campaign_id()
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
    and campaign.status = 'scheduled'
    and campaign.archived_at is null
    and campaign.opens_at is not null
    and (campaign.closes_at is null or campaign.closes_at > now())
$$;

revoke all on function app.public_import_upcoming_campaign_id() from public;

create or replace function public.public_get_import_upcoming_campaign()
returns table (
  campaign_id uuid,
  campaign_number integer,
  campaign_name text,
  opens_at timestamptz,
  closes_at timestamptz,
  public_message text
)
language sql
stable
security definer
set search_path = ''
as $$
  select campaign.id, campaign.number, campaign.name,
         campaign.opens_at, campaign.closes_at, campaign.public_message
  from public.campaigns campaign
  where campaign.id = app.public_import_upcoming_campaign_id()
$$;

create or replace function public.public_list_import_preview_categories()
returns table (slug text, name text, product_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select category.slug, category.name, count(distinct product.id)
  from public.campaigns campaign
  join public.campaign_products offer on offer.campaign_id = campaign.id
  join public.products product on product.id = offer.product_id
  join public.business_units unit on unit.id = campaign.business_unit_id
  join public.product_categories assignment on assignment.product_id = product.id
  join public.categories category on category.id = assignment.category_id
    and category.business_unit_id = product.business_unit_id
    and category.kind = 'import_category'
  where campaign.id = app.public_import_upcoming_campaign_id()
  group by category.slug, category.name, category.sort_order
  order by category.sort_order, category.name
$$;

create or replace function public.public_list_import_campaign_preview(
  p_query text default null,
  p_category_slug text default null,
  p_page integer default 1,
  p_page_size integer default 24
)
returns table (
  campaign_id uuid,
  campaign_number integer,
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
    select left(btrim(coalesce(p_query, '')), 120) as query,
           nullif(left(btrim(coalesce(p_category_slug, '')), 80), '') as category_slug,
           least(greatest(coalesce(p_page, 1), 1), 100) as page,
           least(greatest(coalesce(p_page_size, 24), 1), 40) as page_size
  ), products as (
    select campaign.id as campaign_id, campaign.number as campaign_number,
           product.id as product_id, product.slug, product.name, product.brand,
           category.slug as category_slug, category.name as category_name,
           media.secure_url as media_url, media.alt as media_alt,
           jsonb_agg(jsonb_build_object(
             'id', presentation.id,
             'label', presentation.label,
             'class', presentation.presentation_class,
             'capacityMl', presentation.capacity_ml,
             'price', offer.price_amount::text,
             'currency', offer.currency::text
           ) order by offer.sort_order, presentation.label, offer.id) as presentations,
           min(offer.sort_order) as first_sort_order
    from public.campaigns campaign
    join public.campaign_products offer on offer.campaign_id = campaign.id
    join public.products product on product.id = offer.product_id
    join public.import_presentations presentation
      on presentation.id = offer.import_presentation_id
      and presentation.product_id = product.id
    join public.business_units unit on unit.id = product.business_unit_id
      and unit.code = 'import'
    left join lateral (
      select c.slug, c.name
      from public.product_categories pc
      join public.categories c on c.id = pc.category_id
        and c.business_unit_id = product.business_unit_id
        and c.kind = 'import_category'
      where pc.product_id = product.id
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
    where campaign.id = app.public_import_upcoming_campaign_id()
      and (p_query is null or strpos(lower(product.name), lower(left(btrim(p_query), 120))) > 0
        or strpos(lower(coalesce(product.brand, '')), lower(left(btrim(p_query), 120))) > 0)
    group by campaign.id, campaign.number, product.id, product.slug,
             product.name, product.brand, category.slug, category.name,
             media.secure_url, media.alt
  ), filtered as (
    select products.* from products cross join params
    where params.category_slug is null or products.category_slug = params.category_slug
  ), counted as (
    select filtered.*, count(*) over () as total_count from filtered
  )
  select counted.campaign_id, counted.campaign_number, counted.product_id,
         counted.slug, counted.name, counted.brand, counted.category_slug,
         counted.category_name, counted.media_url, counted.media_alt,
         counted.presentations, counted.total_count
  from counted cross join params
  order by counted.first_sort_order, counted.name, counted.product_id
  limit (select page_size from params)
  offset ((select page - 1 from params) * (select page_size from params))
$$;

create or replace function public.public_get_import_wholesale_rules()
returns table (commercial_type text, min_quantity integer, discount_amount numeric, currency text)
language sql
stable
security definer
set search_path = ''
as $$
  select policy.commercial_type, policy.min_quantity, policy.discount_amount,
         policy.currency::text
  from public.wholesale_policies policy
  join public.business_units unit on unit.id = policy.business_unit_id
  where unit.code = 'import'
    and policy.scope = 'per_commercial_type'
    and policy.is_active
    and policy.archived_at is null
  order by case policy.commercial_type
    when 'arabic' then 1 when 'designer' then 2 when 'niche' then 3 else 4 end
$$;

revoke all on function public.public_get_import_upcoming_campaign() from public;
revoke all on function public.public_list_import_preview_categories() from public;
revoke all on function public.public_list_import_campaign_preview(text, text, integer, integer) from public;
revoke all on function public.public_get_import_wholesale_rules() from public;
grant execute on function public.public_get_import_upcoming_campaign() to anon, authenticated;
grant execute on function public.public_list_import_preview_categories() to anon, authenticated;
grant execute on function public.public_list_import_campaign_preview(text, text, integer, integer) to anon, authenticated;
grant execute on function public.public_get_import_wholesale_rules() to anon, authenticated;

comment on function public.public_get_import_upcoming_campaign() is
  'Public-safe identity of the single future scheduled Import consolidado; no active campaign means preview only.';
comment on function public.public_list_import_campaign_preview(text, text, integer, integer) is
  'Bounded read-only product and reference-price preview for the single future scheduled Import consolidado. It returns no availability or order token.';
comment on function public.public_get_import_wholesale_rules() is
  'Public-safe Import wholesale threshold and discounts, sourced only from active Import-specific policy rows.';

commit;
