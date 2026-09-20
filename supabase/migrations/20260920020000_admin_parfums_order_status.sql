-- Release: minimal Parfums order status lifecycle.
--
-- Today every Parfums web order request is created as
-- `pending_whatsapp_confirmation` and stays that way forever — the admin
-- Pedidos screen (Phase 4E2) is read-only. This closes the loop with the
-- same pattern already proven for Import
-- (20260911100000/100100/100200_import_admin_operations*.sql):
--
--   pending_whatsapp_confirmation -> confirmed | cancelled
--   confirmed                     -> fulfilled | cancelled
--   fulfilled / cancelled         -> terminal
--
-- `draft` is intentionally excluded from every branch below: no Parfums
-- order request is ever created in `draft` today, and this RPC does not
-- invent a transition into or out of it.
--
-- Authorization, locking, concurrency and audit follow
-- admin_import_update_order_status exactly: assert_admin_for() before any
-- row read (no existence oracle), `for update` row lock, expected-status
-- concurrency guard (P2020), unit resolved from the order row itself (never
-- a client-supplied parameter), and an app.write_audit_log() entry.
-- app.freeze_order_snapshot() (20260911100200) already allows this status
-- change via the `app.allow_order_status_change` session signal — no
-- trigger change needed here.

create or replace function public.admin_parfums_update_order_status(
  p_order_id uuid,
  p_expected_status text,
  p_new_status text,
  p_reason text default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parfums_unit_id uuid;
  v_before public.orders;
  v_after public.orders;
begin
  -- Resolve Parfums business unit (never a parameter)
  select id into v_parfums_unit_id from public.business_units where code = 'parfums';
  if v_parfums_unit_id is null then
    raise exception 'parfums business unit is not provisioned' using errcode = 'P0002';
  end if;

  -- Authorize BEFORE reading target row (prevents existence oracle)
  perform app.assert_admin_for(v_parfums_unit_id);

  -- Load order with row-level lock, unit verified from the row itself
  select * into v_before from public.orders
  where id = p_order_id
    and business_unit_id = v_parfums_unit_id
  for update;

  if v_before.id is null then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  -- Archived orders are immutable
  if v_before.archived_at is not null then
    raise exception 'archived order cannot change status' using errcode = 'P2024';
  end if;

  -- Concurrency check: expected status must match current
  if v_before.status <> p_expected_status then
    raise exception 'order status changed since expected (expected %, got %)',
      p_expected_status, v_before.status using errcode = 'P2020';
  end if;

  -- Validate status values
  if p_expected_status not in (
    'pending_whatsapp_confirmation', 'confirmed', 'fulfilled', 'cancelled'
  ) then
    raise exception 'invalid expected status %', p_expected_status using errcode = '22023';
  end if;

  if p_new_status not in (
    'pending_whatsapp_confirmation', 'confirmed', 'fulfilled', 'cancelled'
  ) then
    raise exception 'invalid new status %', p_new_status using errcode = '22023';
  end if;

  -- Validate transition
  if v_before.status = 'pending_whatsapp_confirmation'
     and p_new_status not in ('confirmed', 'cancelled') then
    raise exception 'invalid transition from % to %', v_before.status, p_new_status
      using errcode = 'P2023';
  end if;

  if v_before.status = 'confirmed'
     and p_new_status not in ('fulfilled', 'cancelled') then
    raise exception 'invalid transition from % to %', v_before.status, p_new_status
      using errcode = 'P2023';
  end if;

  if v_before.status in ('fulfilled', 'cancelled') then
    raise exception 'terminal order cannot change status' using errcode = 'P2023';
  end if;

  -- Cancellation requires a reason
  if p_new_status = 'cancelled' then
    if p_reason is null or length(trim(p_reason)) < 3 then
      raise exception 'cancellation reason is required (min 3 chars)' using errcode = 'P2025';
    end if;
    if length(p_reason) > 300 then
      raise exception 'cancellation reason too long (max 300 chars)' using errcode = 'P2025';
    end if;
  end if;

  -- Perform status update (signal freeze_order_snapshot to allow status change)
  perform set_config('app.allow_order_status_change', '1', true);
  update public.orders set
    status = p_new_status,
    updated_at = now()
  where id = p_order_id
    and status = p_expected_status
  returning * into v_after;

  if v_after.id is null then
    raise exception 'order was modified by another session' using errcode = 'P2020';
  end if;

  -- Append audit entry
  perform app.write_audit_log(
    v_parfums_unit_id,
    'order_state_change',
    'order',
    p_order_id,
    jsonb_build_object(
      'status', v_before.status,
      'order_number', v_before.order_number,
      'reason', p_reason
    ),
    jsonb_build_object(
      'status', v_after.status,
      'order_number', v_after.order_number,
      'reason', p_reason
    )
  );

  return v_after;
end;
$$;

revoke all on function public.admin_parfums_update_order_status(uuid, text, text, text) from public, anon;
grant execute on function public.admin_parfums_update_order_status(uuid, text, text, text) to authenticated;
