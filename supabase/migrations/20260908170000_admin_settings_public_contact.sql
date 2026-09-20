-- Cruzial Platform V2 — Admin Settings: public contact (Phase 4G1)
--
-- Typed, business-unit-scoped contact settings. Deliberately NOT a generic
-- JSON editor: `public_contact` is the one confirmed key this phase ships,
-- validated by shape at the database layer and edited only through the
-- typed RPC below.
--
-- Integrity gap closed here: settings_admin_write (rls_policies.sql) lets any
-- unit admin UPDATE/INSERT public.settings directly through PostgREST. That
-- path never calls app.write_audit_log, so a direct table write would leave
-- no audit_log row for a change the brief requires to be audited. Revoking
-- the table-level INSERT/UPDATE/DELETE grants from `authenticated` closes
-- that path without touching the RLS policy itself (the policy still exists,
-- unchanged, as the second enforcement layer the moment anything is ever
-- granted table access again — same layered posture as audit_log's own
-- append-only trigger). The only remaining write path is
-- admin_update_public_contact_setting, which performs the admin check, the
-- update, and the audit_log insert in one transaction.

-- ---------------------------------------------------------------------------
-- Shape validation
-- ---------------------------------------------------------------------------
--
-- Keyed on settings.key so future typed keys can extend this without a
-- generic "anything goes" jsonb column. Unknown keys are left unchecked here
-- (there are none yet — this migration only ever writes 'public_contact')
-- rather than rejected, so this trigger never has to be revisited just to
-- allow a key nobody has defined a shape for.

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
  end if;

  return new;
end;
$$;

create trigger settings_validate_value
  before insert or update on public.settings
  for each row execute function app.validate_settings_value();

-- ---------------------------------------------------------------------------
-- Close the direct-write audit gap
-- ---------------------------------------------------------------------------

revoke insert, update, delete on public.settings from authenticated;

comment on policy settings_admin_write on public.settings is
  'Kept as a second enforcement layer (matches the audit_log posture): if '
  'INSERT/UPDATE/DELETE on public.settings is ever re-granted to authenticated '
  '(revoked below), this policy is what stops a write outside one''s own unit '
  'from succeeding. Today authenticated has no table-level write grant at '
  'all, so every real write instead goes through '
  'admin_update_public_contact_setting (security definer, its own '
  'app.assert_admin_for check), atomic with its audit_log entry. Do not '
  're-grant table writes without adding the same audit guarantee some other '
  'way.';

-- ---------------------------------------------------------------------------
-- Initial data — independent rows, no shared/global fallback
-- ---------------------------------------------------------------------------

insert into public.settings (business_unit_id, key, value, is_public)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'public_contact',
    jsonb_build_object(
      'whatsappNumber', '51926390591',
      'whatsappDisplay', '926 390 591',
      'contactEmail', 'dominiocruzial@gmail.com'
    ),
    true
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'public_contact',
    jsonb_build_object(
      'whatsappNumber', '51926390591',
      'whatsappDisplay', '926 390 591',
      'contactEmail', 'dominiocruzial@gmail.com'
    ),
    true
  )
on conflict (business_unit_id, key) do nothing;

-- ---------------------------------------------------------------------------
-- Mutation RPC
-- ---------------------------------------------------------------------------
--
-- security definer, unlike the security-invoker admin_* RPCs elsewhere in
-- this codebase: those rely on the caller's own RLS-granted table privilege
-- to perform their UPDATE, but authenticated now has NO table-level write
-- privilege on public.settings at all (revoked above) — that is what closes
-- the direct-write audit gap. So this function must run as its owner to
-- reach the row, and app.assert_admin_for(...) below is what stands in for
-- RLS as the authorization check for this one table.

create or replace function public.admin_update_public_contact_setting(
  p_business_unit_code text,
  p_expected_updated_at timestamptz,
  p_whatsapp_number text,
  p_whatsapp_display text,
  p_contact_email text
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
  where business_unit_id = v_business_unit_id and key = 'public_contact';

  if v_before.id is null then
    raise exception 'public_contact setting not found for this business unit' using errcode = 'P0002';
  end if;

  v_new_value := jsonb_build_object(
    'whatsappNumber', p_whatsapp_number,
    'whatsappDisplay', p_whatsapp_display,
    'contactEmail', p_contact_email
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

revoke all on function public.admin_update_public_contact_setting(text, timestamptz, text, text, text) from public;
grant execute on function public.admin_update_public_contact_setting(text, timestamptz, text, text, text) to authenticated;

comment on function public.admin_update_public_contact_setting is
  'Sole write path for the public_contact setting: validates + resolves the '
  'unit server-side (never trusts a browser-supplied business_unit_id), '
  'requires app.assert_admin_for, uses updated_at as an optimistic-concurrency '
  'token, and writes the settings_change audit entry atomically with the '
  'update. updated_by is always auth.uid() — never a caller-supplied actor.';
