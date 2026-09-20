-- Cruzial Platform V2 — Audit Log integrity hardening + read model (Phase 4G2)
--
-- ---------------------------------------------------------------------------
-- CONFIRMED GAP
-- ---------------------------------------------------------------------------
-- audit_log_admin_insert (20260907154358_rls_policies.sql, tightened by
-- 20260907154401_integrity_hardening.sql) let any authenticated admin for a
-- unit INSERT an audit_log row directly through PostgREST, pinning
-- actor_user_id to their own auth.uid(). That closes actor SPOOFING but not
-- FABRICATION: an admin could still write an audit row describing a mutation
-- that never happened — disconnected from any real change — which weakens
-- the log's evidentiary value ("who changed this price" stops being
-- trustworthy if anyone with the role can also just write a row saying so).
--
-- FIX
-- ---------------------------------------------------------------------------
-- Remove the direct-INSERT path entirely: drop the RLS policy AND revoke the
-- table-level INSERT grant (belt and suspenders — matches the posture
-- 4G1 already established for `settings`). The only way to add a row becomes
-- app.write_audit_log(), which every admin mutation RPC already calls in the
-- same transaction as the change it describes.
--
-- Revoking the table grant means app.write_audit_log's own INSERT — running
-- SECURITY INVOKER as the calling `authenticated` role — would now fail
-- before RLS even runs. So it switches to SECURITY DEFINER. That trade
-- removes RLS's independent re-check on the write, so the function now
-- performs that same check itself (app.assert_admin_for) before writing:
-- authorization is relocated from a policy to an explicit statement, not
-- weakened. actor_user_id keeps coming from auth.uid() resolved inside
-- Postgres — never a parameter — so spoofing stays impossible, and
-- UPDATE/DELETE stay blocked by the existing unconditional trigger from
-- 20260907154355_audit_log.sql regardless of who calls what.
--
-- No service/API endpoint is added anywhere that lets a client construct an
-- arbitrary audit_log row: app.write_audit_log stays in `app`, which is not
-- in config.toml's exposed api.schemas, so it is reachable only from other
-- Postgres functions, never directly over PostgREST.

revoke insert on public.audit_log from authenticated;
drop policy if exists audit_log_admin_insert on public.audit_log;

