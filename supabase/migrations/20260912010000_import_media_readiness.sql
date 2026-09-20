-- Cruzial Platform V2 — Import media readiness + publication (Phase 4J5D)
--
-- Adds:
-- 1. p_media_state filter on admin_list_import_products (with_primary / without_media / without_primary)
-- 2. Media counts on admin_get_import_catalog_qa
-- 3. admin_get_import_publication_readiness — deterministic launch blocker report

-- ---------------------------------------------------------------------------
-- 1. Extend admin_list_import_products with media state filter
-- ---------------------------------------------------------------------------

drop function if exists public.admin_list_import_products(text,text,text,text,text,text,integer,integer);

create function public.admin_list_import_products(
  p_query text default null, p_publication_status text default null,
  p_category_slug text default null, p_archived text default 'active',
  p_presentation_state text default null, p_offer_state text default null,
  p_media_state text default null,
  p_page integer default 1, p_page_size integer default 40
)
returns table (
  id uuid, name text, brand text, slug text, legacy_id text,
  publication_status text, archived_at timestamptz, verification_status text,
  updated_at timestamptz, category_name text, category_slug text,
  active_presentations bigint, published_presentations bigint,
  campaign_offer_count bigint, unconfirmed_offer_count bigint,
  has_active_primary boolean,
  active_media_count bigint,
  total_count bigint
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_unit uuid; v_page integer:=greatest(1,coalesce(p_page,1));
  v_size integer:=least(50,greatest(1,coalesce(p_page_size,40)));
  v_query text:=left(btrim(coalesce(p_query,'')),120);
begin
  select bu.id into v_unit from public.business_units bu where bu.code='import';
  if v_unit is null or not app.can_read_unit(v_unit) then raise exception 'cannot read Cruzial Import catalog' using errcode='42501'; end if;
  if p_publication_status is not null and p_publication_status not in ('draft','published','hidden','archived') then raise exception 'invalid publication filter' using errcode='22023'; end if;
  if coalesce(p_archived,'active') not in ('active','archived','all') then raise exception 'invalid archive filter' using errcode='22023'; end if;
  if p_presentation_state is not null and p_presentation_state not in ('with_active','without_active','without_published') then raise exception 'invalid presentation filter' using errcode='22023'; end if;
  if p_offer_state is not null and p_offer_state not in ('with_offer','without_offer') then raise exception 'invalid offer filter' using errcode='22023'; end if;
  if p_media_state is not null and p_media_state not in ('with_primary','without_media','without_primary') then raise exception 'invalid media filter' using errcode='22023'; end if;
  return query
  with campaign6 as (select c.id from public.campaigns c where c.business_unit_id=v_unit and c.number=6 and c.archived_at is null order by c.created_at desc limit 1),
  catalog as (
    select p.id,p.name,p.brand,p.slug,p.legacy_id,p.publication_status,p.archived_at,p.verification_status,p.updated_at,
      cat.name category_name,cat.slug category_slug,
      count(distinct ip.id) filter(where ip.archived_at is null) active_presentations,
      count(distinct ip.id) filter(where ip.archived_at is null and ip.publication_status='published') published_presentations,
      count(distinct cp.id) campaign_offer_count,
      count(distinct cp.id) filter(where cp.availability_status='unconfirmed') unconfirmed_offer_count,
      count(distinct pm.id) filter(where pm.archived_at is null) > 0 has_active_primary_raw,
      bool_or(pm.is_primary and pm.archived_at is null) filter(where pm.archived_at is null) has_active_primary,
      count(distinct pm.id) filter(where pm.archived_at is null) active_media_count
    from public.products p
    left join public.product_categories pc on pc.product_id=p.id
    left join public.categories cat on cat.id=pc.category_id and cat.kind='import_category'
    left join public.import_presentations ip on ip.product_id=p.id
    left join campaign6 c6 on true
    left join public.campaign_products cp on cp.campaign_id=c6.id and cp.product_id=p.id
    left join public.product_media pm on pm.product_id=p.id
    where p.business_unit_id=v_unit
    group by p.id,cat.name,cat.slug
  ), filtered as (
    select * from catalog c where
      (v_query='' or c.name ilike '%'||v_query||'%' or coalesce(c.brand,'') ilike '%'||v_query||'%' or c.slug ilike '%'||v_query||'%' or coalesce(c.legacy_id,'') ilike '%'||v_query||'%')
      and (p_publication_status is null or c.publication_status=p_publication_status)
      and (p_category_slug is null or c.category_slug=p_category_slug)
      and (p_archived='all' or (p_archived='active' and c.archived_at is null) or (p_archived='archived' and c.archived_at is not null))
      and (p_presentation_state is null or (p_presentation_state='with_active' and c.active_presentations>0) or (p_presentation_state='without_active' and c.active_presentations=0) or (p_presentation_state='without_published' and c.published_presentations=0))
      and (p_offer_state is null or (p_offer_state='with_offer' and c.campaign_offer_count>0) or (p_offer_state='without_offer' and c.campaign_offer_count=0))
      and (p_media_state is null or (p_media_state='with_primary' and c.has_active_primary) or (p_media_state='without_media' and c.active_media_count=0) or (p_media_state='without_primary' and c.active_media_count>0 and not c.has_active_primary))
  )
  select f.id,f.name,f.brand,f.slug,f.legacy_id,f.publication_status,f.archived_at,f.verification_status,f.updated_at,
    f.category_name,f.category_slug,f.active_presentations,f.published_presentations,
    f.campaign_offer_count,f.unconfirmed_offer_count,f.has_active_primary,f.active_media_count,
    count(*) over() from filtered f order by lower(f.name),f.id limit v_size offset (v_page-1)*v_size;
end $$;

revoke all on function public.admin_list_import_products(text,text,text,text,text,text,text,integer,integer) from public,anon;
grant execute on function public.admin_list_import_products(text,text,text,text,text,text,text,integer,integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Extend admin_get_import_catalog_qa with media counts
-- ---------------------------------------------------------------------------

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
  with campaign6 as (select c.id,c.number::bigint as number,c.status from public.campaigns c where c.business_unit_id=v_unit and c.number=6 and c.archived_at is null order by c.created_at desc limit 1),
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
    (select c6.number::bigint from campaign6 c6),
    (select c6.status from campaign6 c6),
    (select count(*) from public.campaign_products cp join campaign6 c6 on c6.id=cp.campaign_id),
    (select count(*) from public.products p where p.business_unit_id=v_unit and p.publication_status='draft' and p.archived_at is null),
    (select count(*) from public.products p where p.business_unit_id=v_unit and p.publication_status='published' and p.archived_at is null),
    (select count(*) from public.products p where p.business_unit_id=v_unit and p.publication_status='hidden' and p.archived_at is null),
    (select count(*) from public.import_presentations ip join public.products p on p.id=ip.product_id where p.business_unit_id=v_unit and ip.archived_at is null and ip.publication_status='draft'),
    (select count(*) from public.import_presentations ip join public.products p on p.id=ip.product_id where p.business_unit_id=v_unit and ip.archived_at is null and ip.publication_status='published'),
    (select count(*) from public.campaign_products cp join campaign6 c6 on c6.id=cp.campaign_id where cp.availability_status='unconfirmed'),
    (select count(*) from public.campaign_products cp join campaign6 c6 on c6.id=cp.campaign_id where cp.availability_status='available'),
    (select count(*) from public.campaign_products cp join campaign6 c6 on c6.id=cp.campaign_id where cp.availability_status='out_of_stock'),
    (select count(distinct ip.id) from public.import_presentations ip join public.products p on p.id=ip.product_id left join public.campaign_products cp on cp.import_presentation_id=ip.id and cp.campaign_id=(select c6.id from campaign6 c6) where p.business_unit_id=v_unit and ip.archived_at is null and ip.publication_status='published' and cp.id is null),
    (select count(*) from media_stats ms where ms.has_primary),
    (select count(*) from media_stats ms where ms.active_count=0),
    (select count(*) from media_stats ms where ms.active_count>0 and not ms.has_primary),
    (select sum(ms.active_count)::bigint from media_stats ms);
end $$;

revoke all on function public.admin_get_import_catalog_qa() from public,anon;
grant execute on function public.admin_get_import_catalog_qa() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. admin_get_import_publication_readiness — launch blocker report
-- ---------------------------------------------------------------------------

create or replace function public.admin_get_import_publication_readiness()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_unit uuid; v_result jsonb; v_campaign record;
begin
  select bu.id into v_unit from public.business_units bu where bu.code='import';
  if v_unit is null or not app.can_read_unit(v_unit) then raise exception 'cannot read Import readiness' using errcode='42501'; end if;

  select c.* into v_campaign from public.campaigns c where c.business_unit_id=v_unit and c.number=6 and c.archived_at is null order by c.created_at desc limit 1;

  with media_stats as (
    select p.id,
      bool_or(pm.is_primary and pm.archived_at is null) has_primary,
      count(distinct pm.id) filter(where pm.archived_at is null) active_count
    from public.products p
    left join public.product_media pm on pm.product_id=p.id
    where p.business_unit_id=v_unit and p.archived_at is null
    group by p.id
  ),
  product_readiness as (
    select p.id,p.name,p.publication_status,
      coalesce(ms.has_primary,false) has_primary,
      coalesce(ms.active_count,0) active_media_count,
      count(distinct ip.id) filter(where ip.archived_at is null) active_presentations,
      count(distinct ip.id) filter(where ip.archived_at is null and ip.publication_status='published') published_presentations,
      count(distinct cp.id) campaign_offers,
      count(distinct cp.id) filter(where cp.availability_status='unconfirmed') unconfirmed_offers,
      count(distinct cp.id) filter(where cp.availability_status='available') available_offers,
      count(distinct cp.id) filter(where cp.availability_status='out_of_stock') oos_offers,
      v_campaign.status campaign_status
    from public.products p
    left join media_stats ms on ms.id=p.id
    left join public.import_presentations ip on ip.product_id=p.id
    left join public.campaign_products cp on cp.product_id=p.id and cp.campaign_id=v_campaign.id
    where p.business_unit_id=v_unit and p.archived_at is null
    group by p.id,ms.has_primary,ms.active_count,v_campaign.status
  ),
  blockers as (
    select pr.id,pr.name,
      case when pr.publication_status!='published' then 'Producto no publicado' end b1,
      case when pr.active_presentations=0 then 'Sin presentación activa' end b2,
      case when pr.published_presentations=0 then 'Sin presentación publicada' end b3,
      case when not pr.has_primary then 'Sin imagen principal' end b4,
      case when pr.campaign_offers=0 then 'Sin oferta en consolidado' end b5,
      case when pr.unconfirmed_offers>0 then 'Disponibilidad por confirmar' end b6,
      case when pr.campaign_status!='open' then 'Consolidado no abierto' end b7,
      pr.campaign_offers,pr.unconfirmed_offers,pr.available_offers,pr.oos_offers
    from product_readiness pr
  )
  select jsonb_build_object(
    'total_products', (select count(*) from public.products p where p.business_unit_id=v_unit and p.archived_at is null),
    'ready_products', (select count(*) from blockers b where b.b1 is null and b.b2 is null and b.b3 is null and b.b4 is null and b.b5 is null and b.b6 is null and b.b7 is null),
    'media_blockers', (select count(*) from blockers b where b.b4 is not null),
    'publication_blockers', (select count(*) from blockers b where b.b1 is not null),
    'unconfirmed_offers', (select count(*) from blockers b where b.b6 is not null),
    'campaign_status', v_campaign.status,
    'campaign_number', v_campaign.number
  ) into v_result;

  return v_result;
end $$;

revoke all on function public.admin_get_import_publication_readiness() from public,anon;
grant execute on function public.admin_get_import_publication_readiness() to authenticated;
