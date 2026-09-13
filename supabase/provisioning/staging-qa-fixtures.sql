-- 4J5F-A: STAGING ONLY iyxidhglyqkzoziyewlc. Not a migration.
-- Caller MUST verify linked ref and pass --project-ref iyxidhglyqkzoziyewlc.
-- Reconciles exact owned fixtures. Two synthetic offers in #6 are authorized.
-- No change to #6 itself or any existing non-QA row is permitted.
-- 'Mapper Ready' means Parfums structural mapping succeeds. Its public mapper
-- deliberately omits these data URI media rows (HTTPS Cloudinary only); Admin
-- and Import readiness can use them. No public media cutover is claimed.
-- Minimum synthetic offer: PEN 0.01; this is NOT client commercial evidence.
-- Cleanup: staging-qa-fixtures-cleanup.sql (do not run before hosted QA).
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
lock table public.products,public.categories,public.product_categories,
 public.product_variants,public.inventory,public.product_media,public.combos,
 public.combo_items,public.campaigns,public.import_presentations,
 public.campaign_products in share row exclusive mode;
create temp table qa_products(unit uuid,slug text primary key,old_name text,name text,id uuid) on commit drop;
insert into qa_products(unit,slug,old_name,name) values
('11111111-1111-4111-8111-111111111111','staging-qa-publishable','STAGING QA — Producto Publicable','[STAGING QA] Parfums Mapper Ready'),
('11111111-1111-4111-8111-111111111111','staging-qa-blocked-media','STAGING QA — Bloqueado por Media','[STAGING QA] Parfums Sin Media (sin guard)'),
('11111111-1111-4111-8111-111111111111','staging-qa-blocked-variant','STAGING QA — Bloqueado por Variante','[STAGING QA] Parfums Sin Variantes (omitido por mapper)'),
('11111111-1111-4111-8111-111111111111','staging-qa-archived','STAGING QA — Archivado','[STAGING QA] Archivado'),
('11111111-1111-4111-8111-111111111111','staging-qa-combo-ready','STAGING QA — Combo Listo','[STAGING QA] Combo Composicion Configurada'),
('11111111-1111-4111-8111-111111111111','staging-qa-combo-pending','STAGING QA — Combo Pendiente','[STAGING QA] Combo Composicion Pendiente'),
('22222222-2222-4222-8222-222222222222','staging-qa-import-ready',null,'[STAGING QA] Import Ready'),
('22222222-2222-4222-8222-222222222222','staging-qa-import-no-media',null,'[STAGING QA] Import Sin Media'),
('22222222-2222-4222-8222-222222222222','staging-qa-import-no-offer',null,'[STAGING QA] Import Sin Oferta');
do $$ begin
 if exists(select 1 from qa_products q join public.products p on p.business_unit_id=q.unit and p.slug=q.slug
 where ((p.brand='STAGING QA' and p.name=q.old_name) or (p.brand='[STAGING QA]' and p.name=q.name)) is not true)
 then raise exception 'QA product ownership collision'; end if;
 if exists(select 1 from public.categories where business_unit_id='11111111-1111-4111-8111-111111111111'
 and slug='staging-qa-family' and name not in ('STAGING QA — Aroma','[STAGING QA] Aroma'))
 then raise exception 'QA category collision'; end if;
 if exists(select 1 from public.categories where business_unit_id='11111111-1111-4111-8111-111111111111'
 and slug='arab' and name<>'[STAGING QA] Commercial Type') then raise exception 'QA commercial category collision'; end if;
 if exists(select 1 from public.campaigns c join (values
 (9001,'STAGING QA — Draft','[STAGING QA] Draft'),(9002,'STAGING QA — Open','[STAGING QA] Open'),
 (9003,'STAGING QA — Closed','[STAGING QA] Closed')) q(num,old_name,name) on c.number=q.num
 where c.business_unit_id='22222222-2222-4222-8222-222222222222' and c.name not in(q.old_name,q.name))
 then raise exception 'QA campaign collision'; end if;
 if not exists(select 1 from public.campaigns where business_unit_id='22222222-2222-4222-8222-222222222222'
 and number=6 and archived_at is null) then raise exception 'Staging #6 missing'; end if;
end $$;
update qa_products q set id=p.id from public.products p where p.business_unit_id=q.unit and p.slug=q.slug;