create or replace function app.write_audit_log(
  p_business_unit_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_before jsonb,
  p_after jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_business_unit_id is null then
    raise exception 'write_audit_log requires a business_unit_id' using errcode = '22023';
  end if;

  -- Explicit re-authorization. SECURITY DEFINER bypasses RLS, so this call
  -- is what now plays the role audit_log_admin_insert used to play — every
  -- mutation RPC that reaches here already checked app.assert_admin_for()
  -- for its own write, but this second, independent check is what makes
  -- write_audit_log safe to be the *only* path, including for any future
  -- caller that forgets to check first.
  perform app.assert_admin_for(p_business_unit_id);

  insert into public.audit_log (business_unit_id, actor_user_id, action, entity_type, entity_id, before, after)
  values (p_business_unit_id, auth.uid(), p_action, p_entity_type, p_entity_id, p_before, p_after);
end;
$$;

revoke all on function app.write_audit_log(uuid, text, text, uuid, jsonb, jsonb) from public;
grant execute on function app.write_audit_log(uuid, text, text, uuid, jsonb, jsonb) to authenticated;

comment on function app.write_audit_log(uuid, text, text, uuid, jsonb, jsonb) is
  'The only path that may add a row to audit_log. SECURITY DEFINER because '
  'authenticated has no table-level INSERT grant on audit_log any more; '
  'authorization is re-checked explicitly inside (app.assert_admin_for) '
  'since SECURITY DEFINER bypasses RLS. actor_user_id always comes from '
  'auth.uid(), never a parameter.';

-- ---------------------------------------------------------------------------
-- READ MODEL — list + detail, with actor email resolved server-side
-- ---------------------------------------------------------------------------
-- Both live in `public` (exposed) so supabase-js .rpc() can call them, same
-- placement rationale as the admin_* mutation RPCs. Both are SECURITY
-- DEFINER solely so they can read auth.users to resolve a curated actor
-- email — every other check they perform (business unit resolution,
-- app.can_read_unit) is the same authorization RLS would have applied, run
-- explicitly instead. Neither ever fetches the whole table: the list caps
-- and paginates, the detail fetches exactly one row scoped to the caller's
-- own unit.

create or replace function public.admin_list_audit_log(
  p_business_unit_code text,
  p_page integer default 1,
  p_page_size integer default 20,
  p_action text default null,
  p_entity_type text default null
)
returns table (
  id uuid,
  created_at timestamptz,
  actor_user_id uuid,
  actor_email text,
  action text,
  entity_type text,
  entity_id uuid,
  business_unit_id uuid,
  total_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit uuid;
  v_page integer := greatest(1, coalesce(p_page, 1));
  -- Hard cap independent of what the client asks for — never let a page
  -- size argument turn this into an unbounded scan.
  v_page_size integer := least(30, greatest(1, coalesce(p_page_size, 20)));
begin
  select bu.id into v_unit from public.business_units bu where bu.code = p_business_unit_code;
  if v_unit is null then
    raise exception 'unknown business unit code' using errcode = '22023';
  end if;
  if not app.can_read_unit(v_unit) then
    raise exception 'cannot read audit log for this business unit' using errcode = '42501';
  end if;

  return query
    select
      a.id,
      a.created_at,
      a.actor_user_id,
      u.email::text as actor_email,
      a.action,
      a.entity_type,
      a.entity_id,
      a.business_unit_id,
      count(*) over () as total_count
    from public.audit_log a
    left join auth.users u on u.id = a.actor_user_id
    where a.business_unit_id = v_unit
      and (p_action is null or a.action = p_action)
      and (p_entity_type is null or a.entity_type = p_entity_type)
    order by a.created_at desc
    limit v_page_size
    offset (v_page - 1) * v_page_size;
end;
$$;

revoke all on function public.admin_list_audit_log(text, integer, integer, text, text) from public;
grant execute on function public.admin_list_audit_log(text, integer, integer, text, text) to authenticated;

create or replace function public.admin_get_audit_log_entry(
  p_business_unit_code text,
  p_entry_id uuid
)
returns table (
  id uuid,
  created_at timestamptz,
  actor_user_id uuid,
  actor_email text,
  action text,
  entity_type text,
  entity_id uuid,
  business_unit_id uuid,
  before jsonb,
  after jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit uuid;
begin
  select bu.id into v_unit from public.business_units bu where bu.code = p_business_unit_code;
  if v_unit is null then
    raise exception 'unknown business unit code' using errcode = '22023';
  end if;
  if not app.can_read_unit(v_unit) then
    raise exception 'cannot read audit log for this business unit' using errcode = '42501';
  end if;

  return query
    select
      a.id,
      a.created_at,
      a.actor_user_id,
      u.email::text as actor_email,
      a.action,
      a.entity_type,
      a.entity_id,
      a.business_unit_id,
      a.before,
      a.after
    from public.audit_log a
    left join auth.users u on u.id = a.actor_user_id
    -- Scoped to the caller's resolved unit, not just the row's own
    -- business_unit_id — an Import-only admin passing a Parfums entry id
    -- must get zero rows (not_found), never a cross-unit peek.
    where a.id = p_entry_id and a.business_unit_id = v_unit;
end;
$$;

revoke all on function public.admin_get_audit_log_entry(text, uuid) from public;
grant execute on function public.admin_get_audit_log_entry(text, uuid) to authenticated;

comment on function public.admin_list_audit_log(text, integer, integer, text, text) is
  'Paginated, filterable Parfums/Import audit list with actor email resolved '
  'at read time. Admin and viewer members of the unit may call it; anon and '
  'members of the other unit cannot (app.can_read_unit).';
comment on function public.admin_get_audit_log_entry(text, uuid) is
  'Single audit_log row (with before/after) scoped to the caller''s own '
  'business unit. Never returns a row belonging to a different unit.';
