-- Run scripts/prepare-commercial-reconciliation-test.mjs before local pgTAP.
-- Import the byte-identical committed artifact, not a duplicated target fixture.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

create temporary table c3b1_manifest(payload jsonb not null);
insert into c3b1_manifest select payload from c3b1_test_support.manifest where id;
select ok(app.commercial_reconciliation_source(payload),'exact committed C2 source authorizes reconciliation') from c3b1_manifest;
select ok(not app.commercial_reconciliation_source(jsonb_set(payload,'{metadata,business_unit_code}','"import"')),
  'altered source cannot authorize reconciliation') from c3b1_manifest;
select is((app.plan_parfums_commercial_import(payload)->>'conflict_count')::integer,0,'empty local catalog plans safely') from c3b1_manifest;
select is((app.plan_parfums_commercial_import(payload)#>>'{operations,categories,insert}')::integer,
  jsonb_array_length(payload->'category_targets'),'missing categories insert') from c3b1_manifest;
select is((app.plan_parfums_commercial_import(payload)#>>'{operations,products,insert}')::integer,
  jsonb_array_length(payload->'products'),'missing products insert') from c3b1_manifest;
select is((app.plan_parfums_commercial_import(payload)#>>'{operations,variants,insert}')::integer,
  (select sum(jsonb_array_length(p->'variants'))::integer from jsonb_array_elements(payload->'products') p),
  'missing variants insert') from c3b1_manifest;

-- Reconstruct the approved historical CLASSES from C2, never read hosted data.
-- Combo and supplemental products are absent, as at the hosted checkpoint.
create function pg_temp.c3b1_historical_source(p_manifest jsonb)
returns jsonb language plpgsql as $$
declare p jsonb; v jsonb; products jsonb := '[]'; variants jsonb; t jsonb; concentration text;
begin
  for p in select value from jsonb_array_elements(p_manifest->'products') source(value)
    where value->>'legacy_id' is not null and not exists(select 1 from jsonb_array_elements(p_manifest->'combo_targets') c
      where app.commercial_reference_identity(c->'product')=app.commercial_product_identity(source.value))
  loop
    t:=p->'target_product';
    if p->>'legacy_id' in ('by-the-fireplace','cdn-intense-man','dylan-blue','le-male-elixir') then
      concentration:=t->>'concentration';
      t:=t||jsonb_build_object('concentration','EDP','description',
        replace(t->>'description','concentración '||concentration||'.','concentración EDP.'));
    elsif p->>'legacy_id'='bir-intense' then t:=t||jsonb_build_object('publication_status','hidden');
    elsif p->>'legacy_id'='invictus-elixir' then t:=t||jsonb_build_object('publication_status','draft'); end if;
    variants:='[]';
    for v in select value from jsonb_array_elements(p->'variants') loop
      v:=v||jsonb_build_object('price_verification_status','legacy');
      if p->>'legacy_id' in ('cedrat-boise-int','m-red-tobacco') and v->>'variant_kind'='bottle' then
        v:=v||jsonb_build_object('size_ml',100,'label','Frasco 100 ml',
          'price_amount',case when p->>'legacy_id'='cedrat-boise-int' then 820 else 850 end);
      end if;
      variants:=variants||jsonb_build_array(v);
    end loop;
    products:=products||jsonb_build_array(p||jsonb_build_object('target_product',t,'variants',variants));
  end loop;
  return p_manifest||jsonb_build_object('products',products,'combo_targets','[]'::jsonb);
end
$$;
select ok((app.apply_parfums_commercial_import(pg_temp.c3b1_historical_source(payload))->>'applied')::boolean,
  'C1B still inserts the explicit historical fixture without reconciliation authority') from c3b1_manifest;

create temporary table c3b1_before_variants as select v.* from public.product_variants v;
create temporary table c3b1_before_inventory as select i.* from public.inventory i;
create temporary table c3b1_preplan as select app.plan_parfums_commercial_import(payload) plan from c3b1_manifest;
select is((plan->>'conflict_count')::integer,0,'all approved existing predecessor classes now plan without conflicts') from c3b1_preplan;
select is((plan#>>'{operations,products,reconcile}')::integer,6,'six exact product predecessors reconcile') from c3b1_preplan;
select is((plan#>>'{operations,variants,reconcile}')::integer,305,'303 normal plus two structural variants reconcile') from c3b1_preplan;
select is((plan->>'reconcile_count')::integer,311,'top-level reconcile count equals entity totals') from c3b1_preplan;
select is((plan->>'insert_count')::integer,64,'remaining products and dependent rows insert without artificial updates') from c3b1_preplan;
select is((plan#>>'{operations,variants,insert}')::integer,12,'two 120ml targets reuse their predecessor UUIDs, not inserts') from c3b1_preplan;
select is((plan#>>'{operations,variants,unchanged}')::integer,7,'four unresolved bottles and three archived-product variants unchanged') from c3b1_preplan;
select is((plan#>>'{operations,inventory,reconcile}')::integer,0,'inventory needs no generalized update') from c3b1_preplan;
select is((plan#>>'{operations,relationships,reconcile}')::integer,0,'relationships need no generalized update') from c3b1_preplan;
select ok(not app.commercial_reconciliation_source(jsonb_set(payload,'{products,0,target_product,name}','"Altered target"'))
  and (app.plan_parfums_commercial_import(jsonb_set(payload,'{products,0,target_product,name}','"Altered target"'))->>'conflict_count')::integer>0,
  'same-BU modified artifact cannot authorize any predecessor reconciliation') from c3b1_manifest;

-- Independent local sentinels: full persisted row fingerprints must survive.
insert into public.products(business_unit_id,legacy_id,slug,name,verification_status)
select id,'c3b1-unowned','c3b1-unowned','Local unowned','legacy' from public.business_units where code='parfums';
insert into public.products(business_unit_id,slug,name,verification_status)
select id,'staging-qa-c3b1','[STAGING QA] Local sentinel','client_confirmed' from public.business_units where code='parfums';
insert into public.products(business_unit_id,legacy_id,slug,name,verification_status)
select id,'cedrat-boise-int','cedrat-boise-int','Local Import sentinel','client_confirmed' from public.business_units where code='import';
insert into public.product_variants(product_id,variant_kind,size_ml,label,price_amount,price_verification_status)
select id,'bottle',100,'Import sentinel',1,'client_confirmed' from public.products where name='Local Import sentinel';
create temporary table c3b1_sentinels as select p.* from public.products p
  where p.slug in ('c3b1-unowned','staging-qa-c3b1') or p.name='Local Import sentinel';
create temporary table c3b1_import_variants as select v.* from public.product_variants v
  join c3b1_sentinels p on p.id=v.product_id;

create function pg_temp.c3b1_variant(p_legacy text,p_kind text,p_size numeric)
returns uuid language sql as $$
  select v.id from public.product_variants v join public.products p on p.id=v.product_id
    join public.business_units u on u.id=p.business_unit_id
  where u.code='parfums' and p.legacy_id=p_legacy and v.variant_kind=p_kind and v.size_ml=p_size
$$;
create function pg_temp.c3b1_state()
returns text language sql as $$
  select md5(string_agg(row,'|' order by row)) from (
    select 'p'||to_jsonb(x)::text row from public.products x union all
    select 'v'||to_jsonb(x)::text from public.product_variants x union all
    select 'i'||to_jsonb(x)::text from public.inventory x union all
    select 'c'||to_jsonb(x)::text from public.categories x union all
    select 'r'||to_jsonb(x)::text from public.product_categories x union all
    select 'b'||to_jsonb(x)::text from public.combos x union all
    select 'm'||to_jsonb(x)::text from public.combo_items x
  ) persisted
$$;
-- Every negative checks planner rejection AND apply refusal with no writes.
-- Each injected drift/dependency is rolled back in an inner subtransaction.
create function pg_temp.c3b1_rejected(p_sql text)
returns boolean language plpgsql as $$
declare result boolean; state text; m jsonb;
begin
  select payload into m from c3b1_manifest;
  begin
    execute p_sql;
    state:=pg_temp.c3b1_state();
    result:=(app.plan_parfums_commercial_import(m)->>'conflict_count')::integer>0
      and (app.apply_parfums_commercial_import(m)->>'refused')::boolean
      and pg_temp.c3b1_state()=state;
    raise exception 'restore negative fixture' using errcode='ZX001';
  exception when sqlstate 'ZX001' then null; end;
  return result;
end
$$;

select ok(pg_temp.c3b1_rejected(format('update public.product_variants set price_verification_status=%L,price_amount=price_amount+1 where id=%L',authority,
  pg_temp.c3b1_variant('sauvage-edt','decant',10))),authority||' normal mismatch stays conflict; apply writes nothing')
from unnest(array['client_confirmed','official_pdf','provisional_market','unknown']) authority;
select ok(pg_temp.c3b1_rejected(format('update public.product_variants set %s where id=%L',change,
  pg_temp.c3b1_variant('sauvage-edt','decant',10))),'normal structural drift rejected: '||change)
from unnest(array['variant_kind=''bottle''','size_ml=11','label=''Unexpected label''','sku=''unexpected-sku''',
  'option_values='' {"unexpected":true}''::jsonb','currency=''USD''','sort_order=9','publication_status=''archived''',
  'archived_at=now()']) change;
select ok(pg_temp.c3b1_rejected('update public.products set name=''Unexpected name'' where legacy_id=''by-the-fireplace'''),
  'allowlisted product with any additional field drift stays conflict');
select ok(pg_temp.c3b1_rejected('update public.products set verification_status=''client_confirmed'' where legacy_id=''by-the-fireplace'''),
  'client-confirmed product predecessor cannot be overwritten');
select ok(pg_temp.c3b1_rejected('update public.products set slug=''unexpected-identity'' where legacy_id=''sauvage-edt'''),
  'legacy/slug cross-identity drift rejected');
select ok(pg_temp.c3b1_rejected('update public.products set legacy_id=''unexpected-identity'' where slug=''sauvage-edt'''),
  'wrong authoritative legacy identity has no slug fallback');
select ok(pg_temp.c3b1_rejected('insert into public.product_variants(product_id,variant_kind,size_ml,label,price_amount)
  select product_id,variant_kind,size_ml,label||'' duplicate'',price_amount from public.product_variants where id=pg_temp.c3b1_variant(''sauvage-edt'',''decant'',10)'),
  'ambiguous normal variant identity rejected');
select ok(pg_temp.c3b1_rejected('insert into public.product_variants(product_id,variant_kind,size_ml,label,price_amount)
  select product_id,''bottle'',999,''Unexpected'',1 from public.product_variants where id=pg_temp.c3b1_variant(''sauvage-edt'',''decant'',10)'),
  'unexpected non-allowlisted variant rejected');

select ok(pg_temp.c3b1_rejected(format('update public.product_variants set price_verification_status=%L where id=%L',authority,
  pg_temp.c3b1_variant('cedrat-boise-int','bottle',100))),authority||' structural predecessor rejected')
from unnest(array['client_confirmed','official_pdf','provisional_market','unknown']) authority;
select ok(pg_temp.c3b1_rejected(format('update public.product_variants set %s where id=%L',change,
  pg_temp.c3b1_variant('cedrat-boise-int','bottle',100))),'structural predecessor drift rejected: '||change)
from unnest(array['size_ml=99','price_amount=821','label=''Wrong historical label''','sku=''unexpected''',
  'archived_at=now()','sort_order=4']) change;
select ok(pg_temp.c3b1_rejected('insert into public.product_variants(product_id,variant_kind,size_ml,label,price_amount)
  select product_id,''bottle'',120,''Frasco 120 ml'',price_amount from public.product_variants
  where id=pg_temp.c3b1_variant(''cedrat-boise-int'',''bottle'',100)'), 'existing 120ml sibling rejects structural reconciliation');
select ok(pg_temp.c3b1_rejected('insert into public.product_variants(product_id,variant_kind,size_ml,label,price_amount)
  select product_id,variant_kind,size_ml,label||'' duplicate'',price_amount from public.product_variants
  where id=pg_temp.c3b1_variant(''cedrat-boise-int'',''bottle'',100)'), 'two 100ml predecessors reject structural reconciliation');
select ok(pg_temp.c3b1_rejected('update public.inventory set inventory_mode=''tracked_quantity'',quantity_on_hand=7
  where product_variant_id=pg_temp.c3b1_variant(''cedrat-boise-int'',''bottle'',100)'),
  'tracked inventory/non-null quantity rejects structural reconciliation');
select throws_ok('update public.inventory set quantity_on_hand=1 where product_variant_id=pg_temp.c3b1_variant(''cedrat-boise-int'',''bottle'',100)',
  '23514',null,'status-only quantity is also forbidden by the schema');
select ok(pg_temp.c3b1_rejected('delete from public.inventory where product_variant_id=pg_temp.c3b1_variant(''cedrat-boise-int'',''bottle'',100)'),
  'missing exact inventory dependency rejects structural reconciliation');
select ok(pg_temp.c3b1_rejected('update public.inventory set availability_status=''out_of_stock''
  where product_variant_id=pg_temp.c3b1_variant(''cedrat-boise-int'',''bottle'',100)'),
  'mismatching inventory availability rejects structural reconciliation');
select ok(pg_temp.c3b1_rejected('insert into auth.users(id) values(''c3b10000-0000-4000-8000-000000000001'');
  update public.inventory set updated_by=''c3b10000-0000-4000-8000-000000000001''
  where product_variant_id=pg_temp.c3b1_variant(''cedrat-boise-int'',''bottle'',100)'),
  'inventory with an unexpected updater rejects structural reconciliation');
select ok(pg_temp.c3b1_rejected('update public.products set archived_at=now() where legacy_id=''cedrat-boise-int'''),
  'structural parent archive anomaly rejects reconciliation');
select ok(pg_temp.c3b1_rejected('update public.product_variants set price_amount=851
  where id=pg_temp.c3b1_variant(''m-red-tobacco'',''bottle'',100)'),
  'Red Tobacco also requires its exact historical predecessor price');

select ok(pg_temp.c3b1_rejected('insert into public.variant_price_tiers(product_variant_id,context,min_quantity,price_amount)
  values(pg_temp.c3b1_variant(''cedrat-boise-int'',''bottle'',100),''retail'',1,1)'), 'price-tier reference rejects structural reconciliation');
select ok(pg_temp.c3b1_rejected('insert into public.product_media(product_id,product_variant_id,provider,secure_url)
  select product_id,id,''legacy_static'',''/local-test.png'' from public.product_variants
  where id=pg_temp.c3b1_variant(''cedrat-boise-int'',''bottle'',100)'), 'media reference rejects structural reconciliation');
select ok(pg_temp.c3b1_rejected('with campaign as (insert into public.campaigns(business_unit_id,number,name)
  select id,991601,''Local dependency'' from public.business_units where code=''parfums'' returning id)
  insert into public.campaign_products(campaign_id,product_id,product_variant_id,price_amount)
  select campaign.id,v.product_id,v.id,1 from campaign,public.product_variants v
  where v.id=pg_temp.c3b1_variant(''cedrat-boise-int'',''bottle'',100)'), 'campaign reference rejects structural reconciliation');
select ok(pg_temp.c3b1_rejected('with local_order as (insert into public.orders(business_unit_id,order_number)
  select id,''C3B1-DEPENDENCY'' from public.business_units where code=''parfums'' returning id)
  insert into public.order_lines(order_id,product_id,product_variant_id,product_name_snapshot,variant_label_snapshot,unit_price_amount,quantity,line_total_amount)
  select local_order.id,v.product_id,v.id,''Local snapshot'',''100 ml'',1,1,1 from local_order,public.product_variants v
  where v.id=pg_temp.c3b1_variant(''cedrat-boise-int'',''bottle'',100)'), 'order-history reference rejects structural reconciliation');
select ok(pg_temp.c3b1_rejected('with local_combo as (insert into public.combos(product_id)
  select product_id from public.product_variants where id=pg_temp.c3b1_variant(''sauvage-edt'',''decant'',10) returning id)
  insert into public.combo_items(combo_id,combo_product_variant_id,product_variant_id,quantity)
  select id,pg_temp.c3b1_variant(''sauvage-edt'',''decant'',10),pg_temp.c3b1_variant(''cedrat-boise-int'',''bottle'',100),1 from local_combo'),
  'combo ingredient reference rejects structural reconciliation');
select ok(pg_temp.c3b1_rejected('with local_combo as (insert into public.combos(product_id)
  select product_id from public.product_variants where id=pg_temp.c3b1_variant(''cedrat-boise-int'',''bottle'',100) returning id)
  insert into public.combo_items(combo_id,combo_product_variant_id,product_variant_id,quantity)
  select id,pg_temp.c3b1_variant(''cedrat-boise-int'',''bottle'',100),pg_temp.c3b1_variant(''sauvage-edt'',''decant'',10),1 from local_combo'),
  'combo presentation reference rejects structural reconciliation');
select ok(pg_temp.c3b1_rejected('create table c3b1_test_support.future_variant_dependency(variant_id uuid references public.product_variants(id));
  insert into c3b1_test_support.future_variant_dependency values(pg_temp.c3b1_variant(''cedrat-boise-int'',''bottle'',100))'),
  'dynamic helper rejects a new unsupported FK, regardless of schema or column name');
select ok(pg_temp.c3b1_rejected('alter table public.product_variants add constraint c3b1_composite_test unique(id,variant_kind);
  create table c3b1_test_support.future_composite_dependency(variant_id uuid,kind text,foreign key(variant_id,kind) references public.product_variants(id,variant_kind));
  insert into c3b1_test_support.future_composite_dependency values(pg_temp.c3b1_variant(''cedrat-boise-int'',''bottle'',100),''bottle'')'),
  'dynamic helper rejects a new composite FK reference');

select is(app.commercial_variant_predecessor(to_jsonb(v),p,t,true),null::text,'structural target other than 120ml rejected')
from c3b1_manifest,jsonb_array_elements(payload->'products') p,jsonb_array_elements(p->'variants') target,
  lateral(select target||jsonb_build_object('size_ml',121) t) changed, public.product_variants v
where p->>'legacy_id'='cedrat-boise-int' and target->>'variant_kind'='bottle' and v.id=pg_temp.c3b1_variant('cedrat-boise-int','bottle',100);
select is(app.commercial_variant_predecessor(to_jsonb(v)||jsonb_build_object('product_id',wrong.id),p,t,true),null::text,
  'wrong product UUID rejected even with otherwise exact predecessor')
from c3b1_manifest,jsonb_array_elements(payload->'products') p,jsonb_array_elements(p->'variants') t,public.product_variants v,
  public.products wrong where p->>'legacy_id'='cedrat-boise-int' and t->>'variant_kind'='bottle'
  and v.id=pg_temp.c3b1_variant('cedrat-boise-int','bottle',100) and wrong.slug='c3b1-unowned';
select is(app.commercial_variant_predecessor(to_jsonb(v),p,t,true),null::text,'Import-owned structural predecessor rejected')
from c3b1_manifest,jsonb_array_elements(payload->'products') p,jsonb_array_elements(p->'variants') t,public.product_variants v,
  c3b1_import_variants imported where p->>'legacy_id'='cedrat-boise-int' and t->>'variant_kind'='bottle' and v.id=imported.id;
select is(app.commercial_variant_predecessor(to_jsonb(v)||jsonb_build_object('product_id',imported.product_id),p,t,true),null::text,
  'Import ownership cannot satisfy a normal Parfums reconciliation predicate')
from c3b1_manifest,jsonb_array_elements(payload->'products') p,jsonb_array_elements(p->'variants') t,
  public.product_variants v,c3b1_import_variants imported
where p->>'legacy_id'='sauvage-edt' and t->>'variant_kind'='decant' and (t->>'size_ml')::numeric=10
  and v.id=pg_temp.c3b1_variant('sauvage-edt','decant',10);

-- Deliberate LOCAL test price perturbations prove correction to C2. They do not
-- claim to reproduce real historical prices or introduce new commercial truth.
create function pg_temp.c3b1_price_correction(p_id uuid)
returns boolean language plpgsql as $$
declare result boolean; m jsonb; current_price numeric; target_price numeric;
begin
  select payload into m from c3b1_manifest;
  select (t->>'price_amount')::numeric into target_price from jsonb_array_elements(m->'products') p,
    jsonb_array_elements(p->'variants') t, public.product_variants v,public.products product
    where v.id=p_id and product.id=v.product_id and p->>'legacy_id'=product.legacy_id
      and t->>'variant_kind'=v.variant_kind and (t->>'size_ml')::numeric=v.size_ml;
  begin
    update public.product_variants set price_amount=price_amount+1 where id=p_id;
    result:=(app.plan_parfums_commercial_import(m)->>'conflict_count')::integer=0
      and (app.apply_parfums_commercial_import(m)->>'applied')::boolean;
    select price_amount into current_price from public.product_variants where id=p_id;
    result:=result and current_price=target_price;
    raise exception 'restore price perturbation' using errcode='ZX001';
  exception when sqlstate 'ZX001' then null; end;
  return result;
end
$$;
select ok(pg_temp.c3b1_price_correction(pg_temp.c3b1_variant('sauvage-edt','decant',10)),
  'legacy official-PDF price correction applies exact committed target');
select ok(pg_temp.c3b1_price_correction(pg_temp.c3b1_variant('9pm','bottle',100)),
  'legacy provisional price correction applies exact committed target');

-- A trigger refusing one late row exercises the mandatory affected-row check
-- after earlier reconciliations. The entire function's prior writes roll back.
create function pg_temp.c3b1_refuse_late_update() returns trigger language plpgsql as $$
begin
  if old.id=pg_temp.c3b1_variant('sauvage-edt','decant',10) then return null; end if;
  return new;
end
$$;
create temporary table c3b1_atomic_before as select pg_temp.c3b1_state() state;
create trigger c3b1_refuse_late_update before update on public.product_variants
  for each row execute function pg_temp.c3b1_refuse_late_update();
select throws_ok('select app.apply_parfums_commercial_import(payload) from c3b1_manifest','40001',
  'commercial variant predecessor changed','affected-row count other than one raises and rolls back');
select is(pg_temp.c3b1_state(),state,'all earlier product and variant reconciliations rolled back') from c3b1_atomic_before;
drop trigger c3b1_refuse_late_update on public.product_variants;

select ok((app.apply_parfums_commercial_import(payload)->>'applied')::boolean,'complete existing catalog safely converges to C2') from c3b1_manifest;
select is((select count(*)::integer from public.products p join public.business_units u on u.id=p.business_unit_id
  where u.code='parfums' and p.slug not in ('c3b1-unowned','staging-qa-c3b1')),100,'final target: 100 products');
select is((select count(*)::integer from public.product_variants v join public.products p on p.id=v.product_id
  join public.business_units u on u.id=p.business_unit_id where u.code='parfums'),324,'final target: 324 variants');
select is((select count(*)::integer from public.inventory),324,'final target: 324 inventory intentions');
select results_eq($$select v.price_verification_status,count(*) from public.product_variants v
  join public.products p on p.id=v.product_id join public.business_units u on u.id=p.business_unit_id
  where u.code='parfums' group by 1 order by 1$$,
  $$values ('legacy'::text,7::bigint),('official_pdf'::text,297::bigint),('provisional_market'::text,20::bigint)$$,
  'final authority counts: 297 official_pdf / 20 provisional_market / 7 legacy');
select is((select count(*)::integer from public.categories),11,'final target: 11 categories');
select is((select count(*)::integer from public.product_categories),195,'final target: 195 relationships');
select is((select count(*)::integer from public.combos),3,'final target: 3 combos');
select is((select count(distinct combo_product_variant_id)::integer from public.combo_items),9,'final target: 9 combo presentations');
select is((select count(*)::integer from public.combo_items),30,'final target: 30 variant-aware items');
select ok(not exists(select 1 from c3b1_before_inventory old full join public.inventory current using(id)
  where old.id is not null and (current.id is null or to_jsonb(old)<>to_jsonb(current))),
  'all predecessor inventory UUIDs and complete persisted rows preserved');
select results_eq($$select p.legacy_id,v.id,v.size_ml from public.product_variants v join public.products p on p.id=v.product_id
  join public.business_units u on u.id=p.business_unit_id where u.code='parfums'
  and p.legacy_id in ('cedrat-boise-int','m-red-tobacco') and v.variant_kind='bottle' order by 1$$,
  $$select p.legacy_id,v.id,120::numeric from c3b1_before_variants v join public.products p on p.id=v.product_id
  where p.legacy_id in ('cedrat-boise-int','m-red-tobacco') and v.variant_kind='bottle' order by 1$$,
  'both 100ml predecessor UUIDs preserved in place as exact 120ml targets');
select ok(to_jsonb(old)=to_jsonb(v),'unresolved bottle complete row unchanged: '||p.legacy_id)
from c3b1_before_variants old join public.product_variants v using(id) join public.products p on p.id=v.product_id
where p.legacy_id in ('1-million-lucky','by-the-fireplace','le-beau-le-parfum','bir-intense') and v.variant_kind='bottle';
select ok(not exists(select 1 from c3b1_sentinels old left join public.products current using(id)
  where current.id is null or to_jsonb(old)<>to_jsonb(current)), 'unowned / QA / Import complete product rows untouched');
select ok(not exists(select 1 from c3b1_import_variants old left join public.product_variants current using(id)
  where current.id is null or to_jsonb(old)<>to_jsonb(current)), 'Import variant and trusted authority untouched');

create temporary table c3b1_second_plan as select app.plan_parfums_commercial_import(payload) plan from c3b1_manifest;
select is((plan->>'conflict_count')::integer,0,'second plan has zero conflicts') from c3b1_second_plan;
select is((plan->>'reconcile_count')::integer,0,'second plan has zero reconciliations') from c3b1_second_plan;
select is((plan->>'insert_count')::integer,0,'second plan has zero inserts') from c3b1_second_plan;
select is((operation->>'unchanged')::integer,expected,'every target entity is exactly UNCHANGED: '||entity)
from c3b1_second_plan,jsonb_each(plan->'operations') op(entity,operation),
  (values('categories',11),('products',100),('variants',324),('inventory',324),('relationships',195),('combos',3),('combo_items',30)) totals(name,expected)
where entity=name;
create temporary table c3b1_noop_before as select pg_temp.c3b1_state() state;
select ok((app.apply_parfums_commercial_import(payload)->>'applied')::boolean,'second apply succeeds idempotently') from c3b1_manifest;
select is(pg_temp.c3b1_state(),state,'second apply performs no material or timestamp mutation') from c3b1_noop_before;

select ok(pg_temp.c3b1_rejected('update public.product_categories set sort_order=1 where product_id=(select id from public.products where legacy_id=''sauvage-edt'')'),
  'unexpected relationship state remains conflict');
select ok(pg_temp.c3b1_rejected('insert into public.product_categories(product_id,category_id)
  select p.id,c.id from public.products p join public.business_units u on u.id=p.business_unit_id
  join public.categories c on c.business_unit_id=u.id where u.code=''parfums'' and p.legacy_id=''sauvage-edt''
  and not exists(select 1 from public.product_categories r where r.product_id=p.id and r.category_id=c.id) limit 1'),
  'unexpected existing relationship remains conflict');
select ok(pg_temp.c3b1_rejected('update public.inventory set inventory_mode=''tracked_quantity'',quantity_on_hand=7
  where product_variant_id=pg_temp.c3b1_variant(''sauvage-edt'',''decant'',10)'), 'ordinary inventory drift remains conflict');
select throws_ok('update public.combo_items set product_variant_id=(select id from c3b1_import_variants limit 1)
  where id=(select id from public.combo_items limit 1)','23514',null,'combo ingredient from wrong BU rejected');
select throws_ok('update public.combo_items set product_variant_id=combo_product_variant_id
  where id=(select id from public.combo_items limit 1)','23514',null,'combo self-reference rejected');
select throws_ok('update public.combo_items set combo_product_variant_id=null
  where id=(select id from public.combo_items limit 1)','23514',
  'combo product variant must belong to the combo product','combo own presentation remains mandatory');
select results_eq($$select c.composition_verification_status,count(*) from public.combos c group by 1$$,
  $$values ('official_pdf'::text,3::bigint)$$,'trusted composition authority remains explicit official_pdf');
select ok(not has_function_privilege('authenticated','app.commercial_variant_predecessor(jsonb,jsonb,jsonb,boolean)','EXECUTE'),
  'reconciliation helper not callable by browser roles');
select ok(not has_function_privilege('service_role','app.apply_parfums_commercial_import(jsonb)','EXECUTE'),
  'apply remains operator-only');
select * from finish();
rollback;
