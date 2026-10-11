-- Concurrent complaint retries must serialize both persistence and created/replayed classification.
-- Preserve the legacy signature and its service-only ACL during rollout.
-- No business rows or policies are changed. Locks are scoped to business unit + attempt.
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

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'cruzial:complaint:v1:' || v_business_unit_id::text || ':' || p_request_id::text, 0));

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

create function public.public_submit_complaint_entry_v2(
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
returns table (entry jsonb, created boolean)
language plpgsql security invoker set search_path = '' as $$
declare
  v_business_unit_id uuid;
  v_row public.complaint_book_entries;
  v_existed boolean;
begin
  if p_request_id is null then raise exception 'request_id is required' using errcode='22023'; end if;
  select id into v_business_unit_id from public.business_units where code=p_business_unit_code;
  if v_business_unit_id is null then raise exception 'unknown business unit code' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'cruzial:complaint:v1:' || v_business_unit_id::text || ':' || p_request_id::text, 0));

  select exists(select 1 from public.complaint_book_entries
    where business_unit_id=v_business_unit_id and request_id=p_request_id) into v_existed;
  v_row := public.public_submit_complaint_entry(p_business_unit_code, p_request_id, p_complaint_type, p_full_name, p_document_type, p_document_number, p_address, p_phone, p_email, p_is_minor, p_guardian_full_name, p_guardian_document_number, p_order_reference, p_detail, p_consumer_request);
  return query select to_jsonb(v_row), not v_existed;
end $$;
revoke all on function public.public_submit_complaint_entry_v2(text,uuid,text,text,text,text,text,text,text,boolean,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.public_submit_complaint_entry_v2(text,uuid,text,text,text,text,text,text,text,boolean,text,text,text,text,text) to service_role;
comment on function public.public_submit_complaint_entry_v2 is 'Service-only atomic complaint receipt and creation outcome; the capability is resolved by the server action.';
