-- Cruzial Platform V2 -- Gate A correction: inventory invariant must hold on CREATE, not only on UPDATE
--
-- admin_update_inventory (20260921130223) rejects tracked_quantity +
-- quantity_on_hand=0 + availability_status=available, but
-- admin_create_variant inserts a caller-supplied inventory_mode/
-- quantity_on_hand/availability_status combination directly, guarded only
-- by inventory_quantity_check (which enforces mode/quantity SHAPE --
-- null-vs-not-null, non-negative -- not this specific business rule). A
-- variant could therefore be CREATED in the exact state
-- admin_update_inventory refuses to transition an existing row into.
--
-- Fix, in the same "authoritative DB invariant, friendly RPC guard on top"
-- shape already used elsewhere in this schema:
--   1. A table-level CHECK constraint makes the rule impossible to violate
--      through ANY write path -- the RPC layer, not just RLS/grants, is
--      now backed by the database itself for this specific rule.
--   2. admin_create_variant gets the same explicit, friendly guard
--      admin_update_inventory already has, so the RPC's error is a
--      deterministic 22023 with a clear message instead of a raw 23514
--      constraint-violation bubbling up from the INSERT.
--
-- admin_update_inventory's own guard is unchanged -- this does not weaken
-- it, it makes the same rule additionally authoritative at the DB level.
--
-- Verified against the current local fixture data (post Gate A migrations,
-- pre this one) before adding the constraint: zero existing inventory rows
-- match tracked_quantity + quantity_on_hand=0 + available.

-- =============================================================================
-- A. Authoritative DB-level invariant
-- =============================================================================

alter table public.inventory
  add constraint inventory_tracked_zero_not_available_check
  check (
    not (
      inventory_mode = 'tracked_quantity'
      and quantity_on_hand = 0
      and availability_status = 'available'
    )
  );

comment on constraint inventory_tracked_zero_not_available_check on public.inventory is
  'Gate A correction: a tracked variant with zero quantity on hand can never be marked available, through any write path -- not just the admin_update_inventory RPC guard.';

-- =============================================================================
-- B. Friendly RPC guard on the create path, matching admin_update_inventory
-- =============================================================================

create or replace function public.admin_create_variant(
  p_product_id uuid,
  p_label text,
  p_variant_kind text,
  p_size_ml numeric,
  p_price_amount numeric,
  p_currency character default 'PEN'::bpchar,
  p_sku text default null::text,
  p_publication_status text default 'draft'::text,
  p_sort_order integer default 0,
  p_inventory_mode text default 'status_only'::text,
  p_availability_status text default 'available'::text,
  p_quantity_on_hand integer default null::integer
)
returns product_variants
language plpgsql
security definer
set search_path to ''
as $function$
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

  if p_inventory_mode = 'tracked_quantity' and p_quantity_on_hand = 0 and p_availability_status = 'available' then
    raise exception 'zero tracked quantity cannot be available' using errcode = '22023';
  end if;

  insert into public.product_variants (
    product_id, label, variant_kind, size_ml, price_amount, currency,
    sku, publication_status, sort_order
  ) values (
    p_product_id, p_label, p_variant_kind, p_size_ml, p_price_amount, p_currency,
    p_sku, p_publication_status, p_sort_order
  )
  returning * into v_variant;

  -- inventory_quantity_check (status_only requires a null quantity,
  -- tracked_quantity requires a non-null one) and
  -- inventory_tracked_zero_not_available_check are enforced by the
  -- database itself here, not just by this function's input validation.
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
