-- Cruzial Platform V2 — 4J5E: Global SQLSTATE 40001 / error-contract audit.
-- Additive only. Re-defines the remaining Parfums admin RPCs that still
-- raised Postgres's reserved serialization_failure class ('40001') on their
-- own optimistic-concurrency stale-write branch, to raise this codebase's
-- application-conflict code ('P2011') instead — same correction 4J4C applied
-- to the Import campaign RPCs (20260910020000) and 4J5D applied to the Media
-- RPCs (20260912020000).
--
-- Audit method: every application-authored `raise exception ... using
-- errcode = '40001'` in supabase/migrations and supabase/tests was
-- inventoried, then for each one the LATEST `create or replace function`
-- definition of that function name (migrations are append-only; a function
-- body is whatever its most recent redefinition says, regardless of which
-- file first introduced the name) was checked. Two classes turned up:
--
--   1. Already corrected and no longer live — admin_update_campaign,
--      admin_set_campaign_status, admin_archive_campaign,
--      admin_set_campaign_products (final def: 20260910020000) and all six
--      admin_*_media functions (final def: 20260912020000) already raise
--      P2011. Earlier '40001' raises for these same function names, in
--      20260909000000/010000/020000/030000/050000/060000 and
--      20260908120000, are dead migration history, superseded by
--      `create or replace function`, not live code. Left untouched (nothing
--      to correct; rewriting an applied migration is forbidden regardless).
--
--   2. Still live and still misusing '40001' — sixteen functions across
--      Parfums Products, Categories, Combos, Wholesale, and Settings admin,
--      corrected below:
--        admin_update_product, admin_restore_product, admin_update_variant,
--        admin_restore_variant, admin_update_inventory (products domain);
--        admin_update_category, admin_archive_category,
--        admin_restore_category (categories domain — 2 raise sites each: an
--        early explicit staleness check plus a post-UPDATE zero-rows guard);
--        admin_update_combo_verification, admin_archive_combo,
--        admin_restore_combo, admin_set_combo_composition,
--        admin_archive_variant, admin_archive_product (combos domain — the
--        live admin_archive_variant/admin_archive_product bodies are the
--        ones redefined here in 20260908040000, not the dead ones from
--        20260908000435); admin_update_wholesale_policy (wholesale domain);
--        admin_update_public_contact_setting (settings domain).
--
-- Classification: every one of these raises is an application-level
-- optimistic-concurrency guard — `UPDATE ... WHERE updated_at =
-- p_expected_updated_at` returning zero rows because another session wrote
-- first — never a genuine Postgres-detected SERIALIZABLE transaction
-- conflict. Postgres itself never raises 40001 from a `RAISE ... USING
-- ERRCODE` in PL/pgSQL; that SQLSTATE is reserved for the engine's own
-- serialization_failure detection under SERIALIZABLE isolation, which none
-- of these functions use (all are default READ COMMITTED). So there is no
-- genuine database-generated 40001 anywhere in this codebase to preserve —
-- every occurrence found was a misuse of the reserved class for a stale-
-- write domain conflict, and all are corrected the same way. '40001' is
-- also why these RPCs hang ~60s and surface a raw 504 on local Supabase
-- CLI's Kong/PostgREST gateway instead of a fast, normal application error
-- (see 20260910020000 for the isolated repro); 'P2011' does not trigger
-- that transport-layer retry behavior.
--
-- Caller impact: none. `mapPostgrestError()` in
-- apps/web/src/domains/admin-parfums/products-repository.ts already maps
-- both '40001' and 'P2011' to `{ type: "conflict" }`, and every other
-- admin-parfums repository (categories/combos/wholesale/settings) delegates
-- its default case to that same function — so this change is transparent to
-- every caller without any TypeScript edit.
--
-- No other behavior changes: signatures, business-unit scoping, auth
-- checks, SECURITY DEFINER/INVOKER posture, search_path, archived/combo-
-- reference guards, validation, audit writes, and return shapes are all
-- preserved exactly as in the currently-applied definitions — only the
-- SQLSTATE literal on the stale-write branch(es) of each function changes.

