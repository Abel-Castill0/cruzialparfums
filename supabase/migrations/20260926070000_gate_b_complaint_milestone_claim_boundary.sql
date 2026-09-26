-- Follow-up to gate_b_complaint_milestone_race.sql: that fix closes the
-- enqueue-vs-resolve race (a resolution committing between the worker's
-- unlocked candidate read and its notification insert). Independent review
-- correctly identified a second, later boundary it does not cover:
--
--   worker enqueues -> transaction commits -> a delivery worker claims the
--   notification and enters 'sending' -> admin resolves the complaint.
--
-- cancel_closed_complaint_reminders() only cancels
-- status IN ('queued','claimed','retry','blocked','failed') -- it has never
-- touched 'sending' or 'sent', deliberately: by the time a row is 'sending'
-- the delivery worker has (or is about to) call the actual WhatsApp API, so
-- flipping it to 'cancelled' underneath that in-flight call would not stop
-- the message that already went out, and would race
-- worker_finish_notification's own status check (it requires
-- status IN ('claimed','sending') and raises 'notification lease is
-- invalid' otherwise), corrupting the delivery worker's own bookkeeping for
-- a send that may have already succeeded. That part of the finding is real
-- but is intentionally NOT "fixed" by cancelling sending -- doing so would
-- trade a rare stale internal alert (the recipient is settings.
-- operationsPhone, Cruzial's own staff, never the consumer) for a worse,
-- provider-facing ambiguity. The lease is bounded (2 minutes, see
-- worker_claim_notifications) and begin/finish are called back-to-back
-- around a single API call, so the exposure window is small in practice.
--
-- The finding's more serious tail IS fixed here: if that in-flight send
-- fails and the row cycles back to 'retry' (or a lease simply expires back
-- to 'retry'/'queued'), cancel_closed_complaint_reminders never fires again
-- -- it only runs on the complaint's own status UPDATE, which already
-- happened once and missed this row because it was 'sending' at that
-- instant. Without this fix such a row would sit eligible for
-- worker_claim_notifications forever and could genuinely be retried (and
-- eventually sent) at any point in the future, no matter how long after
-- the complaint was resolved. Fixed by having worker_claim_notifications
-- itself lazily cancel any complaint-milestone row that is back in a
-- claimable state but whose complaint already resolved, before it ever
-- selects candidates -- closing the loop deterministically on every claim
-- cycle instead of depending solely on the one-shot trigger.
create or replace function public.worker_claim_notifications(p_batch integer default 5)
returns setof public.notification_outbox language plpgsql security invoker set search_path = '' as $$
begin
  update public.notification_outbox set status='uncertain',last_error_safe='delivery_uncertain',
    lease_token=null,lease_expires_at=null
  where status='sending' and lease_expires_at < now();
  update public.notification_outbox set status='retry',last_error_safe='worker_lease_expired',
    lease_token=null,lease_expires_at=null,next_attempt_at=now()
  where status='claimed' and lease_expires_at < now();
  -- A resolution that landed while this row was 'sending' (missed by the
  -- one-shot trigger) leaves it back in 'retry'/'queued' once the in-flight
  -- attempt settles. Catch it here so it can never be retried indefinitely.
  update public.notification_outbox n set status='cancelled',lease_token=null,lease_expires_at=null
  where n.status in ('queued','retry') and n.entity_type='complaint'
    and n.event_type in ('complaint_approaching','complaint_overdue')
    and exists (
      select 1 from public.complaint_book_entries c
      where c.id = n.entity_id and c.status = 'resolved'
    );
  return query with candidates as (
    select id from public.notification_outbox
    where status in ('queued','retry') and attempts < 5 and next_attempt_at <= now()
    order by next_attempt_at,created_at,id for update skip locked
    limit greatest(1,least(coalesce(p_batch,5),10))
  ) update public.notification_outbox n
    set status='claimed',lease_token=gen_random_uuid(),lease_expires_at=now()+interval '2 minutes'
    from candidates c where n.id=c.id returning n.*;
end $$;
