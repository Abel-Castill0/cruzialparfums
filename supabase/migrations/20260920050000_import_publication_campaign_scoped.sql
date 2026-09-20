-- Cruzial Platform V2 — Operations Foundation V1 (Task 1)
--
-- Removes the campaign #6 hardcode from Import publication readiness.
--
-- Problem: admin_get_import_publication_readiness() and
-- admin_list_import_publication_blockers() both resolved "the" campaign by
-- `c.number = 6`. That only worked because campaign #6 happened to be the
-- current one. It silently breaks (reports stale/wrong readiness) the
-- moment campaign #7 opens.
--
-- Fix: both RPCs now take an explicit p_campaign_id uuid. The caller (the
-- Admin Publication screen) resolves which campaign to inspect — defaulting
-- to the latest non-archived campaign for convenience — and always passes
-- its id explicitly. No implicit "current campaign" guess happens inside
-- these RPCs any more.
--
-- admin_get_import_catalog_qa() keeps its existing zero-arg signature (it
-- backs dashboard convenience cards, not a decision-making screen) but its
-- internal "current campaign" snapshot is now the latest non-archived
-- campaign instead of a hardcoded number=6 lookup, so it self-corrects once
-- campaign #6 is archived and #7 becomes latest.
--
-- Additive migration. Does not modify 20260912010000/20260912020000.

-- =========================================================================
-- SECTION 1: admin_get_import_catalog_qa — drop the #6 hardcode
-- =========================================================================

drop function if exists public.admin_get_import_catalog_qa();

create function public.admin_get_import_catalog_qa()
returns table (
  products bigint, presentations bigint, active_campaigns bigint,
  campaign_number bigint, campaign_status text, campaign_offers bigint,
  draft_products bigint, published_products bigint, hidden_products bigint,
  draft_presentations bigint, published_presentations bigint,
  unconfirmed_offers bigint, available_offers bigint, out_of_stock_offers bigint,
  structures_without_offer bigint,
  products_with_primary_media bigint, products_without_media bigint,
  products_without_primary_media bigint, total_active_media bigint
)
language plpgsql stable security definer set search_path = ''
as $$
declare v_unit uuid;
begin
  select bu.id into v_unit from public.business_units bu where bu.code='import';
  if v_unit is null or not app.can_read_unit(v_unit) then raise exception 'cannot read Import QA' using errcode='42501'; end if;
  return query
  with latest_campaign as (
    select c.id,c.number::bigint as number,c.status from public.campaigns c
    where c.business_unit_id=v_unit and c.archived_at is null
    order by c.number desc, c.created_at desc limit 1
  ),
  media_stats as (
    select p.id,
      bool_or(pm.is_primary and pm.archived_at is null) has_primary,
      count(distinct pm.id) filter(where pm.archived_at is null) active_count
    from public.products p
    left join public.product_media pm on pm.product_id=p.id
    where p.business_unit_id=v_unit
    group by p.id
  )
  select
    (select count(*) from public.products p where p.business_unit_id=v_unit),
    (select count(*) from public.import_presentations ip join public.products p on p.id=ip.product_id where p.business_unit_id=v_unit),
    (select count(*) from public.campaigns c where c.business_unit_id=v_unit),
    (select lc.number from latest_campaign lc),
    (select lc.status from latest_campaign lc),
    (select count(*) from public.campaign_products cp join latest_campaign lc on lc.id=cp.campaign_id),
    (select count(*) from public.products p where p.business_unit_id=v_unit and p.publication_status='draft' and p.archived_at is null),
    (select count(*) from public.products p where p.business_unit_id=v_unit and p.publication_status='published' and p.archived_at is null),
    (select count(*) from public.products p where p.business_unit_id=v_unit and p.publication_status='hidden' and p.archived_at is null),
    (select count(*) from public.import_presentations ip join public.products p on p.id=ip.product_id where p.business_unit_id=v_unit and ip.archived_at is null and ip.publication_status='draft'),
    (select count(*) from public.import_presentations ip join public.products p on p.id=ip.product_id where p.business_unit_id=v_unit and ip.archived_at is null and ip.publication_status='published'),
    (select count(*) from public.campaign_products cp join latest_campaign lc on lc.id=cp.campaign_id where cp.availability_status='unconfirmed'),
    (select count(*) from public.campaign_products cp join latest_campaign lc on lc.id=cp.campaign_id where cp.availability_status='available'),
    (select count(*) from public.campaign_products cp join latest_campaign lc on lc.id=cp.campaign_id where cp.availability_status='out_of_stock'),
    (select count(distinct ip.id) from public.import_presentations ip join public.products p on p.id=ip.product_id left join public.campaign_products cp on cp.import_presentation_id=ip.id and cp.campaign_id=(select lc.id from latest_campaign lc) where p.business_unit_id=v_unit and ip.archived_at is null and ip.publication_status='published' and cp.id is null),
    (select count(*) from media_stats ms where ms.has_primary),
    (select count(*) from media_stats ms where ms.active_count=0),
    (select count(*) from media_stats ms where ms.active_count>0 and not ms.has_primary),
    (select sum(ms.active_count)::bigint from media_stats ms);
