-- Fixes a real integrity gap found in independent review: app.reserve_
-- tracked_order_line() returned immediately for inventory_mode='status_only'
-- without checking availability_status, so an admin-flagged out-of-stock
-- status_only variant (inventory.availability_status='out_of_stock') was
-- fully orderable through the real Parfums order-request RPC, which never
-- joins public.inventory at all (it only checks products.availability_status
-- and publication_status, a separate product-level field). A variant with
-- no inventory row at all (legacy/untracked) still behaves as before:
-- allowed, since no admin has ever marked it either way.
create or replace function app.reserve_tracked_order_line() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders;
  v_inventory public.inventory;
  v_variant_unit uuid;
begin
  if new.product_variant_id is null then return new; end if;
  select * into v_order from public.orders where id = new.order_id;
  select p.business_unit_id into v_variant_unit
  from public.product_variants v join public.products p on p.id = v.product_id
  where v.id = new.product_variant_id and p.id = new.product_id;
  if v_variant_unit is null or v_variant_unit <> v_order.business_unit_id then
    raise exception 'order line belongs to a different business unit or product' using errcode = 'P2004';
  end if;
  if v_order.status not in ('draft', 'pending_whatsapp_confirmation') then
    raise exception 'cannot add a line to an accepted order' using errcode = 'P2023';
  end if;
  select * into v_inventory from public.inventory
  where product_variant_id = new.product_variant_id for update;
  if v_inventory.id is null then return new; end if;
  if v_inventory.availability_status <> 'available' then
    raise exception 'variant is marked out of stock' using errcode = 'P2034';
  end if;
  if v_inventory.inventory_mode = 'status_only' then return new; end if;
  if v_inventory.quantity_on_hand - v_inventory.reserved_quantity < new.quantity then
    raise exception 'tracked quantity is unavailable' using errcode = 'P2034';
  end if;
  update public.inventory set reserved_quantity = reserved_quantity + new.quantity
  where id = v_inventory.id;
  insert into public.inventory_reservations
    (business_unit_id, order_id, order_line_id, inventory_id, quantity)
  values (v_order.business_unit_id, new.order_id, new.id, v_inventory.id, new.quantity);
  insert into public.audit_log
    (business_unit_id, actor_user_id, action, entity_type, entity_id, before, after)
  values (v_order.business_unit_id, auth.uid(), 'inventory_change', 'inventory_reservation', v_inventory.id,
    jsonb_build_object('reserved_quantity', v_inventory.reserved_quantity),
    jsonb_build_object('reserved_quantity', v_inventory.reserved_quantity + new.quantity, 'order_id', new.order_id));
  return new;
end $$;
