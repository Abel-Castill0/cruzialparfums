-- Explicit catalog mappings; existing canonical mutations preserve all authorization/audit rules.
create function public.admin_bulk_import_catalog(p_rows jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare v_unit uuid; v_row jsonb; v_product public.products; v_presentation public.import_presentations; v_count integer:=0;
begin
 select id into v_unit from public.business_units where code='import'; perform app.assert_admin_for(v_unit);
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 2000
  then raise exception 'invalid batch' using errcode='22023'; end if;
 if exists(select 1 from jsonb_array_elements(p_rows) r group by r->>'kind',r->>'id' having count(*)>1)
  then raise exception 'duplicate identity' using errcode='22023'; end if;
 for v_row in select value from jsonb_array_elements(p_rows) order by value->>'kind',value->>'id' loop
  if v_row->>'kind'='product' then
   select * into v_product from public.products where id=(v_row->>'id')::uuid and business_unit_id=v_unit for update;
   if v_product.id is null then raise exception 'Import product not found' using errcode='P0002'; end if;
   perform public.admin_update_import_product(v_product.id,(v_row->>'updated_at')::timestamptz,
    v_row->>'name',v_row->>'brand',nullif(v_row->>'category_id','')::uuid,v_product.publication_status);
  elsif v_row->>'kind'='presentation' then
   select ip.* into v_presentation from public.import_presentations ip join public.products p on p.id=ip.product_id
    where ip.id=(v_row->>'id')::uuid and p.business_unit_id=v_unit for update of ip;
   if v_presentation.id is null then raise exception 'Import presentation not found' using errcode='P0002'; end if;
   perform public.admin_update_import_presentation(v_presentation.id,(v_row->>'updated_at')::timestamptz,
    v_row->>'label',v_row->>'presentation_class',nullif(v_row->>'capacity_ml','')::numeric,v_presentation.publication_status);
  else raise exception 'invalid row kind' using errcode='22023'; end if;
  v_count:=v_count+1;
 end loop;
 perform app.write_audit_log(v_unit,'update','bulk_import_catalog',null,null,jsonb_build_object('row_count',v_count));
 return v_count;
end $$;
revoke all on function public.admin_bulk_import_catalog(jsonb) from public,anon;
grant execute on function public.admin_bulk_import_catalog(jsonb) to authenticated;

-- Preview exposes exact identities and versions. Final mutation rechecks the facts.
create function public.admin_import_publish_candidates(p_campaign_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_unit uuid; v_result jsonb;
begin
 select id into v_unit from public.business_units where code='import';
 if not app.can_read_unit(v_unit) then raise exception 'Import access denied' using errcode='42501'; end if;
 if not exists(select 1 from public.campaigns where id=p_campaign_id and business_unit_id=v_unit and archived_at is null)
  then raise exception 'campaign not found' using errcode='P0002'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('offer_id',cp.id,'offer_updated_at',cp.updated_at,
  'product_id',p.id,'product_updated_at',p.updated_at,'presentation_id',ip.id,'presentation_updated_at',ip.updated_at,
  'name',p.name,'label',ip.label) order by p.name,ip.label),'[]'::jsonb) into v_result
 from public.campaign_products cp join public.products p on p.id=cp.product_id
 join public.import_presentations ip on ip.id=cp.import_presentation_id and ip.product_id=p.id
 where cp.campaign_id=p_campaign_id and p.business_unit_id=v_unit and p.archived_at is null and ip.archived_at is null
  and p.publication_status in ('draft','published') and ip.publication_status in ('draft','published')
  and (p.publication_status<>'published' or ip.publication_status<>'published')
  and ip.presentation_class<>'ambiguous' and cp.price_amount>0 and cp.availability_status in ('available','out_of_stock')
  and exists(select 1 from public.product_media m where m.product_id=p.id and m.is_primary and m.archived_at is null);
 return v_result;
end $$;
revoke all on function public.admin_import_publish_candidates(uuid) from public,anon;
grant execute on function public.admin_import_publish_candidates(uuid) to authenticated;

