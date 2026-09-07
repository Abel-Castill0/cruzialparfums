-- Cruzial Platform V2 — Foundation
--
-- Business units, admin memberships and the authorization helpers every RLS
-- policy in 20260907154358_rls_policies.sql depends on.
--
-- Design notes that matter for security:
--   * Helpers live in the `app` schema, which is NOT in config.toml's
--     api.schemas (["public", "graphql_public"]), so they are not callable
--     through the Data API.
--   * They are SECURITY DEFINER on purpose: an RLS policy on
--     admin_memberships that itself queries admin_memberships would recurse.
--     A definer function reads the table with the owner's rights, breaking the
--     cycle. search_path is pinned so the body cannot be hijacked by a
--     caller-controlled search_path.

create schema if not exists app;
revoke all on schema app from anon, authenticated;
grant usage on schema app to authenticated;

-- ---------------------------------------------------------------------------
-- Shared triggers
-- ---------------------------------------------------------------------------

create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- business_units
-- ---------------------------------------------------------------------------

create table public.business_units (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_units_code_check check (code in ('parfums', 'import'))
);

create trigger business_units_set_updated_at
  before update on public.business_units
  for each row execute function app.set_updated_at();

-- Fixed UUIDs: migrations, pgTAP tests and the legacy ETL all need to reference
-- these two rows deterministically across a `supabase db reset`.
insert into public.business_units (id, code, name) values
  ('11111111-1111-4111-8111-111111111111', 'parfums', 'Cruzial Parfums'),
  ('22222222-2222-4222-8222-222222222222', 'import',  'Cruzial Import');

-- ---------------------------------------------------------------------------
-- admin_memberships
-- ---------------------------------------------------------------------------
--
-- One auth user can administer one unit, the other, or both — without a second
-- account (client-decisions.md: "V1 tiene admin-only auth y no ofrece signup
-- público"). Roles are deliberately minimal; no enterprise RBAC in V1.

create table public.admin_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  business_unit_id uuid not null references public.business_units (id) on delete restrict,
  role text not null default 'admin',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_memberships_role_check check (role in ('admin', 'viewer')),
  constraint admin_memberships_user_unit_unique unique (user_id, business_unit_id)
);

create index admin_memberships_user_id_idx on public.admin_memberships (user_id);
create index admin_memberships_business_unit_id_idx on public.admin_memberships (business_unit_id);

create trigger admin_memberships_set_updated_at
  before update on public.admin_memberships
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Authorization helpers
-- ---------------------------------------------------------------------------

-- Every unit the current user may administer. Empty set for anon and for a
-- signed-in user with no membership row.
create or replace function app.current_unit_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.business_unit_id
  from public.admin_memberships m
  where m.user_id = (select auth.uid())
    and m.is_active
$$;

-- Membership check used by nearly every admin policy.
create or replace function app.is_admin_for(target_unit uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_memberships m
    where m.user_id = (select auth.uid())
      and m.business_unit_id = target_unit
      and m.is_active
      and m.role = 'admin'
  )
$$;

-- Read access (admin or viewer) for surfaces where a viewer role should still
-- be able to look without mutating.
create or replace function app.can_read_unit(target_unit uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_memberships m
    where m.user_id = (select auth.uid())
      and m.business_unit_id = target_unit
      and m.is_active
  )
$$;

-- True when the caller administers at least one unit. Used to gate /admin
-- itself, never to grant data access to a specific unit's rows.
create or replace function app.has_any_membership()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_memberships m
    where m.user_id = (select auth.uid())
      and m.is_active
  )
$$;

revoke all on function app.set_updated_at() from public;
revoke all on function app.current_unit_ids() from public;
revoke all on function app.is_admin_for(uuid) from public;
revoke all on function app.can_read_unit(uuid) from public;
revoke all on function app.has_any_membership() from public;

grant execute on function app.current_unit_ids() to authenticated;
grant execute on function app.is_admin_for(uuid) to authenticated;
grant execute on function app.can_read_unit(uuid) to authenticated;
grant execute on function app.has_any_membership() to authenticated;
