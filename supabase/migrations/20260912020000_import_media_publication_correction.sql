-- Cruzial Platform V2 — Import media + publication correction (Phase 4J5D gate)
--
-- Additive correction migration for 20260912010000.
-- The original migration is already applied to staging and is NOT modified.
--
-- Sections:
-- 1.   Readiness rewrite — commercial readiness independent of campaign open state
-- 2.   Blocker list RPC with bounded pagination
-- 3.   Media write boundary — close RLS bypass
-- 4.   Revoke direct table write privileges on product_media
-- 5.   Rewrite media RPCs as SECURITY DEFINER + P2011
--
-- Public gate parity:
--   public_list_import_catalog requires:
--     product.publication_status = 'published' AND product.archived_at IS NULL
--     presentation.publication_status = 'published' AND presentation.archived_at IS NULL
--     offer.availability_status IN ('available','out_of_stock') AND offer.price_amount > 0
--   Campaign must exist (public_import_campaign_id returns non-null).
--   These are the SAME conditions used below for commercial readiness.

-- =========================================================================
-- SECTION 1: Rewrite admin_get_import_publication_readiness
--
-- Removes campaign_status != 'open' as a per-product blocker.
-- Campaign merely not-open-yet is NOT a product-level commercial blocker.
-- Adds ready_for_manual_open: TRUE when all commercial/media blockers are
-- zero AND campaign exists in a valid pre-open state.
-- Returns explicit machine-readable fields.
-- =========================================================================

drop function if exists public.admin_get_import_publication_readiness();

create function public.admin_get_import_publication_readiness()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_unit uuid;
  v_result jsonb;
  v_campaign_id uuid;
  v_campaign_number bigint;
  v_campaign_status text;
  v_campaign_exists boolean := false;
begin
  select bu.id into v_unit from public.business_units bu where bu.code = 'import';
  if v_unit is null or not app.can_read_unit(v_unit) then
    raise exception 'cannot read Import readiness' using errcode = '42501';
  end if;

  select c.id, c.number::bigint, c.status
    into v_campaign_id, v_campaign_number, v_campaign_status
    from public.campaigns c
    where c.business_unit_id = v_unit and c.number = 6 and c.archived_at is null
    order by c.created_at desc limit 1;

  v_campaign_exists := v_campaign_id is not null;

  with media_stats as (
    select p.id,
      bool_or(pm.is_primary and pm.archived_at is null) has_primary,
      count(distinct pm.id) filter(where pm.archived_at is null) active_count
    from public.products p
    left join public.product_media pm on pm.product_id = p.id
    where p.business_unit_id = v_unit and p.archived_at is null
    group by p.id
  ),
  product_readiness as (
    select
      p.id, p.name,
      p.publication_status,
      coalesce(ms.has_primary, false) has_primary,
      coalesce(ms.active_count, 0) active_media_count,
      count(distinct ip.id) filter(where ip.archived_at is null) active_presentations,
      count(distinct ip.id) filter(where ip.archived_at is null and ip.publication_status = 'published') published_presentations,
      count(distinct cp.id) campaign_offers,
      count(distinct cp.id) filter(where cp.availability_status = 'unconfirmed') unconfirmed_offers,
      count(distinct cp.id) filter(where cp.availability_status in ('available', 'out_of_stock') and cp.price_amount > 0) valid_offers,
      count(distinct cp.id) filter(where cp.availability_status in ('available', 'out_of_stock') and cp.price_amount <= 0) invalid_price_offers
    from public.products p
    left join media_stats ms on ms.id = p.id
    left join public.import_presentations ip on ip.product_id = p.id
    left join public.campaign_products cp on cp.product_id = p.id
      and v_campaign_exists and cp.campaign_id = v_campaign_id
    where p.business_unit_id = v_unit and p.archived_at is null
    group by p.id, p.name, p.publication_status, ms.has_primary, ms.active_count
  ),
  blockers as (
    select
      pr.id, pr.name,
      case when pr.publication_status != 'published' then 'product_unpublished' end as b_pub_product,
      case when pr.published_presentations = 0 and pr.active_presentations > 0 then 'presentation_unpublished' end as b_pub_presentation,
      case when not pr.has_primary then 'missing_primary_media' end as b_media,
      case when pr.campaign_offers = 0 and pr.active_presentations > 0 then 'missing_offer' end as b_no_offer,
      case when pr.unconfirmed_offers > 0 then 'offer_unconfirmed' end as b_offer_unconfirmed,
      case when pr.invalid_price_offers > 0 then 'offer_invalid_price' end as b_offer_invalid_price,
      pr.campaign_offers, pr.unconfirmed_offers, pr.valid_offers, pr.invalid_price_offers
    from product_readiness pr
  )
  select jsonb_build_object(
    'total_products', (select count(*) from public.products p where p.business_unit_id = v_unit and p.archived_at is null),
    'ready_products', (select count(*) from blockers b where b.b_pub_product is null and b.b_pub_presentation is null
      and b.b_media is null and b.b_no_offer is null and b.b_offer_unconfirmed is null and b.b_offer_invalid_price is null),
    'commercial_blockers', (select count(*) from blockers b where b.b_no_offer is not null or b.b_offer_unconfirmed is not null or b.b_offer_invalid_price is not null),
    'media_blockers', (select count(*) from blockers b where b.b_media is not null),
    'publication_blockers', (select count(*) from blockers b where b.b_pub_product is not null or b.b_pub_presentation is not null),
    'unconfirmed_offer_count', coalesce((select count(*) from public.campaign_products cp
      where cp.campaign_id = v_campaign_id and cp.availability_status = 'unconfirmed'), 0),
    'invalid_price_offer_count', coalesce((select count(*) from public.campaign_products cp
      where cp.campaign_id = v_campaign_id and cp.availability_status in ('available', 'out_of_stock')
      and cp.price_amount <= 0), 0),
    'candidate_product_count', (select count(*) from public.products p where p.business_unit_id = v_unit and p.archived_at is null),
    'ready_for_manual_open', (
      v_campaign_exists
      and (select count(*) from blockers b where b.b_pub_product is not null or b.b_pub_presentation is not null
        or b.b_media is not null or b.b_no_offer is not null
        or b.b_offer_unconfirmed is not null or b.b_offer_invalid_price is not null) = 0
    ),
    'campaign_exists', v_campaign_exists,
    'campaign_number', v_campaign_number,
    'campaign_status', v_campaign_status
  ) into v_result;

  return v_result;