end $$;

revoke all on function public.admin_get_import_catalog_qa() from public,anon;
grant execute on function public.admin_get_import_catalog_qa() to authenticated;

-- =========================================================================
-- SECTION 2: admin_get_import_publication_readiness(p_campaign_id uuid)
--
-- Explicit campaign id, required. Verifies the campaign belongs to Import.
-- Not-found/wrong-unit is a hard error (caller bug — the UI always resolves
-- a real id first). An archived campaign is NOT an error: it returns valid
-- readiness data with campaign_archived = true so historical inspection
-- stays possible without producing a false "not ready" signal.
-- =========================================================================

drop function if exists public.admin_get_import_publication_readiness();

create function public.admin_get_import_publication_readiness(p_campaign_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_unit uuid;
  v_result jsonb;
  v_campaign_id uuid;
  v_campaign_number bigint;
  v_campaign_status text;
  v_campaign_archived_at timestamptz;
begin
  if p_campaign_id is null then
    raise exception 'campaign id is required' using errcode = '22023';
  end if;

  select bu.id into v_unit from public.business_units bu where bu.code = 'import';
  if v_unit is null or not app.can_read_unit(v_unit) then
    raise exception 'cannot read Import readiness' using errcode = '42501';
  end if;

  select c.id, c.number::bigint, c.status, c.archived_at
    into v_campaign_id, v_campaign_number, v_campaign_status, v_campaign_archived_at
    from public.campaigns c
    where c.id = p_campaign_id and c.business_unit_id = v_unit;

  if v_campaign_id is null then
    raise exception 'campaign not found for Import' using errcode = 'P0002';
  end if;

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
      and cp.campaign_id = v_campaign_id
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
      v_campaign_archived_at is null
      and (select count(*) from blockers b where b.b_pub_product is not null or b.b_pub_presentation is not null
        or b.b_media is not null or b.b_no_offer is not null
        or b.b_offer_unconfirmed is not null or b.b_offer_invalid_price is not null) = 0
    ),
    'campaign_id', v_campaign_id,
    'campaign_found', true,
    'campaign_exists', true,
    'campaign_number', v_campaign_number,
    'campaign_status', v_campaign_status,
    'campaign_archived', v_campaign_archived_at is not null
  ) into v_result;

  return v_result;
end $$;

revoke all on function public.admin_get_import_publication_readiness(uuid) from public,anon;
grant execute on function public.admin_get_import_publication_readiness(uuid) to authenticated;

-- =========================================================================
-- SECTION 3: admin_list_import_publication_blockers(p_campaign_id uuid, ...)
--
-- Same explicit-id contract as readiness above. Not-found/wrong-unit is a
-- hard error; an archived campaign still returns its blocker rows.
-- =========================================================================

drop function if exists public.admin_list_import_publication_blockers(text,text,integer,integer);

create function public.admin_list_import_publication_blockers(
  p_campaign_id uuid,
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
  if p_campaign_id is null then
    raise exception 'campaign id is required' using errcode = '22023';
  end if;

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
    where c.id = p_campaign_id and c.business_unit_id = v_unit;

  if v_campaign_id is null then
    raise exception 'campaign not found for Import' using errcode = 'P0002';
  end if;

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

revoke all on function public.admin_list_import_publication_blockers(uuid,text,text,integer,integer) from public,anon;
grant execute on function public.admin_list_import_publication_blockers(uuid,text,text,integer,integer) to authenticated;
