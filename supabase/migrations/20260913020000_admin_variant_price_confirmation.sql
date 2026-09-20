-- 4K-B2B.2A.1: explicit Admin price-confirmation capability.
--
-- Closes the gap 4K-B2B.2A surfaced: a bottle variant can now carry
-- price_verification_status = 'provisional_market' (20260913010000), but
-- admin_update_variant had no way for an Admin to transition it to
-- 'client_confirmed' after the client reviews/corrects the price. Editing
-- the numeric price alone must never imply confirmation — the operator has
-- to consciously assert commercial authority.
--
-- OVERLOAD SAFETY: the prior admin_update_variant took exactly 10 positional
-- arguments. Adding an 11th parameter to a `create or replace function`
-- changes the argument list, which Postgres treats as a distinct signature
-- rather than a replacement — that would leave both the old 10-arg and new
-- 11-arg functions live, and PostgREST RPC resolution ambiguous between
-- them. The old signature is dropped explicitly first so exactly one
-- admin_update_variant contract exists afterward. The new parameter has a
-- SQL default (false), so any existing positional call with 10 arguments
-- (e.g. the pgTAP tests in 05_admin_product_mutations.sql) still resolves
-- against the new, single function without modification.
drop function if exists public.admin_update_variant(
  uuid, timestamptz, text, text, numeric, numeric, char(3), text, text, integer
);

create or replace function public.admin_update_variant(
  p_variant_id uuid,
  p_expected_updated_at timestamptz,
  p_label text,
  p_variant_kind text,
  p_size_ml numeric,
  p_price_amount numeric,
  p_currency char(3),
  p_sku text,
  p_publication_status text,
  p_sort_order integer,
  p_confirm_client_price boolean default false
)
returns public.product_variants
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_business_unit_id uuid;
  v_before public.product_variants;
  v_after public.product_variants;
  v_action text;
  v_new_verification_status text;
begin
  select * into v_before from public.product_variants where id = p_variant_id;
  if v_before.id is null then
    raise exception 'variant not found' using errcode = 'P0002';
  end if;

  v_business_unit_id := app.variant_unit(p_variant_id);
  perform app.assert_admin_for(v_business_unit_id);

  if p_confirm_client_price then
    -- 'official_pdf' authority comes only from the reconciled official
    -- source, never from a manual Admin choice. This RPC never produces
    -- 'official_pdf' and must never silently downgrade an existing one.
    if v_before.price_verification_status = 'official_pdf' then
      raise exception 'cannot manually override an official_pdf price verification status'
        using errcode = '22023';
    end if;
    v_new_verification_status := 'client_confirmed';
  else
    -- The operator changed the form (possibly the numeric price) without
    -- explicitly confirming it. The existing verification status —
    -- including 'provisional_market' — is preserved exactly. A numeric edit
    -- alone never implies client confirmation.
    v_new_verification_status := v_before.price_verification_status;
  end if;

  update public.product_variants set
    label = p_label,
    variant_kind = p_variant_kind,
    size_ml = p_size_ml,
    price_amount = p_price_amount,
    currency = p_currency,
    sku = p_sku,
    publication_status = p_publication_status,
    sort_order = p_sort_order,
    price_verification_status = v_new_verification_status
  where id = p_variant_id
    and updated_at = p_expected_updated_at
  returning * into v_after;

  if v_after.id is null then
    raise exception 'variant was modified by another session' using errcode = 'P2011';
  end if;

  -- The verification-status transition gets its own audit action —
  -- 'verification_update', the same action admin_update_combo_verification
  -- already uses for an analogous authority change — so it is observable
  -- separately from a cosmetic edit or a plain price_change. audit_log's
  -- action check constraint (audit_log_action_check) is the allow-list this
  -- must stay inside; it already includes 'verification_update'.
  v_action := case
    when v_after.price_verification_status is distinct from v_before.price_verification_status
      then 'verification_update'
    when v_after.price_amount is distinct from v_before.price_amount
      then 'price_change'
    else 'update'
  end;

  perform app.write_audit_log(v_business_unit_id, v_action, 'product_variant', p_variant_id, to_jsonb(v_before), to_jsonb(v_after));

  return v_after;
end;
$$;

revoke all on function public.admin_update_variant(
  uuid, timestamptz, text, text, numeric, numeric, char(3), text, text, integer, boolean
) from public;
grant execute on function public.admin_update_variant(
  uuid, timestamptz, text, text, numeric, numeric, char(3), text, text, integer, boolean
) to authenticated;
