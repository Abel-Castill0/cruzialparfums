-- Ingested Import products can legitimately lack a confirmed category. NULL
-- preserves their existing category link, including the absence of one.
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
 if p_category_id is not null and not exists(
   select 1 from public.categories c where c.id=p_category_id and c.business_unit_id=v_unit
     and c.kind='import_category' and c.archived_at is null
 ) then raise exception 'invalid Import category' using errcode='P2004'; end if;
 update public.products set name=v_name,brand=nullif(btrim(coalesce(p_brand,'')),''),publication_status=p_publication_status
 where id=p_product_id and updated_at=p_expected_updated_at returning * into v_after;
 if v_after.id is null then raise exception 'product was modified by another session' using errcode='P2011'; end if;
 if p_category_id is not null then
   delete from public.product_categories pc using public.categories c
   where pc.product_id=p_product_id and pc.category_id=c.id and c.kind='import_category';
   insert into public.product_categories(product_id,category_id,sort_order) values(p_product_id,p_category_id,0);
 end if;
 perform app.write_audit_log(v_unit,'update','import_product',p_product_id,
   jsonb_build_object('name',v_before.name,'brand',v_before.brand,'publication_status',v_before.publication_status),
   jsonb_build_object('name',v_after.name,'brand',v_after.brand,'publication_status',v_after.publication_status,'category_id',p_category_id));
 return v_after;
end $$;

revoke all on function public.admin_update_import_product(uuid,timestamptz,text,text,uuid,text) from public,anon;
grant execute on function public.admin_update_import_product(uuid,timestamptz,text,text,uuid,text) to authenticated;
