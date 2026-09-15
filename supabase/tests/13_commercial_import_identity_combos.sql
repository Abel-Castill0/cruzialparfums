-- 4K-C1B: supplemental identity and variant-aware controlled combo import.

begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

create function pg_temp.c1b_product(p_legacy text, p_slug text, p_name text)
returns jsonb language sql as $$
  select jsonb_build_object(
    'legacy_id', to_jsonb(p_legacy), 'migration_status', 'MIGRATABLE_DRAFT',
    'target_product', jsonb_build_object(
      'legacy_id', to_jsonb(p_legacy), 'slug', p_slug, 'name', p_name, 'brand', null,
      'short_description', null, 'description', null, 'gender', null, 'concentration', null,
      'sales_mode', 'always_available', 'production_status', 'active',
      'availability_status', 'available', 'publication_status', 'draft',
      'is_featured', false, 'featured_rank', null, 'featured_from', null,
      'featured_until', null, 'verification_status', 'unknown', 'specs', '{}'::jsonb),
    'variants', jsonb_build_array(
      jsonb_build_object('variant_kind','decant','size_ml',3,'label','3 ml','price_amount',10,
        'currency','PEN','publication_status','draft','price_verification_status','official_pdf','sort_order',0),
      jsonb_build_object('variant_kind','decant','size_ml',5,'label','5 ml','price_amount',20,
        'currency','PEN','publication_status','draft','price_verification_status','official_pdf','sort_order',1)),
    'categories', '[]'::jsonb,
    'inventory_intent', jsonb_build_object('inventory_mode','status_only','quantity_on_hand',null,'availability_status','available'))
$$;

create temporary table c1b_manifest(payload jsonb not null);
insert into c1b_manifest values (jsonb_build_object(
  'metadata',jsonb_build_object('business_unit_code','parfums'),
  'conflicts','[]'::jsonb,'category_targets','[]'::jsonb,
  'products',jsonb_build_array(
    pg_temp.c1b_product('c1b-combo','c1b-combo','C1B Combo'),
    pg_temp.c1b_product('c1b-ingredient','c1b-ingredient','C1B Ingredient'),
    pg_temp.c1b_product(null,'c1b-supplemental','C1B Supplemental')),
  'combo_targets',jsonb_build_array(jsonb_build_object(
    'product',jsonb_build_object('legacy_id','c1b-combo','slug','c1b-combo'),
    'composition_verification_status','official_pdf',
    'presentations',jsonb_build_array(
      jsonb_build_object('variant',jsonb_build_object('variant_kind','decant','size_ml',3),'items',jsonb_build_array(
        jsonb_build_object('product',jsonb_build_object('legacy_id','c1b-ingredient','slug','c1b-ingredient'),'variant',jsonb_build_object('variant_kind','decant','size_ml',3),'quantity',1,'sort_order',0),
        jsonb_build_object('product',jsonb_build_object('legacy_id',null,'slug','c1b-supplemental'),'variant',jsonb_build_object('variant_kind','decant','size_ml',3),'quantity',1,'sort_order',1))),
      jsonb_build_object('variant',jsonb_build_object('variant_kind','decant','size_ml',5),'items',jsonb_build_array(
        jsonb_build_object('product',jsonb_build_object('legacy_id','c1b-ingredient','slug','c1b-ingredient'),'variant',jsonb_build_object('variant_kind','decant','size_ml',5),'quantity',2,'sort_order',0),
        jsonb_build_object('product',jsonb_build_object('legacy_id',null,'slug','c1b-supplemental'),'variant',jsonb_build_object('variant_kind','decant','size_ml',5),'quantity',1,'sort_order',1))))))));

insert into public.products(business_unit_id,legacy_id,slug,name,publication_status,verification_status)
select id,'c1b-unrelated','c1b-unrelated','C1B Unrelated','draft','unknown' from public.business_units where code='parfums';

