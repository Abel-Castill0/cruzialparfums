-- Search-engine indexing becomes an explicit, persisted, audited owner decision, independent from content
-- completeness. public_launch_ready() keeps measuring factual commercial/legal readiness (unchanged here); it is shown
-- to the admin as a warning and no longer decides indexing implicitly.
--
-- Platform-wide row (business_unit_id IS NULL) because both storefronts share one domain, robots.txt and sitemap.
-- Default OFF. Only an AAL2 admin of EVERY active business unit may change it, so one unit's admin cannot open the
-- other unit to crawlers. Writes go only through admin_set_search_indexing (authenticated has no table write grant on
-- public.settings since 20260908170000) with optimistic concurrency and one settings_change audit row per unit.
-- Additive only: no existing row, function or policy is modified.

create or replace function app.validate_search_indexing_setting()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.key = 'search_indexing' then
    if new.business_unit_id is not null then
      raise exception 'search_indexing is a platform-wide setting (business_unit_id must be null)' using errcode = '22023';
    end if;
    if jsonb_typeof(new.value) is distinct from 'object'
       or (select array_agg(k order by k) from jsonb_object_keys(new.value) k) is distinct from array['enabled']
       or jsonb_typeof(new.value -> 'enabled') is distinct from 'boolean' then
      raise exception 'search_indexing value must be exactly {"enabled": true|false}' using errcode = '22023';
    end if;
    if not new.is_public then
      raise exception 'search_indexing must stay readable by the public site' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function app.validate_search_indexing_setting() from public, anon, authenticated;

create trigger settings_validate_search_indexing
  before insert or update on public.settings
  for each row execute function app.validate_search_indexing_setting();

insert into public.settings (business_unit_id, key, value, is_public)
values (null, 'search_indexing', '{"enabled": false}'::jsonb, true)
on conflict (business_unit_id, key) do nothing;

-- Public read: the only thing it reveals is whether crawlers are invited. Missing row => false (fail closed).
create or replace function public.public_search_indexing_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select (s.value ->> 'enabled')::boolean
       from public.settings s
      where s.business_unit_id is null and s.key = 'search_indexing'),
    false)
$$;
revoke all on function public.public_search_indexing_enabled() from public;
grant execute on function public.public_search_indexing_enabled() to anon, authenticated, service_role;

-- Admin read model: current value, concurrency token and whether THIS caller may change it.
create or replace function public.admin_get_search_indexing()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_row public.settings;
  v_can_read boolean;
  v_can_change boolean;
begin
  select coalesce(bool_or(app.can_read_unit(b.id)), false), coalesce(bool_and(app.is_admin_for(b.id)), false)
    into v_can_read, v_can_change
    from public.business_units b
   where b.is_active;
  if not v_can_read then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into v_row from public.settings where business_unit_id is null and key = 'search_indexing';
  return jsonb_build_object(
    'enabled', coalesce((v_row.value ->> 'enabled')::boolean, false),
    'updatedAt', v_row.updated_at,
    'canChange', v_can_change
  );
end;
$$;
revoke all on function public.admin_get_search_indexing() from public, anon;
grant execute on function public.admin_get_search_indexing() to authenticated;

create or replace function public.admin_set_search_indexing(p_enabled boolean, p_expected_updated_at timestamptz)
returns public.settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit uuid;
  v_units integer := 0;
  v_before public.settings;
  v_after public.settings;
begin
  if p_enabled is null then
    raise exception 'p_enabled is required' using errcode = '22023';
  end if;

  -- Every active unit: AAL2 admin membership (app.assert_admin_for raises 42501 otherwise).
  for v_unit in select id from public.business_units where is_active order by code loop
    perform app.assert_admin_for(v_unit);
    v_units := v_units + 1;
  end loop;
  if v_units = 0 then
    raise exception 'no active business unit' using errcode = '42501';
  end if;

  select * into v_before
    from public.settings
   where business_unit_id is null and key = 'search_indexing'
   for update;
  if v_before.id is null then
    raise exception 'search_indexing setting not found' using errcode = 'P0002';
  end if;

  update public.settings
     set value = jsonb_build_object('enabled', p_enabled),
         updated_by = auth.uid()
   where id = v_before.id and updated_at = p_expected_updated_at
  returning * into v_after;
  if v_after.id is null then
    raise exception 'setting was modified by another session' using errcode = '40001';
  end if;

  for v_unit in select id from public.business_units where is_active order by code loop
    perform app.write_audit_log(
      v_unit, 'settings_change', 'settings', v_after.id,
      jsonb_build_object('key', v_before.key, 'value', v_before.value),
      jsonb_build_object('key', v_after.key, 'value', v_after.value)
    );
  end loop;

  return v_after;
end;
$$;
revoke all on function public.admin_set_search_indexing(boolean, timestamptz) from public, anon;
grant execute on function public.admin_set_search_indexing(boolean, timestamptz) to authenticated;

comment on function public.admin_set_search_indexing(boolean, timestamptz) is
  'Sole write path for the platform-wide search_indexing setting. Requires an AAL2 admin membership in every active '
  'business unit, uses updated_at as optimistic-concurrency token, audits one settings_change per unit atomically. '
  'Independent from public_launch_ready(): incomplete content is a warning in the admin, not a lock.';
comment on function public.public_search_indexing_enabled() is
  'Whether the owner invited search engines (default false; missing row = false). The app additionally never indexes '
  'non-Production deployments.';
