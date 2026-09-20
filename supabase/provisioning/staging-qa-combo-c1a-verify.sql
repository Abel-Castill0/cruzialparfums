-- 4K-C3A-R1 read-only verification for the current post-C1A fixture shape.
begin transaction read only;

do $$
declare ready_product uuid; pending_product uuid; publishable_product uuid;
 ready_variant uuid; pending_variant uuid; ingredient_variant uuid;
begin
 select id into strict ready_product from public.products
  where business_unit_id='11111111-1111-4111-8111-111111111111'
  and slug='staging-qa-combo-ready'
  and name='[STAGING QA] Combo Composicion Configurada' and brand='[STAGING QA]';
 select id into strict pending_product from public.products
  where business_unit_id='11111111-1111-4111-8111-111111111111'
  and slug='staging-qa-combo-pending'
  and name='[STAGING QA] Combo Composicion Pendiente' and brand='[STAGING QA]';
 select id into strict publishable_product from public.products
  where business_unit_id='11111111-1111-4111-8111-111111111111'
  and slug='staging-qa-publishable' and brand='[STAGING QA]';

 select id into strict ready_variant from public.product_variants
  where product_id=ready_product and id=md5('4J5F-A/variant/staging-qa-combo-ready')::uuid
  and variant_kind='decant' and size_ml=5 and label='5 ml' and price_amount=0.01
  and btrim(currency)='PEN' and publication_status='published'
  and price_verification_status='unknown' and sort_order=0 and archived_at is null;
 select id into strict pending_variant from public.product_variants
  where product_id=pending_product and id=md5('4J5F-A/variant/staging-qa-combo-pending')::uuid
  and variant_kind='decant' and size_ml=5 and label='5 ml' and price_amount=0.01
  and btrim(currency)='PEN' and publication_status='draft'
  and price_verification_status='unknown' and sort_order=0 and archived_at is null;
 select id into strict ingredient_variant from public.product_variants
  where product_id=publishable_product and label='5 ml';

 if (select count(*) from public.product_variants where product_id=ready_product)<>1
  or (select count(*) from public.product_variants where product_id=pending_product)<>1 then
  raise exception 'Each QA combo must have exactly one own presentation';
 end if;
 if not exists(select 1 from public.inventory where product_variant_id=ready_variant
   and inventory_mode='status_only' and quantity_on_hand is null and availability_status='available')
  or not exists(select 1 from public.inventory where product_variant_id=pending_variant
   and inventory_mode='status_only' and quantity_on_hand is null and availability_status='available') then
  raise exception 'QA combo presentation inventory contract mismatch';
 end if;
 if not exists(select 1 from public.combos c where c.product_id=ready_product
   and c.composition_verification_status='client_confirmed')
  or not exists(select 1 from public.combos c where c.product_id=pending_product
   and c.composition_verification_status='pending_reconfirmation') then
  raise exception 'QA combo authority contract mismatch';
 end if;
 if (select count(*) from public.combo_items ci join public.combos c on c.id=ci.combo_id
   where c.product_id=ready_product)<>1 then
  raise exception 'Ready QA combo must have exactly one item';
 end if;
 if not exists(select 1 from public.combo_items ci join public.combos c on c.id=ci.combo_id
   where c.product_id=ready_product and ci.combo_product_variant_id=ready_variant
   and ci.product_variant_id=ingredient_variant and ci.quantity=1 and ci.sort_order=0) then
  raise exception 'Ready QA combo variant-aware mapping mismatch';
 end if;
 if exists(select 1 from public.combo_items ci join public.combos c on c.id=ci.combo_id
   where c.product_id=pending_product) then
  raise exception 'Pending QA combo must have zero items';
 end if;
end $$;

select p.slug,v.id as own_variant_id,v.publication_status,
 c.composition_verification_status,count(ci.id) as combo_items
from public.products p
join public.product_variants v on v.product_id=p.id
join public.combos c on c.product_id=p.id
left join public.combo_items ci on ci.combo_id=c.id
where p.business_unit_id='11111111-1111-4111-8111-111111111111'
and p.slug in('staging-qa-combo-ready','staging-qa-combo-pending')
group by p.slug,v.id,v.publication_status,c.composition_verification_status
order by p.slug;

rollback;
