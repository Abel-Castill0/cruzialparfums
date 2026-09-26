-- Closes a gap found while wiring per-variant availability into the public
-- storefront (the DB-authoritative rejection from the earlier gate_b_status_
-- only_availability_enforcement migration stands; this is the read side):
-- public.inventory has only inventory_admin_read/inventory_admin_write RLS
-- policies, both restricted to `authenticated` admins. The anon role used by
-- the storefront has no SELECT access to it at all, so a direct nested
-- `product_variants(...inventory(...))` embed silently returns nothing for
-- real anonymous visitors and any client-side availability check built on
-- top of it always falls back to "available" -- exactly the kind of
-- optimistic-but-wrong UI state the storefront must not present.
--
-- Fix: a SECURITY DEFINER PostgREST computed-column function, matching the
-- same "expose only the safe aggregate, never the raw row" pattern already
-- used by public_launch_ready(). It never grants anon/authenticated SELECT
-- on public.inventory itself, so quantity_on_hand, updated_by and exact
-- timestamps remain admin-only; only the derived boolean crosses the API
-- boundary. Logic mirrors app.reserve_tracked_order_line() exactly: no
-- inventory row is untracked/legacy (available); status_only is available
-- unless flagged out_of_stock; tracked_quantity also needs uncommitted
-- stock. Must be in the public schema (not app) for PostgREST to expose it
-- as `product_variants(...,is_available:variant_effective_availability())`.
create function public.variant_effective_availability(v public.product_variants) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select i.availability_status = 'available'
       and (i.inventory_mode = 'status_only' or i.quantity_on_hand - i.reserved_quantity > 0)
     from public.inventory i
     where i.product_variant_id = v.id),
    true
  );
$$;
revoke all on function public.variant_effective_availability(public.product_variants) from public;
grant execute on function public.variant_effective_availability(public.product_variants) to anon, authenticated;

comment on function public.variant_effective_availability is
  'PostgREST computed column for product_variants: the same purchasability the
   reservation trigger enforces, exposed as a single boolean so the public
   storefront can honestly reflect it without any SELECT grant on inventory
   itself (which stays admin-only -- exact quantities are never public).';
