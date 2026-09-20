-- Release: update the C2 reconciliation manifest fingerprint gate.
--
-- app.commercial_reconciliation_source() (20260916010000) hardcodes the
-- sha256 of the exact committed reconciliation manifest text as an
-- authorization gate for app.apply_parfums_commercial_import(). The manifest
-- (supabase/staging/commercial-reconciliation.json) embeds a fingerprint of
-- docs/client-decisions.md among its inputs; the 2026-09-20 corrective pass
-- legitimately edited that file (recording the Parfums order status
-- lifecycle as a system default, not client-confirmed — see
-- docs/client-decisions.md), which changed the manifest's own fingerprint
-- and therefore invalidated the hardcoded hash below.
--
-- This does NOT rewrite the already-applied 20260916010000 migration (that
-- file, and the reconciliation it already authorized, are untouched) — it
-- replaces the function with a new expected hash matching the regenerated,
-- re-reviewed manifest (`npm run commercial:check` confirms it is
-- byte-stable and current; product/variant/blocked/conflict counts are
-- unchanged at 100/324/0/0).

create or replace function app.commercial_reconciliation_source(p_manifest jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(encode(extensions.digest(convert_to(p_manifest::text, 'UTF8'), 'sha256'), 'hex')
    = '85b858f56bba3966434cf7d98ec05e39b6cc8e3ea72e06989bebadfc55ad9e1a', false)
$$;
