-- 4K-B1: commercial authority reconciliation infrastructure.
--
-- Adds 'provisional_market' as a distinct product_variants.price_verification_status
-- value: an operator-approved, temporary researched price that is truthful about
-- its own weak authority. It must never be confused with 'official_pdf' or
-- 'client_confirmed', and nothing in this migration or the reconciliation
-- pipeline treats it as either. No rows are updated by this migration; it only
-- widens what value the existing column may hold.
--
-- Reversible: a follow-up migration can drop this constraint and re-add the
-- prior list, provided no row has been set to 'provisional_market' yet.

alter table public.product_variants
  drop constraint product_variants_price_verification_check;

alter table public.product_variants
  add constraint product_variants_price_verification_check check (
    price_verification_status in (
      'legacy', 'client_confirmed', 'official_pdf', 'provisional_market', 'unknown'
    )
  );
