-- Cruzial Parfums — commercial rules data that depends on the environment's product ids (2026-10-14).
-- Operator-run, idempotent, data only. Requires migration 20261014120000_commercial_rules.sql.
--
-- Gift exclusion: "Club de Nuit Precieux I" (Armaf) is NOT eligible as the free 2 ml Arabic decant. The rule stores the
-- product BY ID (promotion_rules.conditions.excluded_product_ids). The id is found through the product's stable slug,
-- `cdn-preciux-i` (verified read-only in Production on 2026-10-14: one Parfums product, id 3228ae87-1dae-437e-b6f3-8a901f7cb4ac,
-- name "Club de Nuit Precieux I", brand Armaf, published; the Import unit has unrelated "CDN Preciux I/IV" drafts that this
-- query never touches because it filters by the Parfums unit). The script stops unless that slug matches exactly ONE product
-- AND its name and brand are the expected ones, so a renamed or re-created product can never silently leave the exclusion empty
-- or exclude the wrong perfume.
--
-- Shalom and the mixed wholesale rule (40 units, S/5 · S/7 · S/10) are loaded by the migration itself: they need no ids.
-- The 43 Lima districts are NOT here: see delivery-zones-PROPOSED.sql, which the owner validates first.
--
-- Run: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/provisioning/commercial-rules-seed.sql

begin;

do $$
declare
  v_matches integer;
  v_product uuid;
begin
  select count(*), min(id::text)::uuid into v_matches, v_product
    from public.products
   where business_unit_id = '11111111-1111-4111-8111-111111111111'
     and slug = 'cdn-preciux-i'
     and name = 'Club de Nuit Precieux I'
     and brand = 'Armaf';
  if v_matches <> 1 then
    raise exception 'expected exactly one Parfums product with slug cdn-preciux-i named "Club de Nuit Precieux I" (Armaf), found %', v_matches;
  end if;

  insert into public.promotion_rules (business_unit_id, rule_type, conditions, actions, is_active)
  values (
    '11111111-1111-4111-8111-111111111111',
    'gift_exclusion',
    jsonb_build_object('excluded_product_ids', jsonb_build_array(v_product::text)),
    '{}'::jsonb,
    true
  )
  on conflict (business_unit_id, rule_type) do update
    set conditions = excluded.conditions, actions = excluded.actions, is_active = true;
end
$$;

commit;
