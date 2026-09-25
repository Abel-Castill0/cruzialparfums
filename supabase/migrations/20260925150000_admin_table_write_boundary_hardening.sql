-- Cruzial Platform V2 -- Gate A3: close direct admin table-write bypasses
--
-- Confirmed defect: public.inventory grants authenticated INSERT/UPDATE/
-- DELETE via RLS (inventory_admin_write). admin_update_inventory
-- additionally enforces "tracked_quantity + quantity_on_hand=0 cannot be
-- availability_status=available" and writes an audit_log entry, but the
-- table-level inventory_quantity_check constraint only enforces mode/
-- quantity SHAPE (null-vs-not-null, non-negative) -- not that specific
-- business rule. A valid Admin can therefore bypass admin_update_inventory
-- entirely via direct PostgREST table access, bypassing both the
-- availability invariant and the RPCs audit logging.
--
-- Audit of the full authenticated-write table set named in this Gate
-- (business_units, categories, combo_items, combos, deposit_policies,
-- inventory, product_categories, product_variants, products,
-- shipping_methods, variant_price_tiers, wholesale_policies):
--   - grep across apps/web/src found ZERO direct .insert/.update/.delete
--     calls against any of these 12 tables from application code -- every
--     APPLICATION mutation already goes exclusively through an admin_* RPC.
--   - business_units has NO admin-write RLS policy at all (only
--     business_units_public_read) and no RPC -- it is genuinely read-only
--     by design; its authenticated DML grant is dead weight RLS already
--     blocked, same class of cleanup as 20260920010555. Revoked here.
--   - shipping_methods, deposit_policies and variant_price_tiers each have
--     their OWN dedicated *_admin_write RLS policy (for all, is_admin_for-
--     scoped) -- the exact same architecture inventory has -- but, unlike
--     inventory, no admin_* RPC was ever built for them, and each is
--     protected by a table-level CHECK constraint that (unlike inventory's
--     shape-only inventory_quantity_check) fully covers the integrity rule
--     in question (proved by supabase/tests/08_admin_wholesale.sql's
--     existing "a manual tier cannot duplicate a per-commercial-type
--     derived policy" pgTAP case, 23514). Direct RLS-gated write is this
--     table's designed, sufficient, tested architecture -- NOT revoked;
--     inventing an RPC for them is out of this Gate's scope.
--   - 20 of the resulting admin_* RPCs (categories, combos, products,
--     product_variants, product_categories, combo_items, inventory,
--     wholesale_policies) were SECURITY INVOKER, relying on the caller
--     (authenticated) holding the very table grants this migration
--     revokes, on top of the inventory_admin_write-style RLS policies.
--     Revoking those grants without converting these RPCs would break
--     every Parfums admin mutation.
--   - Each of the 20 already performs its own explicit
--     app.assert_admin_for(...) authorization check, resolved from a
--     server-read row or a server-resolved business_unit_code -> id
--     lookup (never a client-supplied business_unit_id used directly),
--     BEFORE any mutation -- so converting SECURITY INVOKER to SECURITY
--     DEFINER does not weaken authorization; RLS was defense-in-depth on
--     top of it, not the primary gate. All 20 already used an empty
--     search_path and were already granted EXECUTE to authenticated only
--     (never anon/public) -- unchanged here.
--   - public.admin_set_campaign_products_with_version (import campaign
--     products, NOT one of this Gates 12 tables) is also SECURITY INVOKER
--     but was NOT found to have the same explicit-check-before-table-
--     grant-reliance pattern verified above; left untouched pending its
--     own dedicated review (tracked as a P2 finding in the Gate A
--     handoff, not silently converted).
--
-- Also revokes anon SELECT on public.complaint_book_entries: the only
-- read call site (AdminComplaintsRepository) is admin-only and already
-- scoped by RLS (complaint_book_entries_admin_read, authenticated only);
-- public submission goes through the service-only
-- public_submit_complaint_entry RPC, which needs no anon table SELECT.

-- =============================================================================
-- A. Convert the 20 catalog admin_* RPCs from SECURITY INVOKER to SECURITY
--    DEFINER (same signature, same body, same grants -- only the security
--    mode changes, so a CREATE OR REPLACE FUNCTION on the existing
--    signature preserves the existing EXECUTE grants automatically)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_archive_category(p_category_id uuid, p_expected_updated_at timestamp with time zone)
 RETURNS categories
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.admin_archive_combo(p_combo_id uuid, p_expected_updated_at timestamp with time zone)
 RETURNS combos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.admin_archive_product(p_product_id uuid, p_expected_updated_at timestamp with time zone)
 RETURNS products
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.admin_archive_variant(p_variant_id uuid, p_expected_updated_at timestamp with time zone)
 RETURNS product_variants
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.admin_create_category(p_business_unit_code text, p_kind text, p_slug text, p_name text, p_description text DEFAULT NULL::text, p_parent_id uuid DEFAULT NULL::uuid, p_publication_status text DEFAULT 'draft'::text, p_sort_order integer DEFAULT 0)
 RETURNS categories
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_business_unit_id uuid;
  v_row public.categories%rowtype;
begin
  select id into v_business_unit_id
  from public.business_units
  where code = p_business_unit_code;

  if v_business_unit_id is null then
    raise exception 'business unit not found' using errcode = '22023';
  end if;

  perform app.assert_admin_for(v_business_unit_id);

  if p_business_unit_code = 'parfums'
    and p_kind not in ('commercial_type', 'olfactory_family')
  then
    raise exception 'invalid category kind for Parfums' using errcode = '22023';
  end if;

  if p_publication_status not in ('draft', 'published') then
    raise exception 'new categories must be draft or published' using errcode = '22023';
  end if;

  insert into public.categories (
    business_unit_id,
    parent_id,
    kind,
    slug,
    name,
    description,
    publication_status,
    sort_order
  ) values (
    v_business_unit_id,
    p_parent_id,
    p_kind,
    p_slug,
    p_name,
    p_description,
    p_publication_status,
    p_sort_order
  ) returning * into v_row;

  perform app.write_audit_log(
    v_business_unit_id,
    'create',
    'category',
    v_row.id,
    null,
    to_jsonb(v_row)
  );

  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_create_combo(p_product_id uuid, p_composition_verification_status text DEFAULT 'pending_reconfirmation'::text)
 RETURNS combos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_product public.products;
  v_row public.combos;
begin
  select * into v_product from public.products where id = p_product_id;
  if v_product.id is null then
    raise exception 'product not found' using errcode = 'P0002';
  end if;

  perform app.assert_admin_for(v_product.business_unit_id);

  if p_composition_verification_status not in ('pending_reconfirmation', 'client_confirmed', 'unknown') then
    raise exception 'verification status is not manually assignable' using errcode = '22023';
  end if;

  if v_product.archived_at is not null then
    raise exception 'cannot create a combo for an archived product' using errcode = '22023';
  end if;

  insert into public.combos (product_id, composition_verification_status)
  values (p_product_id, p_composition_verification_status)
  returning * into v_row;

  perform app.write_audit_log(v_product.business_unit_id, 'create', 'combo', v_row.id, null, to_jsonb(v_row));
  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_create_product(p_business_unit_code text, p_slug text, p_name text, p_brand text DEFAULT NULL::text, p_short_description text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_gender text DEFAULT NULL::text, p_concentration text DEFAULT NULL::text, p_sales_mode text DEFAULT 'always_available'::text, p_production_status text DEFAULT 'active'::text, p_publication_status text DEFAULT 'draft'::text, p_is_featured boolean DEFAULT false, p_featured_rank integer DEFAULT NULL::integer, p_featured_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_featured_until timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS products
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.admin_create_variant(p_product_id uuid, p_label text, p_variant_kind text, p_size_ml numeric, p_price_amount numeric, p_currency character DEFAULT 'PEN'::bpchar, p_sku text DEFAULT NULL::text, p_publication_status text DEFAULT 'draft'::text, p_sort_order integer DEFAULT 0, p_inventory_mode text DEFAULT 'status_only'::text, p_availability_status text DEFAULT 'available'::text, p_quantity_on_hand integer DEFAULT NULL::integer)
 RETURNS product_variants
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.admin_restore_category(p_category_id uuid, p_expected_updated_at timestamp with time zone)
 RETURNS categories
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.admin_restore_combo(p_combo_id uuid, p_expected_updated_at timestamp with time zone)
 RETURNS combos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.admin_restore_product(p_product_id uuid, p_expected_updated_at timestamp with time zone)
 RETURNS products
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.admin_restore_variant(p_variant_id uuid, p_expected_updated_at timestamp with time zone)
 RETURNS product_variants
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_combo_composition(p_combo_id uuid, p_expected_updated_at timestamp with time zone, p_items jsonb)
 RETURNS SETOF combo_items
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_combo_before public.combos;
  v_combo_after public.combos;
  v_business_unit_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_semantic_changed boolean;
  item jsonb;
  v_combo_variant_id uuid;
  v_variant_id uuid;
  v_variant_archived boolean;
  v_variant_product_id uuid;
  v_variant_product_archived boolean;
begin
  select * into v_combo_before from public.combos where id = p_combo_id;
  if v_combo_before.id is null then
    raise exception 'combo not found' using errcode = 'P0002';
  end if;

  v_business_unit_id := app.combo_unit(p_combo_id);
  perform app.assert_admin_for(v_business_unit_id);

  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'combo composition must be an array' using errcode = '22023';
  end if;

  -- Archived sellable presentations retain their exact semantic composition.
  -- Sort order may change, but additions/removals/replacements/quantity changes
  -- under that presentation are rejected.
  if exists (
    select 1
    from public.product_variants presentation
    where presentation.product_id = v_combo_before.product_id
      and presentation.archived_at is not null
      and (
        exists (
          (select ci.product_variant_id, ci.quantity
           from public.combo_items ci
           where ci.combo_id = p_combo_id and ci.combo_product_variant_id = presentation.id)
          except
          (select (elem->>'product_variant_id')::uuid, (elem->>'quantity')::integer
           from jsonb_array_elements(p_items) elem
           where (elem->>'combo_product_variant_id')::uuid = presentation.id)
        )
        or exists (
          (select (elem->>'product_variant_id')::uuid, (elem->>'quantity')::integer
           from jsonb_array_elements(p_items) elem
           where (elem->>'combo_product_variant_id')::uuid = presentation.id)
          except
          (select ci.product_variant_id, ci.quantity
           from public.combo_items ci
           where ci.combo_id = p_combo_id and ci.combo_product_variant_id = presentation.id)
        )
      )
  ) then
    raise exception 'cannot change composition under an archived combo product variant'
      using errcode = '22023';
  end if;

  for item in select * from jsonb_array_elements(p_items)
  loop
    v_combo_variant_id := (item->>'combo_product_variant_id')::uuid;
    v_variant_id := (item->>'product_variant_id')::uuid;

    -- Existing composite identities remain representable after an ingredient
    -- variant or product is archived. The same ingredient in a new combo
    -- presentation is a new line and must still be active.
    if exists (
      select 1 from public.combo_items ci
      where ci.combo_id = p_combo_id
        and ci.combo_product_variant_id = v_combo_variant_id
        and ci.product_variant_id = v_variant_id
    ) then
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
    if v_variant_product_id = v_combo_before.product_id then
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

  select exists (
    (select ci.combo_product_variant_id, ci.product_variant_id, ci.quantity
     from public.combo_items ci where ci.combo_id = p_combo_id)
    except
    (select (elem->>'combo_product_variant_id')::uuid,
            (elem->>'product_variant_id')::uuid,
            (elem->>'quantity')::integer
     from jsonb_array_elements(p_items) elem)
  ) or exists (
    (select (elem->>'combo_product_variant_id')::uuid,
            (elem->>'product_variant_id')::uuid,
            (elem->>'quantity')::integer
     from jsonb_array_elements(p_items) elem)
    except
    (select ci.combo_product_variant_id, ci.product_variant_id, ci.quantity
     from public.combo_items ci where ci.combo_id = p_combo_id)
  ) into v_semantic_changed;

  update public.combos
  set composition_verification_status = case
        when v_semantic_changed
          and composition_verification_status in ('official_pdf', 'client_confirmed')
        then 'pending_reconfirmation'
        else composition_verification_status
      end,
      updated_at = now()
  where id = p_combo_id and updated_at = p_expected_updated_at
  returning * into v_combo_after;

  if v_combo_after.id is null then
    raise exception 'combo was modified by another session' using errcode = 'P2011';
  end if;

  select coalesce(jsonb_agg(to_jsonb(ci) order by ci.combo_product_variant_id, ci.sort_order), '[]'::jsonb)
    into v_before
  from public.combo_items ci where ci.combo_id = p_combo_id;

  delete from public.combo_items where combo_id = p_combo_id;

  insert into public.combo_items (
    combo_id, combo_product_variant_id, product_variant_id, quantity, sort_order
  )
  select p_combo_id,
    (elem->>'combo_product_variant_id')::uuid,
    (elem->>'product_variant_id')::uuid,
    (elem->>'quantity')::integer,
    (elem->>'sort_order')::integer
  from jsonb_array_elements(p_items) elem;

  select coalesce(jsonb_agg(to_jsonb(ci) order by ci.combo_product_variant_id, ci.sort_order), '[]'::jsonb)
    into v_after
  from public.combo_items ci where ci.combo_id = p_combo_id;

  perform app.write_audit_log(v_business_unit_id, 'composition_update', 'combo', p_combo_id, v_before, v_after);

  if v_combo_after.composition_verification_status is distinct from v_combo_before.composition_verification_status then
    perform app.write_audit_log(
      v_business_unit_id, 'verification_update', 'combo', p_combo_id,
      to_jsonb(v_combo_before), to_jsonb(v_combo_after)
    );
  end if;

  return query
  select * from public.combo_items
  where combo_id = p_combo_id
  order by combo_product_variant_id, sort_order;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_product_categories(p_product_id uuid, p_category_ids uuid[])
 RETURNS SETOF product_categories
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_category(p_category_id uuid, p_expected_updated_at timestamp with time zone, p_kind text, p_slug text, p_name text, p_description text, p_parent_id uuid, p_publication_status text, p_sort_order integer)
 RETURNS categories
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_combo_verification(p_combo_id uuid, p_expected_updated_at timestamp with time zone, p_composition_verification_status text)
 RETURNS combos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  if p_composition_verification_status not in ('pending_reconfirmation', 'client_confirmed', 'unknown') then
    raise exception 'verification status is not manually assignable' using errcode = '22023';
  end if;

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
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_inventory(p_variant_id uuid, p_expected_updated_at timestamp with time zone, p_inventory_mode text, p_availability_status text, p_quantity_on_hand integer)
 RETURNS inventory
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  if p_inventory_mode = 'tracked_quantity' and p_quantity_on_hand = 0 and p_availability_status = 'available' then
    raise exception 'zero tracked quantity cannot be available' using errcode = '22023';
  end if;

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
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_product(p_product_id uuid, p_expected_updated_at timestamp with time zone, p_slug text, p_name text, p_brand text, p_short_description text, p_description text, p_gender text, p_concentration text, p_sales_mode text, p_production_status text, p_publication_status text, p_is_featured boolean, p_featured_rank integer, p_featured_from timestamp with time zone, p_featured_until timestamp with time zone)
 RETURNS products
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_variant(p_variant_id uuid, p_expected_updated_at timestamp with time zone, p_label text, p_variant_kind text, p_size_ml numeric, p_price_amount numeric, p_currency character, p_sku text, p_publication_status text, p_sort_order integer, p_confirm_client_price boolean DEFAULT false)
 RETURNS product_variants
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_business_unit_id uuid;
  v_before public.product_variants;
  v_after public.product_variants;
  v_action text;
  v_new_verification_status text;
begin
  select * into v_before from public.product_variants where id = p_variant_id;
  if v_before.id is null then
    raise exception 'variant not found' using errcode = 'P0002';
  end if;

  v_business_unit_id := app.variant_unit(p_variant_id);
  perform app.assert_admin_for(v_business_unit_id);

  if p_confirm_client_price then
    -- 'official_pdf' authority comes only from the reconciled official
    -- source, never from a manual Admin choice. This RPC never produces
    -- 'official_pdf' and must never silently downgrade an existing one.
    if v_before.price_verification_status = 'official_pdf' then
      raise exception 'cannot manually override an official_pdf price verification status'
        using errcode = '22023';
    end if;
    v_new_verification_status := 'client_confirmed';
  else
    -- The operator changed the form (possibly the numeric price) without
    -- explicitly confirming it. The existing verification status —
    -- including 'provisional_market' — is preserved exactly. A numeric edit
    -- alone never implies client confirmation.
    v_new_verification_status := v_before.price_verification_status;
  end if;

  update public.product_variants set
    label = p_label,
    variant_kind = p_variant_kind,
    size_ml = p_size_ml,
    price_amount = p_price_amount,
    currency = p_currency,
    sku = p_sku,
    publication_status = p_publication_status,
    sort_order = p_sort_order,
    price_verification_status = v_new_verification_status
  where id = p_variant_id
    and updated_at = p_expected_updated_at
  returning * into v_after;

  if v_after.id is null then
    raise exception 'variant was modified by another session' using errcode = 'P2011';
  end if;

  -- The verification-status transition gets its own audit action —
  -- 'verification_update', the same action admin_update_combo_verification
  -- already uses for an analogous authority change — so it is observable
  -- separately from a cosmetic edit or a plain price_change. audit_log's
  -- action check constraint (audit_log_action_check) is the allow-list this
  -- must stay inside; it already includes 'verification_update'.
  v_action := case
    when v_after.price_verification_status is distinct from v_before.price_verification_status
      then 'verification_update'
    when v_after.price_amount is distinct from v_before.price_amount
      then 'price_change'
    else 'update'
  end;

  perform app.write_audit_log(v_business_unit_id, v_action, 'product_variant', p_variant_id, to_jsonb(v_before), to_jsonb(v_after));

  return v_after;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_wholesale_policy(p_policy_id uuid, p_expected_updated_at timestamp with time zone, p_min_quantity integer, p_discount_amount numeric, p_is_active boolean)
 RETURNS wholesale_policies
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

-- =============================================================================
-- B. Revoke authenticated direct DML on tables whose mutations must be
--    RPC-only (business_units: no admin-write policy exists either --
--    this only removes an already-RLS-blocked, unused grant)
-- =============================================================================

revoke insert, update, delete on public.business_units      from authenticated;
revoke insert, update, delete on public.categories           from authenticated;
revoke insert, update, delete on public.combo_items          from authenticated;
revoke insert, update, delete on public.combos               from authenticated;
revoke insert, update, delete on public.inventory            from authenticated;
revoke insert, update, delete on public.product_categories   from authenticated;
revoke insert, update, delete on public.product_variants     from authenticated;
revoke insert, update, delete on public.products             from authenticated;
revoke insert, update, delete on public.wholesale_policies   from authenticated;

comment on table public.inventory is
  'Gate A3: authenticated has SELECT only (RLS: inventory_admin_read). All writes go through public.admin_update_inventory (SECURITY DEFINER), the only path that enforces the tracked_quantity/available invariant and writes audit_log.';

-- =============================================================================
-- C. complaint_book_entries: anon SELECT is unused (public submission is
--    service-role-only via public_submit_complaint_entry; the only read
--    call site is the admin-only repository)
-- =============================================================================

revoke select on public.complaint_book_entries from anon;