create or replace function public.admin_update_product(
  p_product_id uuid,
  p_expected_updated_at timestamptz,
  p_slug text,
  p_name text,
  p_brand text,
  p_short_description text,
  p_description text,
  p_gender text,
  p_concentration text,
  p_sales_mode text,
  p_production_status text,
  p_publication_status text,
  p_is_featured boolean,
  p_featured_rank integer,
  p_featured_from timestamptz,
  p_featured_until timestamptz
)
returns public.products
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_before public.products;
  v_after public.products;
begin
  select * into v_before from public.products where id = p_product_id;
  if v_before.id is null then
    -- Not found and "found but not yours" look identical on purpose: RLS
    -- already hid a cross-unit row before we get here, and this branch does
    -- not distinguish the two, so it never confirms a foreign row exists.
    raise exception 'product not found' using errcode = 'P0002';
  end if;

  perform app.assert_admin_for(v_before.business_unit_id);

  update public.products set
    slug = p_slug,
    name = p_name,
    brand = p_brand,
    short_description = p_short_description,
    description = p_description,
    gender = p_gender,
    concentration = p_concentration,
    sales_mode = p_sales_mode,
    production_status = p_production_status,
    publication_status = p_publication_status,
    is_featured = p_is_featured,
    featured_rank = p_featured_rank,
    featured_from = p_featured_from,
    featured_until = p_featured_until
  where id = p_product_id
    and updated_at = p_expected_updated_at
  returning * into v_after;

  if v_after.id is null then
    raise exception 'product was modified by another session' using errcode = 'P2011';
  end if;

  perform app.write_audit_log(v_before.business_unit_id, 'update', 'product', p_product_id, to_jsonb(v_before), to_jsonb(v_after));

  return v_after;
end;
$$;

revoke all on function public.admin_update_product(
  uuid, timestamptz, text, text, text, text, text, text, text, text, text, text, boolean, integer, timestamptz, timestamptz
) from public;
grant execute on function public.admin_update_product(
  uuid, timestamptz, text, text, text, text, text, text, text, text, text, text, boolean, integer, timestamptz, timestamptz
) to authenticated;

create or replace function public.admin_restore_product(
  p_product_id uuid,
  p_expected_updated_at timestamptz
)
returns public.products
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_before public.products;
  v_after public.products;
begin
  select * into v_before from public.products where id = p_product_id;
  if v_before.id is null then
    raise exception 'product not found' using errcode = 'P0002';
  end if;

  perform app.assert_admin_for(v_before.business_unit_id);

  update public.products
  set archived_at = null, publication_status = 'draft'
  where id = p_product_id
    and updated_at = p_expected_updated_at
  returning * into v_after;

  if v_after.id is null then
    raise exception 'product was modified by another session' using errcode = 'P2011';
  end if;

  perform app.write_audit_log(v_before.business_unit_id, 'restore', 'product', p_product_id, to_jsonb(v_before), to_jsonb(v_after));

  return v_after;
end;
$$;

revoke all on function public.admin_restore_product(uuid, timestamptz) from public;
grant execute on function public.admin_restore_product(uuid, timestamptz) to authenticated;

create or replace function public.admin_update_variant(
  p_variant_id uuid,
  p_expected_updated_at timestamptz,
  p_label text,
  p_variant_kind text,
  p_size_ml numeric,
  p_price_amount numeric,
  p_currency char(3),
  p_sku text,
  p_publication_status text,
  p_sort_order integer
)
returns public.product_variants
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_business_unit_id uuid;
  v_before public.product_variants;
  v_after public.product_variants;
  v_action text;
