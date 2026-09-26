-- The old application treats any non-error begin response as permission to send.
-- Keep that signature fail-closed, while v2 returns a cancelled row truthfully.
-- Apply while workers are quiesced: migration 090000 changes the legacy contract
-- until this append-only compatibility guard is installed.
create function public.worker_begin_notification_v2(p_id uuid, p_lease_token uuid)
returns public.notification_outbox
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row public.notification_outbox;
  v_guarded boolean;
  v_complaint_status text;
begin
  -- Unlocked read only to learn which entity guards this dispatch; every
  -- decision below is re-validated under locks, taken complaint -> outbox.
  select (n.entity_type = 'complaint' and n.event_type in ('complaint_approaching', 'complaint_overdue'))
    into v_guarded
    from public.notification_outbox n where n.id = p_id;
  if v_guarded is null then
    raise exception 'notification lease is invalid' using errcode = 'P2036';
  end if;

  if v_guarded then
    select c.status into v_complaint_status
      from public.complaint_book_entries c
      join public.notification_outbox n on n.entity_id = c.id and n.business_unit_id = c.business_unit_id
     where n.id = p_id
       for share of c;
  end if;

  select * into v_row from public.notification_outbox where id = p_id for update;

  -- A resolution that committed after the claim already cancelled this row
  -- through app.cancel_closed_complaint_reminders (which clears the lease).
  -- That is a definitive "do not dispatch", not a worker fault: return it so
  -- the caller skips the provider without reporting a false failure. Only a
  -- terminal cancelled row is returned this way; nothing sensitive is exposed
  -- beyond what service_role can already read.
  if v_row.status = 'cancelled' then
    return v_row;
  end if;

  if v_row.lease_token is distinct from p_lease_token or v_row.status <> 'claimed'
     or v_row.lease_expires_at <= now() or v_row.attempts >= 5 then
    raise exception 'notification lease is invalid' using errcode = 'P2036';
  end if;

  if v_guarded and (v_complaint_status is null or v_complaint_status = 'resolved') then
    update public.notification_outbox
       set status = 'cancelled', last_error_safe = 'resolved_before_dispatch',
           lease_token = null, lease_expires_at = null
     where id = p_id
    returning * into v_row;
    return v_row;  -- status 'cancelled': the caller must not dispatch.
  end if;

  update public.notification_outbox
     set status = 'sending', attempts = attempts + 1, dispatch_authorized_at = now()
   where id = p_id
  returning * into v_row;
  return v_row;
end $$;
revoke all on function public.worker_begin_notification_v2(uuid,uuid) from public,anon,authenticated;
grant execute on function public.worker_begin_notification_v2(uuid,uuid) to service_role;
create or replace function public.worker_begin_notification(p_id uuid,p_lease_token uuid)
returns public.notification_outbox language plpgsql security invoker set search_path='' as $$
declare v_row public.notification_outbox;
begin
 v_row := public.worker_begin_notification_v2(p_id,p_lease_token);
 if v_row.status is distinct from 'sending' then
  raise exception 'notification dispatch was cancelled' using errcode='P2037';
 end if;
 return v_row;
end $$;
comment on function public.worker_begin_notification(uuid,uuid) is 'Legacy dispatch boundary: only a sending row can produce a successful response; cancelled authorization raises P2037.';
comment on function public.worker_begin_notification_v2(uuid,uuid) is 'Service-only dispatch commit point: sending authorizes one call, cancelled forbids any call.';
