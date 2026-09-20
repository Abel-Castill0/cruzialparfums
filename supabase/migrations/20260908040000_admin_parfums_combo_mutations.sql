-- Cruzial Platform V2 — Admin combo mutations (Parfums CRUD, Phase 4c)
--
-- Same pattern as 20260908000435_admin_parfums_product_mutations.sql and
-- 20260908022000_admin_parfums_category_mutations.sql: SECURITY INVOKER
-- functions in `public` (PostgREST-exposed), app.assert_admin_for() as an
-- explicit authorization check, app.write_audit_log() for a non-spoofable
-- audit trail in the same transaction as the mutation, and optimistic
-- concurrency via `UPDATE ... WHERE id = $1 AND updated_at = $2` raising
-- SQLSTATE 40001 on zero rows. No DELETE anywhere — archive/restore only.
--
-- A combo is 1:1 with a `products` row (the vendible entity); `combo_items`
-- is its composition, drawn from *other* products' variants. Product/variant
-- core data (name, slug, price, publication_status, inventory) stays owned
-- by the Phase 4a mutations — this file only ever touches combos/combo_items,
-- plus two narrow, additive extensions to admin_archive_variant/
-- admin_archive_product (see below) to stop an archive from silently
-- orphaning an active combo's composition or its own vendible product.

-- ---------------------------------------------------------------------------
-- audit_log action vocabulary (additive)
--
-- 20260907154355_audit_log.sql's audit_log_action_check did not anticipate
-- combo-specific actions. Widening it here (drop + recreate, same table, new
-- migration) rather than editing the historical file — the existing action
-- names it already allows are untouched.
-- ---------------------------------------------------------------------------

alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check check (
  action in (
    'create', 'update', 'archive', 'restore', 'publish', 'unpublish',
    'price_change', 'inventory_change', 'campaign_state_change',
    'order_state_change', 'settings_change', 'membership_change',
    'customer_verification_change', 'composition_update', 'verification_update'
  )
);

-- ---------------------------------------------------------------------------
-- Self-reference guard (docs: Phase 4c, section 10)
--
-- app.enforce_combo_item_unit() already rejected a combo_item whose variant
-- belongs to a different business unit than the combo (Phase 3). It did not
-- reject a variant belonging to the combo's *own* product — a combo could
-- previously include itself as an ingredient of itself, which is a real
-- integrity bug, not a business-rule nuance. Re-declaring the function here
-- (additive: a new migration, not an edit to the historical file) adds that
-- check alongside the existing one.
-- ---------------------------------------------------------------------------

create or replace function app.enforce_combo_item_unit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  combo_product_id uuid;
  combo_business_unit uuid;
  variant_product_id uuid;
  variant_business_unit uuid;
begin
  select combo.product_id, product.business_unit_id
    into combo_product_id, combo_business_unit
  from public.combos combo
  join public.products product on product.id = combo.product_id
  where combo.id = new.combo_id;

  select variant.product_id, product.business_unit_id
    into variant_product_id, variant_business_unit
  from public.product_variants variant
  join public.products product on product.id = variant.product_id
  where variant.id = new.product_variant_id;

  if combo_business_unit is null
     or variant_business_unit is null
     or combo_business_unit is distinct from variant_business_unit then
    raise exception 'combo item must belong to the combo business unit'
      using errcode = 'check_violation';
  end if;

  if variant_product_id is not null and variant_product_id = combo_product_id then
    raise exception 'a combo cannot include a variant of its own product (self-reference)'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Combos
-- ---------------------------------------------------------------------------

-- business_unit_id is never a parameter: it is resolved from p_product_id,
-- exactly like admin_create_variant resolves it from the product it attaches
-- to. "Max one combo per product" is enforced by combos_product_unique
-- (23505) — this function does not duplicate that check, only the
-- "product must not already be archived" business rule, which no existing
-- constraint expresses.
create or replace function public.admin_create_combo(
  p_product_id uuid,
  p_composition_verification_status text default 'pending_reconfirmation'
)
returns public.combos
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_product public.products;
  v_row public.combos;
begin
  select * into v_product from public.products where id = p_product_id;
  if v_product.id is null then
    raise exception 'product not found' using errcode = 'P0002';
  end if;

  perform app.assert_admin_for(v_product.business_unit_id);

  if v_product.archived_at is not null then
    raise exception 'cannot create a combo for an archived product' using errcode = '22023';
  end if;

  insert into public.combos (product_id, composition_verification_status)
  values (p_product_id, p_composition_verification_status)
  returning * into v_row;

  perform app.write_audit_log(v_product.business_unit_id, 'create', 'combo', v_row.id, null, to_jsonb(v_row));

  return v_row;