begin
  select * into v_before from public.product_variants where id = p_variant_id;
  if v_before.id is null then
    raise exception 'variant not found' using errcode = 'P0002';
  end if;

  v_business_unit_id := app.variant_unit(p_variant_id);
  perform app.assert_admin_for(v_business_unit_id);

  update public.product_variants set
    label = p_label,
    variant_kind = p_variant_kind,
    size_ml = p_size_ml,
    price_amount = p_price_amount,
    currency = p_currency,
    sku = p_sku,
    publication_status = p_publication_status,
    sort_order = p_sort_order
  where id = p_variant_id
    and updated_at = p_expected_updated_at
  returning * into v_after;

  if v_after.id is null then
    raise exception 'variant was modified by another session' using errcode = 'P2011';
  end if;

  -- A price change gets its own audit action so it is easy to find later,
  -- separate from cosmetic edits (label, sort order).
  v_action := case when v_after.price_amount is distinct from v_before.price_amount
    then 'price_change' else 'update' end;

  perform app.write_audit_log(v_business_unit_id, v_action, 'product_variant', p_variant_id, to_jsonb(v_before), to_jsonb(v_after));

  return v_after;
end;
$$;

revoke all on function public.admin_update_variant(
  uuid, timestamptz, text, text, numeric, numeric, char(3), text, text, integer
) from public;
grant execute on function public.admin_update_variant(
  uuid, timestamptz, text, text, numeric, numeric, char(3), text, text, integer
) to authenticated;

create or replace function public.admin_restore_variant(
  p_variant_id uuid,
  p_expected_updated_at timestamptz
)
returns public.product_variants
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_business_unit_id uuid;
  v_before public.product_variants;
  v_after public.product_variants;
begin
  select * into v_before from public.product_variants where id = p_variant_id;
  if v_before.id is null then
    raise exception 'variant not found' using errcode = 'P0002';
  end if;

  v_business_unit_id := app.variant_unit(p_variant_id);
  perform app.assert_admin_for(v_business_unit_id);

  update public.product_variants
  set archived_at = null, publication_status = 'draft'
  where id = p_variant_id
    and updated_at = p_expected_updated_at
  returning * into v_after;

  if v_after.id is null then
    raise exception 'variant was modified by another session' using errcode = 'P2011';
  end if;

  perform app.write_audit_log(v_business_unit_id, 'restore', 'product_variant', p_variant_id, to_jsonb(v_before), to_jsonb(v_after));

  return v_after;
end;
$$;

revoke all on function public.admin_restore_variant(uuid, timestamptz) from public;
grant execute on function public.admin_restore_variant(uuid, timestamptz) to authenticated;

create or replace function public.admin_update_inventory(
  p_variant_id uuid,
  p_expected_updated_at timestamptz,
  p_inventory_mode text,
  p_availability_status text,
  p_quantity_on_hand integer
)
returns public.inventory
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_business_unit_id uuid;
  v_before public.inventory;
  v_after public.inventory;
begin
  select * into v_before from public.inventory where product_variant_id = p_variant_id;
  if v_before.id is null then
    raise exception 'inventory row not found' using errcode = 'P0002';
  end if;

  v_business_unit_id := app.variant_unit(p_variant_id);
  perform app.assert_admin_for(v_business_unit_id);

  -- inventory_quantity_check still enforces the status_only/tracked_quantity
  -- shape at the database level, so a caller cannot bypass it by calling this
  -- function directly with an inconsistent mode/quantity pair.
  update public.inventory set
    inventory_mode = p_inventory_mode,
    availability_status = p_availability_status,
    quantity_on_hand = p_quantity_on_hand,
    updated_by = auth.uid()
  where product_variant_id = p_variant_id
    and updated_at = p_expected_updated_at
  returning * into v_after;

  if v_after.id is null then
    raise exception 'inventory was modified by another session' using errcode = 'P2011';
  end if;

  perform app.write_audit_log(v_business_unit_id, 'inventory_change', 'inventory', v_after.id, to_jsonb(v_before), to_jsonb(v_after));

  return v_after;
