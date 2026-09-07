-- Cruzial Platform V2 — grant an administrator membership
--
-- Operator-run, never part of a migration or seed.
--
-- Why this is not automated: admin_memberships has no INSERT policy by design.
-- If an admin could write that table, an admin of Parfums could grant
-- themselves Import — the exact privilege escalation the whole model exists to
-- prevent. So memberships are created out of band, by someone with database
-- access, and the action is auditable.
--
-- This script contains NO password and creates NO user. The account must
-- already exist, created by the operator through Supabase Studio (Auth >
-- Users > Add user) or the Management API. docs/client-decisions.md still
-- lists the first admin's password, MFA and recovery procedure as UNKNOWN;
-- inventing any of them here would be worse than leaving this manual.
--
-- Usage (local):
--   psql "$(npx supabase status -o env | grep DB_URL | cut -d= -f2-)" \
--     -v email="'admin@example.test'" -v unit="'parfums'" -v role="'admin'" \
--     -f supabase/provisioning/grant-admin-membership.sql
--
-- `unit` is 'parfums' or 'import'. Run it twice, once per unit, to give one
-- account access to both without creating a second login.

\set ON_ERROR_STOP on

insert into public.admin_memberships (user_id, business_unit_id, role)
select
  u.id,
  b.id,
  :role
from auth.users u
join public.business_units b on b.code = :unit
where u.email = :email
on conflict (user_id, business_unit_id)
  do update set role = excluded.role, is_active = true;

-- Fails loudly instead of silently doing nothing when the account does not
-- exist yet — the most likely operator mistake here.
do $$
begin
  if not found then
    raise exception 'No auth user matched that email. Create the account first, then re-run.';
  end if;
end;
$$;

select
  u.email,
  b.code as business_unit,
  m.role,
  m.is_active
from public.admin_memberships m
join auth.users u on u.id = m.user_id
join public.business_units b on b.id = m.business_unit_id
where u.email = :email;