-- Fingerprints cover exact IDs and every field of ALL non-QA rows in touched tables.
-- In-memory only; no sensitive row contents leave Postgres. Transaction locks avoid races.
create or replace function pg_temp.qa_fingerprint() returns jsonb language plpgsql as $$
declare result jsonb:='{}'; t text; predicate text; digest text; n bigint;
begin
 foreach t in array array['products','categories','campaigns','product_categories',
 'product_variants','inventory','product_media','combos','combo_items','import_presentations','campaign_products'] loop
 predicate:=case
 when t='products' then 'not exists(select 1 from qa_products q where q.unit=r.business_unit_id and q.slug=r.slug)'
 when t='categories' then 'not (r.business_unit_id=''11111111-1111-4111-8111-111111111111'' and r.slug in(''staging-qa-family'',''arab''))'
 when t='campaigns' then 'not (r.business_unit_id=''22222222-2222-4222-8222-222222222222'' and r.number in(9001,9002,9003))'
 when t='inventory' then 'not exists(select 1 from public.product_variants v join qa_products q on q.id=v.product_id where v.id=r.product_variant_id)'
 when t='combo_items' then 'not exists(select 1 from public.combos c join qa_products q on q.id=c.product_id where c.id=r.combo_id)'
 else 'not exists(select 1 from qa_products q where q.id=r.product_id)' end;
 execute format('select count(*),md5(coalesce(string_agg(to_jsonb(r)::text,'''' order by to_jsonb(r)::text),'''')) from public.%I r where %s',t,predicate) into n,digest;
 result:=result||jsonb_build_object(t,jsonb_build_object('count',n,'hash',digest));
 end loop;
 return result;
end $$;
create temp table qa_before on commit drop as select pg_temp.qa_fingerprint() as fingerprint;
-- Capture the exact existing #6 IDs + full rows before any writes.
create temp table qa_offers_before on commit drop as select cp.id,to_jsonb(cp) as row
from public.campaign_products cp join public.campaigns c on c.id=cp.campaign_id
where c.business_unit_id='22222222-2222-4222-8222-222222222222' and c.number=6
and not exists(select 1 from qa_products q where q.id=cp.product_id);
create temp table qa_campaign_before on commit drop as select to_jsonb(c) as row from public.campaigns c
where c.business_unit_id='22222222-2222-4222-8222-222222222222' and c.number=6;

do $$
declare q record; pid uuid; family uuid; commercial uuid; vid uuid; cid uuid; pres uuid;
 -- Inert self-contained SVG supported by img and Next Image data sources. No host/upload.
 media text:='data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"%3E%3Crect width="160" height="160" fill="%23eee"/%3E%3Ctext x="80" y="80" text-anchor="middle" font-size="16" fill="%23000"%3E[STAGING QA]%3C/text%3E%3C/svg%3E';