create function public.admin_bulk_publish_import(p_campaign_id uuid,p_expected_updated_at timestamptz,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_unit uuid; v_campaign public.campaigns; v_row jsonb; v_offer public.campaign_products;
 v_product public.products; v_presentation public.import_presentations; v_products uuid[]:='{}'; v_presentations uuid[]:='{}';
begin
 select id into v_unit from public.business_units where code='import'; perform app.assert_admin_for(v_unit);
 select * into v_campaign from public.campaigns where id=p_campaign_id and business_unit_id=v_unit for update;
 if v_campaign.id is null or v_campaign.archived_at is not null then raise exception 'campaign not found' using errcode='P0002'; end if;
 if v_campaign.updated_at is distinct from p_expected_updated_at then raise exception 'campaign changed' using errcode='P2011'; end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 1500
  then raise exception 'invalid publication batch' using errcode='22023'; end if;
 if exists(select 1 from jsonb_array_elements(p_rows) r group by r->>'offer_id' having count(*)>1)
  then raise exception 'duplicate offer' using errcode='22023'; end if;
 -- Validate and lock every identity before any publication mutation. Shared identities retain their original version.
 for v_row in select value from jsonb_array_elements(p_rows) order by value->>'product_id',value->>'presentation_id' loop
  select * into v_offer from public.campaign_products where id=(v_row->>'offer_id')::uuid and campaign_id=p_campaign_id for update;
  select * into v_product from public.products where id=(v_row->>'product_id')::uuid and business_unit_id=v_unit for update;
  select * into v_presentation from public.import_presentations where id=(v_row->>'presentation_id')::uuid and product_id=v_product.id for update;
  if v_offer.id is null or v_product.id is null or v_presentation.id is null
   or v_offer.product_id<>v_product.id or v_offer.import_presentation_id is distinct from v_presentation.id
   then raise exception 'invalid identity' using errcode='P2004'; end if;
  if v_offer.updated_at is distinct from (v_row->>'offer_updated_at')::timestamptz
   or v_product.updated_at is distinct from (v_row->>'product_updated_at')::timestamptz
   or v_presentation.updated_at is distinct from (v_row->>'presentation_updated_at')::timestamptz
   then raise exception 'publication preview changed' using errcode='P2011'; end if;
  perform 1 from public.product_media where product_id=v_product.id and is_primary and archived_at is null for share;
  if not found or v_product.archived_at is not null or v_presentation.archived_at is not null
   or v_product.publication_status not in ('draft','published') or v_presentation.presentation_class='ambiguous'
   or v_offer.price_amount<=0 or v_offer.availability_status not in ('available','out_of_stock')
   then raise exception 'publication factual blocker' using errcode='P2035'; end if;
  v_products:=array_append(v_products,v_product.id); v_presentations:=array_append(v_presentations,v_presentation.id);
 end loop;
 for v_product in select * from public.products where id=any(v_products) and publication_status<>'published' order by id loop
  perform public.admin_update_import_product(v_product.id,v_product.updated_at,v_product.name,v_product.brand,null,'published');
 end loop;
 for v_presentation in select * from public.import_presentations where id=any(v_presentations) and publication_status<>'published' order by id loop
  perform public.admin_update_import_presentation(v_presentation.id,v_presentation.updated_at,v_presentation.label,
   v_presentation.presentation_class,v_presentation.capacity_ml,'published');
 end loop;
 update public.campaigns set updated_at=clock_timestamp() where id=p_campaign_id returning * into v_campaign;
 perform app.write_audit_log(v_unit,'publish','bulk_import_publication',p_campaign_id,null,
  jsonb_build_object('offer_count',jsonb_array_length(p_rows),'campaign_status',v_campaign.status));
 return jsonb_build_object('offer_count',jsonb_array_length(p_rows),'campaign_updated_at',v_campaign.updated_at);
end $$;
revoke all on function public.admin_bulk_publish_import(uuid,timestamptz,jsonb) from public,anon;
grant execute on function public.admin_bulk_publish_import(uuid,timestamptz,jsonb) to authenticated;
