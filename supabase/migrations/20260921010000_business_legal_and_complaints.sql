-- Cruzial Platform V2 — Final Product Completion Sprint
--
-- Two independent, additive features:
--
-- 1. `business_legal` settings key — the admin-configurable legal/policy
--    identity (legal name, RUC, address, claims contact, policy copy) that
--    was previously nowhere in the schema. Extends the existing typed
--    settings infrastructure (20260908170000_admin_settings_public_contact.sql)
--    exactly the way its own header comment says future keys should: a new
--    branch in app.validate_settings_value, a new typed RPC, seeded neutral
--    rows for both business units. Every field starts blank/neutral — never
--    a fabricated RUC or legal name. The client fills these in later from
--    Admin > Configuración.
--
-- 2. Virtual Libro de Reclamaciones (complaint book) — a real, persisted
--    consumer complaint/queja channel per business unit, modeled on the
--    fields INDECOPI's virtual complaint book format actually asks for
--    (consumer identity, minor/guardian data when applicable, complaint
--    type, detail, the consumer's concrete request). This migration does
--    NOT assert any government registration number or legal certification —
--    it only provides the functional tool. Public submission goes through a
--    service-role-only RPC (same architecture as create_import_order_request
--    / create_parfums_order_request — never a direct anon table write), and
--    is rate-limited by reusing the existing generic
--    check_order_request_rate_limit sliding-window limiter (it is keyed by
--    business_unit_code + request_id + ip_hash + phone_hash, none of which
--    are order-specific). Admin reads go through ordinary RLS
--    (can_read_unit), matching the orders/order_lines read pattern; the
--    admin status-change mutation goes through its own audited RPC.

-- =========================================================================
-- SECTION 1: business_legal setting
-- =========================================================================

create or replace function app.validate_settings_value()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.key = 'public_contact' then
    if new.value is null or jsonb_typeof(new.value) <> 'object' then
      raise exception 'public_contact settings value must be a JSON object' using errcode = '22023';
    end if;

    if (
      select array_agg(key order by key) from jsonb_object_keys(new.value) key
    ) is distinct from array['contactEmail', 'whatsappDisplay', 'whatsappNumber'] then
      raise exception 'public_contact settings value must contain exactly whatsappNumber, whatsappDisplay, contactEmail'
        using errcode = '22023';
    end if;

    if new.value->>'whatsappNumber' !~ '^[1-9][0-9]{7,14}$' then
      raise exception 'whatsappNumber must be E.164 digits without a leading +' using errcode = '22023';
    end if;

    if length(trim(both from coalesce(new.value->>'whatsappDisplay', ''))) not between 1 and 40 then
      raise exception 'whatsappDisplay must be 1-40 characters' using errcode = '22023';
    end if;

    if new.value->>'contactEmail' !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
       or length(new.value->>'contactEmail') > 254 then
      raise exception 'contactEmail must be a valid email address' using errcode = '22023';
    end if;
  elsif new.key = 'business_legal' then
    if new.value is null or jsonb_typeof(new.value) <> 'object' then
      raise exception 'business_legal settings value must be a JSON object' using errcode = '22023';
    end if;

    if (
      select array_agg(key order by key) from jsonb_object_keys(new.value) key
    ) is distinct from array[
      'address', 'claimsEmail', 'claimsPhone', 'exchangePolicy',
      'legalName', 'paymentMethodsNote', 'ruc'
    ] then
      raise exception 'business_legal settings value must contain exactly legalName, ruc, address, claimsEmail, claimsPhone, exchangePolicy, paymentMethodsNote'
        using errcode = '22023';
    end if;

    -- Every field is optional (blank until the client fills it in from
    -- Admin) EXCEPT that whichever ones ARE present as non-empty strings
    -- must be well-formed — an admin cannot save a garbled RUC or an
    -- invalid claims email, but an intentionally blank field is not an
    -- error (the public page omits that block instead of showing garbage).
    if new.value->>'ruc' is not null and length(new.value->>'ruc') > 0
       and new.value->>'ruc' !~ '^[0-9]{11}$' then
      raise exception 'ruc must be blank or exactly 11 digits' using errcode = '22023';
    end if;

    if new.value->>'claimsEmail' is not null and length(new.value->>'claimsEmail') > 0
       and (new.value->>'claimsEmail' !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
         or length(new.value->>'claimsEmail') > 254) then
      raise exception 'claimsEmail must be blank or a valid email address' using errcode = '22023';
    end if;

    if length(coalesce(new.value->>'legalName', '')) > 200
       or length(coalesce(new.value->>'address', '')) > 300
       or length(coalesce(new.value->>'claimsPhone', '')) > 40
       or length(coalesce(new.value->>'exchangePolicy', '')) > 4000
       or length(coalesce(new.value->>'paymentMethodsNote', '')) > 1000 then
      raise exception 'business_legal field exceeds its maximum length' using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

insert into public.settings (business_unit_id, key, value, is_public)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'business_legal',
    jsonb_build_object(
      'legalName', '', 'ruc', '', 'address', '',
      'claimsEmail', '', 'claimsPhone', '',
      'exchangePolicy', '', 'paymentMethodsNote', ''
    ),
    true
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'business_legal',
    jsonb_build_object(
      'legalName', '', 'ruc', '', 'address', '',
      'claimsEmail', '', 'claimsPhone', '',
      'exchangePolicy', '', 'paymentMethodsNote', ''
    ),
    true
  )