begin
 -- Existing commercial categories are draft. The mapper also accepts 'arab'.
 -- Dedicated synthetic alias, no wholesale policy/bottle variants; real taxonomy untouched.
 insert into public.categories(id,business_unit_id,kind,slug,name,publication_status)
 values(md5('4J5F-A/category/arab')::uuid,'11111111-1111-4111-8111-111111111111','commercial_type','arab','[STAGING QA] Commercial Type','published')
 on conflict(business_unit_id,slug) do update set publication_status='published',archived_at=null returning id into commercial;
 insert into public.categories(business_unit_id,kind,slug,name,publication_status)
 values('11111111-1111-4111-8111-111111111111','olfactory_family','staging-qa-family','[STAGING QA] Aroma','published')
 on conflict(business_unit_id,slug) do update set name=excluded.name,publication_status='published',archived_at=null returning id into family;
 for q in select * from qa_products loop
 insert into public.products(id,business_unit_id,slug,legacy_id,name,brand,gender,short_description,
 sales_mode,production_status,availability_status,publication_status,verification_status,archived_at)
 values(coalesce(q.id,md5('4J5F-A/product/'||q.slug)::uuid),q.unit,q.slug,q.slug,q.name,'[STAGING QA]','unisex',
 '[STAGING QA] Synthetic fixture; no client commercial evidence.',
 case when q.unit='11111111-1111-4111-8111-111111111111' then 'always_available' else 'campaign' end,
 'active','available',case when q.slug='staging-qa-archived' then 'archived'
 when q.slug='staging-qa-combo-pending' then 'draft' else 'published' end,'unknown',
 case when q.slug='staging-qa-archived' then '2026-09-12T00:00:00Z'::timestamptz end)
 on conflict(business_unit_id,slug) do update set legacy_id=excluded.legacy_id,name=excluded.name,
 brand=excluded.brand,gender=excluded.gender,short_description=excluded.short_description,
 publication_status=excluded.publication_status,archived_at=excluded.archived_at returning id into pid;
 update qa_products set id=pid where slug=q.slug;
 if q.slug in('staging-qa-publishable','staging-qa-blocked-media','staging-qa-blocked-variant') then
 insert into public.product_categories(product_id,category_id) values(pid,family),(pid,commercial)
 on conflict(product_id,category_id) do nothing;
 end if;
 if q.slug in('staging-qa-publishable','staging-qa-blocked-media','staging-qa-archived') then
 insert into public.product_variants(product_id,variant_kind,size_ml,label,price_amount,currency,publication_status,price_verification_status,archived_at)
 values(pid,'decant',5,'5 ml',0.01,'PEN',case when q.slug='staging-qa-archived' then 'archived' else 'published' end,'unknown',
 case when q.slug='staging-qa-archived' then '2026-09-12T00:00:00Z'::timestamptz end)
 on conflict(product_id,label) do update set price_amount=excluded.price_amount,publication_status=excluded.publication_status,
 archived_at=excluded.archived_at returning id into vid;
 if q.slug<>'staging-qa-archived' then
 insert into public.inventory(product_variant_id,inventory_mode,availability_status)
 values(vid,'status_only','available') on conflict(product_variant_id) do nothing;
 end if;
 end if;
 if q.slug in('staging-qa-publishable','staging-qa-blocked-variant','staging-qa-import-ready','staging-qa-import-no-offer') then
 update public.product_media set secure_url=media,alt='[STAGING QA] Synthetic test card',is_primary=true,archived_at=null
 where product_id=pid and provider='legacy_static' and sort_order=0;
 if not found then
 insert into public.product_media(id,product_id,provider,secure_url,alt,is_primary)
 values(md5('4J5F-A/media/'||q.slug)::uuid,pid,'legacy_static',media,'[STAGING QA] Synthetic test card',true);
 end if;
 end if;
 if q.unit='22222222-2222-4222-8222-222222222222' then
 pres:=md5('4J5F-A/presentation/'||q.slug)::uuid;
 insert into public.import_presentations(id,product_id,stable_key,label,presentation_class,publication_status)
 values(pres,pid,'staging-qa-single','[STAGING QA] Single','single_fixed','published')
 on conflict(product_id,stable_key) do update set publication_status='published',archived_at=null returning id into pres;
 if q.slug<>'staging-qa-import-no-offer' then
 select id into strict cid from public.campaigns where business_unit_id=q.unit and number=6;
 insert into public.campaign_products(id,campaign_id,product_id,import_presentation_id,price_amount,currency,availability_status)
 values(md5('4J5F-A/offer/'||q.slug)::uuid,cid,pid,pres,0.01,'PEN','available')
 on conflict(id) do update set price_amount=excluded.price_amount,availability_status=excluded.availability_status
 where campaign_products.product_id=excluded.product_id and campaign_products.campaign_id=excluded.campaign_id
 and campaign_products.import_presentation_id=excluded.import_presentation_id;
 end if;
 end if;
 end loop;
 for q in select * from(values(9001,'Draft','draft'),(9002,'Open','open'),(9003,'Closed','closed')) v(num,label,status) loop
 insert into public.campaigns(business_unit_id,number,name,status)
 values('22222222-2222-4222-8222-222222222222',q.num,'[STAGING QA] '||q.label,q.status)
 on conflict(business_unit_id,number) do update set name=excluded.name;
 end loop;
 for q in select * from qa_products where slug in('staging-qa-combo-ready','staging-qa-combo-pending') loop
 insert into public.combos(product_id,composition_verification_status)
 values(q.id,case when q.slug='staging-qa-combo-ready' then 'client_confirmed' else 'pending_reconfirmation' end)
 on conflict(product_id) do nothing;
 if q.slug='staging-qa-combo-ready' then
 select id into cid from public.combos where product_id=q.id;
 insert into public.combo_items(combo_id,product_variant_id,quantity,sort_order)
 select cid,v.id,1,0 from public.product_variants v join qa_products p on p.id=v.product_id
 where p.slug='staging-qa-publishable' and v.label='5 ml' on conflict(combo_id,product_variant_id) do nothing;
 end if;
 end loop;
end $$;

do $$ begin
 if (select fingerprint from qa_before)<>pg_temp.qa_fingerprint() then
 raise exception 'Non-QA row changed: entire provisioning rolled back'; end if;
 if (select count(*) from qa_products q join public.products p on p.id=q.id and p.slug=q.slug and p.business_unit_id=q.unit)<>9
 then raise exception 'Expected exactly nine owned products'; end if;
 if exists(select 1 from qa_offers_before b left join public.campaign_products cp on cp.id=b.id where to_jsonb(cp) is distinct from b.row)
 then raise exception 'Existing #6 offers changed'; end if;
 if (select row from qa_campaign_before) is distinct from(select to_jsonb(c) from public.campaigns c
 where c.business_unit_id='22222222-2222-4222-8222-222222222222' and c.number=6)
 then raise exception '#6 row changed'; end if;