end;
$$;

revoke all on function public.admin_update_inventory(uuid, timestamptz, text, text, integer) from public;
grant execute on function public.admin_update_inventory(uuid, timestamptz, text, text, integer) to authenticated;

create or replace function public.admin_update_category(
  p_category_id uuid,
  p_expected_updated_at timestamptz,
  p_kind text,
  p_slug text,
  p_name text,
  p_description text,
  p_parent_id uuid,
  p_publication_status text,
  p_sort_order integer
)
returns public.categories
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_before public.categories%rowtype;
  v_after public.categories%rowtype;
begin
  select * into v_before
  from public.categories
  where id = p_category_id;

  if not found then
    raise exception 'category not found' using errcode = 'P0002';
  end if;

  perform app.assert_admin_for(v_before.business_unit_id);

  if v_before.archived_at is not null then
    raise exception 'restore the category before editing it' using errcode = 'P2005';
  end if;

  if v_before.updated_at is distinct from p_expected_updated_at then
    raise exception 'category was modified by another session' using errcode = 'P2011';
  end if;

  if p_publication_status not in ('draft', 'published') then
    raise exception 'active categories must be draft or published' using errcode = '22023';
  end if;

  if p_kind not in ('commercial_type', 'olfactory_family') then
    raise exception 'Parfums categories must use a Parfums category kind' using errcode = '22023';
  end if;

  update public.categories
  set
    kind = p_kind,
    slug = p_slug,
    name = p_name,
    description = p_description,
    parent_id = p_parent_id,
    publication_status = p_publication_status,
    sort_order = p_sort_order
  where id = p_category_id
    and updated_at = p_expected_updated_at
    and archived_at is null
  returning * into v_after;

  if not found then
    raise exception 'category was modified by another session' using errcode = 'P2011';
  end if;

  perform app.write_audit_log(
    v_before.business_unit_id,
    'update',
    'category',
    p_category_id,
    to_jsonb(v_before),
    to_jsonb(v_after)
  );

  return v_after;
end;
$$;

revoke all on function public.admin_update_category(uuid, timestamptz, text, text, text, text, uuid, text, integer) from public;
grant execute on function public.admin_update_category(uuid, timestamptz, text, text, text, text, uuid, text, integer) to authenticated;

create or replace function public.admin_archive_category(
  p_category_id uuid,
  p_expected_updated_at timestamptz
)
returns public.categories
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_before public.categories%rowtype;
  v_after public.categories%rowtype;
begin
  select * into v_before
  from public.categories
  where id = p_category_id;

  if not found then
    raise exception 'category not found' using errcode = 'P0002';
  end if;

  perform app.assert_admin_for(v_before.business_unit_id);

  if v_before.updated_at is distinct from p_expected_updated_at
    or v_before.archived_at is not null
  then
    raise exception 'category was modified by another session' using errcode = 'P2011';
  end if;

  update public.categories
  set archived_at = now(), publication_status = 'archived'
  where id = p_category_id and updated_at = p_expected_updated_at
  returning * into v_after;

  if not found then
    raise exception 'category was modified by another session' using errcode = 'P2011';
  end if;

  perform app.write_audit_log(
    v_before.business_unit_id,
    'archive',
    'category',
    p_category_id,
    to_jsonb(v_before),
    to_jsonb(v_after)
  );

  return v_after;
end;
$$;

revoke all on function public.admin_archive_category(uuid, timestamptz) from public;
grant execute on function public.admin_archive_category(uuid, timestamptz) to authenticated;

create or replace function public.admin_restore_category(
  p_category_id uuid,
  p_expected_updated_at timestamptz
)
returns public.categories
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_before public.categories%rowtype;
  v_after public.categories%rowtype;
