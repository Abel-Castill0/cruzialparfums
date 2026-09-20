-- Cruzial Parfums — publication pass (operator-run, idempotent, data only).
--
-- Publishes the commercial catalog that the C3B commercial loader left in
-- `draft`, but ONLY where database truth already satisfies the storefront
-- publication gate. Nothing is published because a row exists; nothing is
-- invented. Rows that fail the gate stay draft and are reported at the end.
--
-- Gate (mirrors apps/web/src/domains/catalog/supabase-public-catalog-repository.ts):
--   categories  : Parfums commercial_type / olfactory_family, not QA, not archived
--   variants    : not archived, currency PEN, price_verification_status in
--                 (official_pdf, client_confirmed); product not archived/hidden
--   products    : not archived/hidden, gender set, name+slug set, brand set
--                 (combos are allowed an empty brand), a published
--                 commercial_type category (non-combos), >= 1 published decant
--                 (non-combos) / >= 1 published variant (combos), a primary
--                 public image (https or self-hosted root path), and for
--                 combos a confirmed composition with items for every
--                 published presentation
--   excluded    : anything whose slug starts with `staging-qa` (QA fixtures),
--                 `sceptre-malachite` (CLIENT_ASSET_MISSING, docs/client-decisions.md)
--
-- Provisional/legacy-priced bottle variants are deliberately NOT published:
-- the decants of the same product can go live while the bottle waits for
-- client approval (docs/client-decisions.md — "24 bottle prices").
--
-- Run:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/provisioning/parfums-publication-pass.sql
-- Safe to re-run: every statement is conditional on current state.

begin;

create temporary table parfums_pub_scope on commit drop as
select b.id as business_unit_id
from public.business_units b
where b.code = 'parfums';

-- 1. Commercial classification categories -------------------------------
update public.categories c
set publication_status = 'published'
from parfums_pub_scope s
where c.business_unit_id = s.business_unit_id
  and c.archived_at is null
  and c.publication_status = 'draft'
  and c.kind in ('commercial_type', 'olfactory_family')
  and c.slug not like 'staging-qa%';

-- 2. Self-hosted client media for the three official combos ------------
-- Byte-identical copies of the legacy storefront's combo photos live in
-- apps/web/public/parfums (see PARFUMS_BRAND_MEDIA). `legacy_static` with a
-- root-relative path is the only non-Cloudinary media the mapper accepts.
insert into public.product_media (product_id, provider, secure_url, alt, sort_order, is_primary, metadata)
select p.id, 'legacy_static', m.url, p.name, m.sort_order, m.is_primary,
       jsonb_build_object('media_role', m.role, 'migration_source', 'release_publication_pass')
from public.products p
join parfums_pub_scope s on s.business_unit_id = p.business_unit_id
join (values
  ('combo-cuarteto', '/parfums/combos/set-cuarteto.webp', 'set',  0, true),
  ('combo-cuarteto', '/parfums/hero/promo-cuarteto.webp', 'hero', 1, false),
  ('combo-vainilla', '/parfums/combos/set-vainilla.webp', 'set',  0, true),
  ('combo-vainilla', '/parfums/hero/promo-vainilla.webp', 'hero', 1, false),
  ('combo-tulum',    '/parfums/combos/set-tulum.webp',    'set',  0, true),
  ('combo-tulum',    '/parfums/hero/promo-tulum.webp',    'hero', 1, false)
) as m(slug, url, role, sort_order, is_primary) on m.slug = p.slug
where p.archived_at is null
  and exists (select 1 from public.combos c where c.product_id = p.id)
  and not exists (
    select 1 from public.product_media x
    where x.product_id = p.id and x.secure_url = m.url and x.archived_at is null
  );

-- 3. Variants with confirmed price authority -----------------------------
update public.product_variants v
set publication_status = 'published'
from public.products p
join parfums_pub_scope s on s.business_unit_id = p.business_unit_id
where v.product_id = p.id
  and v.archived_at is null
  and v.publication_status = 'draft'
  and v.currency = 'PEN'
  and v.price_amount > 0
  and v.price_verification_status in ('official_pdf', 'client_confirmed')
  and p.archived_at is null
  and p.publication_status in ('draft', 'published')
  and p.slug not like 'staging-qa%'
  and p.slug <> 'sceptre-malachite';

