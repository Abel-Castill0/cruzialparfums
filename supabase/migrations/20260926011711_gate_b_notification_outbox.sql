create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  event_type text not null,
  entity_type text not null check (entity_type in ('order','complaint')),
  entity_id uuid not null,
  channel text not null default 'whatsapp' check (channel in ('whatsapp','email')),
  recipient text,
  template_key text not null,
  template_data jsonb not null default '{}'::jsonb check (jsonb_typeof(template_data)='object'),
  status text not null default 'queued' check (status in ('queued','claimed','sending','retry','blocked','sent','failed','uncertain')),
  attempts integer not null default 0 check (attempts between 0 and 5),
  next_attempt_at timestamptz not null default now(),
  last_error_safe text check (last_error_safe is null or last_error_safe in (
    'provider_not_configured','recipient_unavailable','provider_rejected','provider_rate_limited',
    'provider_unavailable','provider_timeout','delivery_uncertain','worker_lease_expired','internal_error')),
  provider_message_id text unique,
  delivery_status text check (delivery_status in ('sent','delivered','read','failed')),
  delivery_updated_at timestamptz,
  idempotency_key text not null unique,
  lease_token uuid,
  lease_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);
create index notification_outbox_due_idx on public.notification_outbox(next_attempt_at,created_at)
  where status in ('queued','retry');
create index notification_outbox_unit_entity_idx on public.notification_outbox(business_unit_id,entity_type,entity_id);
create index notification_outbox_lease_idx on public.notification_outbox(lease_expires_at)
  where status in ('claimed','sending');
create trigger notification_outbox_updated_at before update on public.notification_outbox
  for each row execute function app.set_updated_at();
alter table public.notification_outbox enable row level security;
revoke all on public.notification_outbox from public,anon,authenticated;
grant select,insert,update on public.notification_outbox to service_role;

create table public.notification_delivery_events (
  provider_message_id text not null,
  status text not null check (status in ('sent','delivered','read','failed')),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  primary key(provider_message_id,status,occurred_at)
);
alter table public.notification_delivery_events enable row level security;
revoke all on public.notification_delivery_events from public,anon,authenticated;
grant select,insert on public.notification_delivery_events to service_role;

create function public.worker_record_delivery(p_message_id text,p_status text,p_occurred_at timestamptz)
returns void language plpgsql security invoker set search_path = '' as $$
begin
 if p_message_id is null or length(p_message_id) not between 1 and 200
    or p_status is null or p_status not in ('sent','delivered','read','failed') or p_occurred_at is null then
   raise exception 'invalid delivery event' using errcode='22023'; end if;
 insert into public.notification_delivery_events(provider_message_id,status,occurred_at)
 values(p_message_id,p_status,p_occurred_at) on conflict do nothing;
 update public.notification_outbox set delivery_status=p_status,delivery_updated_at=p_occurred_at
 where provider_message_id=p_message_id and (
  delivery_status is null or
  (p_status='read' and delivery_status<>'read') or
  (p_status='delivered' and delivery_status in ('sent','failed')) or
  (p_status='failed' and delivery_status='sent') or
  (p_status=delivery_status and (delivery_updated_at is null or p_occurred_at>delivery_updated_at))
 );