begin
  select * into v_before
  from public.categories
  where id = p_category_id;

  if not found then
    raise exception 'category not found' using errcode = 'P0002';
  end if;

  perform app.assert_admin_for(v_before.business_unit_id);

  if v_before.updated_at is distinct from p_expected_updated_at
    or v_before.archived_at is null
  then
    raise exception 'category was modified by another session' using errcode = 'P2011';
  end if;

  update public.categories
  set archived_at = null, publication_status = 'draft'
  where id = p_category_id and updated_at = p_expected_updated_at
  returning * into v_after;

  if not found then
    raise exception 'category was modified by another session' using errcode = 'P2011';
  end if;

  perform app.write_audit_log(
    v_before.business_unit_id,
    'restore',
    'category',
    p_category_id,
    to_jsonb(v_before),
    to_jsonb(v_after)
  );

  return v_after;
end;
$$;

revoke all on function public.admin_restore_category(uuid, timestamptz) from public;
grant execute on function public.admin_restore_category(uuid, timestamptz) to authenticated;

create or replace function public.admin_update_combo_verification(
  p_combo_id uuid,
  p_expected_updated_at timestamptz,
  p_composition_verification_status text
)
returns public.combos
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_business_unit_id uuid;
  v_before public.combos;
  v_after public.combos;
begin
  select * into v_before from public.combos where id = p_combo_id;
  if v_before.id is null then
    raise exception 'combo not found' using errcode = 'P0002';
  end if;

  v_business_unit_id := app.combo_unit(p_combo_id);
  perform app.assert_admin_for(v_business_unit_id);

  update public.combos
  set composition_verification_status = p_composition_verification_status
  where id = p_combo_id and updated_at = p_expected_updated_at
  returning * into v_after;

  if v_after.id is null then
    raise exception 'combo was modified by another session' using errcode = 'P2011';
  end if;

  perform app.write_audit_log(
    v_business_unit_id, 'verification_update', 'combo', p_combo_id, to_jsonb(v_before), to_jsonb(v_after)
  );

  return v_after;
end;
$$;

revoke all on function public.admin_update_combo_verification(uuid, timestamptz, text) from public;
grant execute on function public.admin_update_combo_verification(uuid, timestamptz, text) to authenticated;

create or replace function public.admin_archive_combo(
  p_combo_id uuid,
  p_expected_updated_at timestamptz
)
returns public.combos
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_business_unit_id uuid;
  v_before public.combos;
  v_after public.combos;
begin
  select * into v_before from public.combos where id = p_combo_id;
  if v_before.id is null then
    raise exception 'combo not found' using errcode = 'P0002';
  end if;

  v_business_unit_id := app.combo_unit(p_combo_id);
  perform app.assert_admin_for(v_business_unit_id);

  update public.combos
  set archived_at = now()
  where id = p_combo_id and updated_at = p_expected_updated_at
  returning * into v_after;

  if v_after.id is null then
    raise exception 'combo was modified by another session' using errcode = 'P2011';
  end if;

  perform app.write_audit_log(v_business_unit_id, 'archive', 'combo', p_combo_id, to_jsonb(v_before), to_jsonb(v_after));

  return v_after;
end;
$$;

revoke all on function public.admin_archive_combo(uuid, timestamptz) from public;
grant execute on function public.admin_archive_combo(uuid, timestamptz) to authenticated;

create or replace function public.admin_restore_combo(
  p_combo_id uuid,
  p_expected_updated_at timestamptz
)
returns public.combos
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_business_unit_id uuid;
  v_before public.combos;
  v_after public.combos;