-- 4. Products that pass the storefront gate -------------------------------
create temporary table parfums_pub_ready on commit drop as
select p.id, p.slug
from public.products p
join parfums_pub_scope s on s.business_unit_id = p.business_unit_id
left join public.combos c on c.product_id = p.id
where p.archived_at is null
  and p.publication_status = 'draft'
  and p.slug not like 'staging-qa%'
  and p.slug <> 'sceptre-malachite'
  and p.gender in ('women', 'men', 'unisex')
  and p.production_status in ('active', 'discontinued')
  and p.availability_status in ('available', 'out_of_stock')
  and coalesce(p.name, '') <> ''
  and coalesce(p.slug, '') <> ''
  and (c.id is not null or coalesce(p.brand, '') <> '')
  -- primary public image
  and exists (
    select 1 from public.product_media m
    where m.product_id = p.id and m.archived_at is null and m.is_primary
      and (m.secure_url ~ '^https://' or (m.provider = 'legacy_static' and m.secure_url ~ '^/[^/]'))
  )
  -- at least one purchasable published presentation
  and exists (
    select 1 from public.product_variants v
    where v.product_id = p.id and v.archived_at is null and v.publication_status = 'published'
      and (c.id is not null or v.variant_kind = 'decant')
  )
  -- non-combos need exactly one published commercial_type classification
  and (c.id is not null or (
    select count(*) from public.product_categories pc
    join public.categories cat on cat.id = pc.category_id
    where pc.product_id = p.id and cat.kind = 'commercial_type'
      and cat.publication_status = 'published' and cat.archived_at is null
  ) = 1)
  -- combos need a confirmed composition with items for every published presentation
  and (c.id is null or (
    c.composition_verification_status in ('official_pdf', 'client_confirmed')
    and not exists (
      select 1 from public.product_variants v
      where v.product_id = p.id and v.archived_at is null and v.publication_status = 'published'
        and not exists (
          select 1 from public.combo_items ci
          where ci.combo_id = c.id and ci.combo_product_variant_id = v.id
        )
    )
  ));

update public.products p
set publication_status = 'published'
from parfums_pub_ready r
where p.id = r.id;

-- 5. Report ----------------------------------------------------------------
select 'published_now' as item, count(*)::text as value from parfums_pub_ready
union all
select 'published_total', count(*)::text
from public.products p join parfums_pub_scope s on s.business_unit_id = p.business_unit_id
where p.publication_status = 'published' and p.archived_at is null and p.slug not like 'staging-qa%'
union all
select 'still_draft: ' || p.slug,
       concat_ws(', ',
         case when p.gender is null then 'no_gender' end,
         case when coalesce(p.brand, '') = '' and not exists (select 1 from public.combos c where c.product_id = p.id) then 'no_brand' end,
         case when not exists (select 1 from public.product_media m where m.product_id = p.id and m.archived_at is null and m.is_primary) then 'no_primary_media' end,
         case when not exists (select 1 from public.product_variants v where v.product_id = p.id and v.archived_at is null and v.publication_status = 'published') then 'no_published_variant' end,
         case when p.slug = 'sceptre-malachite' then 'client_asset_missing' end)
from public.products p join parfums_pub_scope s on s.business_unit_id = p.business_unit_id
where p.publication_status = 'draft' and p.archived_at is null and p.slug not like 'staging-qa%'
union all
select 'variants_published', count(*)::text
from public.product_variants v join public.products p on p.id = v.product_id
join parfums_pub_scope s on s.business_unit_id = p.business_unit_id
where v.publication_status = 'published' and v.archived_at is null and p.slug not like 'staging-qa%'
union all
select 'variants_draft_' || v.price_verification_status, count(*)::text
from public.product_variants v join public.products p on p.id = v.product_id
join parfums_pub_scope s on s.business_unit_id = p.business_unit_id
where v.publication_status = 'draft' and v.archived_at is null and p.slug not like 'staging-qa%'
group by v.price_verification_status
order by 1;

commit;
