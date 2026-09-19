-- Cruzial Platform V2 — Gate 2A: security boundaries hardening
--
-- Append-only. Does not modify any previously-applied migration. NOT applied
-- to Supabase hosted staging as part of this Gate — local/test only, pending
-- review before it is ever run against iyxidhglyqkzoziyewlc.
--
-- Scope (three independent, additive hardenings — none change RLS policies
-- or any function's business logic):
--
-- A. anon EXECUTE hardening — every public.admin_* RPC below currently has an
--    effective, explicit EXECUTE grant for `anon` on cruzial-v2-staging (its
--    pg_proc.proacl there shows `anon=X/postgres` alongside
--    `authenticated=X/postgres`, `service_role=X/postgres`, and
--    `postgres=X/postgres` — a Supabase/default-role grant applied at
--    function creation, not something this project revoked afterward). This
--    migration removes only the `anon` privilege from that ACL, i.e. it
--    revokes an unnecessary reachability surface that anon should never have
--    had; it does not depend on assuming the grant originated solely from
--    PUBLIC, and it does not touch `authenticated`/`service_role`/`postgres`.
--    The four intentionally-public Import storefront RPCs
--    (public_get_import_current_campaign, public_get_import_product,
--    public_list_import_catalog, public_list_import_categories) are
--    untouched, as are the app.*_is_public / app.*_unit RLS helper functions
--    (anon needs those to read published storefront rows at all).
--    Every admin_* function already enforces app.assert_admin_for(...) or
--    app.can_read_unit(...) internally (verified against live pg_proc source
--    on cruzial-v2-staging, 2026-09-19) — this migration removes an
--    unnecessary reachability surface, it does not add the authorization
--    check the functions already have.
--
-- B. search_path hardening — the five trigger functions the Supabase
--    Security Advisor flagged as function_search_path_mutable get an
--    explicit, minimal `search_path`. All five reference only
--    trigger-magic variables (new/old/tg_op/tg_table_name) and pg_catalog
--    builtins (now(), current_setting(), raise exception) — never an
--    unqualified table or function name — so `pg_catalog, pg_temp` is
--    sufficient and changes no behavior.
--
-- C. anon table-DML defense-in-depth — 20260907154358_rls_policies.sql
--    deliberately leaves Supabase's cloud-default table grants in place and
--    relies on RLS as the real enforcement boundary (see that file's header
--    comment), revoking anon grants explicitly only for the tables it
--    classified as sensitive (customers/orders/audit_log/memberships). This
--    migration extends that same explicit-REVOKE treatment to the admin-only
--    catalog/settings tables below, after confirming (rg across apps/web/src
--    for `.insert(`/`.update(`/`.delete(`/`.upsert(`, 2026-09-19) that no
--    public-facing code path ever performs a direct anon write against them
--    — every write goes through an admin_* RPC (unit A above) or, for
--    orders, through create_parfums_order_request(_v2)/import order RPCs.
--    RLS is untouched and remains the primary boundary; this only removes
--    grants nothing legitimate uses. Public SELECT is not touched.

-- =============================================================================
-- A. anon EXECUTE hardening — admin_* RPCs
-- =============================================================================

revoke execute on function public.admin_archive_campaign(uuid, timestamptz) from anon;
revoke execute on function public.admin_archive_category(uuid, timestamptz) from anon;
revoke execute on function public.admin_archive_combo(uuid, timestamptz) from anon;
revoke execute on function public.admin_archive_media(uuid, timestamptz) from anon;
revoke execute on function public.admin_archive_product(uuid, timestamptz) from anon;
revoke execute on function public.admin_archive_variant(uuid, timestamptz) from anon;
revoke execute on function public.admin_create_campaign(integer, text, timestamptz, timestamptz, text) from anon;
revoke execute on function public.admin_create_category(text, text, text, text, text, uuid, text, integer) from anon;
revoke execute on function public.admin_create_combo(uuid, text) from anon;
revoke execute on function public.admin_create_product(text, text, text, text, text, text, text, text, text, text, text, boolean, integer, timestamptz, timestamptz) from anon;
revoke execute on function public.admin_create_variant(uuid, text, text, numeric, numeric, character, text, text, integer, text, text, integer) from anon;
revoke execute on function public.admin_duplicate_campaign(uuid, integer, text) from anon;
revoke execute on function public.admin_get_audit_log_entry(text, uuid) from anon;
revoke execute on function public.admin_list_audit_log(text, integer, integer, text, text) from anon;
revoke execute on function public.admin_register_media(uuid, text, text, uuid, text, integer, integer, integer, text, text, boolean) from anon;
revoke execute on function public.admin_reorder_media(uuid, jsonb) from anon;
revoke execute on function public.admin_restore_category(uuid, timestamptz) from anon;
revoke execute on function public.admin_restore_combo(uuid, timestamptz) from anon;
revoke execute on function public.admin_restore_media(uuid, timestamptz) from anon;
revoke execute on function public.admin_restore_product(uuid, timestamptz) from anon;
revoke execute on function public.admin_restore_variant(uuid, timestamptz) from anon;
revoke execute on function public.admin_set_campaign_products(uuid, timestamptz, jsonb) from anon;
revoke execute on function public.admin_set_campaign_status(uuid, timestamptz, text) from anon;
revoke execute on function public.admin_set_combo_composition(uuid, timestamptz, jsonb) from anon;
revoke execute on function public.admin_set_media_primary(uuid, timestamptz) from anon;
revoke execute on function public.admin_set_product_categories(uuid, uuid[]) from anon;
revoke execute on function public.admin_update_campaign(uuid, timestamptz, text, timestamptz, timestamptz, text) from anon;
revoke execute on function public.admin_update_category(uuid, timestamptz, text, text, text, text, uuid, text, integer) from anon;
revoke execute on function public.admin_update_combo_verification(uuid, timestamptz, text) from anon;
revoke execute on function public.admin_update_inventory(uuid, timestamptz, text, text, integer) from anon;
revoke execute on function public.admin_update_media(uuid, timestamptz, text, uuid) from anon;
revoke execute on function public.admin_update_product(uuid, timestamptz, text, text, text, text, text, text, text, text, text, text, boolean, integer, timestamptz, timestamptz) from anon;
revoke execute on function public.admin_update_public_contact_setting(text, timestamptz, text, text, text) from anon;
revoke execute on function public.admin_update_variant(uuid, timestamptz, text, text, numeric, numeric, character, text, text, integer, boolean) from anon;
revoke execute on function public.admin_update_wholesale_policy(uuid, timestamptz, integer, numeric, boolean) from anon;

-- The remaining admin_* (Import) functions were already anon-unreachable as
-- of 20260911100100_import_admin_operations_grant_correction.sql — nothing
-- to do there. The four public_* Import storefront RPCs are intentionally
-- left untouched.

-- =============================================================================
-- B. search_path hardening — trigger functions flagged by Security Advisor
-- =============================================================================

alter function app.set_updated_at() set search_path = pg_catalog, pg_temp;
alter function app.reject_audit_log_mutation() set search_path = pg_catalog, pg_temp;
alter function app.freeze_order_line_snapshot() set search_path = pg_catalog, pg_temp;
alter function app.freeze_order_snapshot() set search_path = pg_catalog, pg_temp;
alter function app.reject_order_history_delete() set search_path = pg_catalog, pg_temp;

-- =============================================================================
-- C. anon table-DML defense-in-depth — admin-only catalog/settings tables
-- =============================================================================

revoke insert, update, delete on public.admin_parfums_wholesale_catalog from anon;
revoke insert, update, delete on public.business_units from anon;
revoke insert, update, delete on public.campaign_products from anon;
revoke insert, update, delete on public.campaigns from anon;
revoke insert, update, delete on public.categories from anon;
revoke insert, update, delete on public.combo_items from anon;
revoke insert, update, delete on public.combos from anon;
revoke insert, update, delete on public.deposit_policies from anon;
revoke insert, update, delete on public.product_categories from anon;
revoke insert, update, delete on public.product_media from anon;
revoke insert, update, delete on public.product_variants from anon;
revoke insert, update, delete on public.products from anon;
revoke insert, update, delete on public.settings from anon;
revoke insert, update, delete on public.shipping_methods from anon;
revoke insert, update, delete on public.variant_price_tiers from anon;
revoke insert, update, delete on public.wholesale_policies from anon;