begin
  select * into v_before from public.combos where id = p_combo_id;
  if v_before.id is null then
    raise exception 'combo not found' using errcode = 'P0002';
  end if;

  v_business_unit_id := app.combo_unit(p_combo_id);
  perform app.assert_admin_for(v_business_unit_id);

  -- Restoring a combo never touches the underlying product's
  -- publication_status — exactly like admin_restore_product never
  -- re-publishes on its own, restoring a combo does not re-publish the
  -- product it belongs to.
  update public.combos
  set archived_at = null
  where id = p_combo_id and updated_at = p_expected_updated_at
  returning * into v_after;

  if v_after.id is null then
    raise exception 'combo was modified by another session' using errcode = 'P2011';
  end if;

  perform app.write_audit_log(v_business_unit_id, 'restore', 'combo', p_combo_id, to_jsonb(v_before), to_jsonb(v_after));

  return v_after;
end;
$$;

revoke all on function public.admin_restore_combo(uuid, timestamptz) from public;
grant execute on function public.admin_restore_combo(uuid, timestamptz) to authenticated;

create or replace function public.admin_set_combo_composition(
  p_combo_id uuid,
  p_expected_updated_at timestamptz,
  p_items jsonb
)
returns setof public.combo_items
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_combo public.combos;
  v_business_unit_id uuid;
  v_existing_variant_ids uuid[];
  v_before jsonb;
  v_after jsonb;
  item jsonb;
  v_variant_id uuid;
  v_variant_archived boolean;
  v_variant_product_id uuid;
  v_variant_product_archived boolean;
begin
  select * into v_combo from public.combos where id = p_combo_id;
  if v_combo.id is null then
    raise exception 'combo not found' using errcode = 'P0002';
  end if;

  v_business_unit_id := app.combo_unit(p_combo_id);
  perform app.assert_admin_for(v_business_unit_id);

  select coalesce(array_agg(product_variant_id), array[]::uuid[])
    into v_existing_variant_ids
  from public.combo_items where combo_id = p_combo_id;

  -- Validate every item the client wants to add that was not already part of
  -- the composition. jsonb_array_elements over a non-array or malformed
  -- shape raises its own clear Postgres error — no separate shape check
  -- needed here.
  for item in select * from jsonb_array_elements(p_items)
  loop
    v_variant_id := (item->>'product_variant_id')::uuid;

    if v_variant_id = any(v_existing_variant_ids) then
      continue;
    end if;

    select variant.archived_at is not null, product.id, product.archived_at is not null
      into v_variant_archived, v_variant_product_id, v_variant_product_archived
    from public.product_variants variant
    join public.products product on product.id = variant.product_id
    where variant.id = v_variant_id;

    if v_variant_product_id is null then
      raise exception 'variant not found' using errcode = 'P0002';
    end if;

    if v_variant_product_id = v_combo.product_id then
      raise exception 'a combo cannot include a variant of its own product (self-reference)'
        using errcode = 'check_violation';
    end if;

    if v_variant_archived then
      raise exception 'cannot add an archived variant to a combo' using errcode = '22023';
    end if;

    if v_variant_product_archived then
      raise exception 'cannot add a variant of an archived product to a combo' using errcode = '22023';
    end if;
  end loop;

  -- The concurrency gate doubles as the atomicity boundary: if this UPDATE
  -- matches zero rows, nothing below it runs either — the delete+insert that
  -- follows never executes against a version the caller did not actually see.
  update public.combos
  set updated_at = now()
  where id = p_combo_id and updated_at = p_expected_updated_at
  returning * into v_combo;

  if v_combo.id is null then
    raise exception 'combo was modified by another session' using errcode = 'P2011';
  end if;

  select coalesce(jsonb_agg(to_jsonb(ci)), '[]'::jsonb) into v_before
  from public.combo_items ci where ci.combo_id = p_combo_id;

  delete from public.combo_items where combo_id = p_combo_id;

  insert into public.combo_items (combo_id, product_variant_id, quantity, sort_order)
  select
    p_combo_id,
    (elem->>'product_variant_id')::uuid,
    (elem->>'quantity')::integer,
    (elem->>'sort_order')::integer
  from jsonb_array_elements(p_items) as elem;

  select coalesce(jsonb_agg(to_jsonb(ci)), '[]'::jsonb) into v_after
  from public.combo_items ci where ci.combo_id = p_combo_id;

  perform app.write_audit_log(v_business_unit_id, 'composition_update', 'combo', p_combo_id, v_before, v_after);

  return query select * from public.combo_items where combo_id = p_combo_id order by sort_order;