on conflict (business_unit_id, key) do nothing;

create or replace function public.admin_update_business_legal_setting(
  p_business_unit_code text,
  p_expected_updated_at timestamptz,
  p_legal_name text,
  p_ruc text,
  p_address text,
  p_claims_email text,
  p_claims_phone text,
  p_exchange_policy text,
  p_payment_methods_note text
)
returns public.settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_unit_id uuid;
  v_before public.settings;
  v_after public.settings;
  v_new_value jsonb;
begin
  select id into v_business_unit_id from public.business_units where code = p_business_unit_code;
  if v_business_unit_id is null then
    raise exception 'unknown business unit code %', p_business_unit_code using errcode = '22023';
  end if;

  perform app.assert_admin_for(v_business_unit_id);

  select * into v_before
  from public.settings
  where business_unit_id = v_business_unit_id and key = 'business_legal';

  if v_before.id is null then
    raise exception 'business_legal setting not found for this business unit' using errcode = 'P0002';
  end if;

  v_new_value := jsonb_build_object(
    'legalName', left(btrim(coalesce(p_legal_name, '')), 200),
    'ruc', left(btrim(coalesce(p_ruc, '')), 11),
    'address', left(btrim(coalesce(p_address, '')), 300),
    'claimsEmail', left(btrim(coalesce(p_claims_email, '')), 254),
    'claimsPhone', left(btrim(coalesce(p_claims_phone, '')), 40),
    'exchangePolicy', left(btrim(coalesce(p_exchange_policy, '')), 4000),
    'paymentMethodsNote', left(btrim(coalesce(p_payment_methods_note, '')), 1000)
  );

  update public.settings
  set value = v_new_value,
      updated_by = auth.uid()
  where id = v_before.id and updated_at = p_expected_updated_at
  returning * into v_after;

  if v_after.id is null then
    raise exception 'setting was modified by another session' using errcode = '40001';
  end if;

  perform app.write_audit_log(
    v_after.business_unit_id,
    'settings_change',
    'settings',
    v_after.id,
    jsonb_build_object('key', v_before.key, 'value', v_before.value),
    jsonb_build_object('key', v_after.key, 'value', v_after.value)
  );

  return v_after;
end;
$$;

