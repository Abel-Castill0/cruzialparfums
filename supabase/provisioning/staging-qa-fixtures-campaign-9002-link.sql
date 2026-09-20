-- 4J5G-A3: STAGING ONLY iyxidhglyqkzoziyewlc. Not a migration.
-- Caller MUST verify linked ref and pass --project-ref iyxidhglyqkzoziyewlc.
-- Extends staging-qa-fixtures.sql (run that first): links the existing
-- synthetic product staging-qa-import-ready ([STAGING QA] Import Ready) to
-- campaign 9002 ([STAGING QA] Open) as its ONE deterministic public QA
-- offer, so the public Import journey (campaign -> catalog -> product ->
-- cart -> checkout boundary) is exercisable against campaign 9002 without
-- touching campaign #6 or inventing a second product.
-- Cleanup: staging-qa-fixtures-cleanup.sql (same file, added section).
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
lock table public.campaign_products in share row exclusive mode;

do $$
declare
  v_campaign_id uuid;
  v_product_id uuid;
  v_presentation_id uuid;
  v_offer_id uuid := md5('4J5G-A3/offer/staging-qa-import-ready-9002')::uuid;
begin
  select id into strict v_campaign_id from public.campaigns
   where business_unit_id='22222222-2222-4222-8222-222222222222' and number=9002;
  select p.id, ip.id into strict v_product_id, v_presentation_id
    from public.products p
    join public.import_presentations ip on ip.product_id=p.id and ip.stable_key='staging-qa-single'
   where p.business_unit_id='22222222-2222-4222-8222-222222222222'
     and p.slug='staging-qa-import-ready' and p.brand='[STAGING QA]';

  insert into public.campaign_products(id,campaign_id,product_id,import_presentation_id,price_amount,currency,availability_status)
  values(v_offer_id,v_campaign_id,v_product_id,v_presentation_id,0.01,'PEN','available')
  on conflict(id) do update set price_amount=excluded.price_amount,availability_status=excluded.availability_status
  where campaign_products.campaign_id=excluded.campaign_id
    and campaign_products.product_id=excluded.product_id
    and campaign_products.import_presentation_id=excluded.import_presentation_id;
end $$;

do $$
declare n integer;
begin
  select count(*) into n from public.campaign_products cp join public.campaigns c on c.id=cp.campaign_id
   where c.business_unit_id='22222222-2222-4222-8222-222222222222' and c.number=9002;
  if n<>1 then raise exception 'Expected exactly one QA public offer on campaign 9002, found %',n; end if;

  if exists(select 1 from public.campaign_products cp join public.campaigns c on c.id=cp.campaign_id
    where c.business_unit_id='22222222-2222-4222-8222-222222222222' and c.number=9002
      and cp.id<>md5('4J5G-A3/offer/staging-qa-import-ready-9002')::uuid)
  then raise exception 'Unexpected row on campaign 9002'; end if;

  -- Campaign #6's existing QA offer for the same product must remain intact.
  if not exists(select 1 from public.campaign_products where id='a232ab79-7a07-77d0-076d-b9d888cd61e3'
    and price_amount=0.01 and availability_status='available')
  then raise exception 'Campaign #6 QA offer for staging-qa-import-ready is missing/changed'; end if;
end $$;

select '4J5G-A3 applied' as status,
 (select count(*) from public.campaign_products cp join public.campaigns c on c.id=cp.campaign_id
   where c.business_unit_id='22222222-2222-4222-8222-222222222222' and c.number=9002) as c9002_offers,
 (select count(*) from public.campaign_products cp join public.campaigns c on c.id=cp.campaign_id
   where c.business_unit_id='22222222-2222-4222-8222-222222222222' and c.number=6) as c6_offers_unchanged;
commit;
