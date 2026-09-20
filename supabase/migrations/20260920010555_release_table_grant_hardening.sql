-- Cruzial Platform V2 — release: table-level grant hardening
--
-- Append-only. Complements Gate 2A (20260919010000) which removed anon DML
-- grants from admin-only tables. A live-grant audit on the local stack
-- (information_schema.role_table_grants, 2026-09-20) still showed:
--
--   * anon and authenticated holding TRUNCATE, REFERENCES and TRIGGER on
--     every public table Supabase's cloud defaults granted at creation
--     (`grant all on tables`). TRUNCATE is NOT subject to row-level
--     security; REFERENCES/TRIGGER are meaningless for PostgREST callers.
--     None of the three is used by any code path.
--   * authenticated holding INSERT/UPDATE/DELETE on admin_memberships and
--     UPDATE/DELETE on audit_log. RLS already denies both (no write
--     policies exist by design — see grant-admin-membership.sql), but the
--     grants are still an unnecessary surface: a future policy mistake
--     would become a privilege escalation instead of a denied query.
--   * authenticated holding INSERT/UPDATE/DELETE on the read model view
--     admin_parfums_wholesale_catalog (security_invoker view, read only).
--
-- What this migration deliberately keeps: authenticated's INSERT/UPDATE/
-- DELETE on the catalog tables. 22 admin_* RPCs are SECURITY INVOKER and
-- rely on those grants *plus* the admin write policies; revoking them would
-- break every Parfums admin mutation. RLS remains the enforcement boundary.
--
-- Default privileges are also fixed so tables created by future migrations
-- no longer receive TRUNCATE/REFERENCES/TRIGGER for anon/authenticated.

-- =============================================================================
-- A. Privileges nothing legitimate uses: every public table, both API roles
-- =============================================================================

revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;

-- =============================================================================
-- B. Sensitive tables: no DML grant at all for authenticated
-- =============================================================================

-- Memberships are provisioned out of band (supabase/provisioning/
-- grant-admin-membership.sql). An admin must never be able to write them.
revoke insert, update, delete on public.admin_memberships from authenticated;

-- Audit history is append-only through app-side definer functions; nobody
-- edits or deletes it from the API.
revoke update, delete on public.audit_log from authenticated;

-- =============================================================================
-- C. Admin read-model view: read only, and not for anon at all
-- =============================================================================

revoke all on public.admin_parfums_wholesale_catalog from anon;
revoke insert, update, delete on public.admin_parfums_wholesale_catalog from authenticated;
