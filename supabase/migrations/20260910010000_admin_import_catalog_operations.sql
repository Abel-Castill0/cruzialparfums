-- Cruzial Platform V2 — 4J4C Import catalog operations and bounded QA reads.
-- Schema/RPC only: this migration does not publish or mutate existing catalog data.
--
-- Optimistic-concurrency conflicts here raise errcode 'P2011', not the
-- pre-existing app-wide '40001' convention (see e.g. 4A/4J2's
-- admin_update_product / admin_set_campaign_products). '40001' is Postgres's
-- own reserved serialization_failure SQLSTATE class, and on local Supabase
-- CLI (Kong/PostgREST) any RPC raising it was found, via real browser +
-- direct REST QA in 4J4C, to hang ~60s and surface as a raw 504 "upstream
-- server is timing out" instead of the friendly conflict message — verified
-- to reproduce even with a trivial isolated function, so it is not specific
-- to this RPC's logic. 'P2011' (an unused slot in this codebase's existing
-- custom P20xx error family) avoids that reserved class entirely and was
-- confirmed instant. mapPostgrestError() maps both codes to `conflict`, so
-- pre-existing RPCs are untouched — this only changes new 4J4C code. The
-- same defect likely still lurks in every pre-4J4C '40001' raise; whether it
-- reproduces on hosted staging (a different Kong/gateway config) is unverified
-- and is flagged as a follow-up, not fixed here (out of 4J4C's scope: those
-- migrations are already applied and closed).

create or replace function public.admin_get_import_catalog_qa()
returns table (
  products bigint, presentations bigint, active_campaigns bigint,
  campaign_number integer, campaign_status text, campaign_offers bigint,
  draft_products bigint, published_products bigint, hidden_products bigint,
  draft_presentations bigint, published_presentations bigint,
  unconfirmed_offers bigint, available_offers bigint, out_of_stock_offers bigint,
  structures_without_offer bigint
)
language plpgsql stable security definer set search_path = ''
as $$
declare v_unit uuid;
begin
  select id into v_unit from public.business_units where code = 'import';
  if v_unit is null or not app.can_read_unit(v_unit) then
    raise exception 'cannot read Cruzial Import catalog' using errcode = '42501';
  end if;
  return query
  with current_campaign as (
    select c.id, c.number, c.status from public.campaigns c
    where c.business_unit_id = v_unit and c.number = 6 and c.archived_at is null
    order by c.created_at desc limit 1
  ), product_counts as (
    select count(*) filter (where p.archived_at is null) total_products,
      count(*) filter (where p.archived_at is null and p.publication_status='draft') total_draft,
      count(*) filter (where p.archived_at is null and p.publication_status='published') total_published,
      count(*) filter (where p.archived_at is null and p.publication_status='hidden') total_hidden
    from public.products p where p.business_unit_id=v_unit
  ), presentation_counts as (
    select count(*) filter (where ip.archived_at is null) total_presentations,
      count(*) filter (where ip.archived_at is null and ip.publication_status='draft') total_draft,
      count(*) filter (where ip.archived_at is null and ip.publication_status='published') total_published
    from public.import_presentations ip join public.products p on p.id=ip.product_id
    where p.business_unit_id=v_unit
  ), offer_counts as (
    select count(cp.id) total_offers,
      count(cp.id) filter (where cp.availability_status='unconfirmed') total_unconfirmed,
      count(cp.id) filter (where cp.availability_status='available') total_available,
      count(cp.id) filter (where cp.availability_status='out_of_stock') total_out_of_stock
    from current_campaign cc left join public.campaign_products cp on cp.campaign_id=cc.id
  )
  select pc.total_products, pr.total_presentations,
    (select count(*) from public.campaigns c where c.business_unit_id=v_unit and c.archived_at is null),
    cc.number, cc.status, oc.total_offers, pc.total_draft, pc.total_published, pc.total_hidden,
    pr.total_draft, pr.total_published, oc.total_unconfirmed, oc.total_available, oc.total_out_of_stock,
    (select count(*) from public.import_presentations ip
      join public.products p on p.id=ip.product_id
      where p.business_unit_id=v_unit and p.archived_at is null and ip.archived_at is null
      and not exists (select 1 from current_campaign cc2 join public.campaign_products cp
        on cp.campaign_id=cc2.id and cp.product_id=p.id and cp.import_presentation_id=ip.id))
  from product_counts pc cross join presentation_counts pr cross join offer_counts oc
  left join current_campaign cc on true;
end $$;

