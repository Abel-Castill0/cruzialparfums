-- Cruzial Platform V2 — Admin Import: Consolidado lifecycle + security
-- foundation (Phase 4J1)
--
-- Two confirmed gaps are closed here before any new mutation surface is
-- built on top of campaigns/campaign_products:
--
--   1. PUBLIC VISIBILITY GAP — campaigns_public_read (and, through
--      app.campaign_is_public, campaign_products_public_read) currently
--      treat status in ('scheduled', 'open', 'paused') as public. The
--      confirmed Cruzial Import V1 contract is narrower: ONLY an open,
--      non-archived Import campaign may be publicly readable. draft,
--      scheduled, paused, closed, fulfilled and archived are all private.
--
--   2. DIRECT-WRITE / AUDIT GAP — campaigns_admin_write and
--      campaign_products_admin_write grant authenticated table-level
--      INSERT/UPDATE/DELETE through PostgREST. That path never calls
--      app.write_audit_log, so a legitimate-unit admin could bypass every
--      audited mutation RPC this migration adds. Same posture as
--      20260908170000_admin_settings_public_contact.sql: revoke the
--      table-level write grant, keep the RLS policy as a second layer, and
--      route every real write through a SECURITY DEFINER RPC that performs
--      the admin check and the audit_log insert atomically with the row
--      change.
--
-- Scope: campaign LIFECYCLE only (create/edit/status/archive). Campaign
-- products (price, availability) are 4J2 and are not touched here beyond
-- closing their direct-write path so 4J2 cannot inherit an unaudited
-- bypass.

-- ---------------------------------------------------------------------------
-- 1. Public visibility fix
-- ---------------------------------------------------------------------------

create or replace function app.campaign_is_public(target_campaign uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Only an OPEN, non-archived Import campaign is public. draft/scheduled/
  -- paused/closed/fulfilled/archived are all private — status alone does not
  -- imply publication, and there is no scheduler that flips status
  -- automatically (see campaigns table comment in 20260907154351_commerce.sql).
  select exists (
    select 1
    from public.campaigns c
    join public.business_units u on u.id = c.business_unit_id
    where c.id = target_campaign
      and c.status = 'open'
      and c.archived_at is null
      and u.code = 'import'
  )
$$;

comment on function app.campaign_is_public(uuid) is
  'Public-visibility gate for campaigns and (via campaign_id) campaign_products. '
  'Narrowed in Phase 4J1: only status = open, archived_at is null, business unit '
  '= import. Previously also treated scheduled/paused as public, which was not '
  'the confirmed Import contract.';

drop policy if exists campaigns_public_read on public.campaigns;

create policy campaigns_public_read on public.campaigns
  for select to anon, authenticated
  using (
    status = 'open'
    and archived_at is null
    and business_unit_id = (select id from public.business_units where code = 'import')
  );

comment on policy campaigns_public_read on public.campaigns is
  'Phase 4J1: only open, non-archived Import campaigns are public. Kept as a '
  'plain column comparison (not app.campaign_is_public(id), which needs a row '
  'to already exist) so it stays a cheap, self-contained policy.';

-- campaign_products_public_read (20260907154358_rls_policies.sql) already
-- delegates to app.campaign_is_public(campaign_id), so it inherits this same
-- narrowed contract without needing its own edit.

-- ---------------------------------------------------------------------------
-- 2. Close the direct-write / audit-bypass gap
-- ---------------------------------------------------------------------------

revoke insert, update, delete on public.campaigns from authenticated;
revoke insert, update, delete on public.campaign_products from authenticated;

comment on policy campaigns_admin_write on public.campaigns is
  'Kept as a second enforcement layer (same posture as settings_admin_write): '
  'authenticated has no table-level write grant on public.campaigns any more '
  '(revoked in 20260909000000_admin_import_consolidados.sql), so this policy '
  'only matters if table access is ever re-granted. Every real write goes '
  'through admin_create_campaign / admin_update_campaign / '
  'admin_set_campaign_status / admin_archive_campaign, each atomic with its '
  'audit_log entry. Do not re-grant table writes without adding the same '
  'audit guarantee some other way.';

comment on policy campaign_products_admin_write on public.campaign_products is
  'Table-level write grant revoked from authenticated (Phase 4J1) so 4J2 '
  '(campaign products/prices) cannot be built on an unaudited bypass. This '
  'policy is the dormant second layer, matching campaigns_admin_write. No '
  'mutation RPC exists for campaign_products yet — that is 4J2.';

-- ---------------------------------------------------------------------------
-- 3. Structural guards additive to the existing campaigns constraints
-- ---------------------------------------------------------------------------

alter table public.campaigns
  add constraint campaigns_number_positive check (number > 0);

alter table public.campaigns
  add constraint campaigns_name_not_blank check (btrim(name) <> '');

alter table public.campaigns
  add constraint campaigns_public_message_length check (
    public_message is null or char_length(public_message) <= 2000
  );

-- ---------------------------------------------------------------------------
-- 4. Mutation RPCs
-- ---------------------------------------------------------------------------
--
-- All SECURITY DEFINER (unlike the security-invoker admin_* RPCs for
-- products/categories/combos, which still rely on RLS-granted table
-- privilege): authenticated now has no table-level write privilege on
-- campaigns/campaign_products at all, so these must run as owner to reach
-- the rows. app.assert_admin_for(...) is what stands in for RLS as the
-- authorization check, exactly as in admin_update_public_contact_setting.

-- Create always lands on draft. There is no create-as-open shortcut, and the
-- business unit is never a parameter — every call is intrinsically scoped to
-- Import server-side, never trusted from the browser.
create or replace function public.admin_create_campaign(
  p_number integer,
  p_name text,
  p_opens_at timestamptz default null,
  p_closes_at timestamptz default null,
  p_public_message text default null
)
returns public.campaigns
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_unit_id uuid;
  v_row public.campaigns;
begin
  select id into v_business_unit_id from public.business_units where code = 'import';
  if v_business_unit_id is null then
    raise exception 'import business unit is not provisioned' using errcode = 'P0002';
  end if;

  perform app.assert_admin_for(v_business_unit_id);

  insert into public.campaigns (
    business_unit_id, number, name, status, opens_at, closes_at, public_message
  ) values (
    v_business_unit_id, p_number, p_name, 'draft', p_opens_at, p_closes_at, p_public_message
  )
  returning * into v_row;

  perform app.write_audit_log(v_business_unit_id, 'create', 'campaign', v_row.id, null, to_jsonb(v_row));

  return v_row;
end;
$$;

revoke all on function public.admin_create_campaign(integer, text, timestamptz, timestamptz, text) from public;
grant execute on function public.admin_create_campaign(integer, text, timestamptz, timestamptz, text) to authenticated;

-- Metadata-only edit: name, opens_at, closes_at, public_message. Status is
-- deliberately never a parameter here — it changes only through
-- admin_set_campaign_status, so an unrelated metadata save can never
-- accidentally move the lifecycle state.
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
  v_before public.campaigns;
  v_after public.campaigns;
begin
  select * into v_before from public.campaigns where id = p_campaign_id;
  if v_before.id is null then
    -- Not found and "found but not yours" look identical on purpose.
    raise exception 'campaign not found' using errcode = 'P0002';
  end if;

  perform app.assert_admin_for(v_before.business_unit_id);

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

  perform app.write_audit_log(v_before.business_unit_id, 'update', 'campaign', p_campaign_id, to_jsonb(v_before), to_jsonb(v_after));

  return v_after;
end;
$$;

revoke all on function public.admin_update_campaign(uuid, timestamptz, text, timestamptz, timestamptz, text) from public;
grant execute on function public.admin_update_campaign(uuid, timestamptz, text, timestamptz, timestamptz, text) to authenticated;

-- Explicit lifecycle transition. Status is never inferred from opens_at/
-- closes_at — there is no scheduler/trigger in V1 (client-decisions.md:
-- UNKNOWN whether dates should auto-transition status, so nothing does).
-- "Structurally valid" for OPEN means the row itself satisfies the table's
-- own constraints (name/number/window), which is already guaranteed by the
-- time a row exists — there is deliberately no campaign_products emptiness
-- check here: 4J2 has not shipped, so a zero-product open campaign is a
-- warning surfaced by the Admin UI, not a database-level block.
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
  v_before public.campaigns;
  v_after public.campaigns;
begin
  if p_status not in ('draft', 'scheduled', 'open', 'paused', 'closed', 'fulfilled') then
    raise exception 'invalid campaign status %', p_status using errcode = '22023';
  end if;

  select * into v_before from public.campaigns where id = p_campaign_id;
  if v_before.id is null then
    raise exception 'campaign not found' using errcode = 'P0002';
  end if;

  perform app.assert_admin_for(v_before.business_unit_id);

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
    v_before.business_unit_id, 'campaign_state_change', 'campaign', p_campaign_id,
    jsonb_build_object('status', v_before.status), jsonb_build_object('status', v_after.status)
  );

  return v_after;
