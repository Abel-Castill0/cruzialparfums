-- One-time owner-authorized Production data preparation for Cruzial Import.
-- Source prices are from the reviewed Sixth Consolidado PDF; every offer
-- remains unconfirmed and the new campaign is scheduled, never purchasable.

begin;

-- Fail closed if production data no longer matches the reviewed source state.
do $guard$
declare
  v_campaign_id uuid;
  v_offer_count integer;
  v_unconfirmed integer;
  v_existing_octavo integer;
  v_distinct_products integer;
  v_arabic_assignments integer;
  v_source_policy_count integer;
  v_import_policy_count integer;
begin
  select id into v_campaign_id
  from public.campaigns
  where business_unit_id = (select id from public.business_units where code = 'import')
    and number = 6 and status = 'draft' and archived_at is null;

  if v_campaign_id is null then
    raise exception 'Expected the unarchived Sixth Consolidado draft was not found.';
  end if;

  select count(*)::integer,
         count(*) filter (where availability_status = 'unconfirmed')::integer
  into v_offer_count, v_unconfirmed
  from public.campaign_products where campaign_id = v_campaign_id;

  if v_offer_count <> 898 or v_unconfirmed <> 898 then
    raise exception 'Sixth Consolidado source changed: expected 898 unconfirmed offers; found % offers, % unconfirmed.', v_offer_count, v_unconfirmed;
  end if;

  select count(*)::integer into v_existing_octavo
  from public.campaigns
  where business_unit_id = (select id from public.business_units where code = 'import')
    and number = 8;

  if v_existing_octavo <> 0 then
    raise exception 'Consolidado 8 already exists; review it instead of replacing it.';
  end if;

  select count(distinct product_id)::integer into v_distinct_products
  from public.campaign_products where campaign_id = v_campaign_id;
  if v_distinct_products <> 830 then
    raise exception 'Sixth Consolidado product set changed: expected 830 products with verified reference prices, found %.', v_distinct_products;
  end if;

  select count(*)::integer into v_arabic_assignments
  from public.product_categories pc
  join public.categories category on category.id = pc.category_id
  join public.business_units unit on unit.id = category.business_unit_id
  where unit.code = 'import' and category.kind = 'import_category'
    and category.slug = 'import-arabic';
  if v_arabic_assignments <> 415 then
    raise exception 'Import Arabic-category correction drifted: expected 415 links, found %.', v_arabic_assignments;
  end if;

  select count(*)::integer into v_source_policy_count
  from public.wholesale_policies policy
  join public.business_units unit on unit.id = policy.business_unit_id
  where unit.code = 'parfums' and policy.scope = 'per_commercial_type'
    and policy.archived_at is null and policy.is_active
    and ((policy.commercial_type = 'arabic' and policy.min_quantity = 40 and policy.discount_amount = 5.00)
      or (policy.commercial_type = 'designer' and policy.min_quantity = 40 and policy.discount_amount = 7.00)
      or (policy.commercial_type = 'niche' and policy.min_quantity = 40 and policy.discount_amount = 10.00));
  if v_source_policy_count <> 3 then
    raise exception 'Parfums wholesale rules changed; refusing to transfer them automatically.';
  end if;

  select count(*)::integer into v_import_policy_count
  from public.wholesale_policies policy
  join public.business_units unit on unit.id = policy.business_unit_id
  where unit.code = 'import' and policy.scope = 'per_commercial_type'
    and policy.archived_at is null;
  if v_import_policy_count <> 0 then
    raise exception 'Import wholesale rules already exist; review them rather than duplicating.';
  end if;
end;
$guard$;

-- 415 unknown source classifications had been silently mapped to Arabic by
-- the old loader's fallback. The reviewed source has no explicit Arabic rows;
-- remove those false category assignments, retaining the products as uncategorized.
delete from public.product_categories pc
using public.categories category, public.business_units unit
where pc.category_id = category.id
  and category.business_unit_id = unit.id
  and unit.code = 'import'
  and category.kind = 'import_category'
  and category.slug = 'import-arabic';