end;
$$;

revoke all on function public.admin_set_combo_composition(uuid, timestamptz, jsonb) from public;
grant execute on function public.admin_set_combo_composition(uuid, timestamptz, jsonb) to authenticated;

create or replace function public.admin_archive_variant(
  p_variant_id uuid,
  p_expected_updated_at timestamptz
)
returns public.product_variants
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_business_unit_id uuid;
  v_before public.product_variants;
  v_after public.product_variants;
begin
  select * into v_before from public.product_variants where id = p_variant_id;
  if v_before.id is null then
    raise exception 'variant not found' using errcode = 'P0002';
  end if;

  v_business_unit_id := app.variant_unit(p_variant_id);
  perform app.assert_admin_for(v_business_unit_id);

  if exists (
    select 1
    from public.combo_items ci
    join public.combos c on c.id = ci.combo_id
    where ci.product_variant_id = p_variant_id
      and c.archived_at is null
  ) then
    raise exception 'cannot archive a variant referenced by an active combo'
      using errcode = 'P2006';
  end if;

  -- Archive only, never delete: order_lines/combo_items may reference this
  -- variant, and their FKs are ON DELETE SET NULL/RESTRICT specifically so a
  -- physical delete here could never silently erase history. There is no
  -- DELETE statement anywhere in this migration.
  update public.product_variants
  set archived_at = now(), publication_status = 'archived'
  where id = p_variant_id
    and updated_at = p_expected_updated_at
  returning * into v_after;

  if v_after.id is null then
    raise exception 'variant was modified by another session' using errcode = 'P2011';
  end if;

  perform app.write_audit_log(v_business_unit_id, 'archive', 'product_variant', p_variant_id, to_jsonb(v_before), to_jsonb(v_after));

  return v_after;
end;
$$;

revoke all on function public.admin_archive_variant(uuid, timestamptz) from public;
grant execute on function public.admin_archive_variant(uuid, timestamptz) to authenticated;

create or replace function public.admin_archive_product(
  p_product_id uuid,
  p_expected_updated_at timestamptz
)
returns public.products
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_before public.products;
  v_after public.products;
begin
  select * into v_before from public.products where id = p_product_id;
  if v_before.id is null then
    raise exception 'product not found' using errcode = 'P0002';
  end if;

  perform app.assert_admin_for(v_before.business_unit_id);

  if exists (
    select 1 from public.combos c
    where c.product_id = p_product_id
      and c.archived_at is null
  ) then
    raise exception 'cannot archive a product that has an active combo; archive the combo first'
      using errcode = 'P2006';
  end if;

  update public.products
  set archived_at = now(), publication_status = 'archived'
  where id = p_product_id
    and updated_at = p_expected_updated_at
  returning * into v_after;

  if v_after.id is null then
    raise exception 'product was modified by another session' using errcode = 'P2011';
  end if;

  perform app.write_audit_log(v_before.business_unit_id, 'archive', 'product', p_product_id, to_jsonb(v_before), to_jsonb(v_after));

  return v_after;
end;
$$;

revoke all on function public.admin_archive_product(uuid, timestamptz) from public;
grant execute on function public.admin_archive_product(uuid, timestamptz) to authenticated;

create or replace function public.admin_update_wholesale_policy(
  p_policy_id uuid,
  p_expected_updated_at timestamptz,
  p_min_quantity integer,
  p_discount_amount numeric,
  p_is_active boolean
)
returns public.wholesale_policies
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_before public.wholesale_policies;
  v_after public.wholesale_policies;
  v_action text;
