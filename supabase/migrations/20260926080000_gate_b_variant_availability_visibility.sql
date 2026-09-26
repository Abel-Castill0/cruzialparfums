-- Gate B correction: public.variant_effective_availability must enforce its
-- OWN public-visibility eligibility.
--
-- 20260926060000 exposed a SECURITY DEFINER computed column so anon can read
-- a derived per-variant availability boolean without any grant on the private
-- inventory table. Through the PostgREST embed that is safe (the variant row
-- itself is already filtered by product_variants_public_read), but the
-- function is also directly invocable as an RPC with an arbitrary row value:
--   POST /rest/v1/rpc/variant_effective_availability {"v": {"id": "<uuid>"}}
-- and, running as definer, it would answer for a draft, archived, unpublished
-- or non-Parfums variant — an availability oracle that bypasses publication.
--
-- The function now answers only for a variant anon could already read through
-- the public catalog: Parfums business unit, product published and not
-- archived, variant published and not archived (the same predicates as
-- products_public_read / product_variants_public_read). It looks the variant
-- up by id itself — every other field of the caller-supplied row value is
-- ignored — and returns NULL (no public result) for anything else. Raw
-- inventory remains ungranted to anon; only the boolean ever crosses the API.

create or replace function public.variant_effective_availability(v public.product_variants)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not exists (
      select 1
      from public.product_variants pv
      join public.products p on p.id = pv.product_id
      join public.business_units bu on bu.id = p.business_unit_id
      where pv.id = v.id
        and bu.code = 'parfums'
        and p.publication_status = 'published'
        and p.archived_at is null
        and pv.publication_status = 'published'
        and pv.archived_at is null
    ) then null
    else coalesce(
      (select i.availability_status = 'available'
          and (i.inventory_mode = 'status_only' or i.quantity_on_hand - i.reserved_quantity > 0)
         from public.inventory i
        where i.product_variant_id = v.id),
      true)
  end;
$$;

revoke all on function public.variant_effective_availability(public.product_variants) from public;
grant execute on function public.variant_effective_availability(public.product_variants) to anon, authenticated;

comment on function public.variant_effective_availability(public.product_variants) is
  'Public derived availability for a PUBLIC Parfums variant only (NULL otherwise). '
  'Never exposes quantities; raw inventory stays private.';
