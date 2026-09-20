-- Cruzial Platform V2 — Admin product mutations (Parfums CRUD, Phase 4a)
--
-- Every admin write to products/product_variants/inventory/product_categories
-- goes through one of these functions instead of a raw PostgREST call. Three
-- problems this solves together, why none of them can be solved by RLS alone:
--
--   1. Atomicity across tables. A Postgres function body is one implicit
--      transaction: if the variant insert fails after the product insert
--      succeeded, the whole call rolls back. Five independent PostgREST
--      requests from the browser cannot offer that.
--   2. Audit that cannot be spoofed. auth.uid() is resolved *inside* Postgres
--      from the caller's verified JWT, never accepted as a parameter. A
--      client cannot claim to be a different actor, and the audit row is
--      written in the same transaction as the mutation it describes — there
--      is no gap where the write succeeds but the audit entry does not.
--   3. Optimistic concurrency with a clear error. `UPDATE ... WHERE id = $1
--      AND updated_at = $2` returning zero rows is deliberately turned into a
--      raised exception (SQLSTATE 40001) instead of a silent no-op, so the
--      caller can show "this was edited elsewhere" instead of pretending the
--      save worked.
--
-- SECURITY INVOKER throughout, on purpose: every statement inside these
-- functions still runs as the calling admin, so RLS keeps applying row by
-- row. app.assert_admin_for() is an *explicit* authorization check on top of
-- that — defense in depth, and it also gives a clear 42501 error instead of
-- an update that silently matches zero rows because RLS hid it.
--
-- Mass assignment is avoided throughout: every function takes named,
-- individually-typed parameters and maps them one at a time onto columns.
-- Nothing here does `insert into products select * from jsonb_populate_record(...)`.
--
-- business_unit_id is never a parameter of admin_create_product. It is
-- resolved server-side from a business-unit *code* ('parfums'), so nothing a
-- browser sends can pick which unit a new row lands in — assert_admin_for()
-- rejects the call before the insert if the caller is not an admin for that
-- resolved unit.
--
-- Schema placement: the mutation entry points below live in `public` because
-- config.toml's api.schemas is ["public", "graphql_public"] — PostgREST (and
-- therefore supabase-js's .rpc()) can only dispatch to a function in an
-- exposed schema. The helpers they call (assert_admin_for, write_audit_log,
-- and the *_unit()/*_is_public() resolvers from earlier migrations) stay in
-- `app`, which is deliberately NOT exposed: they are reachable from plpgsql
-- and from RLS policy expressions, but not directly callable over the API,
-- which matters most for write_audit_log — a client that could call it
-- directly could forge an audit entry disconnected from any real mutation.

create or replace function app.assert_admin_for(target_unit uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not app.is_admin_for(target_unit) then
    raise exception 'not an admin for this business unit'
      using errcode = '42501'; -- insufficient_privilege
  end if;
end;
$$;

revoke all on function app.assert_admin_for(uuid) from public;
grant execute on function app.assert_admin_for(uuid) to authenticated;

-- Shared audit helper. Runs as the caller (SECURITY INVOKER): the INSERT is
-- still subject to audit_log_admin_insert's RLS policy, which independently
-- re-checks app.is_admin_for(business_unit_id) — the same check the calling
-- mutation already performed, applied a second time by the database itself.
create or replace function app.write_audit_log(
  p_business_unit_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_before jsonb,
  p_after jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.audit_log (business_unit_id, actor_user_id, action, entity_type, entity_id, before, after)
  values (p_business_unit_id, auth.uid(), p_action, p_entity_type, p_entity_id, p_before, p_after);
end;
$$;

revoke all on function app.write_audit_log(uuid, text, text, uuid, jsonb, jsonb) from public;
grant execute on function app.write_audit_log(uuid, text, text, uuid, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Products
-- ---------------------------------------------------------------------------

create or replace function public.admin_create_product(
  p_business_unit_code text,
  p_slug text,
  p_name text,
  p_brand text default null,
  p_short_description text default null,
  p_description text default null,
  p_gender text default null,
  p_concentration text default null,
  p_sales_mode text default 'always_available',
  p_production_status text default 'active',
  p_publication_status text default 'draft',
  p_is_featured boolean default false,
  p_featured_rank integer default null,
  p_featured_from timestamptz default null,
  p_featured_until timestamptz default null
)
returns public.products
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_business_unit_id uuid;
  v_row public.products;
begin
  select id into v_business_unit_id from public.business_units where code = p_business_unit_code;
  if v_business_unit_id is null then
    raise exception 'unknown business unit code %', p_business_unit_code using errcode = '22023';
  end if;

  perform app.assert_admin_for(v_business_unit_id);

  insert into public.products (
    business_unit_id, slug, name, brand, short_description, description,
    gender, concentration, sales_mode, production_status, publication_status,
    is_featured, featured_rank, featured_from, featured_until
  ) values (
    v_business_unit_id, p_slug, p_name, p_brand, p_short_description, p_description,
    p_gender, p_concentration, p_sales_mode, p_production_status, p_publication_status,
    p_is_featured, p_featured_rank, p_featured_from, p_featured_until
  )
  returning * into v_row;

  perform app.write_audit_log(v_business_unit_id, 'create', 'product', v_row.id, null, to_jsonb(v_row));

  return v_row;
end;
$$;

revoke all on function public.admin_create_product(
  text, text, text, text, text, text, text, text, text, text, text, boolean, integer, timestamptz, timestamptz
) from public;
grant execute on function public.admin_create_product(
  text, text, text, text, text, text, text, text, text, text, text, boolean, integer, timestamptz, timestamptz
) to authenticated;

-- Full-replace update: the edit form submits every editable field together,
-- so there is no partial-PATCH sentinel problem (no way to distinguish
-- "field omitted" from "field explicitly cleared" with plain SQL parameters).
-- slug and name are both here — editing name never touches slug on its own;
-- the admin can change slug too, but only by explicitly submitting a new one.
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
    raise exception 'product was modified by another session' using errcode = '40001';
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

-- Archive/restore never touch production_status or availability_status —
-- "archived → discontinued" and "archived → out_of_stock" are exactly the
-- automatic collapsing docs/client-decisions.md forbids. Restore lands on
-- 'draft', never back on 'published': un-archiving must not silently
-- re-publish something the admin has to look at again first.
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

  update public.products
  set archived_at = now(), publication_status = 'archived'
  where id = p_product_id
    and updated_at = p_expected_updated_at
  returning * into v_after;

  if v_after.id is null then
    raise exception 'product was modified by another session' using errcode = '40001';
  end if;

  perform app.write_audit_log(v_before.business_unit_id, 'archive', 'product', p_product_id, to_jsonb(v_before), to_jsonb(v_after));

  return v_after;
end;
$$;

revoke all on function public.admin_archive_product(uuid, timestamptz) from public;
grant execute on function public.admin_archive_product(uuid, timestamptz) to authenticated;

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
    raise exception 'product was modified by another session' using errcode = '40001';
  end if;

  perform app.write_audit_log(v_before.business_unit_id, 'restore', 'product', p_product_id, to_jsonb(v_before), to_jsonb(v_after));

  return v_after;
end;
$$;

revoke all on function public.admin_restore_product(uuid, timestamptz) from public;
grant execute on function public.admin_restore_product(uuid, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Variants (+ their paired inventory row, created together)
-- ---------------------------------------------------------------------------

create or replace function public.admin_create_variant(
  p_product_id uuid,
  p_label text,
  p_variant_kind text,
  p_size_ml numeric,
  p_price_amount numeric,
  p_currency char(3) default 'PEN',
  p_sku text default null,
  p_publication_status text default 'draft',
  p_sort_order integer default 0,
  p_inventory_mode text default 'status_only',
  p_availability_status text default 'available',
  p_quantity_on_hand integer default null
)
returns public.product_variants
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_business_unit_id uuid;
  v_variant public.product_variants;
  v_inventory public.inventory;
begin
  v_business_unit_id := app.product_unit(p_product_id);
  if v_business_unit_id is null then
    raise exception 'product not found' using errcode = 'P0002';
  end if;

  perform app.assert_admin_for(v_business_unit_id);

  insert into public.product_variants (
    product_id, label, variant_kind, size_ml, price_amount, currency,
    sku, publication_status, sort_order
  ) values (
    p_product_id, p_label, p_variant_kind, p_size_ml, p_price_amount, p_currency,
    p_sku, p_publication_status, p_sort_order
  )
  returning * into v_variant;

  -- inventory_quantity_check (status_only requires a null quantity,
  -- tracked_quantity requires a non-null one) is enforced by the database
  -- itself here, not just by this function's input validation.
  insert into public.inventory (product_variant_id, inventory_mode, quantity_on_hand, availability_status, updated_by)
  values (v_variant.id, p_inventory_mode, p_quantity_on_hand, p_availability_status, auth.uid())
  returning * into v_inventory;

  perform app.write_audit_log(
    v_business_unit_id, 'create', 'product_variant', v_variant.id,
    null,
    jsonb_build_object('variant', to_jsonb(v_variant), 'inventory', to_jsonb(v_inventory))
  );

  return v_variant;
end;
$$;

revoke all on function public.admin_create_variant(
  uuid, text, text, numeric, numeric, char(3), text, text, integer, text, text, integer
) from public;
grant execute on function public.admin_create_variant(
  uuid, text, text, numeric, numeric, char(3), text, text, integer, text, text, integer
) to authenticated;

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
    raise exception 'variant was modified by another session' using errcode = '40001';
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
    raise exception 'variant was modified by another session' using errcode = '40001';
  end if;

  perform app.write_audit_log(v_business_unit_id, 'archive', 'product_variant', p_variant_id, to_jsonb(v_before), to_jsonb(v_after));

  return v_after;
end;
$$;

revoke all on function public.admin_archive_variant(uuid, timestamptz) from public;
grant execute on function public.admin_archive_variant(uuid, timestamptz) to authenticated;

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
    raise exception 'variant was modified by another session' using errcode = '40001';
  end if;

  perform app.write_audit_log(v_business_unit_id, 'restore', 'product_variant', p_variant_id, to_jsonb(v_before), to_jsonb(v_after));

  return v_after;
end;
$$;

revoke all on function public.admin_restore_variant(uuid, timestamptz) from public;
grant execute on function public.admin_restore_variant(uuid, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Inventory
-- ---------------------------------------------------------------------------

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
    raise exception 'inventory was modified by another session' using errcode = '40001';
  end if;

  perform app.write_audit_log(v_business_unit_id, 'inventory_change', 'inventory', v_after.id, to_jsonb(v_before), to_jsonb(v_after));

  return v_after;
end;
$$;

revoke all on function public.admin_update_inventory(uuid, timestamptz, text, text, integer) from public;
grant execute on function public.admin_update_inventory(uuid, timestamptz, text, text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Categories (assign/unassign existing categories — no category CRUD here)
-- ---------------------------------------------------------------------------

-- Full-replace, same reasoning as admin_update_product: the admin UI presents
-- a fixed list of existing categories with checkboxes, so "the set the admin
-- submitted" is the whole desired state, not a delta.
-- app.enforce_product_category_unit() (from the Phase 3 hardening migration)
-- still fires on every inserted row and rejects a category from the wrong
-- business unit — this function does not duplicate that check.
create or replace function public.admin_set_product_categories(
  p_product_id uuid,
  p_category_ids uuid[]
)
returns setof public.product_categories
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_business_unit_id uuid;
  v_before jsonb;
  v_after jsonb;
begin
  v_business_unit_id := app.product_unit(p_product_id);
  if v_business_unit_id is null then
    raise exception 'product not found' using errcode = 'P0002';
  end if;

  perform app.assert_admin_for(v_business_unit_id);

  select coalesce(jsonb_agg(to_jsonb(pc)), '[]'::jsonb) into v_before
  from public.product_categories pc where pc.product_id = p_product_id;

  delete from public.product_categories where product_id = p_product_id;

  insert into public.product_categories (product_id, category_id, sort_order)
  select p_product_id, cid, ord - 1
  from unnest(p_category_ids) with ordinality as t(cid, ord);

  select coalesce(jsonb_agg(to_jsonb(pc)), '[]'::jsonb) into v_after
  from public.product_categories pc where pc.product_id = p_product_id;

  perform app.write_audit_log(v_business_unit_id, 'update', 'product_categories', p_product_id, v_before, v_after);

  return query select * from public.product_categories where product_id = p_product_id order by sort_order;
end;
$$;

revoke all on function public.admin_set_product_categories(uuid, uuid[]) from public;
grant execute on function public.admin_set_product_categories(uuid, uuid[]) to authenticated;