end $$;
-- Structural assertions run inside provisioning, BEFORE commit. These do not bypass
-- RPC authorization. Run staging-qa-fixtures-readiness.sql with a legitimate
-- existing member later for actual RPC evidence (no Auth user is created here).
do $$
declare q record; pid uuid; actual text[]; expected text[]; n integer;
begin
 for q in select * from qa_products where unit='22222222-2222-4222-8222-222222222222' loop
  select count(*) into n from public.import_presentations where product_id=q.id and archived_at is null and publication_status='published';
  if n<>1 then raise exception 'Expected exactly one published QA presentation: %',q.slug; end if;
  select count(*) into n from public.campaign_products where product_id=q.id;
  if n<>(case when q.slug='staging-qa-import-no-offer' then 0 else 1 end) then
   raise exception 'Unexpected QA offer count: %',q.slug; end if;
  if exists(select 1 from public.campaign_products cp join public.campaigns c on c.id=cp.campaign_id
   where cp.product_id=q.id and (c.number<>6 or c.business_unit_id<>q.unit or cp.price_amount<>0.01
    or cp.currency<>'PEN' or cp.availability_status<>'available'
    or cp.id<>md5('4J5F-A/offer/'||q.slug)::uuid
    or cp.import_presentation_id<>md5('4J5F-A/presentation/'||q.slug)::uuid)) then
   raise exception 'QA offer contract mismatch'; end if;
  select count(*) into n from public.product_media where product_id=q.id;
  if n<>(case when q.slug='staging-qa-import-no-media' then 0 else 1 end) then
   raise exception 'Unexpected QA media count: %',q.slug; end if;
  select array_remove(array[
   case when not exists(select 1 from public.product_media where product_id=q.id and is_primary and archived_at is null) then 'missing_primary_media' end,
   case when not exists(select 1 from public.campaign_products cp join public.campaigns c on c.id=cp.campaign_id
    where cp.product_id=q.id and c.number=6 and c.business_unit_id=q.unit) then 'missing_offer' end
  ],null) into actual;
  expected:=case q.slug when 'staging-qa-import-ready' then array[]::text[]
   when 'staging-qa-import-no-media' then array['missing_primary_media'] else array['missing_offer'] end;
  if actual<>expected then raise exception 'QA structural blockers mismatch: %',q.slug; end if;
 end loop;
 for q in select * from qa_products where slug in('staging-qa-publishable','staging-qa-blocked-media','staging-qa-blocked-variant') loop
  if not exists(select 1 from public.products p where p.id=q.id and p.legacy_id=q.slug and p.gender='unisex'
   and p.publication_status='published' and p.archived_at is null and p.production_status in('active','discontinued')
   and p.availability_status in('available','out_of_stock')) then raise exception 'Parfums mapping fields missing'; end if;
  if (select count(*) from public.product_categories pc join public.categories c on c.id=pc.category_id
   where pc.product_id=q.id and c.business_unit_id=q.unit and c.archived_at is null and c.publication_status='published'
   and ((c.kind='commercial_type' and c.slug='arab') or(c.kind='olfactory_family' and c.slug='staging-qa-family')))<>2
   then raise exception 'Parfums category mapping incomplete'; end if;
  select count(*) into n from public.product_variants where product_id=q.id;
  if n<>(case when q.slug='staging-qa-blocked-variant' then 0 else 1 end) then raise exception 'Parfums variant scenario mismatch'; end if;
  if q.slug<>'staging-qa-blocked-variant' and not exists(select 1 from public.product_variants v
    join public.inventory i on i.product_variant_id=v.id where v.product_id=q.id and v.variant_kind='decant'
    and v.size_ml=5 and v.price_amount=0.01 and v.currency='PEN' and v.publication_status='published'
    and v.archived_at is null and i.availability_status='available' and i.inventory_mode='status_only')
   then raise exception 'Parfums sellable variant missing'; end if;
 end loop;
 if exists(select 1 from public.product_media m join qa_products owned on owned.id=m.product_id
  where m.secure_url not like 'data:image/svg+xml,%' or m.alt<>'[STAGING QA] Synthetic test card'
  or not m.is_primary or m.archived_at is not null) then raise exception 'Unexpected QA media'; end if;
 if exists(select 1 from public.product_media m join qa_products owned on owned.id=m.product_id
  where owned.slug in('staging-qa-blocked-media','staging-qa-import-no-media')) then raise exception 'No-media scenario has media'; end if;
end $$;
select '4J5F-A applied' as status,(select count(*) from qa_products) as qa_products,
 (select count(*) from qa_offers_before) as unchanged_non_qa_offers,
 md5((select row::text from qa_campaign_before)) as unchanged_campaign_hash;
commit;
