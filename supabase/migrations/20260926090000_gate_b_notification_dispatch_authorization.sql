-- Gate B F5: an explicit, auditable dispatch commit point for notifications.
--
-- The outbox already had the right shape (claimed -> sending -> sent/retry/
-- failed/uncertain), but the claimed -> sending transition
-- (worker_begin_notification) did not re-check the one business fact that
-- makes a complaint milestone pointless: that the complaint is still open.
-- A resolution committed after the claim but before the provider call could
-- therefore still produce an "approaching/overdue" alert.
--
-- worker_begin_notification IS the dispatch commit point from now on:
--
--   * For complaint milestones it first takes the complaint row lock
--     (FOR SHARE) and only then the outbox row — the same global order used by
--     worker_enqueue_complaint_milestones (complaint FOR UPDATE -> outbox
--     insert) and by the resolution path (complaint UPDATE -> trigger ->
--     outbox), so no lock inversion/deadlock is introduced. FOR SHARE
--     conflicts with the resolution's row update, so the two serialize:
--       - resolution committed first  -> begin sees 'resolved' and CANCELS
--         (status 'cancelled', reason 'resolved_before_dispatch'); the worker
--         receives that row and must not call the provider.
--       - begin committed first       -> the row is 'sending' with
--         dispatch_authorized_at set; the provider call is legitimately in
--         flight and is recorded truthfully as sent/retry/failed/uncertain.
--         (A later failed attempt that returns to 'retry' is cancelled by the
--         claim-time sweep of 20260926070000 and re-checked here again.)
--   * It never holds a transaction open across the network call: it commits
--     the authorization and returns; the provider call happens afterwards.
--   * A row the resolution trigger already cancelled (resolution committed
--     between claim and begin) is returned as 'cancelled' instead of raising
--     a lease error, so the worker skips it without a false health failure.
--   * 'sent' and 'uncertain' are never cancelled or re-sent by this change.

alter table public.notification_outbox add column dispatch_authorized_at timestamptz;

comment on column public.notification_outbox.dispatch_authorized_at is
  'When worker_begin_notification authorized the provider call (the dispatch commit point).';

alter table public.notification_outbox drop constraint notification_outbox_last_error_safe_check;
alter table public.notification_outbox add constraint notification_outbox_last_error_safe_check
  check (last_error_safe is null or last_error_safe in (
    'provider_not_configured','recipient_unavailable','provider_rejected','provider_rate_limited',
    'provider_unavailable','provider_timeout','delivery_uncertain','worker_lease_expired','internal_error',
    'resolved_before_dispatch'));

create or replace function public.worker_begin_notification(p_id uuid, p_lease_token uuid)
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

comment on function public.worker_begin_notification(uuid, uuid) is
  'Dispatch commit point: returns the authoritative row. status=sending authorizes exactly one provider '
  'call; status=cancelled (resolved_before_dispatch) forbids it.';
