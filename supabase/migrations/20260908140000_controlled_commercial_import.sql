-- Cruzial Platform V2 — controlled commercial import boundary (Phase 4H1B1)
--
-- This operator-only function consumes the reviewed reconciliation manifest.
-- It is deliberately INSERT-or-verify: matching rows are unchanged, differing
-- rows are conflicts, and no UPDATE/DELETE/UPSERT path exists. The function is
-- in the non-exposed app schema and executable only by postgres.

create or replace function app.plan_parfums_commercial_import(p_manifest jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_unit_id uuid;
  v_category_json jsonb;
  v_product_json jsonb;
  v_variant_json jsonb;
  v_relationship_json jsonb;
  v_expected jsonb;
  v_actual jsonb;
  v_category public.categories%rowtype;
  v_product public.products%rowtype;
  v_variant public.product_variants%rowtype;
  v_inventory public.inventory%rowtype;
  v_relationship public.product_categories%rowtype;
  v_collision_id uuid;
  v_product_usable boolean;
  v_category_usable boolean;
  v_variant_usable boolean;
  v_conflicts jsonb := '[]'::jsonb;
  v_categories_insert integer := 0;
  v_categories_unchanged integer := 0;
  v_categories_conflict integer := 0;
  v_products_insert integer := 0;
  v_products_unchanged integer := 0;
  v_products_conflict integer := 0;
  v_variants_insert integer := 0;
  v_variants_unchanged integer := 0;
  v_variants_conflict integer := 0;
  v_relationships_insert integer := 0;
  v_relationships_unchanged integer := 0;
  v_relationships_conflict integer := 0;
  v_inventory_insert integer := 0;
  v_inventory_unchanged integer := 0;
  v_inventory_conflict integer := 0;
begin
  if p_manifest is null
     or jsonb_typeof(p_manifest) <> 'object'
     or p_manifest #>> '{metadata,business_unit_code}' <> 'parfums'
  then
    raise exception 'commercial import requires a Parfums reconciliation manifest'
      using errcode = '22023';
  end if;

  select id into strict v_business_unit_id
  from public.business_units
  where code = 'parfums';

  if jsonb_array_length(coalesce(p_manifest->'conflicts', '[]'::jsonb)) > 0 then
    v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
      'entity', 'manifest',
      'code', 'MANIFEST_CONFLICTS_PRESENT',
      'identity', 'supabase/staging/commercial-reconciliation.json'
    ));
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_manifest->'products', '[]'::jsonb)) item
    group by item->>'legacy_id'
    having count(*) > 1
  ) then
    v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
      'entity', 'manifest', 'code', 'DUPLICATE_MANIFEST_LEGACY_ID', 'identity', 'products'
    ));
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_manifest->'category_targets', '[]'::jsonb)) item
    group by item->>'slug'
    having count(*) > 1
  ) then
    v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
      'entity', 'manifest', 'code', 'DUPLICATE_MANIFEST_CATEGORY_SLUG', 'identity', 'category_targets'
    ));
  end if;

  for v_category_json in
    select value
    from jsonb_array_elements(coalesce(p_manifest->'category_targets', '[]'::jsonb))
    order by value->>'slug'
  loop
    v_expected := jsonb_build_object(
      'parent_id', null,
      'kind', v_category_json->>'kind',
      'slug', v_category_json->>'slug',
      'name', v_category_json->>'name',
      'description', v_category_json->'description',
      'spec_schema', coalesce(v_category_json->'spec_schema', '{}'::jsonb),
      'publication_status', v_category_json->>'publication_status',
      'sort_order', (v_category_json->>'sort_order')::integer,
      'archived_at', null
    );

    v_category := null;
    select * into v_category
    from public.categories
    where business_unit_id = v_business_unit_id
      and slug = v_category_json->>'slug';

    if v_category.id is null then
      v_categories_insert := v_categories_insert + 1;
    else
      v_actual := to_jsonb(v_category) - array['id', 'business_unit_id', 'created_at', 'updated_at'];
      if v_actual = v_expected then
        v_categories_unchanged := v_categories_unchanged + 1;
      else
        v_categories_conflict := v_categories_conflict + 1;
        v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
          'entity', 'category', 'code', 'CATEGORY_STATE_MISMATCH',
          'identity', v_category_json->>'slug', 'expected', v_expected, 'actual', v_actual
        ));
      end if;
    end if;
  end loop;

  for v_product_json in
    select value
    from jsonb_array_elements(coalesce(p_manifest->'products', '[]'::jsonb))
    order by value->>'legacy_id'
  loop
    if v_product_json->>'migration_status' not in ('MIGRATABLE_DRAFT', 'MIGRATABLE_WITH_VERIFIED_FIELDS') then
      v_products_conflict := v_products_conflict + 1;
      v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
        'entity', 'product', 'code', 'PRODUCT_NOT_MIGRATABLE',
        'identity', v_product_json->>'legacy_id'
      ));
      continue;
    end if;

    v_expected := (v_product_json->'target_product') || jsonb_build_object('archived_at', null);
    v_product := null;
    select * into v_product
    from public.products
    where business_unit_id = v_business_unit_id
      and legacy_id = v_product_json->>'legacy_id';
    v_product_usable := true;

    if v_product.id is null then
      v_collision_id := null;
      select id into v_collision_id
      from public.products
      where business_unit_id = v_business_unit_id
        and slug = v_product_json #>> '{target_product,slug}';
      if v_collision_id is null then
        v_products_insert := v_products_insert + 1;
      else
        v_product_usable := false;
        v_products_conflict := v_products_conflict + 1;
        v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
          'entity', 'product', 'code', 'PRODUCT_SLUG_COLLISION',
          'identity', v_product_json->>'legacy_id'
        ));
      end if;
    else
      v_actual := to_jsonb(v_product) - array['id', 'business_unit_id', 'created_at', 'updated_at'];
      if v_actual = v_expected then
        v_products_unchanged := v_products_unchanged + 1;
      else
        v_product_usable := false;
        v_products_conflict := v_products_conflict + 1;
        v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
          'entity', 'product', 'code', 'PRODUCT_STATE_MISMATCH',
          'identity', v_product_json->>'legacy_id', 'expected', v_expected, 'actual', v_actual
        ));
      end if;
    end if;

    for v_variant_json in
      select value
      from jsonb_array_elements(coalesce(v_product_json->'variants', '[]'::jsonb))
      order by (value->>'sort_order')::integer, value->>'label'
    loop
      if not v_product_usable then
        v_variants_conflict := v_variants_conflict + 1;
        v_inventory_conflict := v_inventory_conflict + 1;
        continue;
      end if;

      v_expected := jsonb_build_object(
        'sku', null,
        'variant_kind', v_variant_json->>'variant_kind',
        'size_ml', case when v_variant_json->'size_ml' = 'null'::jsonb then null else to_jsonb((v_variant_json->>'size_ml')::numeric) end,
        'label', v_variant_json->>'label',
        'option_values', '{}'::jsonb,
        'price_amount', to_jsonb((v_variant_json->>'price_amount')::numeric),
        'currency', v_variant_json->>'currency',
        'publication_status', v_variant_json->>'publication_status',
        'sort_order', (v_variant_json->>'sort_order')::integer,
        'price_verification_status', v_variant_json->>'price_verification_status',
        'archived_at', null
      );

      v_variant := null;
      if v_product.id is not null then
        select * into v_variant
        from public.product_variants
        where product_id = v_product.id
          and label = v_variant_json->>'label';
      end if;
      v_variant_usable := true;

      if v_variant.id is null then
        v_variants_insert := v_variants_insert + 1;
      else
        v_actual := to_jsonb(v_variant) - array['id', 'product_id', 'created_at', 'updated_at'];
        if v_actual = v_expected then
          v_variants_unchanged := v_variants_unchanged + 1;
        else
          v_variant_usable := false;
          v_variants_conflict := v_variants_conflict + 1;
          v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
            'entity', 'variant', 'code', 'VARIANT_STATE_MISMATCH',
            'identity', (v_product_json->>'legacy_id') || ':' || (v_variant_json->>'label'),
            'expected', v_expected, 'actual', v_actual
          ));
        end if;
      end if;

      if not v_variant_usable then
        v_inventory_conflict := v_inventory_conflict + 1;
      elsif v_variant.id is null then
        v_inventory_insert := v_inventory_insert + 1;
      else
        v_inventory := null;
        select * into v_inventory
        from public.inventory
        where product_variant_id = v_variant.id;
        v_expected := jsonb_build_object(
          'inventory_mode', v_product_json #>> '{inventory_intent,inventory_mode}',
          'quantity_on_hand', v_product_json #> '{inventory_intent,quantity_on_hand}',
          'availability_status', v_product_json #>> '{inventory_intent,availability_status}',
          'updated_by', null
        );
        if v_inventory.id is null then
          v_inventory_insert := v_inventory_insert + 1;
        else
          v_actual := to_jsonb(v_inventory) - array['id', 'product_variant_id', 'created_at', 'updated_at'];
          if v_actual = v_expected then
            v_inventory_unchanged := v_inventory_unchanged + 1;
          else
            v_inventory_conflict := v_inventory_conflict + 1;
            v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
              'entity', 'inventory', 'code', 'INVENTORY_STATE_MISMATCH',
              'identity', (v_product_json->>'legacy_id') || ':' || (v_variant_json->>'label'),
              'expected', v_expected, 'actual', v_actual
            ));
          end if;
        end if;
      end if;
    end loop;

    if v_product.id is not null and v_product_usable then
      for v_variant in
        select variant.*
        from public.product_variants variant
        where variant.product_id = v_product.id
          and not exists (
            select 1
            from jsonb_array_elements(coalesce(v_product_json->'variants', '[]'::jsonb)) expected
            where expected->>'label' = variant.label
          )
      loop
        v_variants_conflict := v_variants_conflict + 1;
        v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
          'entity', 'variant', 'code', 'UNEXPECTED_EXISTING_VARIANT',
          'identity', (v_product_json->>'legacy_id') || ':' || v_variant.label
        ));
      end loop;
    end if;

    for v_relationship_json in
      select value
      from jsonb_array_elements(coalesce(v_product_json->'categories', '[]'::jsonb))
      order by value->>'kind', value->>'target_slug'
    loop
      if not v_product_usable then
        v_relationships_conflict := v_relationships_conflict + 1;
        continue;
      end if;

      v_category := null;
      select * into v_category
      from public.categories
      where business_unit_id = v_business_unit_id
        and slug = v_relationship_json->>'target_slug';
      v_category_usable := true;
      if v_category.id is not null then
        select value into v_category_json
        from jsonb_array_elements(coalesce(p_manifest->'category_targets', '[]'::jsonb))
        where value->>'slug' = v_relationship_json->>'target_slug';
        v_expected := jsonb_build_object(
          'parent_id', null,
          'kind', v_category_json->>'kind',
          'slug', v_category_json->>'slug',
          'name', v_category_json->>'name',
          'description', v_category_json->'description',
          'spec_schema', coalesce(v_category_json->'spec_schema', '{}'::jsonb),
          'publication_status', v_category_json->>'publication_status',
          'sort_order', (v_category_json->>'sort_order')::integer,
          'archived_at', null
        );
        v_actual := to_jsonb(v_category) - array['id', 'business_unit_id', 'created_at', 'updated_at'];
        v_category_usable := v_actual = v_expected;
      end if;

      if not v_category_usable then
        v_relationships_conflict := v_relationships_conflict + 1;
      elsif v_product.id is null or v_category.id is null then
        v_relationships_insert := v_relationships_insert + 1;
      else
        v_relationship := null;
        select * into v_relationship
        from public.product_categories
        where product_id = v_product.id
          and category_id = v_category.id;
        if v_relationship.product_id is null then
          v_relationships_insert := v_relationships_insert + 1;
        elsif v_relationship.sort_order = 0 then
          v_relationships_unchanged := v_relationships_unchanged + 1;
        else
          v_relationships_conflict := v_relationships_conflict + 1;
          v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
            'entity', 'relationship', 'code', 'RELATIONSHIP_STATE_MISMATCH',
            'identity', (v_product_json->>'legacy_id') || ':' || (v_relationship_json->>'target_slug')
          ));
        end if;
      end if;
    end loop;

    if v_product.id is not null and v_product_usable then
      for v_relationship in
        select relationship.*
        from public.product_categories relationship
        join public.categories category on category.id = relationship.category_id
        where relationship.product_id = v_product.id
          and not exists (
            select 1
            from jsonb_array_elements(coalesce(v_product_json->'categories', '[]'::jsonb)) expected
            where expected->>'target_slug' = category.slug
              and expected->>'kind' = category.kind
          )
      loop
        v_relationships_conflict := v_relationships_conflict + 1;
        v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
          'entity', 'relationship', 'code', 'UNEXPECTED_EXISTING_RELATIONSHIP',
          'identity', v_product_json->>'legacy_id'
        ));
      end loop;
    end if;
  end loop;

  return jsonb_build_object(
    'mode', 'dry_run',
    'applied', false,
    'refused', false,
    'operations', jsonb_build_object(
      'categories', jsonb_build_object('insert', v_categories_insert, 'unchanged', v_categories_unchanged, 'conflict', v_categories_conflict),
      'products', jsonb_build_object('insert', v_products_insert, 'unchanged', v_products_unchanged, 'conflict', v_products_conflict),
      'variants', jsonb_build_object('insert', v_variants_insert, 'unchanged', v_variants_unchanged, 'conflict', v_variants_conflict),
      'relationships', jsonb_build_object('insert', v_relationships_insert, 'unchanged', v_relationships_unchanged, 'conflict', v_relationships_conflict),
      'inventory', jsonb_build_object('insert', v_inventory_insert, 'unchanged', v_inventory_unchanged, 'conflict', v_inventory_conflict)
    ),
    'conflict_count', jsonb_array_length(v_conflicts),
    'conflicts', v_conflicts
  );
