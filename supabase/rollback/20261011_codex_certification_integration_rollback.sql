-- Rollback for 20261011120000_complaint_submission_atomic_result, 20261011120100_notification_legacy_dispatch_guard
-- and 20261011120200_complaint_milestone_backlog_progress. NEVER edit the applied migrations; apply this as a NEW
-- forward migration if a rollback is ever required.
-- ORDER: first roll the application back to a commit that does not call the *_v2 functions (anything before the
-- integration of codex/final/cruzial-certification-fixes), THEN apply this. The previous bodies are copied verbatim
-- (generated) from the migrations that last defined them. No data is touched; CREATE OR REPLACE keeps the ACLs of the
-- legacy signatures.

begin;

-- previous body from 20260921010000_business_legal_and_complaints.sql
create or replace function public.public_submit_complaint_entry(
  p_business_unit_code text,
  p_request_id uuid,
  p_complaint_type text,
  p_full_name text,
  p_document_type text,
  p_document_number text,
  p_address text,
  p_phone text,
  p_email text,
  p_is_minor boolean,
  p_guardian_full_name text,
  p_guardian_document_number text,
  p_order_reference text,
  p_detail text,
  p_consumer_request text
)
returns public.complaint_book_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_unit_id uuid;
  v_row public.complaint_book_entries;
begin
  if p_request_id is null then
    raise exception 'request_id is required' using errcode = '22023';
  end if;

  select id into v_business_unit_id from public.business_units where code = p_business_unit_code;
  if v_business_unit_id is null then
    raise exception 'unknown business unit code %', p_business_unit_code using errcode = '22023';
  end if;

  -- Idempotent on (business_unit_id, request_id) — a client retry never
  -- creates a duplicate entry.
  select * into v_row
  from public.complaint_book_entries
  where business_unit_id = v_business_unit_id and request_id = p_request_id;

  if found then
    return v_row;
  end if;

  if p_complaint_type not in ('reclamo', 'queja') then
    raise exception 'complaint_type must be reclamo or queja' using errcode = '22023';
  end if;

  if p_document_type not in ('dni', 'ce', 'pasaporte') then
    raise exception 'invalid document type' using errcode = '22023';
  end if;

  if length(btrim(coalesce(p_full_name, ''))) < 2 then
    raise exception 'full name is required' using errcode = '22023';
  end if;

  if length(btrim(coalesce(p_document_number, ''))) < 4 then
    raise exception 'document number is required' using errcode = '22023';
  end if;

  if length(btrim(coalesce(p_address, ''))) < 4 then
    raise exception 'address is required' using errcode = '22023';
  end if;

  if regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') !~ '^[0-9]{9,15}$' then
    raise exception 'a valid phone is required (9-15 digits)' using errcode = '22023';
  end if;

  if coalesce(p_email, '') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'a valid email is required' using errcode = '22023';
  end if;

  if coalesce(p_is_minor, false) and (
    length(btrim(coalesce(p_guardian_full_name, ''))) < 2
    or length(btrim(coalesce(p_guardian_document_number, ''))) < 4
  ) then
    raise exception 'guardian name and document are required for a minor consumer' using errcode = '22023';
  end if;

  if length(btrim(coalesce(p_detail, ''))) < 10 then
    raise exception 'detail must describe the complaint (at least 10 characters)' using errcode = '22023';
  end if;

  if length(btrim(coalesce(p_consumer_request, ''))) < 5 then
    raise exception 'consumer_request is required (what resolution are you asking for)' using errcode = '22023';
  end if;

  -- Reject oversized submissions before writing anything. Truncating a
  -- complaint and returning success would discard part of the consumer's
  -- statement or requested remedy without their knowledge.
  if char_length(btrim(p_detail)) > 4000 then
    raise exception 'detail exceeds 4000 characters' using errcode = '22023';
  end if;
  if char_length(btrim(p_consumer_request)) > 2000 then
    raise exception 'consumer_request exceeds 2000 characters' using errcode = '22023';
  end if;
  if char_length(btrim(p_full_name)) > 200
     or char_length(btrim(p_document_number)) > 20
     or char_length(btrim(p_address)) > 300
     or char_length(btrim(p_email)) > 254
     or char_length(btrim(coalesce(p_guardian_full_name, ''))) > 200
     or char_length(btrim(coalesce(p_guardian_document_number, ''))) > 20
     or char_length(btrim(coalesce(p_order_reference, ''))) > 60 then
    raise exception 'complaint identity or reference field exceeds its maximum length' using errcode = '22023';
  end if;

  insert into public.complaint_book_entries (
    business_unit_id, request_id, complaint_type, full_name, document_type,
    document_number, address, phone, email, is_minor, guardian_full_name,
    guardian_document_number, order_reference, detail, consumer_request
  ) values (
    v_business_unit_id, p_request_id, p_complaint_type,
    btrim(p_full_name), p_document_type, btrim(p_document_number),
    btrim(p_address), regexp_replace(p_phone, '[^0-9]', '', 'g'),
    btrim(p_email), coalesce(p_is_minor, false),
    nullif(btrim(coalesce(p_guardian_full_name, '')), ''),
    nullif(btrim(coalesce(p_guardian_document_number, '')), ''),
    nullif(btrim(coalesce(p_order_reference, '')), ''),
    btrim(p_detail), btrim(p_consumer_request)
  )
  returning * into v_row;

  return v_row;
end;
$$;

-- previous body from 20260926090000_gate_b_notification_dispatch_authorization.sql
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

-- previous body from 20260926050000_gate_b_complaint_milestone_race.sql
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

drop function if exists public.public_submit_complaint_entry_v2(text,uuid,text,text,text,text,text,text,text,boolean,text,text,text,text,text);
drop function if exists public.worker_begin_notification_v2(uuid,uuid);
commit;
