-- Cruzial Platform V2 — Final Product Completion Sprint
--
-- Adds updated_at to admin_get_import_campaign_products's read model. The
-- CSV export/import workflow (CampaignProductsManager) needs a per-offer
-- timestamp to show the admin when each offer was last touched — the same
-- column campaign_products already has, just not previously selected here.
-- Purely additive: same input signature, one new output column.
--
-- True latest already-applied definition of this function is in
-- 20260909050000_import_presentations_and_unconfirmed_availability.sql —
-- rebased on that body, not the earlier 20260909040000 draft.

drop function if exists public.admin_get_import_campaign_products(uuid);

create function public.admin_get_import_campaign_products(p_campaign_id uuid)
returns table (
  id uuid,
  product_id uuid,
  product_variant_id uuid,
  import_presentation_id uuid,
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
  variant_publication_status text,
  presentation_label text,
  presentation_class text,
  presentation_capacity_ml numeric,
  presentation_archived_at timestamptz,
  presentation_publication_status text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    offer.id, offer.product_id, offer.product_variant_id, offer.import_presentation_id,
    offer.price_amount::text, offer.currency, offer.availability_status, offer.sort_order,
    product.name, product.slug, product.brand, product.archived_at, product.publication_status,
    variant.label, variant.archived_at, variant.publication_status,
    presentation.label, presentation.presentation_class, presentation.capacity_ml,
    presentation.archived_at, presentation.publication_status,
    offer.updated_at
  from public.campaign_products offer
  join public.campaigns campaign on campaign.id = offer.campaign_id
  join public.business_units unit on unit.id = campaign.business_unit_id
  join public.products product on product.id = offer.product_id
  left join public.product_variants variant on variant.id = offer.product_variant_id
  left join public.import_presentations presentation on presentation.id = offer.import_presentation_id
  where offer.campaign_id = p_campaign_id
    and unit.code = 'import'
    and app.can_read_unit(campaign.business_unit_id)
  order by offer.sort_order, offer.id
$$;

revoke all on function public.admin_get_import_campaign_products(uuid) from public;
revoke all on function public.admin_get_import_campaign_products(uuid) from anon;
grant execute on function public.admin_get_import_campaign_products(uuid) to authenticated;

comment on function public.admin_get_import_campaign_products(uuid) is
  'Read model for one campaign''s configured offers, including each offer''s own updated_at (added for the CSV export/import bulk workflow — lets the admin see and reason about staleness per row even though the write path (admin_set_campaign_products) is still a whole-campaign optimistic-concurrency full replace, not per-row).';
