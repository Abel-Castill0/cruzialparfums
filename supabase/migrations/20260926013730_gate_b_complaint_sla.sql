-- Legal rule verified against Indecopi (2026-09-25): 15 non-extendable
-- business days for reclamos and quejas. See docs/gate-b-automation.md.
-- National holidays follow the current Peru statutory calendar. Voluntary
-- private-sector days off do not silently extend a consumer's deadline.
create function app.peru_easter_date(p_year integer) returns date
language plpgsql immutable strict set search_path='' as $$
declare a integer;b integer;c integer;d integer;e integer;f integer;g integer;h integer;
 i integer;k integer;l integer;m integer;n integer;
begin
 a:=p_year%19;b:=p_year/100;c:=p_year%100;d:=b/4;e:=b%4;f:=(b+8)/25;
 g:=(b-f+1)/3;h:=(19*a+b-d-g+15)%30;i:=c/4;k:=c%4;
 l:=(32+2*e+2*i-h-k)%7;m:=(a+11*h+22*l)/451;n:=h+l-7*m+114;
 return make_date(p_year,n/31,n%31+1);
end $$;
create function app.peru_is_business_day(p_date date) returns boolean
language sql immutable strict set search_path='' as $$
 select extract(isodow from p_date) between 1 and 5
  and (extract(month from p_date)::integer*100+extract(day from p_date)::integer)
   not in (101,501,607,629,723,728,729,806,830,1008,1101,1208,1209,1225)
  and p_date not in (app.peru_easter_date(extract(year from p_date)::integer)-3,
                    app.peru_easter_date(extract(year from p_date)::integer)-2);
$$;
create function app.complaint_sla_due_at(p_submitted_at timestamptz) returns timestamptz
language plpgsql stable strict set search_path='' as $$
declare v_date date:=(p_submitted_at at time zone 'America/Lima')::date;v_days integer:=0;
begin
 while v_days<15 loop
  v_date:=v_date+1;
  if app.peru_is_business_day(v_date) then v_days:=v_days+1; end if;
 end loop;
 return (v_date+time '23:59:59') at time zone 'America/Lima';
end $$;
create function app.complaint_reminder_at(p_due_at timestamptz,p_business_days integer) returns timestamptz
language plpgsql stable strict set search_path='' as $$
declare v_date date:=(p_due_at at time zone 'America/Lima')::date;v_days integer:=0;
begin
 if p_business_days not between 1 and 7 then raise exception 'invalid reminder interval' using errcode='22023'; end if;
 while v_days<p_business_days loop
  v_date:=v_date-1;
  if app.peru_is_business_day(v_date) then v_days:=v_days+1; end if;
 end loop;
 return v_date::timestamp at time zone 'America/Lima';
end $$;
revoke all on function app.peru_easter_date(integer) from public,anon,authenticated;
revoke all on function app.peru_is_business_day(date) from public,anon,authenticated;
revoke all on function app.complaint_sla_due_at(timestamptz) from public,anon,authenticated;
revoke all on function app.complaint_reminder_at(timestamptz,integer) from public,anon,authenticated;

insert into public.settings(business_unit_id,key,value,is_public)
select id,'operations_automation',jsonb_build_object('operationsPhone','','complaintReminderBusinessDays',3),false
from public.business_units where code in ('parfums','import')
on conflict(business_unit_id,key) do nothing;

alter table public.complaint_book_entries
 add column submitted_at timestamptz generated always as (created_at) stored,
 add column due_at timestamptz,
 add column approaching_at timestamptz,
 add column sla_rule text not null default 'peru-15-business-days-2026';
update public.complaint_book_entries set due_at=app.complaint_sla_due_at(created_at),
 approaching_at=app.complaint_reminder_at(app.complaint_sla_due_at(created_at),3);
alter table public.complaint_book_entries alter column due_at set not null,
 alter column approaching_at set not null,
 add constraint complaint_sla_dates_check check (due_at>created_at and approaching_at<due_at);
create index complaint_sla_unresolved_idx on public.complaint_book_entries(business_unit_id,due_at)
 where status<>'resolved';

create function app.complaint_sla_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_days integer;
begin
 if tg_op='INSERT' then
  select (value->>'complaintReminderBusinessDays')::integer into v_days from public.settings
  where business_unit_id=new.business_unit_id and key='operations_automation';
  new.due_at:=app.complaint_sla_due_at(new.created_at);
  new.approaching_at:=app.complaint_reminder_at(new.due_at,coalesce(v_days,3));
  new.sla_rule:='peru-15-business-days-2026';
 elsif new.created_at is distinct from old.created_at or new.due_at is distinct from old.due_at
    or new.sla_rule is distinct from old.sla_rule then
  raise exception 'complaint legal deadline is immutable' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function app.complaint_sla_guard() from public,anon,authenticated;
create trigger complaint_sla_guard before insert or update on public.complaint_book_entries
 for each row execute function app.complaint_sla_guard();

create or replace function public.admin_update_operations_settings(
 p_unit_code text,p_expected_updated_at timestamptz,p_operations_phone text,p_reminder_business_days integer
) returns public.settings language plpgsql security definer set search_path='' as $$
declare v_unit uuid;v_before public.settings;v_after public.settings;v_changed integer;v_recovered integer:=0;
 v_phone text:=app.normalize_import_phone(coalesce(p_operations_phone,''));
