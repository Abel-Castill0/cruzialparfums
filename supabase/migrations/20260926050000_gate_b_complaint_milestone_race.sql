-- Fixes a real race found in independent review: worker_enqueue_complaint_
-- milestones() selected candidate complaints without locking them, so a
-- concurrent resolution that committed between that unlocked read and the
-- notification insert left a freshly-queued reminder for an
-- already-resolved complaint. cancel_closed_complaint_reminders() (the
-- existing trigger) only cancels notifications that already exist at the
-- moment resolution commits -- it cannot cancel one inserted afterward.
--
-- Fix: lock each candidate row (FOR UPDATE) and re-check status/
-- approaching_at/existing-notification under that lock before enqueueing.
-- This closes both interleavings: if a resolution is still in-flight when
-- the worker reaches this row, FOR UPDATE blocks until it commits or rolls
-- back, then the worker sees the authoritative post-resolution state; if
-- the worker locks first, the resolution's own UPDATE (which needs the same
-- row's lock) waits for the worker's transaction to finish, and the
-- existing cancellation trigger then correctly cancels what the worker just
-- queued. No sleeps; the lock itself is the synchronization.
create or replace function public.worker_enqueue_complaint_milestones() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_candidate record;
  v_locked public.complaint_book_entries;
  v_event text;
  v_operations_phone text;
begin
  for v_candidate in
    select c.id
    from public.complaint_book_entries c
    where c.status <> 'resolved' and c.approaching_at <= now()
    order by c.due_at, c.id
    limit 200
  loop
    select * into v_locked from public.complaint_book_entries where id = v_candidate.id for update;
    continue when v_locked.status = 'resolved' or v_locked.approaching_at > now();
    v_event := case when v_locked.due_at < now() then 'complaint_overdue' else 'complaint_approaching' end;
    continue when exists (
      select 1 from public.notification_outbox n
      where n.business_unit_id = v_locked.business_unit_id and n.entity_type = 'complaint'
        and n.entity_id = v_locked.id and n.event_type = v_event
    );
    select s.value ->> 'operationsPhone' into v_operations_phone
    from public.settings s
    where s.business_unit_id = v_locked.business_unit_id and s.key = 'operations_automation';
    perform app.enqueue_notification(v_locked.business_unit_id, v_event, 'complaint', v_locked.id,
      v_operations_phone, v_locked.id::text);
  end loop;
end $$;