end;
$$;

create or replace function app.apply_parfums_commercial_import(p_manifest jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan jsonb;
  v_business_unit_id uuid;
  v_category_json jsonb;
  v_product_json jsonb;
  v_variant_json jsonb;
  v_relationship_json jsonb;
  v_product_id uuid;
  v_category_id uuid;
  v_variant_id uuid;
begin
  -- Serialize the plan/apply boundary against concurrent catalog writes. The
  -- lock is held only for this transaction and dry-run never takes it.
  lock table public.categories, public.products, public.product_variants,
    public.product_categories, public.inventory in share row exclusive mode;

  v_plan := app.plan_parfums_commercial_import(p_manifest);
  if (v_plan->>'conflict_count')::integer > 0 then
    return v_plan || jsonb_build_object('mode', 'apply', 'refused', true);
  end if;

  select id into strict v_business_unit_id
  from public.business_units
  where code = 'parfums';

  for v_category_json in
    select value from jsonb_array_elements(p_manifest->'category_targets') order by value->>'slug'
  loop
    if not exists (
      select 1 from public.categories
      where business_unit_id = v_business_unit_id and slug = v_category_json->>'slug'
    ) then
      insert into public.categories (
        business_unit_id, parent_id, kind, slug, name, description,
        spec_schema, publication_status, sort_order
      ) values (
        v_business_unit_id, null, v_category_json->>'kind', v_category_json->>'slug',
        v_category_json->>'name', v_category_json->>'description',
        coalesce(v_category_json->'spec_schema', '{}'::jsonb),
        v_category_json->>'publication_status', (v_category_json->>'sort_order')::integer
      );
    end if;
  end loop;

  for v_product_json in
    select value from jsonb_array_elements(p_manifest->'products') order by value->>'legacy_id'
  loop
    if not exists (
      select 1 from public.products
      where business_unit_id = v_business_unit_id and legacy_id = v_product_json->>'legacy_id'
    ) then
      insert into public.products (
        business_unit_id, legacy_id, slug, name, brand, short_description,
        description, gender, concentration, sales_mode, production_status,
        availability_status, publication_status, is_featured, featured_rank,
        featured_from, featured_until, verification_status, specs
      ) values (
        v_business_unit_id,
        v_product_json #>> '{target_product,legacy_id}',
        v_product_json #>> '{target_product,slug}',
        v_product_json #>> '{target_product,name}',
        v_product_json #>> '{target_product,brand}',
        v_product_json #>> '{target_product,short_description}',
        v_product_json #>> '{target_product,description}',
        v_product_json #>> '{target_product,gender}',
        v_product_json #>> '{target_product,concentration}',
        v_product_json #>> '{target_product,sales_mode}',
        v_product_json #>> '{target_product,production_status}',
        v_product_json #>> '{target_product,availability_status}',
        v_product_json #>> '{target_product,publication_status}',
        (v_product_json #>> '{target_product,is_featured}')::boolean,
        (v_product_json #>> '{target_product,featured_rank}')::integer,
        (v_product_json #>> '{target_product,featured_from}')::timestamptz,
        (v_product_json #>> '{target_product,featured_until}')::timestamptz,
        v_product_json #>> '{target_product,verification_status}',
        v_product_json #> '{target_product,specs}'
      );
    end if;

    select id into strict v_product_id
    from public.products
    where business_unit_id = v_business_unit_id
      and legacy_id = v_product_json->>'legacy_id';

    for v_variant_json in
      select value from jsonb_array_elements(v_product_json->'variants')
      order by (value->>'sort_order')::integer, value->>'label'
    loop
      if not exists (
        select 1 from public.product_variants
        where product_id = v_product_id and label = v_variant_json->>'label'
      ) then
        insert into public.product_variants (
          product_id, sku, variant_kind, size_ml, label, option_values,
          price_amount, currency, publication_status, sort_order,
          price_verification_status
        ) values (
          v_product_id, null, v_variant_json->>'variant_kind',
          (v_variant_json->>'size_ml')::numeric, v_variant_json->>'label',
          '{}'::jsonb, (v_variant_json->>'price_amount')::numeric,
          (v_variant_json->>'currency')::char(3),
          v_variant_json->>'publication_status',
          (v_variant_json->>'sort_order')::integer,
          v_variant_json->>'price_verification_status'
        );
      end if;
    end loop;

    for v_relationship_json in
      select value from jsonb_array_elements(v_product_json->'categories')
      order by value->>'kind', value->>'target_slug'
    loop
      select id into strict v_category_id
      from public.categories
      where business_unit_id = v_business_unit_id
        and slug = v_relationship_json->>'target_slug';
      if not exists (
        select 1 from public.product_categories
        where product_id = v_product_id and category_id = v_category_id
      ) then
        insert into public.product_categories (product_id, category_id, sort_order)
        values (v_product_id, v_category_id, 0);
      end if;
    end loop;

    for v_variant_json in
      select value from jsonb_array_elements(v_product_json->'variants')
      order by (value->>'sort_order')::integer, value->>'label'
    loop
      select id into strict v_variant_id
      from public.product_variants
      where product_id = v_product_id and label = v_variant_json->>'label';
      if not exists (
        select 1 from public.inventory where product_variant_id = v_variant_id
      ) then
        insert into public.inventory (
          product_variant_id, inventory_mode, quantity_on_hand, availability_status, updated_by
        ) values (
          v_variant_id,
          v_product_json #>> '{inventory_intent,inventory_mode}',
          (v_product_json #>> '{inventory_intent,quantity_on_hand}')::integer,
          v_product_json #>> '{inventory_intent,availability_status}',
          null
        );
      end if;
    end loop;
  end loop;

  return v_plan || jsonb_build_object('mode', 'apply', 'applied', true, 'refused', false);
end;
$$;

revoke all on function app.plan_parfums_commercial_import(jsonb) from public, anon, authenticated, service_role;
revoke all on function app.apply_parfums_commercial_import(jsonb) from public, anon, authenticated, service_role;
grant execute on function app.plan_parfums_commercial_import(jsonb) to postgres;
grant execute on function app.apply_parfums_commercial_import(jsonb) to postgres;
