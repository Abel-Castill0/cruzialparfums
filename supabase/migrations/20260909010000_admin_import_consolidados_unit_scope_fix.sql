-- Cruzial Platform V2 — Admin Import: consolidado RPC unit-scope fix
-- (Phase 4J1 correctness micro-patch)
--
-- admin_create_campaign already resolves the Import business unit
-- server-side and is intrinsically Import-scoped. admin_update_campaign,
-- admin_set_campaign_status and admin_archive_campaign did not: they loaded
-- the campaign by id and authorized with
-- app.assert_admin_for(v_before.business_unit_id) — i.e. whatever unit the
-- row actually belongs to. An admin of some OTHER business unit could
-- therefore call these Import-specific RPCs against a campaign belonging to
-- their own unit, if one existed, because the check never required that
-- unit to be Import specifically.
--
-- Fix: each of the three functions now resolves the canonical Import
-- business_unit_id itself (never a parameter — nothing the browser sends
-- can pick a unit) and requires the loaded campaign's business_unit_id to
-- equal it *before* running app.assert_admin_for. A campaign that exists
-- but belongs to a different unit is treated identically to one that does
-- not exist at all (P0002, same message), so the error response cannot be
-- used to enumerate cross-unit campaign ids.

create or replace function public.admin_update_campaign(
  p_campaign_id uuid,
  p_expected_updated_at timestamptz,
  p_name text,
  p_opens_at timestamptz,
  p_closes_at timestamptz,
  p_public_message text
)
returns public.campaigns
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import_unit_id uuid;
  v_before public.campaigns;
  v_after public.campaigns;
begin
  select id into v_import_unit_id from public.business_units where code = 'import';
  if v_import_unit_id is null then
    raise exception 'import business unit is not provisioned' using errcode = 'P0002';
  end if;

  select * into v_before from public.campaigns where id = p_campaign_id;
  if v_before.id is null or v_before.business_unit_id <> v_import_unit_id then
    -- Not found, and "found but belongs to another unit", look identical on
    -- purpose — this RPC is intrinsically Import-scoped and must not let a
    -- caller distinguish "no such campaign" from "that campaign is not
    -- yours" for a cross-unit row.
    raise exception 'campaign not found' using errcode = 'P0002';
  end if;

  perform app.assert_admin_for(v_import_unit_id);

  if v_before.archived_at is not null then
    raise exception 'archived campaigns cannot be edited' using errcode = 'P2007';
  end if;

  update public.campaigns set
    name = p_name,
    opens_at = p_opens_at,
    closes_at = p_closes_at,
    public_message = p_public_message
  where id = p_campaign_id
    and updated_at = p_expected_updated_at
  returning * into v_after;

  if v_after.id is null then
    raise exception 'campaign was modified by another session' using errcode = '40001';
  end if;

  perform app.write_audit_log(v_import_unit_id, 'update', 'campaign', p_campaign_id, to_jsonb(v_before), to_jsonb(v_after));

  return v_after;
end;
$$;

create or replace function public.admin_set_campaign_status(
  p_campaign_id uuid,
  p_expected_updated_at timestamptz,
  p_status text
)
returns public.campaigns
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import_unit_id uuid;
  v_before public.campaigns;
  v_after public.campaigns;
begin
  if p_status not in ('draft', 'scheduled', 'open', 'paused', 'closed', 'fulfilled') then
    raise exception 'invalid campaign status %', p_status using errcode = '22023';
  end if;

  select id into v_import_unit_id from public.business_units where code = 'import';
  if v_import_unit_id is null then
    raise exception 'import business unit is not provisioned' using errcode = 'P0002';
  end if;

  select * into v_before from public.campaigns where id = p_campaign_id;
  if v_before.id is null or v_before.business_unit_id <> v_import_unit_id then
    raise exception 'campaign not found' using errcode = 'P0002';
  end if;

  perform app.assert_admin_for(v_import_unit_id);

  if v_before.archived_at is not null then
    raise exception 'archived campaigns cannot change status' using errcode = 'P2007';
  end if;

  update public.campaigns
  set status = p_status
  where id = p_campaign_id
    and updated_at = p_expected_updated_at
  returning * into v_after;

  if v_after.id is null then
    raise exception 'campaign was modified by another session' using errcode = '40001';
  end if;

  perform app.write_audit_log(
    v_import_unit_id, 'campaign_state_change', 'campaign', p_campaign_id,
    jsonb_build_object('status', v_before.status), jsonb_build_object('status', v_after.status)
  );

  return v_after;
end;
$$;

create or replace function public.admin_archive_campaign(
  p_campaign_id uuid,
  p_expected_updated_at timestamptz
)
returns public.campaigns
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import_unit_id uuid;
  v_before public.campaigns;
  v_after public.campaigns;
begin
  select id into v_import_unit_id from public.business_units where code = 'import';
  if v_import_unit_id is null then
    raise exception 'import business unit is not provisioned' using errcode = 'P0002';
  end if;

  select * into v_before from public.campaigns where id = p_campaign_id;
  if v_before.id is null or v_before.business_unit_id <> v_import_unit_id then
    raise exception 'campaign not found' using errcode = 'P0002';
  end if;

  perform app.assert_admin_for(v_import_unit_id);

  if v_before.archived_at is not null then
    raise exception 'campaign is already archived' using errcode = 'P2007';
  end if;

  update public.campaigns
  set archived_at = now()
  where id = p_campaign_id
    and updated_at = p_expected_updated_at
  returning * into v_after;

  if v_after.id is null then
    raise exception 'campaign was modified by another session' using errcode = '40001';
  end if;

  perform app.write_audit_log(v_import_unit_id, 'archive', 'campaign', p_campaign_id, to_jsonb(v_before), to_jsonb(v_after));

  return v_after;
end;
$$;

comment on function public.admin_update_campaign is
  'Metadata-only edit (name/opens_at/closes_at/public_message), intrinsically '
  'scoped to the Import business unit resolved server-side. A campaign_id '
  'belonging to any other unit is rejected identically to a nonexistent id '
  '(P0002) — this must never let a caller distinguish "not found" from "not '
  'yours". Status is not a parameter — see admin_set_campaign_status. '
  'Optimistic concurrency via updated_at; a stale write is rejected (40001), '
  'never silently overwritten.';
comment on function public.admin_set_campaign_status is
  'Sole lifecycle-transition path, intrinsically scoped to Import (see '
  'admin_update_campaign for the same unit-scoping note). Status is always '
  'explicit admin action, never inferred from opens_at/closes_at. Audited as '
  'campaign_state_change.';
comment on function public.admin_archive_campaign is
  'Soft archive only — no cascade, no delete, no restore workflow in this '
  'phase. Intrinsically scoped to Import (see admin_update_campaign).';
