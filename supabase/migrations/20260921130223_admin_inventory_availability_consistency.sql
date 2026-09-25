-- Preserve existing authorization, optimistic concurrency and audit logging.
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
$$;

revoke all on function public.admin_update_inventory(uuid, timestamptz, text, text, integer) from public, anon;
grant execute on function public.admin_update_inventory(uuid, timestamptz, text, text, integer) to authenticated;
