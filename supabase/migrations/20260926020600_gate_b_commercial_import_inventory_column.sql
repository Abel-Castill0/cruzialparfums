-- Gate B: reserved_quantity (added by 20260926010455) must not be treated
-- as a facts mismatch by the pre-existing commercial-import convergence
-- check. Re-declare the two comparisons that inspect a full public.inventory
-- row so the new column is excluded, exactly like id/created_at/updated_at.

create or replace function app.commercial_structural_dependencies(p_variant_id uuid, p_inventory jsonb)
returns boolean language plpgsql set search_path = '' as $$
declare fk record; predicate text; referenced boolean; inventory_count integer;
begin
  select count(*) into inventory_count from public.inventory i where i.product_variant_id=p_variant_id
    and to_jsonb(i)-array['id','product_variant_id','created_at','updated_at','reserved_quantity'] = jsonb_build_object(
      'inventory_mode','status_only','quantity_on_hand',null,
      'availability_status',p_inventory->>'availability_status','updated_by',null);
  if inventory_count<>1 or p_inventory->>'inventory_mode' is distinct from 'status_only'
     or p_inventory->'quantity_on_hand' is distinct from 'null'::jsonb then return false; end if;
  for fk in select c.*,n.nspname schema_name,t.relname table_name
    from pg_catalog.pg_constraint c join pg_catalog.pg_class t on t.oid=c.conrelid
    join pg_catalog.pg_namespace n on n.oid=t.relnamespace
    where c.contype='f' and c.confrelid='public.product_variants'::regclass order by c.oid
  loop
    select string_agg(format('r.%I = v.%I',a.attname,b.attname),' and ' order by k.ordinality) into predicate
    from unnest(fk.conkey,fk.confkey) with ordinality k(src,dst,ordinality)
    join pg_catalog.pg_attribute a on a.attrelid=fk.conrelid and a.attnum=k.src
    join pg_catalog.pg_attribute b on b.attrelid=fk.confrelid and b.attnum=k.dst;
    if fk.conrelid='public.inventory'::regclass and fk.conkey=array[
      (select attnum from pg_catalog.pg_attribute where attrelid='public.inventory'::regclass and attname='product_variant_id')]
      and fk.confkey=array[(select attnum from pg_catalog.pg_attribute where attrelid='public.product_variants'::regclass and attname='id')] then
      continue;
    end if;
    execute format('select exists(select 1 from %I.%I r join public.product_variants v on %s where v.id=$1)',
      fk.schema_name,fk.table_name,predicate) into referenced using p_variant_id;
    if referenced then return false; end if;
  end loop;
  return true;
end
$$;

