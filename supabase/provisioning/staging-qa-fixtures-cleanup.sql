-- 4J5F-A cleanup. STAGING ONLY iyxidhglyqkzoziyewlc, after hosted QA.
-- Verify linked ref, pass --linked --project-ref iyxidhglyqkzoziyewlc explicitly.
-- Exact unit + slug + name + brand; never a prefix or campaign-only selector.
-- #6 and real offers are never deleted. Transaction/FKs reject unexpected references.
-- 4J5G-A3 addition: removes ONLY the one deterministic campaign-9002 QA link
-- added by staging-qa-fixtures-campaign-9002-link.sql, by its exact id.
-- No wildcard/pattern selector. Campaign #6's offer for the same product
-- is a distinct row (different id) and is untouched by this delete.
begin;
set local lock_timeout='5s';

delete from public.campaign_products
 where id=md5('4J5G-A3/offer/staging-qa-import-ready-9002')::uuid;
create temp table qa_cleanup_products on commit drop as
select p.id,p.slug,p.business_unit_id from public.products p join(values
('11111111-1111-4111-8111-111111111111','staging-qa-publishable','[STAGING QA] Parfums Mapper Ready'),
('11111111-1111-4111-8111-111111111111','staging-qa-blocked-media','[STAGING QA] Parfums Sin Media (sin guard)'),
('11111111-1111-4111-8111-111111111111','staging-qa-blocked-variant','[STAGING QA] Parfums Sin Variantes (omitido por mapper)'),
('11111111-1111-4111-8111-111111111111','staging-qa-archived','[STAGING QA] Archivado'),
('11111111-1111-4111-8111-111111111111','staging-qa-combo-ready','[STAGING QA] Combo Composicion Configurada'),
('11111111-1111-4111-8111-111111111111','staging-qa-combo-pending','[STAGING QA] Combo Composicion Pendiente'),
('22222222-2222-4222-8222-222222222222','staging-qa-import-ready','[STAGING QA] Import Ready'),
('22222222-2222-4222-8222-222222222222','staging-qa-import-no-media','[STAGING QA] Import Sin Media'),
('22222222-2222-4222-8222-222222222222','staging-qa-import-no-offer','[STAGING QA] Import Sin Oferta')
) q(unit,slug,name) on p.business_unit_id=q.unit::uuid and p.slug=q.slug and p.name=q.name
where p.brand='[STAGING QA]';

delete from public.campaign_products cp using qa_cleanup_products q,public.campaigns c
where cp.product_id=q.id and q.business_unit_id='22222222-2222-4222-8222-222222222222'
and q.slug in('staging-qa-import-ready','staging-qa-import-no-media')
and cp.id=md5('4J5F-A/offer/'||q.slug)::uuid
and cp.import_presentation_id=md5('4J5F-A/presentation/'||q.slug)::uuid
and cp.campaign_id=c.id and c.business_unit_id=q.business_unit_id and c.number=6;
delete from public.import_presentations ip using qa_cleanup_products q
where ip.product_id=q.id and q.business_unit_id='22222222-2222-4222-8222-222222222222'
and q.slug in('staging-qa-import-ready','staging-qa-import-no-media','staging-qa-import-no-offer')
and ip.id=md5('4J5F-A/presentation/'||q.slug)::uuid
and ip.stable_key='staging-qa-single' and ip.label='[STAGING QA] Single';
delete from public.combo_items ci using public.combos c,qa_cleanup_products q
where ci.combo_id=c.id and c.product_id=q.id
and q.slug in('staging-qa-combo-ready','staging-qa-combo-pending')
and q.business_unit_id='11111111-1111-4111-8111-111111111111';
delete from public.combos c using qa_cleanup_products q
where c.product_id=q.id and q.slug in('staging-qa-combo-ready','staging-qa-combo-pending')
and q.business_unit_id='11111111-1111-4111-8111-111111111111';
-- FK cascades remove only these products' variants/inventory/media/category links.
delete from public.products p using qa_cleanup_products q where p.id=q.id and p.business_unit_id=q.business_unit_id and p.slug=q.slug;
delete from public.categories c using(values
('staging-qa-family','[STAGING QA] Aroma'),('arab','[STAGING QA] Commercial Type')
) q(slug,name) where c.business_unit_id='11111111-1111-4111-8111-111111111111' and c.slug=q.slug and c.name=q.name;
delete from public.campaigns c using(values
(9001,'[STAGING QA] Draft'),(9002,'[STAGING QA] Open'),(9003,'[STAGING QA] Closed')
) q(num,name) where c.business_unit_id='22222222-2222-4222-8222-222222222222' and c.number=q.num and c.name=q.name;
commit;
