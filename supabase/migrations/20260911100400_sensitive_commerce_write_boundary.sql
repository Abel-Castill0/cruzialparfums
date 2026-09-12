-- Migration: Sensitive commerce write boundary
-- Phase 4J5C1 — Controlled-Mutation Boundary Final Gate
--
-- Removes authenticated direct write access to customers/orders/order_lines.
-- All mutations now flow through SECURITY DEFINER RPCs with audit trails.
-- SELECT remains for admin viewers via existing RLS policies.
--
-- Defence-in-depth layers:
--   1. DROP RLS write policies (removes PostgREST authorization)
--   2. REVOKE table-level privileges (removes SQL-level permission)
--   3. SECURITY DEFINER RPCs bypass both (owned by postgres)
--
-- This migration does NOT affect:
--   - service_role (bypasses RLS entirely)
--   - SECURITY DEFINER RPCs (execute as postgres owner)
--   - SELECT access for admin readers
--   - Public storefront order creation (service_role only)

-- =========================================================================
-- 1. DROP write policies — customers
-- =========================================================================
-- customers_admin_write is FOR ALL (covers INSERT + UPDATE + DELETE).
-- Drop it: all three write operations must go through RPCs.

DROP POLICY IF EXISTS customers_admin_write ON public.customers;

-- =========================================================================
-- 2. DROP write policies — orders
-- =========================================================================
-- orders_admin_insert + orders_admin_update.
-- orders DELETE was already blocked (no policy + orders_no_delete trigger).

DROP POLICY IF EXISTS orders_admin_insert ON public.orders;
DROP POLICY IF EXISTS orders_admin_update ON public.orders;

-- =========================================================================
-- 3. DROP write policies — order_lines
-- =========================================================================
-- order_lines_admin_insert + order_lines_admin_update.
-- order_lines DELETE was already blocked (no policy + order_lines_no_delete trigger).

DROP POLICY IF EXISTS order_lines_admin_insert ON public.order_lines;
DROP POLICY IF EXISTS order_lines_admin_update ON public.order_lines;

-- =========================================================================
-- 4. REVOKE table-level write privileges
-- =========================================================================
-- Defence-in-depth: even if a future policy is accidentally added,
-- the REVOKE prevents direct table writes by authenticated.

REVOKE INSERT, UPDATE, DELETE ON public.customers FROM authenticated;
REVOKE UPDATE, DELETE ON public.orders FROM authenticated;
REVOKE UPDATE, DELETE ON public.order_lines FROM authenticated;

-- Note: orders and order_lines already had REVOKE INSERT from authenticated
-- (migration 20260911010000). Adding UPDATE + DELETE completes the boundary.

-- =========================================================================
-- 5. REVOKE phone helper from authenticated
-- =========================================================================
-- The concurrency migration (20260911100300) granted EXECUTE on
-- normalize_import_phone to authenticated because the expression index
-- evaluated it during direct authenticated writes.
-- With direct writes removed, authenticated no longer needs EXECUTE.
-- SECURITY DEFINER RPCs call it under their owner (postgres) context.

REVOKE EXECUTE ON FUNCTION app.normalize_import_phone(text) FROM authenticated;