create or replace function app.plan_parfums_commercial_import(p_manifest jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit uuid;
  j jsonb;
  p jsonb;
  v jsonb;
  r jsonb;
  c jsonb;
  pr jsonb;
  i jsonb;
  expected jsonb;
  actual jsonb;
  identity text;
  variant_identity text;
  status text;
  product_row public.products%rowtype;
  slug_row public.products%rowtype;
  variant_row public.product_variants%rowtype;
  category_row public.categories%rowtype;
  relation_row public.product_categories%rowtype;
  inventory_row public.inventory%rowtype;
  combo_row public.combos%rowtype;
  item_row public.combo_items%rowtype;
  product_ok boolean;
  variant_ok boolean;
  category_ok boolean;
  source_product jsonb;
  source_ingredient jsonb;
  source_variant jsonb;
  combo_product_id uuid;
  ingredient_product_id uuid;
  combo_variant_id uuid;
  ingredient_variant_id uuid;
  match_count integer;
  authorized boolean := app.commercial_reconciliation_source(p_manifest);
  products_reconcile integer := 0; variants_reconcile integer := 0;
  conflicts jsonb := '[]'::jsonb;
  categories_insert integer := 0; categories_unchanged integer := 0; categories_conflict integer := 0;
  products_insert integer := 0; products_unchanged integer := 0; products_conflict integer := 0;
  variants_insert integer := 0; variants_unchanged integer := 0; variants_conflict integer := 0;
  relationships_insert integer := 0; relationships_unchanged integer := 0; relationships_conflict integer := 0;
  inventory_insert integer := 0; inventory_unchanged integer := 0; inventory_conflict integer := 0;
  combos_insert integer := 0; combos_unchanged integer := 0; combos_conflict integer := 0;
  items_insert integer := 0; items_unchanged integer := 0; items_conflict integer := 0;
begin
  if p_manifest is null or jsonb_typeof(p_manifest) <> 'object'
     or p_manifest #>> '{metadata,business_unit_code}' <> 'parfums' then
    raise exception 'commercial import requires a Parfums reconciliation manifest' using errcode = '22023';
  end if;
  select id into strict v_unit from public.business_units where code = 'parfums';

  if jsonb_array_length(coalesce(p_manifest->'conflicts', '[]'::jsonb)) > 0 then
    conflicts := conflicts || jsonb_build_array(jsonb_build_object(
      'entity','manifest','code','MANIFEST_CONFLICTS_PRESENT','identity','supabase/staging/commercial-reconciliation.json'));
  end if;

  for j in
    select jsonb_build_object('code', q.code, 'identity', q.identity) from (
      select 'INVALID_PRODUCT_IDENTITY' code, coalesce(value #>> '{target_product,slug}', '<missing>') identity
      from jsonb_array_elements(coalesce(p_manifest->'products','[]'::jsonb)) where app.commercial_product_identity(value) is null
      union all
      select 'DUPLICATE_MANIFEST_PRODUCT_IDENTITY', app.commercial_product_identity(value)
      from jsonb_array_elements(coalesce(p_manifest->'products','[]'::jsonb))
      group by app.commercial_product_identity(value) having count(*) > 1
      union all
      select 'DUPLICATE_MANIFEST_PRODUCT_SLUG', value #>> '{target_product,slug}'
      from jsonb_array_elements(coalesce(p_manifest->'products','[]'::jsonb))
      group by value #>> '{target_product,slug}' having count(*) > 1
    ) q order by q.code, q.identity
  loop
    conflicts := conflicts || jsonb_build_array(jsonb_build_object(
      'entity','manifest','code',j->>'code','identity',j->>'identity'));
  end loop;

  if exists (
    select 1 from jsonb_array_elements(coalesce(p_manifest->'category_targets','[]'::jsonb))
    group by value->>'slug' having count(*) > 1
  ) then
    conflicts := conflicts || jsonb_build_array(jsonb_build_object(
      'entity','manifest','code','DUPLICATE_MANIFEST_CATEGORY_SLUG','identity','category_targets'));
  end if;

  for j in select value from jsonb_array_elements(coalesce(p_manifest->'category_targets','[]'::jsonb)) order by value->>'slug' loop
    expected := jsonb_build_object('parent_id',null,'kind',j->>'kind','slug',j->>'slug','name',j->>'name',
      'description',j->'description','spec_schema',coalesce(j->'spec_schema','{}'::jsonb),
      'publication_status',j->>'publication_status','sort_order',(j->>'sort_order')::integer,'archived_at',null);
    category_row := null;
    select * into category_row from public.categories where business_unit_id=v_unit and slug=j->>'slug';
    if category_row.id is null then categories_insert := categories_insert + 1;
    elsif to_jsonb(category_row)-array['id','business_unit_id','created_at','updated_at'] = expected then
      categories_unchanged := categories_unchanged + 1;
    else
      categories_conflict := categories_conflict + 1;
      conflicts := conflicts || jsonb_build_array(jsonb_build_object('entity','category','code','CATEGORY_STATE_MISMATCH',
        'identity',j->>'slug','expected',expected,'actual',to_jsonb(category_row)-array['id','business_unit_id','created_at','updated_at']));
    end if;
  end loop;

  for p in select value from jsonb_array_elements(coalesce(p_manifest->'products','[]'::jsonb))
           order by app.commercial_product_identity(value) loop
    identity := app.commercial_product_identity(p);
    product_ok := identity is not null;
    product_row := null; slug_row := null;

    if p->>'migration_status' not in ('MIGRATABLE_DRAFT','MIGRATABLE_WITH_VERIFIED_FIELDS') then
      product_ok := false; products_conflict := products_conflict + 1;
      conflicts := conflicts || jsonb_build_array(jsonb_build_object('entity','product','code','PRODUCT_NOT_MIGRATABLE','identity',identity));
    elsif (p->>'legacy_id' is not null and p #>> '{target_product,legacy_id}' is distinct from p->>'legacy_id')
       or (p->'legacy_id' = 'null'::jsonb and p #> '{target_product,legacy_id}' is distinct from 'null'::jsonb) then
      product_ok := false; products_conflict := products_conflict + 1;
      conflicts := conflicts || jsonb_build_array(jsonb_build_object('entity','product','code','PRODUCT_IDENTITY_MISMATCH','identity',identity));
    elsif identity is null then
      product_ok := false; products_conflict := products_conflict + 1;
    else
      select * into slug_row from public.products where business_unit_id=v_unit and slug=p #>> '{target_product,slug}';
      if p->>'legacy_id' is not null then
        select * into product_row from public.products where business_unit_id=v_unit and legacy_id=p->>'legacy_id';
        if product_row.id is null and slug_row.id is not null then
          product_ok := false; products_conflict := products_conflict + 1;
          conflicts := conflicts || jsonb_build_array(jsonb_build_object('entity','product','code','LEGACY_ID_NOT_FOUND_SLUG_OWNED','identity',identity));
        elsif product_row.id is not null and slug_row.id is distinct from product_row.id then
          product_ok := false; products_conflict := products_conflict + 1;
          conflicts := conflicts || jsonb_build_array(jsonb_build_object('entity','product','code','LEGACY_ID_SLUG_CROSS_IDENTITY','identity',identity));
        end if;
      else
        product_row := slug_row;
        if product_row.id is not null and product_row.legacy_id is not null then
          product_ok := false; products_conflict := products_conflict + 1;
          conflicts := conflicts || jsonb_build_array(jsonb_build_object('entity','product','code','SUPPLEMENTAL_SLUG_OWNED_BY_LEGACY','identity',identity));
        end if;
      end if;

      if product_ok then
        expected := (p->'target_product') || jsonb_build_object('archived_at',null);
        if product_row.id is null then products_insert := products_insert + 1;
        elsif to_jsonb(product_row)-array['id','business_unit_id','created_at','updated_at'] = expected then
          products_unchanged := products_unchanged + 1;
        elsif app.commercial_product_predecessor(to_jsonb(product_row),p,authorized) then
          products_reconcile := products_reconcile + 1;
        else
          product_ok := false; products_conflict := products_conflict + 1;
          conflicts := conflicts || jsonb_build_array(jsonb_build_object('entity','product','code','PRODUCT_STATE_MISMATCH',
            'identity',identity,'expected',expected,'actual',to_jsonb(product_row)-array['id','business_unit_id','created_at','updated_at']));
        end if;
      end if;
    end if;

    if exists (select 1 from jsonb_array_elements(coalesce(p->'variants','[]'::jsonb))
               group by app.commercial_variant_identity(value) having count(*) > 1)
       or exists (select 1 from jsonb_array_elements(coalesce(p->'variants','[]'::jsonb))
                  where app.commercial_variant_identity(value) is null) then
      product_ok := false; variants_conflict := variants_conflict + 1;
      conflicts := conflicts || jsonb_build_array(jsonb_build_object('entity','variant','code','DUPLICATE_OR_INVALID_VARIANT_IDENTITY','identity',identity));
    end if;

    for v in select value from jsonb_array_elements(coalesce(p->'variants','[]'::jsonb))
             order by app.commercial_variant_identity(value) loop
      if not product_ok then variants_conflict:=variants_conflict+1; inventory_conflict:=inventory_conflict+1; continue; end if;
      variant_identity := app.commercial_variant_identity(v);
      expected := jsonb_build_object('sku',null,'variant_kind',v->>'variant_kind',
        'size_ml',case when v->'size_ml'='null'::jsonb then null else to_jsonb((v->>'size_ml')::numeric) end,
        'label',v->>'label','option_values','{}'::jsonb,'price_amount',to_jsonb((v->>'price_amount')::numeric),
        'currency',v->>'currency','publication_status',v->>'publication_status','sort_order',(v->>'sort_order')::integer,
        'price_verification_status',v->>'price_verification_status','archived_at',null);
      variant_row := null; match_count := 0;
      if product_row.id is not null then
        select count(*), min(id::text)::uuid into match_count, variant_row.id from public.product_variants
        where product_id=product_row.id and variant_kind=v->>'variant_kind'
          and size_ml is not distinct from (v->>'size_ml')::numeric;
        if match_count=1 then select * into variant_row from public.product_variants where id=variant_row.id; end if;
      end if;
      -- Canonical target is absent: only the two exact 100ml predecessors may resolve it.
      if match_count=0 and authorized and identity in ('legacy:cedrat-boise-int','legacy:m-red-tobacco')
         and v->>'variant_kind'='bottle' and (v->>'size_ml')::numeric=120 then
        select x.* into variant_row from public.product_variants x
          where x.product_id=product_row.id and x.variant_kind='bottle' and x.size_ml=100
            and app.commercial_variant_predecessor(to_jsonb(x),p,v,authorized)='structural';
        if variant_row.id is not null then match_count:=1; end if;
      end if;
      variant_ok := match_count <= 1;
      if match_count > 1 then
        variants_conflict:=variants_conflict+1;
        conflicts:=conflicts||jsonb_build_array(jsonb_build_object('entity','variant','code','VARIANT_IDENTITY_AMBIGUOUS','identity',identity||':'||variant_identity));
      elsif variant_row.id is null then variants_insert:=variants_insert+1;
      elsif to_jsonb(variant_row)-array['id','product_id','created_at','updated_at'] = expected then variants_unchanged:=variants_unchanged+1;
      elsif app.commercial_variant_predecessor(to_jsonb(variant_row),p,v,authorized) is not null then variants_reconcile:=variants_reconcile+1;
      else
        variant_ok:=false; variants_conflict:=variants_conflict+1;
        conflicts:=conflicts||jsonb_build_array(jsonb_build_object('entity','variant','code','VARIANT_STATE_MISMATCH',
          'identity',identity||':'||variant_identity,'expected',expected,'actual',to_jsonb(variant_row)-array['id','product_id','created_at','updated_at']));
      end if;
      if not variant_ok then inventory_conflict:=inventory_conflict+1;
      elsif variant_row.id is null then inventory_insert:=inventory_insert+1;
      else
        select * into inventory_row from public.inventory where product_variant_id=variant_row.id;
        expected:=jsonb_build_object('inventory_mode',p #>> '{inventory_intent,inventory_mode}',
          'quantity_on_hand',p #> '{inventory_intent,quantity_on_hand}',
          'availability_status',p #>> '{inventory_intent,availability_status}','updated_by',null);
        if inventory_row.id is null then inventory_insert:=inventory_insert+1;
        elsif to_jsonb(inventory_row)-array['id','product_variant_id','created_at','updated_at','reserved_quantity'] = expected then inventory_unchanged:=inventory_unchanged+1;
        else inventory_conflict:=inventory_conflict+1;
          conflicts:=conflicts||jsonb_build_array(jsonb_build_object('entity','inventory','code','INVENTORY_STATE_MISMATCH','identity',identity||':'||variant_identity));
        end if;
      end if;
    end loop;

    if product_row.id is not null and product_ok then
      for variant_row in select x.* from public.product_variants x where x.product_id=product_row.id and not exists (
        select 1 from jsonb_array_elements(coalesce(p->'variants','[]'::jsonb)) s
        where (x.variant_kind=s->>'variant_kind' and x.size_ml is not distinct from (s->>'size_ml')::numeric)
          or app.commercial_variant_predecessor(to_jsonb(x),p,s,authorized)='structural') loop
        variants_conflict:=variants_conflict+1;
        conflicts:=conflicts||jsonb_build_array(jsonb_build_object('entity','variant','code','UNEXPECTED_EXISTING_VARIANT','identity',identity||':'||variant_row.variant_kind||':'||coalesce(variant_row.size_ml::text,'null')));
      end loop;
    end if;

    for r in select value from jsonb_array_elements(coalesce(p->'categories','[]'::jsonb)) order by value->>'kind',value->>'target_slug' loop
      if not product_ok then relationships_conflict:=relationships_conflict+1; continue; end if;
      category_row:=null; select * into category_row from public.categories where business_unit_id=v_unit and slug=r->>'target_slug';
      category_ok:=category_row.id is null;
      if category_row.id is not null then
        select value into j from jsonb_array_elements(coalesce(p_manifest->'category_targets','[]'::jsonb)) where value->>'slug'=r->>'target_slug';
        expected:=jsonb_build_object('parent_id',null,'kind',j->>'kind','slug',j->>'slug','name',j->>'name','description',j->'description',
          'spec_schema',coalesce(j->'spec_schema','{}'::jsonb),'publication_status',j->>'publication_status','sort_order',(j->>'sort_order')::integer,'archived_at',null);
        category_ok:=to_jsonb(category_row)-array['id','business_unit_id','created_at','updated_at'] = expected;
      end if;
      if not category_ok then relationships_conflict:=relationships_conflict+1;
      elsif product_row.id is null or category_row.id is null then relationships_insert:=relationships_insert+1;
      else
        select * into relation_row from public.product_categories where product_id=product_row.id and category_id=category_row.id;
        if relation_row.product_id is null then relationships_insert:=relationships_insert+1;
        elsif relation_row.sort_order=0 then relationships_unchanged:=relationships_unchanged+1;
        else relationships_conflict:=relationships_conflict+1;
          conflicts:=conflicts||jsonb_build_array(jsonb_build_object('entity','relationship','code','RELATIONSHIP_STATE_MISMATCH','identity',identity||':'||(r->>'target_slug')));
        end if;
      end if;
    end loop;
    if product_row.id is not null and product_ok then
      for relation_row in select x.* from public.product_categories x join public.categories cat on cat.id=x.category_id
        where x.product_id=product_row.id and not exists (select 1 from jsonb_array_elements(coalesce(p->'categories','[]'::jsonb)) s
          where s->>'target_slug'=cat.slug and s->>'kind'=cat.kind) loop
        relationships_conflict:=relationships_conflict+1;
        conflicts:=conflicts||jsonb_build_array(jsonb_build_object('entity','relationship','code','UNEXPECTED_EXISTING_RELATIONSHIP','identity',identity));
      end loop;
    end if;
  end loop;

  -- A combo target refers only to products and canonical variants present in
  -- this manifest. This makes every reference resolvable before mutation.
  for c in select value from jsonb_array_elements(coalesce(p_manifest->'combo_targets','[]'::jsonb))
           order by app.commercial_reference_identity(value->'product') loop
    identity:=app.commercial_reference_identity(c->'product');
    status:=coalesce(c->>'composition_verification_status','pending_reconfirmation');
    source_product:=null;
    select value into source_product from jsonb_array_elements(coalesce(p_manifest->'products','[]'::jsonb))
      where app.commercial_product_identity(value)=identity limit 1;
    if identity is null or source_product is null then
      combos_conflict:=combos_conflict+1;
      conflicts:=conflicts||jsonb_build_array(jsonb_build_object('entity','combo','code','MISSING_COMBO_PRODUCT_REFERENCE','identity',coalesce(identity,'<invalid>')));
      continue;
    end if;
    if c #>> '{product,slug}' is distinct from source_product #>> '{target_product,slug}' then
      combos_conflict:=combos_conflict+1;
      conflicts:=conflicts||jsonb_build_array(jsonb_build_object('entity','combo','code','COMBO_PRODUCT_REFERENCE_SLUG_MISMATCH','identity',identity));
      continue;
    end if;
    if status not in ('pending_reconfirmation','client_confirmed','official_pdf','unknown') then
      combos_conflict:=combos_conflict+1;
      conflicts:=conflicts||jsonb_build_array(jsonb_build_object('entity','combo','code','INVALID_COMPOSITION_AUTHORITY','identity',identity));
      continue;
    end if;
    if (select count(*) from jsonb_array_elements(coalesce(p_manifest->'combo_targets','[]'::jsonb)) x
        where app.commercial_reference_identity(x->'product')=identity) > 1 then
      combos_conflict:=combos_conflict+1;
      conflicts:=conflicts||jsonb_build_array(jsonb_build_object('entity','combo','code','DUPLICATE_COMBO_TARGET','identity',identity));
      continue;
    end if;
    combo_product_id:=null;
    if source_product->>'legacy_id' is not null then
      select id into combo_product_id from public.products where business_unit_id=v_unit and legacy_id=source_product->>'legacy_id';
    else
      select id into combo_product_id from public.products where business_unit_id=v_unit and legacy_id is null and slug=source_product #>> '{target_product,slug}';
    end if;
    combo_row:=null; if combo_product_id is not null then select * into combo_row from public.combos where product_id=combo_product_id; end if;
    if combo_row.id is null then combos_insert:=combos_insert+1;
    elsif combo_row.composition_verification_status=status and combo_row.archived_at is null then combos_unchanged:=combos_unchanged+1;
    else combos_conflict:=combos_conflict+1;
      conflicts:=conflicts||jsonb_build_array(jsonb_build_object('entity','combo','code','COMBO_STATE_MISMATCH','identity',identity));
      continue;
    end if;

    if exists (select 1 from jsonb_array_elements(coalesce(c->'presentations','[]'::jsonb))
               group by app.commercial_variant_identity(value->'variant') having count(*)>1) then
      items_conflict:=items_conflict+1;
      conflicts:=conflicts||jsonb_build_array(jsonb_build_object('entity','combo_item','code','DUPLICATE_COMBO_PRESENTATION','identity',identity));
      continue;
    end if;
    for pr in select value from jsonb_array_elements(coalesce(c->'presentations','[]'::jsonb))
              order by app.commercial_variant_identity(value->'variant') loop
      variant_identity:=app.commercial_variant_identity(pr->'variant');
      source_variant:=null;
      select value into source_variant from jsonb_array_elements(coalesce(source_product->'variants','[]'::jsonb))
        where app.commercial_variant_identity(value)=variant_identity limit 1;
      if variant_identity is null or source_variant is null then
        items_conflict:=items_conflict+1;
        conflicts:=conflicts||jsonb_build_array(jsonb_build_object('entity','combo_item','code','MISSING_COMBO_PRESENTATION_VARIANT','identity',identity||':'||coalesce(variant_identity,'<invalid>')));
        continue;
      end if;
      combo_variant_id:=null;
      if combo_product_id is not null then
        select count(*),min(id::text)::uuid into match_count,combo_variant_id from public.product_variants
        where product_id=combo_product_id and variant_kind=pr #>> '{variant,variant_kind}'
          and size_ml is not distinct from (pr #>> '{variant,size_ml}')::numeric;
        if match_count>1 then
          items_conflict:=items_conflict+1;
          conflicts:=conflicts||jsonb_build_array(jsonb_build_object('entity','combo_item','code','COMBO_PRESENTATION_VARIANT_AMBIGUOUS','identity',identity||':'||variant_identity));
          continue;
        end if;
      end if;
      if exists (select 1 from jsonb_array_elements(coalesce(pr->'items','[]'::jsonb))
        group by app.commercial_reference_identity(value->'product'),app.commercial_variant_identity(value->'variant') having count(*)>1) then
        items_conflict:=items_conflict+1;
        conflicts:=conflicts||jsonb_build_array(jsonb_build_object('entity','combo_item','code','DUPLICATE_PRESENTATION_INGREDIENT','identity',identity||':'||variant_identity));
        continue;
      end if;
      if exists (select 1 from jsonb_array_elements(coalesce(pr->'items','[]'::jsonb))
        group by (value->>'sort_order')::integer having count(*)>1) then
        items_conflict:=items_conflict+1;
        conflicts:=conflicts||jsonb_build_array(jsonb_build_object('entity','combo_item','code','DUPLICATE_PRESENTATION_SORT_ORDER','identity',identity||':'||variant_identity));
        continue;
      end if;
      for i in select value from jsonb_array_elements(coalesce(pr->'items','[]'::jsonb))
               order by (value->>'sort_order')::integer,app.commercial_reference_identity(value->'product'),app.commercial_variant_identity(value->'variant') loop
        source_ingredient:=null;
        select value into source_ingredient from jsonb_array_elements(coalesce(p_manifest->'products','[]'::jsonb))
          where app.commercial_product_identity(value)=app.commercial_reference_identity(i->'product') limit 1;
        if source_ingredient is null then
          items_conflict:=items_conflict+1;
          conflicts:=conflicts||jsonb_build_array(jsonb_build_object('entity','combo_item','code','MISSING_INGREDIENT_PRODUCT_REFERENCE','identity',identity||':'||coalesce(app.commercial_reference_identity(i->'product'),'<invalid>')));
          continue;
        end if;
        if app.commercial_product_identity(source_ingredient)=identity then
          items_conflict:=items_conflict+1;
          conflicts:=conflicts||jsonb_build_array(jsonb_build_object('entity','combo_item','code','COMBO_SELF_REFERENCE','identity',identity||':'||variant_identity));
          continue;
        end if;
        if i #>> '{product,slug}' is distinct from source_ingredient #>> '{target_product,slug}' then
          items_conflict:=items_conflict+1;
          conflicts:=conflicts||jsonb_build_array(jsonb_build_object('entity','combo_item','code','INGREDIENT_REFERENCE_SLUG_MISMATCH','identity',identity||':'||app.commercial_reference_identity(i->'product')));
          continue;
        end if;
        source_variant:=null;
        select value into source_variant from jsonb_array_elements(coalesce(source_ingredient->'variants','[]'::jsonb))
          where app.commercial_variant_identity(value)=app.commercial_variant_identity(i->'variant') limit 1;
        if source_variant is null then
          items_conflict:=items_conflict+1;
          conflicts:=conflicts||jsonb_build_array(jsonb_build_object('entity','combo_item','code','MISSING_INGREDIENT_VARIANT','identity',identity||':'||app.commercial_reference_identity(i->'product')||':'||coalesce(app.commercial_variant_identity(i->'variant'),'<invalid>')));
          continue;
        end if;
        if coalesce((i->>'quantity')::integer,0)<=0 or (i->>'sort_order')::integer is null then
          items_conflict:=items_conflict+1;
          conflicts:=conflicts||jsonb_build_array(jsonb_build_object('entity','combo_item','code','INVALID_COMBO_ITEM_VALUES','identity',identity||':'||variant_identity));
          continue;
        end if;
        ingredient_product_id:=null;
        if source_ingredient->>'legacy_id' is not null then
          select id into ingredient_product_id from public.products where business_unit_id=v_unit and legacy_id=source_ingredient->>'legacy_id';
        else
          select id into ingredient_product_id from public.products where business_unit_id=v_unit and legacy_id is null and slug=source_ingredient #>> '{target_product,slug}';
        end if;
        ingredient_variant_id:=null;
        if ingredient_product_id is not null then
          select count(*),min(id::text)::uuid into match_count,ingredient_variant_id from public.product_variants
          where product_id=ingredient_product_id and variant_kind=i #>> '{variant,variant_kind}'
            and size_ml is not distinct from (i #>> '{variant,size_ml}')::numeric;
          if match_count>1 then
            items_conflict:=items_conflict+1;
            conflicts:=conflicts||jsonb_build_array(jsonb_build_object('entity','combo_item','code','INGREDIENT_VARIANT_AMBIGUOUS','identity',identity||':'||app.commercial_reference_identity(i->'product')||':'||app.commercial_variant_identity(i->'variant')));
            continue;
          end if;
        end if;
        item_row:=null;
        if combo_row.id is not null and combo_variant_id is not null and ingredient_variant_id is not null then
          select * into item_row from public.combo_items where combo_id=combo_row.id
            and combo_product_variant_id=combo_variant_id and product_variant_id=ingredient_variant_id;
        end if;
        if item_row.id is null then items_insert:=items_insert+1;
        elsif item_row.quantity=(i->>'quantity')::integer and item_row.sort_order=(i->>'sort_order')::integer then items_unchanged:=items_unchanged+1;
        else items_conflict:=items_conflict+1;
          conflicts:=conflicts||jsonb_build_array(jsonb_build_object('entity','combo_item','code','COMBO_ITEM_STATE_MISMATCH','identity',identity||':'||variant_identity||':'||app.commercial_reference_identity(i->'product')));
        end if;
      end loop;
    end loop;
    if combo_row.id is not null then
      for item_row in select x.* from public.combo_items x where x.combo_id=combo_row.id and not exists (
        select 1 from jsonb_array_elements(coalesce(c->'presentations','[]'::jsonb)) as presentation(value)
        cross join lateral jsonb_array_elements(coalesce(presentation.value->'items','[]'::jsonb)) as item(value)
        join lateral (select value source from jsonb_array_elements(coalesce(p_manifest->'products','[]'::jsonb))
          where app.commercial_product_identity(value)=app.commercial_reference_identity(item.value->'product') limit 1) ingredient on true
        join public.product_variants cpv on cpv.id=x.combo_product_variant_id and cpv.variant_kind=presentation.value #>> '{variant,variant_kind}'
          and cpv.size_ml is not distinct from (presentation.value #>> '{variant,size_ml}')::numeric
        join public.product_variants ipv on ipv.id=x.product_variant_id and ipv.variant_kind=item.value #>> '{variant,variant_kind}'
          and ipv.size_ml is not distinct from (item.value #>> '{variant,size_ml}')::numeric
        join public.products ip on ip.id=ipv.product_id and ((ingredient.source->>'legacy_id' is not null and ip.legacy_id=ingredient.source->>'legacy_id')
          or (ingredient.source->'legacy_id'='null'::jsonb and ip.legacy_id is null and ip.slug=ingredient.source #>> '{target_product,slug}'))
      ) loop
        items_conflict:=items_conflict+1;
        conflicts:=conflicts||jsonb_build_array(jsonb_build_object('entity','combo_item','code','UNEXPECTED_EXISTING_COMBO_ITEM','identity',identity));
      end loop;
    end if;
  end loop;

  return jsonb_build_object('mode','dry_run','applied',false,'refused',false,
    'operations',jsonb_build_object(
      'categories',jsonb_build_object('reconcile',0,'insert',categories_insert,'unchanged',categories_unchanged,'conflict',categories_conflict),
      'products',jsonb_build_object('reconcile',products_reconcile,'insert',products_insert,'unchanged',products_unchanged,'conflict',products_conflict),
      'variants',jsonb_build_object('reconcile',variants_reconcile,'insert',variants_insert,'unchanged',variants_unchanged,'conflict',variants_conflict),
      'relationships',jsonb_build_object('reconcile',0,'insert',relationships_insert,'unchanged',relationships_unchanged,'conflict',relationships_conflict),
      'inventory',jsonb_build_object('reconcile',0,'insert',inventory_insert,'unchanged',inventory_unchanged,'conflict',inventory_conflict),
      'combos',jsonb_build_object('reconcile',0,'insert',combos_insert,'unchanged',combos_unchanged,'conflict',combos_conflict),
      'combo_items',jsonb_build_object('reconcile',0,'insert',items_insert,'unchanged',items_unchanged,'conflict',items_conflict)),
    'reconcile_count',products_reconcile+variants_reconcile,
    'insert_count',categories_insert+products_insert+variants_insert+relationships_insert+inventory_insert+combos_insert+items_insert,
    'conflict_count',jsonb_array_length(conflicts),'conflicts',conflicts);
end;
$$;
