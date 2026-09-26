-- Gate B: a reservation is one order line's claim on tracked physical stock.
-- Stock is decremented only when the order is fulfilled. Every action is in
-- the same transaction as the order insert or status change.
alter table public.inventory
  add column reserved_quantity integer not null default 0,
  add constraint inventory_reserved_quantity_check check (
    reserved_quantity >= 0 and
    ((inventory_mode = 'status_only' and reserved_quantity = 0) or
     (inventory_mode = 'tracked_quantity' and reserved_quantity <= quantity_on_hand))
  );

create table public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  order_line_id uuid not null unique references public.order_lines(id) on delete restrict,
  inventory_id uuid not null references public.inventory(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  status text not null default 'reserved' check (status in ('reserved','released','consumed')),
  created_at timestamptz not null default now(),
  released_at timestamptz,
  consumed_at timestamptz,
  constraint inventory_reservation_terminal_time_check check (
    (status = 'reserved' and released_at is null and consumed_at is null) or
    (status = 'released' and released_at is not null and consumed_at is null) or
    (status = 'consumed' and consumed_at is not null and released_at is null)
  )
);
create index inventory_reservations_order_idx on public.inventory_reservations(order_id, status);
create index inventory_reservations_inventory_idx on public.inventory_reservations(inventory_id, status);
alter table public.inventory_reservations enable row level security;
create policy inventory_reservations_unit_read on public.inventory_reservations
  for select to authenticated using (app.can_read_unit(business_unit_id));
revoke all on public.inventory_reservations from public, anon, authenticated;
grant select on public.inventory_reservations to authenticated;

create table public.order_status_events (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  from_status text,
  to_status text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now()
);
create index order_status_events_order_idx on public.order_status_events(order_id, occurred_at);
alter table public.order_status_events enable row level security;
create policy order_status_events_unit_read on public.order_status_events
  for select to authenticated using (app.can_read_unit(business_unit_id));
revoke all on public.order_status_events from public, anon, authenticated;
grant select on public.order_status_events to authenticated;

create function app.reserve_tracked_order_line() returns trigger
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
  if v_inventory.id is null or v_inventory.inventory_mode = 'status_only' then return new; end if;
  if v_inventory.availability_status <> 'available'
     or v_inventory.quantity_on_hand - v_inventory.reserved_quantity < new.quantity then
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
revoke all on function app.reserve_tracked_order_line() from public, anon, authenticated;
create trigger order_line_reserve_tracked_inventory
  after insert on public.order_lines for each row execute function app.reserve_tracked_order_line();

create function app.apply_order_inventory_transition() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_reservation public.inventory_reservations;
  v_inventory public.inventory;
  v_new_status text;
begin
  if new.status = old.status then return new; end if;
  if not (
    (old.status = 'draft' and new.status = 'pending_whatsapp_confirmation') or
    (old.status = 'pending_whatsapp_confirmation' and new.status in ('confirmed','cancelled')) or
    (old.status = 'confirmed' and new.status in ('fulfilled','cancelled'))
  ) then
    raise exception 'invalid order transition' using errcode = 'P2023';
  end if;
  insert into public.order_status_events
    (business_unit_id, order_id, from_status, to_status, actor_user_id)
  values (new.business_unit_id, new.id, old.status, new.status, auth.uid());
  if new.status not in ('cancelled', 'fulfilled') then return new; end if;
  for v_reservation in
    select * from public.inventory_reservations
    where order_id = new.id and status = 'reserved'
    order by inventory_id, id for update
  loop
    select * into v_inventory from public.inventory where id = v_reservation.inventory_id for update;
    if v_inventory.id is null or v_inventory.inventory_mode <> 'tracked_quantity'
       or v_inventory.reserved_quantity < v_reservation.quantity then
      raise exception 'inventory reservation is inconsistent' using errcode = 'P2035';
    end if;
    if new.status = 'cancelled' then
      update public.inventory set reserved_quantity = reserved_quantity - v_reservation.quantity
      where id = v_inventory.id;
      update public.inventory_reservations set status = 'released', released_at = now()
      where id = v_reservation.id;
      v_new_status := 'released';
    else
      update public.inventory
      set reserved_quantity = reserved_quantity - v_reservation.quantity,
          quantity_on_hand = quantity_on_hand - v_reservation.quantity,
          availability_status = case when quantity_on_hand = v_reservation.quantity
            then 'out_of_stock' else availability_status end
      where id = v_inventory.id;
      update public.inventory_reservations set status = 'consumed', consumed_at = now()
      where id = v_reservation.id;
      v_new_status := 'consumed';
    end if;
    insert into public.audit_log
      (business_unit_id, actor_user_id, action, entity_type, entity_id, before, after)
    values (new.business_unit_id, auth.uid(), 'inventory_change', 'inventory_reservation', v_inventory.id,
      jsonb_build_object('reserved_quantity', v_inventory.reserved_quantity,
                         'quantity_on_hand', v_inventory.quantity_on_hand),
      jsonb_build_object('reservation_id', v_reservation.id, 'state', v_new_status,
                         'order_id', new.id));
  end loop;
  return new;
end $$;
revoke all on function app.apply_order_inventory_transition() from public, anon, authenticated;
create trigger order_inventory_status_transition
  after update of status on public.orders for each row
  execute function app.apply_order_inventory_transition();
