-- Each business retains its public RPC and transition semantics. The internal
-- mechanism adds target-state replay handling without bypassing unit/AAL2 auth.
create function app.transition_order_for_unit(
  p_unit_code text, p_order_id uuid, p_expected_status text,
  p_new_status text, p_reason text
) returns public.orders language plpgsql security definer set search_path = '' as $$
declare v_unit uuid; v_before public.orders; v_after public.orders;
begin
  select id into v_unit from public.business_units where code = p_unit_code;
  perform app.assert_admin_for(v_unit);
  if p_expected_status is null or p_expected_status not in
    ('pending_whatsapp_confirmation','confirmed','fulfilled','cancelled')
    or p_new_status is null or p_new_status not in
    ('pending_whatsapp_confirmation','confirmed','fulfilled','cancelled') then
    raise exception 'invalid order status' using errcode = '22023';
  end if;
  select * into v_before from public.orders
  where id = p_order_id and business_unit_id = v_unit for update;
  if v_before.id is null then raise exception 'order not found' using errcode = 'P0002'; end if;
  if v_before.archived_at is not null then
    raise exception 'archived order cannot change status' using errcode = 'P2024';
  end if;
  -- Desired state already reached: no inventory, event, timestamp or audit
  -- mutation is repeated, including a retry after the first response was lost.
  if v_before.status = p_new_status then return v_before; end if;
  if v_before.status <> p_expected_status then
    raise exception 'order status changed since expected' using errcode = 'P2020';
  end if;
  if not ((v_before.status = 'pending_whatsapp_confirmation' and p_new_status in ('confirmed','cancelled'))
    or (v_before.status = 'confirmed' and p_new_status in ('fulfilled','cancelled'))) then
    raise exception 'invalid order transition' using errcode = 'P2023';
  end if;
  if p_new_status = 'cancelled' and (p_reason is null or length(btrim(p_reason)) < 3 or length(p_reason) > 300) then
    raise exception 'cancellation reason is required (3-300 chars)' using errcode = 'P2025';
  end if;
  perform set_config('app.allow_order_status_change','1',true);
  update public.orders set status = p_new_status where id = p_order_id returning * into v_after;
  perform app.write_audit_log(v_unit,'order_state_change','order',p_order_id,
    jsonb_build_object('status',v_before.status,'order_number',v_before.order_number,'reason',p_reason),
    jsonb_build_object('status',v_after.status,'order_number',v_after.order_number,'reason',p_reason));
  return v_after;
end $$;
revoke all on function app.transition_order_for_unit(text,uuid,text,text,text) from public,anon,authenticated;

create or replace function public.admin_parfums_update_order_status(
  p_order_id uuid, p_expected_status text, p_new_status text, p_reason text default null
) returns public.orders language sql security definer set search_path = '' as $$
  select app.transition_order_for_unit('parfums',p_order_id,p_expected_status,p_new_status,p_reason);
$$;
create or replace function public.admin_import_update_order_status(
  p_order_id uuid, p_expected_status text, p_new_status text, p_reason text default null
) returns public.orders language sql security definer set search_path = '' as $$
  select app.transition_order_for_unit('import',p_order_id,p_expected_status,p_new_status,p_reason);
$$;
revoke all on function public.admin_parfums_update_order_status(uuid,text,text,text) from public,anon;
revoke all on function public.admin_import_update_order_status(uuid,text,text,text) from public,anon;
grant execute on function public.admin_parfums_update_order_status(uuid,text,text,text) to authenticated;
grant execute on function public.admin_import_update_order_status(uuid,text,text,text) to authenticated;
