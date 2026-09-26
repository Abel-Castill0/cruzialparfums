-- Filter already-enqueued milestones BEFORE the batch limit; otherwise 200 open complaints starve every later complaint.
-- The complaint-first lock order, locked eligibility recheck, ACL and event idempotency are unchanged.
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
      and not exists (
        select 1 from public.notification_outbox n
        where n.business_unit_id=c.business_unit_id and n.entity_type='complaint'
          and n.entity_id=c.id
          and n.event_type=case when c.due_at < now() then 'complaint_overdue' else 'complaint_approaching' end
      )
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
