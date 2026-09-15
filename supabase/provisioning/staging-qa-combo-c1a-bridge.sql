-- 4K-C3A-R1: STAGING QA compatibility bridge for the C1A historical backfill.
-- STAGING ONLY iyxidhglyqkzoziyewlc. This is provisioning, not a migration.
-- Run only before 20260914010000_combo_variant_composition_contract.sql.
-- It establishes one owning presentation per exact QA combo and deliberately
-- leaves combo_items untouched so C1A itself performs the historical backfill.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
lock table public.products,public.product_variants,public.inventory,public.combos,
 public.combo_items in share row exclusive mode;

create temp table qa_combo_products(
 slug text primary key,
 name text not null,
 publication_status text not null,
 product_id uuid,
 variant_id uuid not null,
 inventory_id uuid not null
) on commit drop;
insert into qa_combo_products(slug,name,publication_status,variant_id,inventory_id) values
('staging-qa-combo-ready','[STAGING QA] Combo Composicion Configurada','published',
 md5('4J5F-A/variant/staging-qa-combo-ready')::uuid,
 md5('4J5F-A/inventory/staging-qa-combo-ready')::uuid),
('staging-qa-combo-pending','[STAGING QA] Combo Composicion Pendiente','draft',
 md5('4J5F-A/variant/staging-qa-combo-pending')::uuid,
 md5('4J5F-A/inventory/staging-qa-combo-pending')::uuid);

do $$
begin
 if (select count(*) from qa_combo_products q join public.products p
   on p.business_unit_id='11111111-1111-4111-8111-111111111111'
   and p.slug=q.slug and p.name=q.name and p.brand='[STAGING QA]')<>2 then
  raise exception 'Exact staging QA combo ownership is missing or conflicting';
 end if;
 if exists(select 1 from qa_combo_products q join public.products p
   on p.business_unit_id='11111111-1111-4111-8111-111111111111' and p.slug=q.slug
   where p.name<>q.name or p.brand<>'[STAGING QA]') then
  raise exception 'Staging QA combo slug is not owned by the expected fixture';
 end if;
end $$;

update qa_combo_products q set product_id=p.id
from public.products p
where p.business_unit_id='11111111-1111-4111-8111-111111111111'
and p.slug=q.slug and p.name=q.name and p.brand='[STAGING QA]';

do $$
begin
 if exists(select 1 from qa_combo_products q left join public.combos c on c.product_id=q.product_id
   where c.id is null) then
  raise exception 'Expected staging QA combo row is missing';
 end if;
 if exists(select 1 from public.combos c join qa_combo_products q on c.product_id=q.product_id
   group by q.product_id having count(*)<>1) then
  raise exception 'Unexpected staging QA combo ownership';
 end if;
 if exists(select 1 from public.product_variants v join qa_combo_products q on v.id=q.variant_id
   where v.product_id<>q.product_id) then
  raise exception 'Deterministic staging QA combo variant id is already owned elsewhere';
 end if;
 if exists(select 1 from public.product_variants v join qa_combo_products q on v.product_id=q.product_id
   where v.id<>q.variant_id or v.variant_kind<>'decant' or v.size_ml<>5 or v.label<>'5 ml'
   or v.price_amount<>0.01 or btrim(v.currency)<>'PEN'
   or v.price_verification_status<>'unknown' or v.sort_order<>0
   or v.publication_status<>q.publication_status or v.archived_at is not null) then
  raise exception 'Unexpected or conflicting staging QA combo presentation';
 end if;
 if exists(select 1 from public.inventory i join qa_combo_products q on i.id=q.inventory_id
   where i.product_variant_id<>q.variant_id) then
  raise exception 'Deterministic staging QA combo inventory id is already owned elsewhere';
 end if;
 if exists(select 1 from public.inventory i join qa_combo_products q on i.product_variant_id=q.variant_id
   where i.id<>q.inventory_id or i.inventory_mode<>'status_only'
   or i.quantity_on_hand is not null or i.availability_status<>'available') then
  raise exception 'Unexpected or conflicting staging QA combo inventory';
 end if;
end $$;

create or replace function pg_temp.qa_combo_non_qa_fingerprint() returns jsonb
language sql as $$
 select jsonb_build_object(
  'product_variants',jsonb_build_object(
   'count',count(*),
   'hash',md5(coalesce(string_agg(to_jsonb(v)::text,'' order by to_jsonb(v)::text),''))
  ),
  'inventory',(select jsonb_build_object(
   'count',count(*),
   'hash',md5(coalesce(string_agg(to_jsonb(i)::text,'' order by to_jsonb(i)::text),''))
  ) from public.inventory i
   where not exists(select 1 from qa_combo_products q where q.variant_id=i.product_variant_id))
 )
 from public.product_variants v
 where not exists(select 1 from qa_combo_products q where q.product_id=v.product_id)
$$;
create temp table qa_combo_before on commit drop as
 select pg_temp.qa_combo_non_qa_fingerprint() as fingerprint;

insert into public.product_variants(
 id,product_id,variant_kind,size_ml,label,price_amount,currency,
 publication_status,sort_order,price_verification_status,archived_at
)
select q.variant_id,q.product_id,'decant',5,'5 ml',0.01,'PEN',
 q.publication_status,0,'unknown',null
from qa_combo_products q
on conflict(id) do nothing;

insert into public.inventory(
 id,product_variant_id,inventory_mode,quantity_on_hand,availability_status
)
select q.inventory_id,q.variant_id,'status_only',null,'available'
from qa_combo_products q
on conflict(product_variant_id) do nothing;

do $$
begin
 if (select fingerprint from qa_combo_before)<>pg_temp.qa_combo_non_qa_fingerprint() then
  raise exception 'Non-QA row changed: bridge transaction rolled back';
 end if;
 if exists(select 1 from qa_combo_products q where
   (select count(*) from public.product_variants v where v.product_id=q.product_id)<>1
   or not exists(select 1 from public.product_variants v
    where v.id=q.variant_id and v.product_id=q.product_id and v.variant_kind='decant'
    and v.size_ml=5 and v.label='5 ml' and v.price_amount=0.01
    and btrim(v.currency)='PEN' and v.publication_status=q.publication_status
    and v.price_verification_status='unknown' and v.sort_order=0 and v.archived_at is null)
   or not exists(select 1 from public.inventory i where i.id=q.inventory_id
    and i.product_variant_id=q.variant_id and i.inventory_mode='status_only'
    and i.quantity_on_hand is null and i.availability_status='available')) then
  raise exception 'Staging QA combo presentation bridge verification failed';
 end if;
end $$;

select '4K-C3A-R1 bridge applied' as status,
 (select count(*) from qa_combo_products) as exact_combo_products,
 (select count(*) from public.combo_items ci join public.combos c on c.id=ci.combo_id
   join qa_combo_products q on q.product_id=c.product_id) as untouched_combo_items;
commit;
