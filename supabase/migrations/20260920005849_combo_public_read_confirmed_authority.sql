-- Release: public combo visibility follows the same authority ladder as prices.
--
-- app.combo_is_public() only accepted `client_confirmed`, written before the
-- official 2026 PDF became the commercial authority (4K-C2 materialized the
-- three official combos as `official_pdf`). Under that rule the three real
-- Cruzial sets were invisible to the storefront while the QA fixture combo
-- was visible. `official_pdf` and `client_confirmed` are both confirmed
-- authorities everywhere else (variant price gate, readiness classifier,
-- v2 order RPC); the public read boundary now agrees.
--
-- `pending_reconfirmation` and `unknown` remain private. Nothing else about
-- the policy changes: the combo's product must still be published and not
-- archived, and combo_items still require the ingredient variant to be
-- public.

create or replace function app.combo_is_public(target_combo uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.combos combo
    join public.products product on product.id = combo.product_id
    where combo.id = target_combo
      and combo.archived_at is null
      and combo.composition_verification_status in ('client_confirmed', 'official_pdf')
      and product.publication_status = 'published'
      and product.archived_at is null
  )
$$;

revoke all on function app.combo_is_public(uuid) from public;
grant execute on function app.combo_is_public(uuid) to anon, authenticated, service_role;

comment on function app.combo_is_public(uuid) is
  'Public combo read gate: published, non-archived product with a confirmed composition (client_confirmed or official_pdf).';