create or replace function public.admin_list_import_products(
  p_query text default null, p_publication_status text default null,
  p_category_slug text default null, p_archived text default 'active',
  p_presentation_state text default null, p_offer_state text default null,
  p_page integer default 1, p_page_size integer default 40
)
returns table (
  id uuid, name text, brand text, slug text, legacy_id text,
  publication_status text, archived_at timestamptz, verification_status text,
  updated_at timestamptz, category_name text, category_slug text,
  active_presentations bigint, published_presentations bigint,
  campaign_offer_count bigint, unconfirmed_offer_count bigint, total_count bigint
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
  return query
  with campaign6 as (select c.id from public.campaigns c where c.business_unit_id=v_unit and c.number=6 and c.archived_at is null order by c.created_at desc limit 1),
  catalog as (
    select p.id,p.name,p.brand,p.slug,p.legacy_id,p.publication_status,p.archived_at,p.verification_status,p.updated_at,
      cat.name category_name,cat.slug category_slug,
      count(distinct ip.id) filter(where ip.archived_at is null) active_presentations,
      count(distinct ip.id) filter(where ip.archived_at is null and ip.publication_status='published') published_presentations,
      count(distinct cp.id) campaign_offer_count,
      count(distinct cp.id) filter(where cp.availability_status='unconfirmed') unconfirmed_offer_count
    from public.products p
    left join public.product_categories pc on pc.product_id=p.id
    left join public.categories cat on cat.id=pc.category_id and cat.kind='import_category'
    left join public.import_presentations ip on ip.product_id=p.id
    left join campaign6 c6 on true
    left join public.campaign_products cp on cp.campaign_id=c6.id and cp.product_id=p.id
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
  )
  select f.*,count(*) over() from filtered f order by lower(f.name),f.id limit v_size offset (v_page-1)*v_size;
end $$;

create or replace function public.admin_update_import_product(
  p_product_id uuid, p_expected_updated_at timestamptz, p_name text, p_brand text,
  p_category_id uuid, p_publication_status text
) returns public.products language plpgsql security definer set search_path=''
as $$
declare v_unit uuid; v_before public.products; v_after public.products; v_name text:=btrim(coalesce(p_name,''));
begin
 select id into v_unit from public.business_units where code='import'; perform app.assert_admin_for(v_unit);
 select * into v_before from public.products where id=p_product_id and business_unit_id=v_unit;
 if v_before.id is null then raise exception 'Import product not found' using errcode='P0002'; end if;
 if v_before.archived_at is not null then raise exception 'archived product cannot be edited' using errcode='22023'; end if;
 if v_name='' or length(v_name)>180 or length(coalesce(p_brand,''))>120 then raise exception 'invalid product fields' using errcode='22023'; end if;
 if p_publication_status not in ('draft','published','hidden') then raise exception 'invalid product publication status' using errcode='22023'; end if;
 if not exists(select 1 from public.categories c where c.id=p_category_id and c.business_unit_id=v_unit and c.kind='import_category' and c.archived_at is null) then raise exception 'invalid Import category' using errcode='P2004'; end if;
 update public.products set name=v_name,brand=nullif(btrim(coalesce(p_brand,'')),''),publication_status=p_publication_status
 where id=p_product_id and updated_at=p_expected_updated_at returning * into v_after;
 if v_after.id is null then raise exception 'product was modified by another session' using errcode='P2011'; end if;
 delete from public.product_categories pc using public.categories c where pc.product_id=p_product_id and pc.category_id=c.id and c.kind='import_category';
 insert into public.product_categories(product_id,category_id,sort_order) values(p_product_id,p_category_id,0);
 perform app.write_audit_log(v_unit,'update','import_product',p_product_id,
   jsonb_build_object('name',v_before.name,'brand',v_before.brand,'publication_status',v_before.publication_status),
   jsonb_build_object('name',v_after.name,'brand',v_after.brand,'publication_status',v_after.publication_status,'category_id',p_category_id));
 return v_after;
end $$;

create or replace function public.admin_archive_import_product(p_product_id uuid,p_expected_updated_at timestamptz)
returns public.products language plpgsql security definer set search_path='' as $$
declare v_unit uuid; v_before public.products; v_after public.products;
begin select id into v_unit from public.business_units where code='import'; perform app.assert_admin_for(v_unit);
 select * into v_before from public.products where id=p_product_id and business_unit_id=v_unit;
 if v_before.id is null then raise exception 'Import product not found' using errcode='P0002'; end if;
 update public.products set archived_at=now(),publication_status='archived' where id=p_product_id and updated_at=p_expected_updated_at and archived_at is null returning * into v_after;
 if v_after.id is null then raise exception 'product was modified or archived' using errcode='P2011'; end if;
 perform app.write_audit_log(v_unit,'archive','import_product',p_product_id,to_jsonb(v_before),to_jsonb(v_after)); return v_after; end $$;

create or replace function public.admin_restore_import_product(p_product_id uuid,p_expected_updated_at timestamptz)
returns public.products language plpgsql security definer set search_path='' as $$
declare v_unit uuid; v_before public.products; v_after public.products;
begin select id into v_unit from public.business_units where code='import'; perform app.assert_admin_for(v_unit);
 select * into v_before from public.products where id=p_product_id and business_unit_id=v_unit;
 if v_before.id is null then raise exception 'Import product not found' using errcode='P0002'; end if;
 update public.products set archived_at=null,publication_status='draft' where id=p_product_id and updated_at=p_expected_updated_at and archived_at is not null returning * into v_after;
 if v_after.id is null then raise exception 'product was modified or active' using errcode='P2011'; end if;
 perform app.write_audit_log(v_unit,'restore','import_product',p_product_id,to_jsonb(v_before),to_jsonb(v_after)); return v_after; end $$;

create or replace function public.admin_create_import_presentation(p_product_id uuid,p_label text,p_presentation_class text,p_capacity_ml numeric default null)
returns public.import_presentations language plpgsql security definer set search_path='' as $$
declare v_unit uuid; v_row public.import_presentations; v_label text:=btrim(coalesce(p_label,'')); v_key text;
begin select id into v_unit from public.business_units where code='import'; perform app.assert_admin_for(v_unit);
 if not exists(select 1 from public.products where id=p_product_id and business_unit_id=v_unit and archived_at is null) then raise exception 'active Import product not found' using errcode='P0002'; end if;
 if v_label='' or length(v_label)>180 or p_presentation_class not in ('single_fixed','multi_presentation','pack_set','ambiguous') or (p_capacity_ml is not null and p_capacity_ml<=0) then raise exception 'invalid presentation fields' using errcode='22023'; end if;
 v_key:='manual-'||substr(encode(extensions.digest(p_product_id::text||'|'||lower(v_label)||'|'||p_presentation_class||'|'||coalesce(p_capacity_ml::text,''),'sha256'),'hex'),1,24);
 insert into public.import_presentations(product_id,stable_key,label,presentation_class,capacity_ml,source_metadata,publication_status)
 values(p_product_id,v_key,v_label,p_presentation_class,p_capacity_ml,jsonb_build_object('provenance','CLIENT_CONFIRMED','entry','admin_manual'),'draft') returning * into v_row;
 perform app.write_audit_log(v_unit,'create','import_presentation',v_row.id,null,
   jsonb_build_object('product_id',p_product_id,'stable_key',v_key,'label',v_label,'presentation_class',p_presentation_class,'capacity_ml',p_capacity_ml,'publication_status','draft'));
 return v_row; end $$;

create or replace function public.admin_update_import_presentation(p_presentation_id uuid,p_expected_updated_at timestamptz,p_label text,p_presentation_class text,p_capacity_ml numeric,p_publication_status text)
returns public.import_presentations language plpgsql security definer set search_path='' as $$
declare v_unit uuid; v_before public.import_presentations; v_after public.import_presentations; v_label text:=btrim(coalesce(p_label,''));
begin select id into v_unit from public.business_units where code='import'; perform app.assert_admin_for(v_unit);
 select ip.* into v_before from public.import_presentations ip join public.products p on p.id=ip.product_id where ip.id=p_presentation_id and p.business_unit_id=v_unit;
 if v_before.id is null then raise exception 'Import presentation not found' using errcode='P0002'; end if;
 if v_before.archived_at is not null then raise exception 'archived presentation cannot be edited' using errcode='22023'; end if;
 if v_label='' or length(v_label)>180 or p_presentation_class not in ('single_fixed','multi_presentation','pack_set','ambiguous') or p_publication_status not in ('draft','published') or (p_capacity_ml is not null and p_capacity_ml<=0) then raise exception 'invalid presentation fields' using errcode='22023'; end if;
 update public.import_presentations set label=v_label,presentation_class=p_presentation_class,capacity_ml=p_capacity_ml,publication_status=p_publication_status
 where id=p_presentation_id and updated_at=p_expected_updated_at returning * into v_after;
 if v_after.id is null then raise exception 'presentation was modified by another session' using errcode='P2011'; end if;
 perform app.write_audit_log(v_unit,'update','import_presentation',p_presentation_id,
  jsonb_build_object('label',v_before.label,'presentation_class',v_before.presentation_class,'capacity_ml',v_before.capacity_ml,'publication_status',v_before.publication_status),
  jsonb_build_object('label',v_after.label,'presentation_class',v_after.presentation_class,'capacity_ml',v_after.capacity_ml,'publication_status',v_after.publication_status)); return v_after; end $$;

create or replace function public.admin_archive_import_presentation(p_presentation_id uuid,p_expected_updated_at timestamptz)
returns public.import_presentations language plpgsql security definer set search_path='' as $$
declare v_unit uuid; v_before public.import_presentations; v_after public.import_presentations;
begin select id into v_unit from public.business_units where code='import'; perform app.assert_admin_for(v_unit);
 select ip.* into v_before from public.import_presentations ip join public.products p on p.id=ip.product_id where ip.id=p_presentation_id and p.business_unit_id=v_unit;
 if v_before.id is null then raise exception 'Import presentation not found' using errcode='P0002'; end if;
 update public.import_presentations set archived_at=now(),publication_status='archived' where id=p_presentation_id and updated_at=p_expected_updated_at and archived_at is null returning * into v_after;
 if v_after.id is null then raise exception 'presentation was modified or archived' using errcode='P2011'; end if;
 perform app.write_audit_log(v_unit,'archive','import_presentation',p_presentation_id,to_jsonb(v_before),to_jsonb(v_after)); return v_after; end $$;

create or replace function public.admin_restore_import_presentation(p_presentation_id uuid,p_expected_updated_at timestamptz)
returns public.import_presentations language plpgsql security definer set search_path='' as $$
declare v_unit uuid; v_before public.import_presentations; v_after public.import_presentations;
begin select id into v_unit from public.business_units where code='import'; perform app.assert_admin_for(v_unit);
 select ip.* into v_before from public.import_presentations ip join public.products p on p.id=ip.product_id where ip.id=p_presentation_id and p.business_unit_id=v_unit;
 if v_before.id is null then raise exception 'Import presentation not found' using errcode='P0002'; end if;
 update public.import_presentations set archived_at=null,publication_status='draft' where id=p_presentation_id and updated_at=p_expected_updated_at and archived_at is not null returning * into v_after;
 if v_after.id is null then raise exception 'presentation was modified or active' using errcode='P2011'; end if;
 perform app.write_audit_log(v_unit,'restore','import_presentation',p_presentation_id,to_jsonb(v_before),to_jsonb(v_after)); return v_after; end $$;

revoke all on function public.admin_get_import_catalog_qa() from public,anon;
revoke all on function public.admin_list_import_products(text,text,text,text,text,text,integer,integer) from public,anon;
grant execute on function public.admin_get_import_catalog_qa() to authenticated;
grant execute on function public.admin_list_import_products(text,text,text,text,text,text,integer,integer) to authenticated;

revoke all on function public.admin_update_import_product(uuid,timestamptz,text,text,uuid,text) from public,anon;
revoke all on function public.admin_archive_import_product(uuid,timestamptz) from public,anon;
revoke all on function public.admin_restore_import_product(uuid,timestamptz) from public,anon;
revoke all on function public.admin_create_import_presentation(uuid,text,text,numeric) from public,anon;
revoke all on function public.admin_update_import_presentation(uuid,timestamptz,text,text,numeric,text) from public,anon;
revoke all on function public.admin_archive_import_presentation(uuid,timestamptz) from public,anon;
revoke all on function public.admin_restore_import_presentation(uuid,timestamptz) from public,anon;
grant execute on function public.admin_update_import_product(uuid,timestamptz,text,text,uuid,text) to authenticated;
grant execute on function public.admin_archive_import_product(uuid,timestamptz) to authenticated;
grant execute on function public.admin_restore_import_product(uuid,timestamptz) to authenticated;
grant execute on function public.admin_create_import_presentation(uuid,text,text,numeric) to authenticated;
grant execute on function public.admin_update_import_presentation(uuid,timestamptz,text,text,numeric,text) to authenticated;
grant execute on function public.admin_archive_import_presentation(uuid,timestamptz) to authenticated;
grant execute on function public.admin_restore_import_presentation(uuid,timestamptz) to authenticated;

comment on function public.admin_update_import_product(uuid,timestamptz,text,text,uuid,text) is
  'Import-only audited display/category/publication update. legacy_id and slug are intentionally immutable loader identities.';
comment on function public.admin_create_import_presentation(uuid,text,text,numeric) is
  'Import-only audited structural presentation creation. stable_key is deterministic and server-derived; no price or availability fields exist here.';