end $$;
revoke all on function public.worker_record_delivery(text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.worker_record_delivery(text,text,timestamptz) to service_role;

create table public.automation_worker_health (
  worker text primary key check (worker = 'notifications'),
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_status text check (last_status in ('running','ok','failed')),
  processed_count integer not null default 0 check (processed_count >= 0)
);
insert into public.automation_worker_health(worker) values ('notifications');
alter table public.automation_worker_health enable row level security;
revoke all on public.automation_worker_health from public,anon,authenticated;
grant select,update on public.automation_worker_health to service_role;

create or replace function app.enqueue_notification(
 p_unit uuid,p_event text,p_entity_type text,p_entity_id uuid,p_recipient text,p_reference text
) returns void language plpgsql security definer set search_path = '' as $$
declare v_recipient text := app.normalize_import_phone(p_recipient);
begin
  -- Preserve the customer identity normalizer. Delivery uses the already
  -- approved Peru mobile contract; an unknown country is never guessed.
  if v_recipient ~ '^9[0-9]{8}$' then v_recipient := '51' || v_recipient;
  elsif v_recipient !~ '^519[0-9]{8}$' then v_recipient := null; end if;
  insert into public.notification_outbox
    (business_unit_id,event_type,entity_type,entity_id,recipient,template_key,template_data,
     status,last_error_safe,idempotency_key)
  values (p_unit,p_event,p_entity_type,p_entity_id,v_recipient,p_event,
    jsonb_build_object('reference',p_reference),
    case when v_recipient is null then 'blocked' else 'queued' end,
    case when v_recipient is null then 'recipient_unavailable' else null end,
    p_unit::text || ':' || p_entity_type || ':' || p_entity_id::text || ':' || p_event)
  on conflict (idempotency_key) do nothing;
end $$;
revoke all on function app.enqueue_notification(uuid,text,text,uuid,text,text) from public,anon,authenticated;

create function app.enqueue_business_notification() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_event text;
begin
  if tg_op = 'UPDATE' and new.status = old.status then return new; end if;
  if tg_table_name = 'orders' then
    v_event := case new.status when 'pending_whatsapp_confirmation' then 'order_received'
      when 'confirmed' then 'order_confirmed' when 'cancelled' then 'order_cancelled'
      when 'fulfilled' then 'order_fulfilled' end;
    if v_event is not null then
      perform app.enqueue_notification(new.business_unit_id,v_event,'order',new.id,
        new.customer_snapshot->>'phone',new.order_number);
    end if;
  else
    v_event := case when tg_op = 'INSERT' then 'complaint_received'
      when new.status = 'resolved' then 'complaint_resolved' end;
    if v_event is not null then
      perform app.enqueue_notification(new.business_unit_id,v_event,'complaint',new.id,new.phone,new.id::text);
    end if;
  end if;
  return new;
end $$;
revoke all on function app.enqueue_business_notification() from public,anon,authenticated;
create trigger order_enqueue_notification after insert or update of status on public.orders
  for each row execute function app.enqueue_business_notification();
create trigger complaint_enqueue_notification after insert or update of status on public.complaint_book_entries
  for each row execute function app.enqueue_business_notification();

-- Expired claims are safe to retry only before the send intent was recorded.
-- Expired sending leases become uncertain: a provider may have accepted a
-- request whose response was lost. They are never automatically resent.
create function public.worker_claim_notifications(p_batch integer default 5)
returns setof public.notification_outbox language plpgsql security invoker set search_path = '' as $$
begin
  update public.notification_outbox set status='uncertain',last_error_safe='delivery_uncertain',
    lease_token=null,lease_expires_at=null
  where status='sending' and lease_expires_at < now();
  update public.notification_outbox set status='retry',last_error_safe='worker_lease_expired',
    lease_token=null,lease_expires_at=null,next_attempt_at=now()
  where status='claimed' and lease_expires_at < now();
  return query with candidates as (
    select id from public.notification_outbox
    where status in ('queued','retry') and attempts < 5 and next_attempt_at <= now()
    order by next_attempt_at,created_at,id for update skip locked
    limit greatest(1,least(coalesce(p_batch,5),10))
  ) update public.notification_outbox n
    set status='claimed',lease_token=gen_random_uuid(),lease_expires_at=now()+interval '2 minutes'
    from candidates c where n.id=c.id returning n.*;
end $$;

create function public.worker_begin_notification(p_id uuid,p_lease_token uuid)
returns public.notification_outbox language plpgsql security invoker set search_path = '' as $$
declare v_row public.notification_outbox;
begin
 update public.notification_outbox set status='sending',attempts=attempts+1
 where id=p_id and lease_token=p_lease_token and status='claimed'
   and lease_expires_at > now() and attempts < 5 returning * into v_row;
 if v_row.id is null then raise exception 'notification lease is invalid' using errcode='P2036'; end if;
 return v_row;
end $$;

create function public.worker_finish_notification(
 p_id uuid,p_lease_token uuid,p_outcome text,p_error_safe text default null,p_provider_message_id text default null
) returns void language plpgsql security invoker set search_path = '' as $$
declare v_row public.notification_outbox;
begin
 select * into v_row from public.notification_outbox where id=p_id for update;
 if v_row.id is null or v_row.lease_token is distinct from p_lease_token
    or v_row.status not in ('claimed','sending') then
   raise exception 'notification lease is invalid' using errcode='P2036';
 end if;
 if p_outcome not in ('sent','retry','failed','blocked','uncertain') or p_outcome is null
    or (p_outcome='sent' and (v_row.status<>'sending' or nullif(p_provider_message_id,'') is null)) then
   raise exception 'invalid notification outcome' using errcode='22023';
 end if;
 update public.notification_outbox set
   status=case when p_outcome='retry' and attempts>=5 then 'failed' else p_outcome end,
   last_error_safe=p_error_safe,provider_message_id=p_provider_message_id,
   delivery_status=case when p_outcome='sent' then 'sent' else null end,
   sent_at=case when p_outcome='sent' then now() else null end,
   next_attempt_at=now()+make_interval(secs=>least(3600,30*power(2,greatest(attempts-1,0)))::integer),
   lease_token=null,lease_expires_at=null where id=p_id;
 if p_outcome='sent' then
   -- Webhooks can arrive before the send result is committed.
   update public.notification_outbox n set delivery_status=e.status,delivery_updated_at=e.occurred_at
   from (select status,occurred_at from public.notification_delivery_events
     where provider_message_id=p_provider_message_id
     order by case status when 'read' then 4 when 'delivered' then 3 when 'failed' then 2 else 1 end desc,
       occurred_at desc limit 1) e where n.id=p_id;
 end if;
end $$;

create function public.worker_record_health(p_status text,p_processed integer default 0)
returns void language plpgsql security invoker set search_path = '' as $$
begin
 if p_status not in ('running','ok','failed') or p_processed not between 0 and 10 then
  raise exception 'invalid worker health' using errcode='22023'; end if;
 update public.automation_worker_health set last_status=p_status,
  last_started_at=case when p_status='running' then now() else last_started_at end,
  last_finished_at=case when p_status<>'running' then now() else last_finished_at end,
  processed_count=p_processed where worker='notifications';
end $$;

create function public.admin_list_notifications(p_business_unit_code text,p_entity_id uuid default null)
returns table(id uuid,event_type text,entity_type text,entity_id uuid,status text,attempts integer,
 last_error_safe text,created_at timestamptz,updated_at timestamptz,sent_at timestamptz,delivery_status text)
language plpgsql security definer set search_path = '' as $$
declare v_unit uuid;
begin
 select u.id into v_unit from public.business_units u where u.code=p_business_unit_code;
 if not app.can_read_unit(v_unit) then raise exception 'unit access denied' using errcode='42501'; end if;
 return query select n.id,n.event_type,n.entity_type,n.entity_id,n.status,n.attempts,n.last_error_safe,
  n.created_at,n.updated_at,n.sent_at,n.delivery_status from public.notification_outbox n
 where n.business_unit_id=v_unit and (p_entity_id is null or n.entity_id=p_entity_id)
 order by n.created_at desc,n.id limit 100;
end $$;

create function public.admin_retry_notification(
 p_business_unit_code text,p_id uuid,p_expected_updated_at timestamptz,p_verified_not_sent boolean default false
) returns void language plpgsql security definer set search_path = '' as $$
declare v_unit uuid;v_before public.notification_outbox;
begin
 select id into v_unit from public.business_units where code=p_business_unit_code;
 perform app.assert_admin_for(v_unit);
 select * into v_before from public.notification_outbox where id=p_id and business_unit_id=v_unit for update;
 if v_before.id is null then raise exception 'notification not found' using errcode='P0002'; end if;
 if v_before.updated_at is distinct from p_expected_updated_at then
  raise exception 'notification changed' using errcode='P2011'; end if;
 if v_before.status not in ('blocked','failed','retry','uncertain')
    or (v_before.status='uncertain' and not coalesce(p_verified_not_sent,false)) then
  raise exception 'notification cannot be safely retried' using errcode='22023'; end if;
 if v_before.recipient is null then raise exception 'recipient is unavailable' using errcode='22023'; end if;
 update public.notification_outbox set status='queued',attempts=0,next_attempt_at=now(),last_error_safe=null,
  lease_token=null,lease_expires_at=null where id=p_id;
 perform app.write_audit_log(v_unit,'update','notification_retry',p_id,
  jsonb_build_object('status',v_before.status,'attempts',v_before.attempts),
  jsonb_build_object('status','queued','verified_not_sent',p_verified_not_sent));
end $$;

revoke all on function public.worker_claim_notifications(integer) from public,anon,authenticated;
revoke all on function public.worker_begin_notification(uuid,uuid) from public,anon,authenticated;
revoke all on function public.worker_finish_notification(uuid,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.worker_record_health(text,integer) from public,anon,authenticated;
grant execute on function public.worker_claim_notifications(integer) to service_role;
grant execute on function public.worker_begin_notification(uuid,uuid) to service_role;
grant execute on function public.worker_finish_notification(uuid,uuid,text,text,text) to service_role;
grant execute on function public.worker_record_health(text,integer) to service_role;
revoke all on function public.admin_list_notifications(text,uuid) from public,anon;
revoke all on function public.admin_retry_notification(text,uuid,timestamptz,boolean) from public,anon;
grant execute on function public.admin_list_notifications(text,uuid) to authenticated;
grant execute on function public.admin_retry_notification(text,uuid,timestamptz,boolean) to authenticated;