begin
  select * into v_before from public.wholesale_policies where id = p_policy_id;
  if v_before.id is null then
    raise exception 'wholesale policy not found' using errcode = 'P0002';
  end if;

  perform app.assert_admin_for(v_before.business_unit_id);

  if v_before.scope <> 'per_commercial_type' or v_before.commercial_type is null then
    raise exception 'policy is not a per-commercial-type wholesale rule' using errcode = '22023';
  end if;
  if p_min_quantity is null or p_min_quantity <= 0 then
    raise exception 'minimum quantity must be positive' using errcode = '22023';
  end if;
  if p_discount_amount is null or p_discount_amount <= 0 then
    raise exception 'discount amount must be positive' using errcode = '22023';
  end if;

  update public.wholesale_policies
  set min_quantity = p_min_quantity,
      discount_amount = p_discount_amount,
      is_active = p_is_active
  where id = p_policy_id and updated_at = p_expected_updated_at
  returning * into v_after;

  if v_after.id is null then
    raise exception 'wholesale policy was modified by another session' using errcode = 'P2011';
  end if;

  v_action := case
    when not v_before.is_active and v_after.is_active then 'wholesale.enable'
    when v_before.is_active and not v_after.is_active then 'wholesale.disable'
    else 'wholesale.policy_update'
  end;

  perform app.write_audit_log(
    v_before.business_unit_id,
    v_action,
    'wholesale_policy',
    v_after.id,
    jsonb_build_object(
      'min_quantity', v_before.min_quantity,
      'discount_amount', v_before.discount_amount,
      'is_active', v_before.is_active
    ),
    jsonb_build_object(
      'min_quantity', v_after.min_quantity,
      'discount_amount', v_after.discount_amount,
      'is_active', v_after.is_active
    )
  );

  return v_after;
end;
$$;

revoke all on function public.admin_update_wholesale_policy(uuid, timestamptz, integer, numeric, boolean) from public;
grant execute on function public.admin_update_wholesale_policy(uuid, timestamptz, integer, numeric, boolean) to authenticated;

create or replace function public.admin_update_public_contact_setting(
  p_business_unit_code text,
  p_expected_updated_at timestamptz,
  p_whatsapp_number text,
  p_whatsapp_display text,
  p_contact_email text
)
returns public.settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_unit_id uuid;
  v_before public.settings;
  v_after public.settings;
  v_new_value jsonb;
begin
  select id into v_business_unit_id from public.business_units where code = p_business_unit_code;
  if v_business_unit_id is null then
    raise exception 'unknown business unit code %', p_business_unit_code using errcode = '22023';
  end if;

  perform app.assert_admin_for(v_business_unit_id);

  select * into v_before
  from public.settings
  where business_unit_id = v_business_unit_id and key = 'public_contact';

  if v_before.id is null then
    raise exception 'public_contact setting not found for this business unit' using errcode = 'P0002';
  end if;

  v_new_value := jsonb_build_object(
    'whatsappNumber', p_whatsapp_number,
    'whatsappDisplay', p_whatsapp_display,
    'contactEmail', p_contact_email
  );

  update public.settings
  set value = v_new_value,
      updated_by = auth.uid()
  where id = v_before.id and updated_at = p_expected_updated_at
  returning * into v_after;

  if v_after.id is null then
    raise exception 'setting was modified by another session' using errcode = 'P2011';
  end if;

  perform app.write_audit_log(
    v_after.business_unit_id,
    'settings_change',
    'settings',
    v_after.id,
    jsonb_build_object('key', v_before.key, 'value', v_before.value),
    jsonb_build_object('key', v_after.key, 'value', v_after.value)
  );

  return v_after;
end;
$$;

revoke all on function public.admin_update_public_contact_setting(text, timestamptz, text, text, text) from public;
grant execute on function public.admin_update_public_contact_setting(text, timestamptz, text, text, text) to authenticated;

