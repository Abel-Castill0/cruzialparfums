-- Cruzial Platform V2 — Import Admin Operations Grant Correction (Phase 4J5C1)
--
-- The original migration 20260911100000 used `REVOKE ALL ... FROM public`
-- which only removes the PUBLIC pseudo-role grant. Supabase's default grants
-- also grant EXECUTE to anon, requiring explicit REVOKE FROM anon.
--
-- This correction tightens the grant surface for all 8 functions.

-- 1. Order status lifecycle
revoke all on function public.admin_import_update_order_status(uuid, text, text, text) from public, anon;
grant execute on function public.admin_import_update_order_status(uuid, text, text, text) to authenticated;

-- 2. Phone normalization helper
revoke all on function app.normalize_import_phone(text) from public, anon;
grant execute on function app.normalize_import_phone(text) to authenticated;

-- 3. Customer creation
revoke all on function public.admin_import_create_customer(text, text, text) from public, anon;
grant execute on function public.admin_import_create_customer(text, text, text) to authenticated;

-- 4. Customer update
revoke all on function public.admin_import_update_customer(uuid, text, text, text) from public, anon;
grant execute on function public.admin_import_update_customer(uuid, text, text, text) to authenticated;

-- 5. Customer verification status
revoke all on function public.admin_import_verify_customer_status(uuid, text) from public, anon;
grant execute on function public.admin_import_verify_customer_status(uuid, text) to authenticated;

-- 6. Customer archival
revoke all on function public.admin_import_archive_customer(uuid) from public, anon;
grant execute on function public.admin_import_archive_customer(uuid) to authenticated;

-- 7. Link customer to order
revoke all on function public.admin_import_link_customer_order(uuid, uuid) from public, anon;
grant execute on function public.admin_import_link_customer_order(uuid, uuid) to authenticated;

-- 8. Create customer from order
revoke all on function public.admin_import_create_customer_from_order(uuid) from public, anon;
grant execute on function public.admin_import_create_customer_from_order(uuid) to authenticated;