end $$;

revoke all on function public.admin_get_import_publication_readiness() from public,anon;
grant execute on function public.admin_get_import_publication_readiness() to authenticated;

-- =========================================================================
-- SECTION 2: admin_list_import_publication_blockers — bounded blocker inspection
--
-- Returns per-product/per-presentation/per-offer blocker rows with:
--   product_id, product_name, brand, slug, presentation_id (nullable),
--   presentation_label (nullable), offer_id (nullable),
--   blocker_code, blocker_label, total_count
--
-- Bounded: page_size <= 50, deterministic ordering.
-- =========================================================================

create function public.admin_list_import_publication_blockers(
  p_query text default null,
  p_blocker text default null,
  p_page integer default 1,
  p_page_size integer default 20
)
returns table (
  product_id uuid,
  product_name text,
  brand text,
  slug text,
  presentation_id uuid,
  presentation_label text,
  offer_id uuid,
  blocker_code text,
  blocker_label text,
  total_count bigint
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_unit uuid;
  v_page integer := greatest(1, coalesce(p_page, 1));
  v_size integer := least(50, greatest(1, coalesce(p_page_size, 20)));
  v_query text := left(btrim(coalesce(p_query, '')), 120);
  v_blocker text := btrim(coalesce(p_blocker, ''));
  v_campaign_id uuid;
begin
  select bu.id into v_unit from public.business_units bu where bu.code = 'import';
  if v_unit is null or not app.can_read_unit(v_unit) then
    raise exception 'cannot read Import blockers' using errcode = '42501';
  end if;

  if v_blocker != '' and v_blocker not in (
    'product_unpublished', 'presentation_unpublished', 'presentation_archived',
    'missing_primary_media', 'missing_offer', 'offer_unconfirmed',
    'offer_invalid_price', 'offer_invalid_availability', 'category_not_public',
    'no_active_presentations'
  ) then
    raise exception 'invalid blocker filter' using errcode = '22023';
  end if;

  select c.id into v_campaign_id
    from public.campaigns c
    where c.business_unit_id = v_unit and c.number = 6 and c.archived_at is null
    order by c.created_at desc limit 1;

  return query
  with product_blockers as (
    select
      p.id as product_id, p.name as product_name, p.brand, p.slug,
      null::uuid as presentation_id, null::text as presentation_label,
      null::uuid as offer_id,
      case
        when p.publication_status != 'published' then 'product_unpublished'::text
        when not exists (
          select 1 from public.import_presentations ip2
          where ip2.product_id = p.id and ip2.archived_at is null
        ) then 'no_active_presentations'::text
        when not exists (
          select 1 from public.import_presentations ip2
          where ip2.product_id = p.id and ip2.archived_at is null and ip2.publication_status = 'published'
        ) then 'presentation_unpublished'::text
        when not exists (
          select 1 from public.product_media pm2
          where pm2.product_id = p.id and pm2.archived_at is null and pm2.is_primary
        ) then 'missing_primary_media'::text
      end as blocker_code,
      case
        when p.publication_status != 'published' then 'Producto no publicado'::text
        when not exists (
          select 1 from public.import_presentations ip2
          where ip2.product_id = p.id and ip2.archived_at is null
        ) then 'Sin presentaciones activas'::text
        when not exists (
          select 1 from public.import_presentations ip2
          where ip2.product_id = p.id and ip2.archived_at is null and ip2.publication_status = 'published'
        ) then 'Ninguna presentacion publicada'::text
        when not exists (
          select 1 from public.product_media pm2
          where pm2.product_id = p.id and pm2.archived_at is null and pm2.is_primary
        ) then 'Sin imagen principal'::text
      end as blocker_label
    from public.products p
    where p.business_unit_id = v_unit and p.archived_at is null
      and (
        p.publication_status != 'published'
        or not exists (select 1 from public.import_presentations ip2 where ip2.product_id = p.id and ip2.archived_at is null)
        or not exists (select 1 from public.import_presentations ip2 where ip2.product_id = p.id and ip2.archived_at is null and ip2.publication_status = 'published')
        or not exists (select 1 from public.product_media pm2 where pm2.product_id = p.id and pm2.archived_at is null and pm2.is_primary)
      )
  ),
  offer_blockers as (
    select
      p.id as product_id, p.name as product_name, p.brand, p.slug,
      ip.id as presentation_id, ip.label as presentation_label,
      cp.id as offer_id,
      case
        when cp.availability_status = 'unconfirmed' then 'offer_unconfirmed'::text
        when cp.availability_status not in ('available', 'out_of_stock') then 'offer_invalid_availability'::text
        when cp.price_amount <= 0 then 'offer_invalid_price'::text
      end as blocker_code,
      case
        when cp.availability_status = 'unconfirmed' then 'Disponibilidad por confirmar'::text
        when cp.availability_status not in ('available', 'out_of_stock') then 'Estado de disponibilidad invalido'::text
        when cp.price_amount <= 0 then 'Precio invalido'::text
      end as blocker_label
    from public.campaign_products cp
    join public.products p on p.id = cp.product_id and p.business_unit_id = v_unit
    left join public.import_presentations ip on ip.id = cp.import_presentation_id
    where cp.campaign_id = v_campaign_id
      and (
        cp.availability_status = 'unconfirmed'
        or cp.availability_status not in ('available', 'out_of_stock')
        or cp.price_amount <= 0
      )
  ),
  missing_offer_blockers as (
    select
      p.id as product_id, p.name as product_name, p.brand, p.slug,
      null::uuid as presentation_id, null::text as presentation_label,
      null::uuid as offer_id,
      'missing_offer'::text as blocker_code,
      'Sin oferta en consolidado'::text as blocker_label
    from public.products p
    where p.business_unit_id = v_unit and p.archived_at is null
      and p.publication_status = 'published'
      and exists (select 1 from public.import_presentations ip where ip.product_id = p.id and ip.archived_at is null and ip.publication_status = 'published')
      and v_campaign_id is not null
      and not exists (select 1 from public.campaign_products cp where cp.product_id = p.id and cp.campaign_id = v_campaign_id)
  ),
  all_blockers as (
    select * from product_blockers
    union all
    select * from offer_blockers
    union all
    select * from missing_offer_blockers
  ),
  filtered as (
    select ab.*
    from all_blockers ab
    where
      (v_query = '' or ab.product_name ilike '%' || v_query || '%'
        or coalesce(ab.brand, '') ilike '%' || v_query || '%'
        or ab.slug ilike '%' || v_query || '%')
      and (v_blocker = '' or ab.blocker_code = v_blocker)
  ),
  counted as (
    select f.*, count(*) over() as total_count
    from filtered f
  )
  select c.product_id, c.product_name, c.brand, c.slug,
    c.presentation_id, c.presentation_label, c.offer_id,
    c.blocker_code, c.blocker_label, c.total_count
  from counted c
  order by c.blocker_code, c.product_name, c.presentation_label, c.offer_id
  limit v_size offset (v_page - 1) * v_size;
end $$;

revoke all on function public.admin_list_import_publication_blockers(text,text,integer,integer) from public,anon;
grant execute on function public.admin_list_import_publication_blockers(text,text,integer,integer) to authenticated;

-- =========================================================================
-- SECTION 3: Media write boundary — close RLS bypass
--
-- The product_media_admin_write FOR ALL policy allows authenticated users
-- to directly INSERT/UPDATE/DELETE product_media, bypassing the audit/invariant
-- RPCs (admin_register_media, admin_update_media, etc.).
--
-- Replace with SELECT-only policy. All writes must flow through the
-- SECURITY DEFINER media RPCs.
-- =========================================================================

drop policy if exists product_media_admin_write on public.product_media;

-- No INSERT/UPDATE/DELETE policies — authenticated cannot write directly.
-- The media RPCs are SECURITY DEFINER and bypass RLS.
-- SELECT remains via product_media_admin_read (already exists).

-- =========================================================================
-- SECTION 4: Revoke direct table write privileges on product_media
--
-- Defence-in-depth: even if a policy is accidentally re-added,
-- the REVOKE prevents direct table writes by authenticated.
-- =========================================================================

revoke INSERT, UPDATE, DELETE ON public.product_media FROM authenticated;

-- =========================================================================
-- SECTION 5: Rewrite media RPCs as SECURITY DEFINER
--
-- Drop and recreate the 6 media RPCs with:
--   - SECURITY DEFINER (owned by postgres)
--   - safe search_path = ''
--   - P2011 instead of 40001 for optimistic concurrency
--   - Explicit GRANT to authenticated
--   - REVOKE from public,anon
-- =========================================================================

-- admin_register_media — SECURITY DEFINER
drop function if exists public.admin_register_media(uuid,text,text,uuid,text,integer,integer,integer,text,text,boolean);

create function public.admin_register_media(
  p_product_id uuid,
  p_secure_url text,
  p_provider text default 'cloudinary',
  p_variant_id uuid default null,
  p_public_id text default null,
  p_width integer default null,
  p_height integer default null,
  p_bytes integer default null,
  p_format text default null,
  p_alt text default null,
  p_set_primary boolean default false
)
returns public.product_media
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products;
  v_variant_product_id uuid;
  v_row public.product_media;
begin
  select * into v_product from public.products where id = p_product_id;
  if v_product.id is null then
    raise exception 'product not found' using errcode = 'P0002';
  end if;

  perform app.assert_admin_for(v_product.business_unit_id);

  if p_variant_id is not null then
    select product_id into v_variant_product_id
    from public.product_variants
    where id = p_variant_id;

    if v_variant_product_id is null then
      raise exception 'variant not found' using errcode = 'P0002';
    end if;
    if v_variant_product_id <> p_product_id then
      raise exception 'variant does not belong to this product' using errcode = 'P2004';
    end if;
  end if;

  if p_provider not in ('legacy_static', 'cloudinary') then
    raise exception 'unsupported media provider' using errcode = '22023';
  end if;

  insert into public.product_media (
    product_id, product_variant_id, provider, public_id, secure_url,
    width, height, bytes, format, alt, sort_order, is_primary
  )
  values (
    p_product_id, p_variant_id, p_provider, p_public_id, p_secure_url,
    p_width, p_height, p_bytes, p_format, p_alt,
    coalesce((select max(sort_order) + 1 from public.product_media where product_id = p_product_id), 0),
    false
  )
  returning * into v_row;

  if p_set_primary then
    update public.product_media
    set is_primary = false
    where product_id = p_product_id and id <> v_row.id and is_primary and archived_at is null;

    update public.product_media
    set is_primary = true
    where id = v_row.id
    returning * into v_row;
  end if;

  perform app.write_audit_log(v_product.business_unit_id, 'create', 'product_media', v_row.id, null, to_jsonb(v_row));

  return v_row;
end;
$$;

revoke all on function public.admin_register_media(uuid,text,text,uuid,text,integer,integer,integer,text,text,boolean) from public;
grant execute on function public.admin_register_media(uuid,text,text,uuid,text,integer,integer,integer,text,text,boolean) to authenticated;

-- admin_update_media — SECURITY DEFINER + P2011
drop function if exists public.admin_update_media(uuid,timestamptz,text,uuid);

create function public.admin_update_media(
  p_media_id uuid,
  p_expected_updated_at timestamptz,
  p_alt text,
  p_variant_id uuid
)
returns public.product_media
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_unit_id uuid;
  v_before public.product_media;
  v_after public.product_media;
  v_variant_product_id uuid;
begin
  select * into v_before from public.product_media where id = p_media_id;
  if v_before.id is null then
    raise exception 'media not found' using errcode = 'P0002';
  end if;

  v_business_unit_id := app.media_unit(p_media_id);
  perform app.assert_admin_for(v_business_unit_id);

  if p_variant_id is not null then
    select product_id into v_variant_product_id
    from public.product_variants
    where id = p_variant_id;

    if v_variant_product_id is null then
      raise exception 'variant not found' using errcode = 'P0002';
    end if;
    if v_variant_product_id <> v_before.product_id then
      raise exception 'variant does not belong to this product' using errcode = 'P2004';
    end if;
  end if;

  update public.product_media
  set alt = p_alt, product_variant_id = p_variant_id
  where id = p_media_id and updated_at = p_expected_updated_at
  returning * into v_after;

  if v_after.id is null then
    raise exception 'media was modified by another session' using errcode = 'P2011';
  end if;

  perform app.write_audit_log(v_business_unit_id, 'update', 'product_media', p_media_id, to_jsonb(v_before), to_jsonb(v_after));

  return v_after;
end;
$$;

revoke all on function public.admin_update_media(uuid,timestamptz,text,uuid) from public;
grant execute on function public.admin_update_media(uuid,timestamptz,text,uuid) to authenticated;

-- admin_set_media_primary — SECURITY DEFINER + P2011
drop function if exists public.admin_set_media_primary(uuid,timestamptz);

create function public.admin_set_media_primary(
  p_media_id uuid,
  p_expected_updated_at timestamptz
)
returns public.product_media
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_unit_id uuid;
  v_before public.product_media;
  v_after public.product_media;
begin
  select * into v_before from public.product_media where id = p_media_id;
  if v_before.id is null then
    raise exception 'media not found' using errcode = 'P0002';
  end if;

  v_business_unit_id := app.media_unit(p_media_id);
  perform app.assert_admin_for(v_business_unit_id);

  if v_before.archived_at is not null then
    raise exception 'cannot set an archived media row as primary' using errcode = '22023';
  end if;

  update public.product_media
  set is_primary = false
  where product_id = v_before.product_id and id <> p_media_id and is_primary and archived_at is null;

  update public.product_media
  set is_primary = true
  where id = p_media_id and updated_at = p_expected_updated_at
  returning * into v_after;

  if v_after.id is null then
    raise exception 'media was modified by another session' using errcode = 'P2011';
  end if;

  perform app.write_audit_log(v_business_unit_id, 'primary_change', 'product_media', p_media_id, to_jsonb(v_before), to_jsonb(v_after));

  return v_after;
end;
$$;

revoke all on function public.admin_set_media_primary(uuid,timestamptz) from public;
grant execute on function public.admin_set_media_primary(uuid,timestamptz) to authenticated;

-- admin_archive_media — SECURITY DEFINER + P2011
drop function if exists public.admin_archive_media(uuid,timestamptz);

create function public.admin_archive_media(
  p_media_id uuid,
  p_expected_updated_at timestamptz
)
returns public.product_media
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_unit_id uuid;
  v_before public.product_media;
  v_after public.product_media;
begin
  select * into v_before from public.product_media where id = p_media_id;
  if v_before.id is null then
    raise exception 'media not found' using errcode = 'P0002';
  end if;

  v_business_unit_id := app.media_unit(p_media_id);
  perform app.assert_admin_for(v_business_unit_id);

  update public.product_media
  set archived_at = now(), is_primary = false
  where id = p_media_id and updated_at = p_expected_updated_at
  returning * into v_after;

  if v_after.id is null then
    raise exception 'media was modified by another session' using errcode = 'P2011';
  end if;

  perform app.write_audit_log(v_business_unit_id, 'archive', 'product_media', p_media_id, to_jsonb(v_before), to_jsonb(v_after));

  return v_after;
end;
$$;

revoke all on function public.admin_archive_media(uuid,timestamptz) from public;
grant execute on function public.admin_archive_media(uuid,timestamptz) to authenticated;

-- admin_restore_media — SECURITY DEFINER + P2011
drop function if exists public.admin_restore_media(uuid,timestamptz);

create function public.admin_restore_media(
  p_media_id uuid,
  p_expected_updated_at timestamptz
)
returns public.product_media
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_unit_id uuid;
  v_before public.product_media;
  v_after public.product_media;
begin
  select * into v_before from public.product_media where id = p_media_id;
  if v_before.id is null then
    raise exception 'media not found' using errcode = 'P0002';
  end if;

  v_business_unit_id := app.media_unit(p_media_id);
  perform app.assert_admin_for(v_business_unit_id);

  update public.product_media
  set archived_at = null
  where id = p_media_id and updated_at = p_expected_updated_at
  returning * into v_after;

  if v_after.id is null then
    raise exception 'media was modified by another session' using errcode = 'P2011';
  end if;

  perform app.write_audit_log(v_business_unit_id, 'restore', 'product_media', p_media_id, to_jsonb(v_before), to_jsonb(v_after));

  return v_after;
end;
$$;

revoke all on function public.admin_restore_media(uuid,timestamptz) from public;
grant execute on function public.admin_restore_media(uuid,timestamptz) to authenticated;

-- admin_reorder_media — SECURITY DEFINER
drop function if exists public.admin_reorder_media(uuid,jsonb);

create function public.admin_reorder_media(
  p_product_id uuid,
  p_items jsonb
)
returns setof public.product_media
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products;
  v_before jsonb;
  v_after jsonb;
  item jsonb;
  v_media_id uuid;
  v_media_product_id uuid;
begin
  select * into v_product from public.products where id = p_product_id;
  if v_product.id is null then
    raise exception 'product not found' using errcode = 'P0002';
  end if;

  perform app.assert_admin_for(v_product.business_unit_id);

  select coalesce(jsonb_agg(to_jsonb(m) order by m.sort_order), '[]'::jsonb) into v_before
  from public.product_media m where m.product_id = p_product_id;

  for item in select * from jsonb_array_elements(p_items)
  loop
    v_media_id := (item->>'id')::uuid;

    select product_id into v_media_product_id
    from public.product_media
    where id = v_media_id;

    if v_media_product_id is null then
      raise exception 'media not found' using errcode = 'P0002';
    end if;
    if v_media_product_id <> p_product_id then
      raise exception 'media does not belong to this product' using errcode = 'P2004';
    end if;

    update public.product_media
    set sort_order = (item->>'sort_order')::integer
    where id = v_media_id;
  end loop;

  select coalesce(jsonb_agg(to_jsonb(m) order by m.sort_order), '[]'::jsonb) into v_after
  from public.product_media m where m.product_id = p_product_id;

  perform app.write_audit_log(v_product.business_unit_id, 'reorder', 'product_media', p_product_id, v_before, v_after);

  return query select * from public.product_media where product_id = p_product_id order by sort_order;
end;
$$;

revoke all on function public.admin_reorder_media(uuid,jsonb) from public;
grant execute on function public.admin_reorder_media(uuid,jsonb) to authenticated;
