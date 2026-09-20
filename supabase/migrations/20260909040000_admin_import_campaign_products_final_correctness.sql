-- Cruzial Platform V2 — 4J2 final correctness patch
--
-- PostgREST serializes numeric columns through its JSON number path. Campaign
-- prices require an exact decimal-text read boundary, so this narrowly scoped
-- admin RPC casts only campaign_products.price_amount to text in PostgreSQL.

create or replace function public.admin_get_import_campaign_products(
  p_campaign_id uuid
)
returns table (
  id uuid,
  product_id uuid,
  product_variant_id uuid,
  price_amount text,
  currency text,
  availability_status text,
  sort_order integer,
  product_name text,
  product_slug text,
  product_brand text,
  product_archived_at timestamptz,
  product_publication_status text,
  variant_label text,
  variant_archived_at timestamptz,
  variant_publication_status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    cp.id,
    cp.product_id,
    cp.product_variant_id,
    cp.price_amount::text,
    cp.currency,
    cp.availability_status,
    cp.sort_order,
    p.name,
    p.slug,
    p.brand,
    p.archived_at,
    p.publication_status,
    v.label,
    v.archived_at,
    v.publication_status
  from public.campaign_products cp
  join public.campaigns c on c.id = cp.campaign_id
  join public.business_units bu on bu.id = c.business_unit_id
  join public.products p on p.id = cp.product_id
  left join public.product_variants v on v.id = cp.product_variant_id
  where cp.campaign_id = p_campaign_id
    and bu.code = 'import'
    and app.can_read_unit(c.business_unit_id)
  order by cp.sort_order, cp.id
$$;

revoke all on function public.admin_get_import_campaign_products(uuid) from public;
revoke all on function public.admin_get_import_campaign_products(uuid) from anon;
grant execute on function public.admin_get_import_campaign_products(uuid) to authenticated;

comment on function public.admin_get_import_campaign_products(uuid) is
  'Bounded-to-one-campaign Import admin/viewer read. Returns campaign price as '
  'PostgreSQL decimal text so authoritative money never crosses a JS number.';