end;
$$;

revoke all on function public.admin_create_combo(uuid, text) from public;
grant execute on function public.admin_create_combo(uuid, text) to authenticated;

-- The only combo-level field an admin can change outside its composition is
-- composition_verification_status (product_id is immutable after creation —
-- re-pointing a combo at a different product is not an "edit", it would be a
-- different combo). Kept as its own function/audit action so "an admin
-- explicitly confirmed this composition" is never inferred from anything
-- else, per docs/client-decisions.md CLIENT_PROVIDED_PENDING_RECONFIRMATION.
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
    raise exception 'combo was modified by another session' using errcode = '40001';
  end if;

  perform app.write_audit_log(
    v_business_unit_id, 'verification_update', 'combo', p_combo_id, to_jsonb(v_before), to_jsonb(v_after)
  );

  return v_after;
end;
$$;

revoke all on function public.admin_update_combo_verification(uuid, timestamptz, text) from public;
grant execute on function public.admin_update_combo_verification(uuid, timestamptz, text) to authenticated;

-- Archive/restore never touch the underlying product, its variants, or
-- combo_items — "no cascade destructivo" from docs/progress-v2.md Phase 4c.
-- The composition/history stays exactly as it was; only the combo's own
-- archived_at flips.
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
    raise exception 'combo was modified by another session' using errcode = '40001';
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
    raise exception 'combo was modified by another session' using errcode = '40001';
  end if;

  perform app.write_audit_log(v_business_unit_id, 'restore', 'combo', p_combo_id, to_jsonb(v_before), to_jsonb(v_after));

  return v_after;
end;
$$;

revoke all on function public.admin_restore_combo(uuid, timestamptz) from public;
grant execute on function public.admin_restore_combo(uuid, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Composition (combo_items) — full replace, one transaction
--
-- The admin UI holds the whole desired composition client-side (add/remove/
-- reorder are all local state) and submits it as one array, exactly like
-- admin_set_product_categories's full-replace of product_categories. Unlike
-- that function, this one *does* carry optimistic concurrency: composition
-- changes are exactly the kind of concurrent-edit scenario docs/progress-v2.md
-- Phase 4c calls out for a stale-conflict test, so the combo's own
-- updated_at is the version token, bumped by this same call.
--
-- Existing composition rows are preserved even if their variant/product has
-- since been archived — a combo must not silently lose history because a
-- component happened to go out of production. Only *new* additions (a
-- variant not already present in the composition before this call) are
-- required to be active: an admin cannot introduce an archived component
-- into a combo, but archiving a component after the fact does not retroactively
-- break the combo. See docs/progress-v2.md Phase 4c for the full rationale.
-- ---------------------------------------------------------------------------

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
    raise exception 'combo was modified by another session' using errcode = '40001';
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

-- ---------------------------------------------------------------------------
-- Product/variant archive guards (docs: Phase 4c, section 14)
--
-- Re-declaring both functions (additive: new migration, same signature) to
-- add one check each, following the exact precedent already set by
-- admin_archive_category (Phase 4b), which blocks archiving a category that
-- still has active children or active product assignments rather than
-- silently allowing it. The same conservative choice applies here: archiving
-- a variant that an *active* combo currently sells as a component, or
-- archiving the product that *is* an active combo, is blocked — the admin
-- must archive the combo (or drop the item from its composition) first. This
-- never cascades a change into the combo automatically; it only stops a new
-- inconsistency from being created. Everything else about these two
-- functions is unchanged from Phase 4a — no regression in the no-combo case,
-- covered by the Phase 4c product-CRUD smoke test.
-- ---------------------------------------------------------------------------

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
    raise exception 'variant was modified by another session' using errcode = '40001';
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
    raise exception 'product was modified by another session' using errcode = '40001';
  end if;

  perform app.write_audit_log(v_before.business_unit_id, 'archive', 'product', p_product_id, to_jsonb(v_before), to_jsonb(v_after));

  return v_after;
end;
$$;

revoke all on function public.admin_archive_product(uuid, timestamptz) from public;
grant execute on function public.admin_archive_product(uuid, timestamptz) to authenticated;