end;
$$;

revoke all on function public.admin_set_campaign_status(uuid, timestamptz, text) from public;
grant execute on function public.admin_set_campaign_status(uuid, timestamptz, text) to authenticated;

-- No destructive delete. Archive hides the campaign from active admin
-- listing/public visibility while retaining campaign_products/history
-- (nothing cascades). No restore workflow is implemented — restore
-- semantics are not confirmed in docs/client-decisions.md, so an archived
-- campaign is a terminal state for this phase rather than an invented one.
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
  v_before public.campaigns;
  v_after public.campaigns;
begin
  select * into v_before from public.campaigns where id = p_campaign_id;
  if v_before.id is null then
    raise exception 'campaign not found' using errcode = 'P0002';
  end if;

  perform app.assert_admin_for(v_before.business_unit_id);

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

  perform app.write_audit_log(v_before.business_unit_id, 'archive', 'campaign', p_campaign_id, to_jsonb(v_before), to_jsonb(v_after));

  return v_after;
end;
$$;

revoke all on function public.admin_archive_campaign(uuid, timestamptz) from public;
grant execute on function public.admin_archive_campaign(uuid, timestamptz) to authenticated;

comment on function public.admin_create_campaign is
  'Sole create path for a Cruzial Import consolidado. business_unit_id is '
  'always resolved server-side to the import unit, never a parameter. Always '
  'creates as draft — there is no create-as-open shortcut.';
comment on function public.admin_update_campaign is
  'Metadata-only edit (name/opens_at/closes_at/public_message). Status is not '
  'a parameter — see admin_set_campaign_status. Optimistic concurrency via '
  'updated_at; a stale write is rejected (40001), never silently overwritten.';
comment on function public.admin_set_campaign_status is
  'Sole lifecycle-transition path. Status is always explicit admin action, '
  'never inferred from opens_at/closes_at. Audited as campaign_state_change.';
comment on function public.admin_archive_campaign is
  'Soft archive only — no cascade, no delete, no restore workflow in this '
  'phase (restore semantics are not confirmed).';