-- The owner explicitly moved the existing wholesale rules to Import.
-- Preserve the Parfums records as archived history and create isolated Import rows.
with archived as (
  update public.wholesale_policies policy
  set is_active = false, archived_at = coalesce(policy.archived_at, now())
  from public.business_units unit
  where policy.business_unit_id = unit.id
    and unit.code = 'parfums'
    and policy.scope = 'per_commercial_type'
    and policy.archived_at is null
  returning policy.*
)
insert into public.audit_log (
  business_unit_id, actor_user_id, action, entity_type, entity_id,
  before, after, request_id
)
select business_unit_id, null, 'wholesale.policy_update', 'wholesale_policy', id,
       jsonb_build_object('is_active', true, 'archived_at', null),
       jsonb_build_object('is_active', false, 'archived_at', archived_at),
       'owner_move_wholesale_to_import_2026-10-02'
from archived;

with import_unit as (
  select id from public.business_units where code = 'import'
), inserted as (
  insert into public.wholesale_policies (
    business_unit_id, name, scope, commercial_type, min_quantity,
    discount_amount, currency, notes, is_active
  )
  select import_unit.id, rule.name, 'per_commercial_type', rule.commercial_type,
         40, rule.discount_amount, 'PEN',
         'Owner-authorized transfer from the existing wholesale rules; editable in Import admin.',
         true
  from import_unit
  cross join (values
    ('Mayorista Árabe', 'arabic', 5.00::numeric),
    ('Mayorista Diseñador', 'designer', 7.00::numeric),
    ('Mayorista Nicho', 'niche', 10.00::numeric)
  ) as rule(name, commercial_type, discount_amount)
  returning *
)
insert into public.audit_log (
  business_unit_id, actor_user_id, action, entity_type, entity_id,
  before, after, request_id
)
select business_unit_id, null, 'create', 'wholesale_policy', id, null,
       jsonb_build_object(
         'name', name, 'scope', scope, 'commercial_type', commercial_type,
         'min_quantity', min_quantity, 'discount_amount', discount_amount,
         'currency', currency, 'is_active', is_active
       ),
       'owner_move_wholesale_to_import_2026-10-02'
from inserted;

-- Build consolidado 8 from the client-provided Sixth PDF's reviewed offers.
-- Prices are explicitly presented as reference values for the previous PDF;
-- none is treated as client-confirmed for consolidado 8.
with import_unit as (
  select id from public.business_units where code = 'import'
), source_campaign as (
  select campaign.* from public.campaigns campaign
  join import_unit on import_unit.id = campaign.business_unit_id
  where campaign.number = 6 and campaign.status = 'draft'
), created_campaign as (
  insert into public.campaigns (
    business_unit_id, number, name, status, opens_at, closes_at, public_message
  )
  select import_unit.id, 8, 'Octavo Consolidado', 'scheduled',
         '2026-10-15 00:00:00-05:00'::timestamptz, null,
         'Apertura estimada: 15 de octubre de 2026. Vista previa de 830 productos con precio de referencia basado en el Sexto Consolidado. Los productos con precio ambiguo o pendiente de revisión se añadirán después de la validación. Precios finales y disponibilidad deben confirmarse antes de abrir. Catálogo de consulta, sin compras habilitadas.'
  from import_unit
  returning *
), copied_offers as (
  insert into public.campaign_products (
    campaign_id, product_id, product_variant_id, import_presentation_id,
    price_amount, currency, availability_status, quantity_limit, sort_order
  )
  select created_campaign.id, offer.product_id, offer.product_variant_id,
         offer.import_presentation_id, offer.price_amount, offer.currency,
         'unconfirmed', null, offer.sort_order
  from created_campaign
  cross join source_campaign
  join public.campaign_products offer on offer.campaign_id = source_campaign.id
  returning *
)
insert into public.audit_log (
  business_unit_id, actor_user_id, action, entity_type, entity_id,
  before, after, request_id
)
select created_campaign.business_unit_id, null, 'create', 'campaign', created_campaign.id,
       null,
       to_jsonb(created_campaign) || jsonb_build_object('copied_offer_count', (select count(*) from copied_offers)),
       'owner_prepare_octavo_from_sixth_2026-10-02'
from created_campaign;


commit;