select is((app.plan_parfums_commercial_import(payload)->>'conflict_count')::integer,0,'fresh legacy and supplemental identities plan safely') from c1b_manifest;
select is((app.plan_parfums_commercial_import(payload)#>>'{operations,products,insert}')::integer,3,'legacy products resolve through legacy_id and supplemental through slug') from c1b_manifest;
select is((app.plan_parfums_commercial_import(payload)#>>'{operations,combos,insert}')::integer,1,'combo row is planned') from c1b_manifest;
select is((app.plan_parfums_commercial_import(payload)#>>'{operations,combo_items,insert}')::integer,4,'presentation-aware combo items are planned') from c1b_manifest;
select is(app.plan_parfums_commercial_import(payload)::text,app.plan_parfums_commercial_import(payload)::text,'plan output is deterministic') from c1b_manifest;
select ok((app.apply_parfums_commercial_import(payload)->>'applied')::boolean,'trusted operator apply succeeds') from c1b_manifest;
select results_eq(
  $$select legacy_id from public.products where slug='c1b-supplemental'$$,
  $$values (null::text)$$,'supplemental identity remains legacy_id null');
select is((select composition_verification_status from public.combos c join public.products p on p.id=c.product_id where p.legacy_id='c1b-combo'),'official_pdf','explicit trusted source authority remains official_pdf');
select results_eq(
  $$select cpv.size_ml,ipv.size_ml,ci.quantity,ci.sort_order from public.combo_items ci join public.combos c on c.id=ci.combo_id join public.products p on p.id=c.product_id join public.product_variants cpv on cpv.id=ci.combo_product_variant_id join public.product_variants ipv on ipv.id=ci.product_variant_id where p.legacy_id='c1b-combo' order by cpv.size_ml,ci.sort_order$$,
  $$values (3::numeric,3::numeric,1,0),(3::numeric,3::numeric,1,1),(5::numeric,5::numeric,2,0),(5::numeric,5::numeric,1,1)$$,
  'combo presentation and ingredient IDs resolve to exact canonical variants');
select is((app.plan_parfums_commercial_import(payload)#>>'{operations,combo_items,unchanged}')::integer,4,'second plan is combo-item no-op') from c1b_manifest;
select ok((app.apply_parfums_commercial_import(payload)->>'applied')::boolean,'repeated apply is idempotent') from c1b_manifest;
select is((select count(*)::integer from public.products where legacy_id='c1b-unrelated'),1,'unrelated catalog product is not deleted or rewritten');

select ok(exists(select 1 from jsonb_array_elements(app.plan_parfums_commercial_import(
  jsonb_build_object('metadata',jsonb_build_object('business_unit_code','parfums'),'conflicts','[]'::jsonb,'category_targets','[]'::jsonb,
    'products',jsonb_build_array(pg_temp.c1b_product('c1b-missing','c1b-ingredient','Wrong fallback'))))->'conflicts') x
  where x->>'code'='LEGACY_ID_NOT_FOUND_SLUG_OWNED'),'legacy identity never falls back to an occupied slug');

select ok(exists(select 1 from jsonb_array_elements(app.plan_parfums_commercial_import(
  jsonb_build_object('metadata',jsonb_build_object('business_unit_code','parfums'),'conflicts','[]'::jsonb,'category_targets','[]'::jsonb,
    'products',jsonb_build_array(pg_temp.c1b_product(null,'c1b-ingredient','Collision'))))->'conflicts') x
  where x->>'code'='SUPPLEMENTAL_SLUG_OWNED_BY_LEGACY'),'supplemental slug collision with legacy-backed product fails');

select ok(exists(select 1 from jsonb_array_elements((app.plan_parfums_commercial_import(jsonb_set(
  (select payload from c1b_manifest),'{products,0,target_product,slug}','"c1b-ingredient"')))->'conflicts') x
  where x->>'code'='LEGACY_ID_SLUG_CROSS_IDENTITY'),'legacy_id and slug cross-identity conflict fails');

insert into public.product_variants(product_id,variant_kind,size_ml,label,price_amount,publication_status,price_verification_status)
select id,'decant',3,'Three ml duplicate',10,'draft','official_pdf' from public.products where legacy_id='c1b-ingredient';
select ok(exists(select 1 from jsonb_array_elements(app.plan_parfums_commercial_import(payload)->'conflicts') x
  where x->>'code'='VARIANT_IDENTITY_AMBIGUOUS'),'database variant ambiguity fails') from c1b_manifest;
delete from public.product_variants where label='Three ml duplicate';

select ok(exists(select 1 from jsonb_array_elements((app.plan_parfums_commercial_import(jsonb_set(
  (select payload from c1b_manifest),'{combo_targets,0,presentations,0,items,0,variant,size_ml}','10')))->'conflicts') x
  where x->>'code'='MISSING_INGREDIENT_VARIANT'),'missing ingredient variant reference fails');
select ok(exists(select 1 from jsonb_array_elements((app.plan_parfums_commercial_import(jsonb_set(
  (select payload from c1b_manifest),'{combo_targets,0,presentations,0,variant,size_ml}','10')))->'conflicts') x
  where x->>'code'='MISSING_COMBO_PRESENTATION_VARIANT'),'missing combo presentation variant fails');
select ok(exists(select 1 from jsonb_array_elements((app.plan_parfums_commercial_import(jsonb_insert(
  (select payload from c1b_manifest),'{combo_targets,0,presentations,0,items,2}',
  (select payload #> '{combo_targets,0,presentations,0,items,0}' from c1b_manifest))))->'conflicts') x
  where x->>'code'='DUPLICATE_PRESENTATION_INGREDIENT'),'duplicate presentation and ingredient line fails');
select ok(exists(select 1 from jsonb_array_elements((app.plan_parfums_commercial_import(jsonb_set(
  (select payload from c1b_manifest),'{combo_targets,0,presentations,0,items,1,sort_order}','0')))->'conflicts') x
  where x->>'code'='DUPLICATE_PRESENTATION_SORT_ORDER'),'duplicate presentation-local sort order fails');
select ok(exists(select 1 from jsonb_array_elements((app.plan_parfums_commercial_import(jsonb_set(
  (select payload from c1b_manifest),'{combo_targets,0,presentations,0,items,0,product}',
  '{"legacy_id":"c1b-combo","slug":"c1b-combo"}'::jsonb)))->'conflicts') x
  where x->>'code'='COMBO_SELF_REFERENCE'),'combo self-reference fails during plan rather than apply');

select ok(exists(select 1 from jsonb_array_elements((app.plan_parfums_commercial_import(jsonb_set(
  (select payload from c1b_manifest),'{combo_targets,0,presentations,0,items,0,product}',
  '{"legacy_id":"c1b-import-only","slug":"c1b-import-only"}'::jsonb)))->'conflicts') x
  where x->>'code'='MISSING_INGREDIENT_PRODUCT_REFERENCE'),'cross-unit or out-of-scope ingredient reference is rejected before apply');
select ok(exists(select 1 from jsonb_array_elements((app.plan_parfums_commercial_import(jsonb_set(
  (select payload from c1b_manifest),'{combo_targets,0,presentations,0,items,0,product,slug}','"wrong-slug"')))->'conflicts') x
  where x->>'code'='INGREDIENT_REFERENCE_SLUG_MISMATCH'),'variant-aware combo references also enforce legacy_id and slug consistency');

update public.combo_items set quantity=9 where id=(select ci.id from public.combo_items ci join public.combos c on c.id=ci.combo_id join public.products p on p.id=c.product_id where p.legacy_id='c1b-combo' limit 1);
select ok(exists(select 1 from jsonb_array_elements(app.plan_parfums_commercial_import(payload)->'conflicts') x
  where x->>'code'='COMBO_ITEM_STATE_MISMATCH'),'verify plan detects materialized/source mismatch') from c1b_manifest;
update public.combo_items set quantity=case when sort_order=0 and product_variant_id in (select id from public.product_variants where product_id=(select id from public.products where legacy_id='c1b-ingredient') and size_ml=5) then 2 else 1 end
where combo_id=(select c.id from public.combos c join public.products p on p.id=c.product_id where p.legacy_id='c1b-combo');

insert into c1b_manifest select jsonb_set(jsonb_set(payload,'{products}',(payload->'products')||jsonb_build_array(pg_temp.c1b_product('c1b-unverified-combo','c1b-unverified-combo','Unverified Combo'))),
  '{combo_targets}',jsonb_build_array(jsonb_build_object('product',jsonb_build_object('legacy_id','c1b-unverified-combo','slug','c1b-unverified-combo'),'presentations','[]'::jsonb))) from c1b_manifest limit 1;
select ok((app.apply_parfums_commercial_import(payload)->>'applied')::boolean,'source without official_pdf authority can apply conservatively')
from c1b_manifest where payload #>> '{combo_targets,0,product,legacy_id}'='c1b-unverified-combo';
select is((select composition_verification_status from public.combos c join public.products p on p.id=c.product_id where p.legacy_id='c1b-unverified-combo'),'pending_reconfirmation','missing source authority cannot become official_pdf');

select ok(exists(select 1 from jsonb_array_elements((app.plan_parfums_commercial_import(jsonb_set(
  (select payload from c1b_manifest limit 1),'{products,1,variants,2}',
  (select payload #> '{products,1,variants,0}' from c1b_manifest limit 1))))->'conflicts') x
  where x->>'code'='DUPLICATE_OR_INVALID_VARIANT_IDENTITY'),'duplicate canonical source variant identity fails');

select is((app.plan_parfums_commercial_import(payload)->>'conflict_count')::integer,0,'restored materialized state verifies exactly') from c1b_manifest limit 1;
select is((select count(*)::integer from public.combo_items ci join public.combos c on c.id=ci.combo_id join public.products p on p.id=c.product_id where p.legacy_id='c1b-combo'),4,'same ingredient product participates through distinct 3 ml and 5 ml variants');

select * from finish();
rollback;