revoke all on function public.admin_update_business_legal_setting(text, timestamptz, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.admin_update_business_legal_setting(text, timestamptz, text, text, text, text, text, text, text) to authenticated;

comment on function public.admin_update_business_legal_setting is
  'Sole write path for the business_legal setting (legal name, RUC, address, '
  'claims contact, exchange policy, payment methods note) — every field '
  'optional/blank until the business owner fills it in. Same shape as '
  'admin_update_public_contact_setting: server-resolved unit, '
  'app.assert_admin_for, updated_at optimistic concurrency, atomic audit '
  'entry, updated_by always auth.uid().';

-- =========================================================================
-- SECTION 2: Virtual Libro de Reclamaciones (complaint book)
-- =========================================================================

create table public.complaint_book_entries (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units (id) on delete restrict,
  request_id uuid not null,
  status text not null default 'received',
  complaint_type text not null,
  full_name text not null,
  document_type text not null,
  document_number text not null,
  address text not null,
  phone text not null,
  email text not null,
  is_minor boolean not null default false,
  guardian_full_name text,
  guardian_document_number text,
  order_reference text,
  detail text not null,
  consumer_request text not null,
  admin_notes text,
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint complaint_book_entries_unit_request_unique unique (business_unit_id, request_id),
  constraint complaint_book_entries_status_check
    check (status in ('received', 'in_review', 'resolved')),
  constraint complaint_book_entries_type_check
    check (complaint_type in ('reclamo', 'queja')),
  constraint complaint_book_entries_document_type_check
    check (document_type in ('dni', 'ce', 'pasaporte')),
  constraint complaint_book_entries_guardian_check
    check (not is_minor or (guardian_full_name is not null and guardian_document_number is not null)),
  constraint complaint_book_entries_resolved_provenance_check
    check (status <> 'resolved' or resolved_at is not null)
);

create index complaint_book_entries_unit_status_idx
  on public.complaint_book_entries (business_unit_id, status, created_at desc);

create trigger complaint_book_entries_set_updated_at
  before update on public.complaint_book_entries
  for each row execute function app.set_updated_at();

alter table public.complaint_book_entries enable row level security;

-- Admin read only — same shape as orders_admin_read. No anon/authenticated
-- write policy at all: the only insert path is the SECURITY DEFINER RPC
-- below (service_role only, mirroring create_import_order_request), and the
-- only update path is admin_update_complaint_status further below.
create policy complaint_book_entries_admin_read on public.complaint_book_entries
  for select to authenticated
  using (app.can_read_unit(business_unit_id));

revoke insert, update, delete on public.complaint_book_entries from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Public submission — service-role only, same architecture as
-- create_import_order_request. Rate limiting is enforced by the Next.js
-- server action calling check_order_request_rate_limit before this RPC
-- (that RPC is business-unit/request-id/ip/phone generic, not order-
-- specific, despite its name — reused as-is rather than duplicating a
-- second limiter table).
-- ---------------------------------------------------------------------------

create function public.public_submit_complaint_entry(
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

revoke all on function public.public_submit_complaint_entry(
  text, uuid, text, text, text, text, text, text, text, boolean, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.public_submit_complaint_entry(
  text, uuid, text, text, text, text, text, text, text, boolean, text, text, text, text, text
) to service_role;

comment on function public.public_submit_complaint_entry is
  'Service-only public complaint/queja submission (Virtual Libro de '
  'Reclamaciones), same architecture as create_import_order_request: '
  'server-resolved business unit, idempotent on (business_unit_id, '
  'request_id), full server-side validation. Rate limiting happens one '
  'layer up (Next.js server action calling check_order_request_rate_limit) '
  'before this RPC is ever invoked.';

-- ---------------------------------------------------------------------------
-- Admin status update — audited, optimistic concurrency.
-- ---------------------------------------------------------------------------

create function public.admin_update_complaint_status(
  p_id uuid,
  p_expected_updated_at timestamptz,
  p_status text,
  p_admin_notes text
)
returns public.complaint_book_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.complaint_book_entries;
  v_after public.complaint_book_entries;
begin
  if p_status not in ('received', 'in_review', 'resolved') then
    raise exception 'invalid status' using errcode = '22023';
  end if;

  select * into v_before from public.complaint_book_entries where id = p_id;
  if v_before.id is null then
    raise exception 'complaint entry not found' using errcode = 'P0002';
  end if;

  perform app.assert_admin_for(v_before.business_unit_id);

  update public.complaint_book_entries
  set status = p_status,
      admin_notes = nullif(left(btrim(coalesce(p_admin_notes, '')), 2000), ''),
      resolved_at = case when p_status = 'resolved' then coalesce(resolved_at, now()) else null end,
      resolved_by = case when p_status = 'resolved' then auth.uid() else null end
  where id = p_id and updated_at = p_expected_updated_at
  returning * into v_after;

  if v_after.id is null then
    raise exception 'complaint entry was modified by another session' using errcode = 'P2011';
  end if;

  perform app.write_audit_log(
    v_after.business_unit_id,
    'complaint_status_change',
    'complaint_book_entries',
    v_after.id,
    jsonb_build_object('status', v_before.status),
    jsonb_build_object('status', v_after.status)
  );

  return v_after;
end;
$$;

revoke all on function public.admin_update_complaint_status(uuid, timestamptz, text, text) from public, anon;
grant execute on function public.admin_update_complaint_status(uuid, timestamptz, text, text) to authenticated;

comment on function public.admin_update_complaint_status is
  'Admin-only status transition (received/in_review/resolved) for a Virtual '
  'Libro de Reclamaciones entry. app.assert_admin_for on the entry''s own '
  'business unit, updated_at optimistic concurrency, atomic audit entry.';
