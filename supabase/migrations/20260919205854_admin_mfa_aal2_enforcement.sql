-- Gate 2C1 — AAL2 enforcement at the database layer.
--
-- Every admin-readable/admin-writable RLS policy in this schema and every
-- admin_* RPC routes authorization through exactly two helpers:
--   app.can_read_unit(target_unit)  — admin OR viewer membership
--   app.is_admin_for(target_unit)   — admin membership only
-- (app.assert_admin_for(...) is a thin plpgsql wrapper over is_admin_for and
-- inherits whatever it enforces; see 20260908000435_admin_parfums_product_mutations.sql.)
-- A targeted audit (rg "auth\.uid\(\)" across every migration) found no
-- other admin-readable/admin-writable policy or RPC that checks membership
-- directly instead of through these two functions. The one remaining direct
-- auth.uid() read is admin_memberships_read_own
-- (20260907154358_rls_policies.sql), which must stay reachable at AAL1 so a
-- freshly authenticated admin can discover their own membership and reach
-- the MFA enrollment/challenge screens — it grants no business/admin data.
--
-- This migration adds a second, independent condition to both helpers: the
-- caller's current JWT must be at Authenticator Assurance Level 2. The
-- assurance level is read from the `aal` claim Supabase Auth embeds in every
-- access token (auth.jwt()->>'aal'), never from a custom table/column, so
-- there is nothing here for application code to desynchronize from the
-- user's actual MFA state. A JWT missing the claim (should not happen for a
-- real Supabase-issued token, but the coalesce is what makes the function
-- provably total) is treated as aal1 — fail closed, not fail open.
--
-- Net effect: a stolen or replayed aal1 access token — obtained before MFA
-- enrollment/challenge, or simply because a legitimate admin has not
-- completed MFA yet — can still read its own admin_memberships row (needed
-- to reach enrollment) but cannot read or mutate any business/admin data,
-- even by calling PostgREST directly and bypassing the Next.js session
-- model entirely. Business-unit isolation and the viewer/admin distinction
-- are unchanged: this is an additional AND, not a replacement.

create or replace function app.is_admin_for(target_unit uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.admin_memberships m
      where m.user_id = (select auth.uid())
        and m.business_unit_id = target_unit
        and m.is_active
        and m.role = 'admin'
    )
    and coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2'
$$;

create or replace function app.can_read_unit(target_unit uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.admin_memberships m
      where m.user_id = (select auth.uid())
        and m.business_unit_id = target_unit
        and m.is_active
    )
    and coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2'
$$;

comment on function app.is_admin_for(uuid) is
  'Admin membership in target_unit AND current JWT assurance level = aal2. '
  'Every admin mutation path (RLS policy or admin_* RPC via '
  'app.assert_admin_for) depends on this — see 20260919205854 for the full '
  'audit that established there is no other membership-check path to patch.';

comment on function app.can_read_unit(uuid) is
  'Admin or viewer membership in target_unit AND current JWT assurance '
  'level = aal2. admin_memberships_read_own is the one intentional '
  'exception that stays reachable at aal1, so a user can discover their own '
  'membership and reach MFA enrollment/challenge before AAL2 exists.';

-- Grants are unchanged: both functions were already restricted to
-- `authenticated` by 20260907154344_foundation.sql, and `create or replace`
-- does not reset an existing grant.