begin
 select id into v_unit from public.business_units where code=p_unit_code;
 perform app.assert_admin_for(v_unit);
 if v_phone<>'' and v_phone !~ '^9[0-9]{8}$' and v_phone !~ '^519[0-9]{8}$'
   or p_reminder_business_days is null or p_reminder_business_days not between 1 and 7 then
  raise exception 'invalid operations settings' using errcode='22023'; end if;
 select * into v_before from public.settings where business_unit_id=v_unit and key='operations_automation' for update;
 if v_before.id is null then raise exception 'operations setting not found' using errcode='P0002'; end if;
 if v_before.updated_at is distinct from p_expected_updated_at then
  raise exception 'operations settings changed' using errcode='P2011'; end if;
 update public.settings set value=jsonb_build_object('operationsPhone',v_phone,
  'complaintReminderBusinessDays',p_reminder_business_days),is_public=false,updated_by=auth.uid()
 where id=v_before.id returning * into v_after;
 update public.complaint_book_entries set approaching_at=app.complaint_reminder_at(due_at,p_reminder_business_days)
 where business_unit_id=v_unit and status<>'resolved';
 get diagnostics v_changed=row_count;
 if v_phone<>'' then
  update public.notification_outbox set
   recipient=case when length(v_phone)=9 then '51'||v_phone else v_phone end,
   status='queued',last_error_safe=null,next_attempt_at=now()
  where business_unit_id=v_unit and event_type in ('complaint_approaching','complaint_overdue')
   and status='blocked' and last_error_safe='recipient_unavailable';
  get diagnostics v_recovered=row_count;
 end if;
 perform app.write_audit_log(v_unit,'settings_change','settings',v_after.id,
  jsonb_build_object('operations_phone_configured',coalesce(v_before.value->>'operationsPhone','')<>'',
   'reminder_business_days',v_before.value->>'complaintReminderBusinessDays'),
  jsonb_build_object('operations_phone_configured',v_phone<>'','reminder_business_days',p_reminder_business_days,
   'reminders_updated',v_changed,'notifications_recovered',v_recovered));
 return v_after;
end $$;
revoke all on function public.admin_update_operations_settings(text,timestamptz,text,integer) from public,anon;
grant execute on function public.admin_update_operations_settings(text,timestamptz,text,integer) to authenticated;

create or replace function public.worker_enqueue_complaint_milestones() returns void
language plpgsql security definer set search_path='' as $$
declare v_entry record;
begin
 for v_entry in
  select c.id,c.business_unit_id,c.due_at,s.value->>'operationsPhone' as operations_phone
  from public.complaint_book_entries c left join public.settings s
   on s.business_unit_id=c.business_unit_id and s.key='operations_automation'
  where c.status<>'resolved' and c.approaching_at<=now() and not exists (
   select 1 from public.notification_outbox n where n.business_unit_id=c.business_unit_id
    and n.entity_type='complaint' and n.entity_id=c.id
    and n.event_type=case when c.due_at<now() then 'complaint_overdue' else 'complaint_approaching' end
  )
  order by c.due_at,c.id limit 200
 loop
  perform app.enqueue_notification(v_entry.business_unit_id,
   case when v_entry.due_at<now() then 'complaint_overdue' else 'complaint_approaching' end,
   'complaint',v_entry.id,v_entry.operations_phone,v_entry.id::text);
 end loop;
end $$;
revoke all on function public.worker_enqueue_complaint_milestones() from public,anon,authenticated;
grant execute on function public.worker_enqueue_complaint_milestones() to service_role;

alter table public.notification_outbox drop constraint notification_outbox_status_check;
alter table public.notification_outbox add constraint notification_outbox_status_check
 check(status in ('queued','claimed','sending','retry','blocked','sent','failed','uncertain','cancelled'));
create function app.cancel_closed_complaint_reminders() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
 if new.status='resolved' and old.status<>'resolved' then
  update public.notification_outbox set status='cancelled',lease_token=null,lease_expires_at=null
  where business_unit_id=new.business_unit_id and entity_type='complaint' and entity_id=new.id
   and event_type in ('complaint_approaching','complaint_overdue')
   and status in ('queued','claimed','retry','blocked','failed');
  get diagnostics v_count=row_count;
  if v_count>0 then
   insert into public.audit_log(business_unit_id,actor_user_id,action,entity_type,entity_id,after)
   values(new.business_unit_id,auth.uid(),'update','complaint_reminder',new.id,
    jsonb_build_object('cancelled_jobs',v_count));
  end if;
 end if;
 return new;
end $$;
revoke all on function app.cancel_closed_complaint_reminders() from public,anon,authenticated;
create trigger complaint_cancel_closed_reminders after update of status on public.complaint_book_entries
 for each row execute function app.cancel_closed_complaint_reminders();
-- Existing complaint resolution emits this action; preserve the prior vocabulary.
alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check check (action in (
 'create','update','archive','restore','publish','unpublish','price_change','inventory_change',
 'campaign_state_change','order_state_change','settings_change','membership_change',
 'customer_verification_change','composition_update','verification_update','wholesale.policy_update',
 'wholesale.enable','wholesale.disable','primary_change','reorder','complaint_status_change'
));
