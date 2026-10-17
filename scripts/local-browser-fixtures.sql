-- Synthetic fixtures for disposable LOCAL browser verification only.
-- Invoked by local-admin-browser.mjs --seed through the loopback-only runner.
-- Never represents client prices, availability, identity, or product imagery.
begin;
-- Import Mayorista editor fixtures: synthetic values on the disposable local
-- stack only; production provisioning writes its own owner-reviewed policies.
insert into public.wholesale_policies (business_unit_id,name,scope,commercial_type,min_quantity,discount_amount,currency,notes,is_active)
select unit.id, rule.name, 'per_commercial_type', rule.commercial_type, rule.min_quantity, rule.discount_amount, 'PEN', 'LOCAL QA — synthetic editor fixture', true
from public.business_units unit
cross join (values ('LOCAL QA Mayorista Árabe','arabic',4,1.00::numeric),('LOCAL QA Mayorista Diseñador','designer',4,2.00::numeric),('LOCAL QA Mayorista Nicho','niche',4,3.00::numeric)) as rule(name,commercial_type,min_quantity,discount_amount)
where unit.code='import'
on conflict (business_unit_id,commercial_type) where scope='per_commercial_type' and archived_at is null do nothing;
insert into public.categories(id,business_unit_id,kind,slug,name,publication_status)
values ('99001000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','import_category','local-qa','LOCAL QA','published') on conflict do nothing;
insert into public.products(id,business_unit_id,slug,name,brand,publication_status)
values ('99001000-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222','local-qa-import','LOCAL QA — Producto de prueba','LOCAL QA','published') on conflict do nothing;
insert into public.product_categories(product_id,category_id)
values ('99001000-0000-4000-8000-000000000002','99001000-0000-4000-8000-000000000001') on conflict do nothing;
insert into public.import_presentations(id,product_id,stable_key,label,presentation_class,capacity_ml,publication_status)
values ('99001000-0000-4000-8000-000000000003','99001000-0000-4000-8000-000000000002','local-qa-100','QA 100 ml','single_fixed',100,'published') on conflict do nothing;
insert into public.campaigns(id,business_unit_id,number,name,status,opens_at,closes_at)
values ('99001000-0000-4000-8000-000000000004','22222222-2222-4222-8222-222222222222',9901,'LOCAL QA activo','open',now()-interval '1 day',now()+interval '1 day'),
('99001000-0000-4000-8000-000000000005','22222222-2222-4222-8222-222222222222',9902,'LOCAL QA cerrado','closed',now()-interval '2 days',now()-interval '1 day')
-- The windows are relative to now(): on a database that persists between days (the hosted QA project) a plain
-- `do nothing` left 'LOCAL QA activo' expired two days after the first seed, so every Import purchase journey
-- failed with "Producto no disponible". Re-seeding must renew the windows.
on conflict (id) do update set status=excluded.status, opens_at=excluded.opens_at, closes_at=excluded.closes_at, archived_at=null;
insert into public.campaign_products(id,campaign_id,product_id,import_presentation_id,price_amount,availability_status)
values ('99001000-0000-4000-8000-000000000006','99001000-0000-4000-8000-000000000004','99001000-0000-4000-8000-000000000002','99001000-0000-4000-8000-000000000003',10,'available'),
('99001000-0000-4000-8000-000000000007','99001000-0000-4000-8000-000000000005','99001000-0000-4000-8000-000000000002','99001000-0000-4000-8000-000000000003',20,'available') on conflict do nothing;
-- A generic brand mark labels synthetic QA data; never a substituted perfume.
insert into public.product_media(id,product_id,provider,secure_url,alt,is_primary)
values ('99001000-0000-4000-8000-000000000008','99001000-0000-4000-8000-000000000002','legacy_static','/icon.png','LOCAL QA — imagen de prueba',true) on conflict do nothing;
-- A second synthetic photo so the Import product page gallery (thumbnails, arrows) has something to show.
insert into public.product_media(id,product_id,provider,secure_url,alt,is_primary,sort_order)
values ('99001000-0000-4000-8000-000000000018','99001000-0000-4000-8000-000000000002','legacy_static','/parfums/logo-mark.png','LOCAL QA — segunda imagen',false,1) on conflict do nothing;

-- Parfums QA product: one published, always-available decant so the admin
-- product/variant/media/inventory journeys have something real to open.
-- Gender + a published commercial_type category are required for the
-- PUBLIC storefront to show it at all (mapPublicProduct fails closed
-- without both) — included so the public Parfums journey is also testable.
insert into public.categories(id,business_unit_id,kind,slug,name,publication_status)
values ('99002000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','commercial_type','niche','LOCAL QA Nicho','published') on conflict do nothing;
insert into public.products(id,business_unit_id,slug,name,brand,gender,sales_mode,publication_status)
values ('99002000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','local-qa-parfums','LOCAL QA — Producto de prueba','LOCAL QA','unisex','always_available','published') on conflict do nothing;
insert into public.product_categories(product_id,category_id)
values ('99002000-0000-4000-8000-000000000001','99002000-0000-4000-8000-000000000004') on conflict do nothing;
insert into public.product_variants(id,product_id,variant_kind,size_ml,label,price_amount,currency,publication_status,price_verification_status)
values ('99002000-0000-4000-8000-000000000002','99002000-0000-4000-8000-000000000001','decant',5,'LOCAL QA 5 ml',10,'PEN','published','client_confirmed') on conflict do nothing;
insert into public.inventory(product_variant_id,inventory_mode,availability_status)
values ('99002000-0000-4000-8000-000000000002','status_only','available') on conflict do nothing;
insert into public.product_media(id,product_id,provider,secure_url,alt,is_primary)
values ('99002000-0000-4000-8000-000000000003','99002000-0000-4000-8000-000000000001','legacy_static','/icon.png','LOCAL QA — imagen de prueba',true) on conflict do nothing;
select * from public.create_import_order_request('99001000-1111-4000-8000-000000000009',
  '{"name":"LOCAL QA Cliente","phone":"987999001"}',
  '{"district":"Lima","address":"LOCAL QA — no despachar"}',
  jsonb_build_array(jsonb_build_object('offer_id','99001000-0000-4000-8000-000000000006',
  'offer_updated_at',(select updated_at from public.campaign_products where id='99001000-0000-4000-8000-000000000006'),'quantity',1)));
-- LOCAL QA combo (synthetic, local stack only): one published set whose
-- confirmed composition is the LOCAL QA fragrance, so the public combos
-- surface renders a real card in local E2E instead of skipping.
insert into public.products(id,business_unit_id,slug,name,brand,gender,sales_mode,publication_status,description)
values ('99002000-0000-4000-8000-000000000011','11111111-1111-4111-8111-111111111111','local-qa-combo','LOCAL QA — Set de prueba','LOCAL QA','unisex','always_available','published','Set sintético de prueba local.') on conflict do nothing;
insert into public.product_variants(id,product_id,variant_kind,size_ml,label,price_amount,currency,publication_status,price_verification_status)
values ('99002000-0000-4000-8000-000000000012','99002000-0000-4000-8000-000000000011','decant',5,'LOCAL QA Set 5 ml',30,'PEN','published','client_confirmed') on conflict do nothing;
insert into public.inventory(product_variant_id,inventory_mode,availability_status)
values ('99002000-0000-4000-8000-000000000012','status_only','available') on conflict do nothing;
insert into public.product_media(id,product_id,provider,secure_url,alt,is_primary)
values ('99002000-0000-4000-8000-000000000013','99002000-0000-4000-8000-000000000011','legacy_static','/icon.png','LOCAL QA — set de prueba',true) on conflict do nothing;
insert into public.combos(id,product_id,composition_verification_status)
values ('99002000-0000-4000-8000-000000000014','99002000-0000-4000-8000-000000000011','client_confirmed') on conflict do nothing;
insert into public.combo_items(id,combo_id,product_variant_id,combo_product_variant_id,quantity,sort_order)
values ('99002000-0000-4000-8000-000000000015','99002000-0000-4000-8000-000000000014','99002000-0000-4000-8000-000000000002','99002000-0000-4000-8000-000000000012',1,0) on conflict do nothing;

-- Phase B2B (synthetic, local stack only). All products are DRAFT so no
-- public storefront surface changes; values are arbitrary QA numbers, never
-- client prices. Wholesale policies come from the migrations as-is.
-- (a) Read-only combo whose composition is official_pdf source authority,
--     with two presentations so composition groups render.
insert into public.products(id,business_unit_id,slug,name,brand,gender,sales_mode,publication_status)
values ('99002000-0000-4000-8000-000000000021','11111111-1111-4111-8111-111111111111','local-qa-b2b-set-oficial','LOCAL QA — Set oficial','LOCAL QA','unisex','always_available','draft'),
('99002000-0000-4000-8000-000000000031','11111111-1111-4111-8111-111111111111','local-qa-b2b-set-editable','LOCAL QA — Set editable','LOCAL QA','unisex','always_available','draft'),
('99002000-0000-4000-8000-000000000041','11111111-1111-4111-8111-111111111111','local-qa-b2b-frasco-nicho','LOCAL QA — Frasco mayorista','LOCAL QA','unisex','always_available','draft'),
('99002000-0000-4000-8000-000000000043','11111111-1111-4111-8111-111111111111','local-qa-b2b-frasco-sin-tipo','LOCAL QA — Frasco sin tipo','LOCAL QA','unisex','always_available','draft') on conflict do nothing;
insert into public.product_variants(id,product_id,variant_kind,size_ml,label,price_amount,currency,publication_status,price_verification_status)
values ('99002000-0000-4000-8000-000000000022','99002000-0000-4000-8000-000000000021','decant',3,'LOCAL QA Set 3 ml',20,'PEN','published','client_confirmed'),
('99002000-0000-4000-8000-000000000023','99002000-0000-4000-8000-000000000021','decant',5,'LOCAL QA Set 5 ml',30,'PEN','published','client_confirmed'),
('99002000-0000-4000-8000-000000000032','99002000-0000-4000-8000-000000000031','decant',5,'LOCAL QA Set editable 5 ml',30,'PEN','published','client_confirmed'),
('99002000-0000-4000-8000-000000000042','99002000-0000-4000-8000-000000000041','bottle',100,'LOCAL QA 100 ml',100,'PEN','published','client_confirmed'),
('99002000-0000-4000-8000-000000000044','99002000-0000-4000-8000-000000000043','bottle',100,'LOCAL QA sin tipo 100 ml',100,'PEN','published','client_confirmed') on conflict do nothing;
insert into public.inventory(product_variant_id,inventory_mode,availability_status)
values ('99002000-0000-4000-8000-000000000042','status_only','available'),
('99002000-0000-4000-8000-000000000044','status_only','available') on conflict do nothing;
insert into public.product_categories(product_id,category_id)
values ('99002000-0000-4000-8000-000000000041','99002000-0000-4000-8000-000000000004') on conflict do nothing;
insert into public.combos(id,product_id,composition_verification_status)
values ('99002000-0000-4000-8000-000000000024','99002000-0000-4000-8000-000000000021','official_pdf'),
-- (b) Disposable combo the authenticated E2E may edit (composition,
--     verification, archive/restore) — never read-only assertions.
('99002000-0000-4000-8000-000000000034','99002000-0000-4000-8000-000000000031','pending_reconfirmation') on conflict do nothing;
insert into public.combo_items(id,combo_id,product_variant_id,combo_product_variant_id,quantity,sort_order)
values ('99002000-0000-4000-8000-000000000025','99002000-0000-4000-8000-000000000024','99002000-0000-4000-8000-000000000002','99002000-0000-4000-8000-000000000022',1,0),
('99002000-0000-4000-8000-000000000026','99002000-0000-4000-8000-000000000024','99002000-0000-4000-8000-000000000042','99002000-0000-4000-8000-000000000022',1,1),
('99002000-0000-4000-8000-000000000027','99002000-0000-4000-8000-000000000024','99002000-0000-4000-8000-000000000002','99002000-0000-4000-8000-000000000023',2,0),
('99002000-0000-4000-8000-000000000035','99002000-0000-4000-8000-000000000034','99002000-0000-4000-8000-000000000002','99002000-0000-4000-8000-000000000032',1,0) on conflict do nothing;

-- Coverage fixtures (synthetic, local stack only; never client data). Several Playwright specs used to
-- skip on a one-product stack: the featured rail needs >= 5 items to loop/auto-rotate, and the gallery
-- needs a product with more than one photo. These are real published products so the same code paths run.
insert into public.products(id,business_unit_id,slug,name,brand,gender,sales_mode,publication_status,is_featured,featured_rank)
select ('99003000-0000-4000-8000-'||lpad((100+n)::text,12,'0'))::uuid,'11111111-1111-4111-8111-111111111111',
  'local-qa-destacado-'||n,'LOCAL QA — Destacado '||n,'LOCAL QA','unisex','always_available','published',true,n
from generate_series(1,6) as n on conflict do nothing;
insert into public.product_categories(product_id,category_id)
select ('99003000-0000-4000-8000-'||lpad((100+n)::text,12,'0'))::uuid,'99002000-0000-4000-8000-000000000004'
from generate_series(1,6) as n on conflict do nothing;
insert into public.product_variants(id,product_id,variant_kind,size_ml,label,price_amount,currency,publication_status,price_verification_status)
select ('99003000-0000-4000-8000-'||lpad((200+n)::text,12,'0'))::uuid,('99003000-0000-4000-8000-'||lpad((100+n)::text,12,'0'))::uuid,
  'decant',5,'LOCAL QA Destacado '||n||' 5 ml',10+n,'PEN','published','client_confirmed'
from generate_series(1,6) as n on conflict do nothing;
insert into public.inventory(product_variant_id,inventory_mode,availability_status)
select ('99003000-0000-4000-8000-'||lpad((200+n)::text,12,'0'))::uuid,'status_only','available'
from generate_series(1,6) as n on conflict do nothing;
insert into public.product_media(id,product_id,provider,secure_url,alt,is_primary)
select ('99003000-0000-4000-8000-'||lpad((300+n)::text,12,'0'))::uuid,('99003000-0000-4000-8000-'||lpad((100+n)::text,12,'0'))::uuid,
  'legacy_static','/icon.png','LOCAL QA — imagen de prueba',true
from generate_series(1,6) as n on conflict do nothing;
-- Product with two photos (distinct URLs: the gallery de-duplicates by URL): drives the gallery (thumbnails, arrows, keyboard) spec.
insert into public.products(id,business_unit_id,slug,name,brand,gender,sales_mode,publication_status)
values ('99003000-0000-4000-8000-000000000500','11111111-1111-4111-8111-111111111111','local-qa-galeria','LOCAL QA — Galería','LOCAL QA','unisex','always_available','published') on conflict do nothing;
insert into public.product_categories(product_id,category_id)
values ('99003000-0000-4000-8000-000000000500','99002000-0000-4000-8000-000000000004') on conflict do nothing;
insert into public.product_variants(id,product_id,variant_kind,size_ml,label,price_amount,currency,publication_status,price_verification_status)
values ('99003000-0000-4000-8000-000000000501','99003000-0000-4000-8000-000000000500','decant',5,'LOCAL QA Galería 5 ml',10,'PEN','published','client_confirmed') on conflict do nothing;
insert into public.inventory(product_variant_id,inventory_mode,availability_status)
values ('99003000-0000-4000-8000-000000000501','status_only','available') on conflict do nothing;
insert into public.product_media(id,product_id,provider,secure_url,alt,is_primary,sort_order)
values ('99003000-0000-4000-8000-000000000502','99003000-0000-4000-8000-000000000500','legacy_static','/icon.png','LOCAL QA — foto principal',true,0),
('99003000-0000-4000-8000-000000000503','99003000-0000-4000-8000-000000000500','legacy_static','/parfums/logo-mark.png','LOCAL QA — foto secundaria',false,1) on conflict (id) do update set secure_url=excluded.secure_url;

-- Import publication-readiness fixtures (admin-authenticated.spec.ts): three published products assessed
-- against one DRAFT consolidado (number 9800, below every other fixture campaign, so it is never the
-- admin's default selection and nothing here is ever public): ready / missing primary media / missing offer.
insert into public.campaigns(id,business_unit_id,number,name,status)
values ('99004000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222',9800,'LOCAL QA preparación','draft') on conflict do nothing;
insert into public.products(id,business_unit_id,slug,name,brand,publication_status) values
('99004000-0000-4000-8000-000000000010','22222222-2222-4222-8222-222222222222','local-qa-import-ready','LOCAL QA — Import listo','LOCAL QA','published'),
('99004000-0000-4000-8000-000000000020','22222222-2222-4222-8222-222222222222','local-qa-import-no-media','LOCAL QA — Import sin imagen','LOCAL QA','published'),
('99004000-0000-4000-8000-000000000030','22222222-2222-4222-8222-222222222222','local-qa-import-no-offer','LOCAL QA — Import sin oferta','LOCAL QA','published') on conflict do nothing;
insert into public.product_categories(product_id,category_id) values
('99004000-0000-4000-8000-000000000010','99001000-0000-4000-8000-000000000001'),
('99004000-0000-4000-8000-000000000020','99001000-0000-4000-8000-000000000001'),
('99004000-0000-4000-8000-000000000030','99001000-0000-4000-8000-000000000001') on conflict do nothing;
insert into public.import_presentations(id,product_id,stable_key,label,presentation_class,capacity_ml,publication_status) values
('99004000-0000-4000-8000-000000000011','99004000-0000-4000-8000-000000000010','local-qa-ready-100','QA 100 ml','single_fixed',100,'published'),
('99004000-0000-4000-8000-000000000021','99004000-0000-4000-8000-000000000020','local-qa-no-media-100','QA 100 ml','single_fixed',100,'published'),
('99004000-0000-4000-8000-000000000031','99004000-0000-4000-8000-000000000030','local-qa-no-offer-100','QA 100 ml','single_fixed',100,'published') on conflict do nothing;
insert into public.campaign_products(id,campaign_id,product_id,import_presentation_id,price_amount,availability_status) values
('99004000-0000-4000-8000-000000000012','99004000-0000-4000-8000-000000000001','99004000-0000-4000-8000-000000000010','99004000-0000-4000-8000-000000000011',10,'available'),
('99004000-0000-4000-8000-000000000022','99004000-0000-4000-8000-000000000001','99004000-0000-4000-8000-000000000020','99004000-0000-4000-8000-000000000021',10,'available') on conflict do nothing;
insert into public.product_media(id,product_id,provider,secure_url,alt,is_primary) values
('99004000-0000-4000-8000-000000000013','99004000-0000-4000-8000-000000000010','legacy_static','/icon.png','LOCAL QA — imagen de prueba',true),
('99004000-0000-4000-8000-000000000033','99004000-0000-4000-8000-000000000030','legacy_static','/icon.png','LOCAL QA — imagen de prueba',true) on conflict do nothing;
-- Motorcycle delivery zones (docs/commercial-rules.md): the owner's PROPOSED list, only on the disposable local stack and
-- the QA project, so the checkout e2e can exercise a covered and a restricted district. Production loads its own list
-- after the owner validates it (supabase/provisioning/delivery-zones-PROPOSED.sql).
insert into public.delivery_zones (business_unit_id, district, is_restricted)
select '11111111-1111-4111-8111-111111111111', zone.district, zone.is_restricted
from (values ('Ancón',true),('Santa Rosa',true),('Puente Piedra',true),('Carabayllo',false),('San Martín de Porres',false),('Los Olivos',false),('Comas',false),('Rímac',false),('Independencia',false),('San Juan de Lurigancho',false),('San Miguel',false),('Pueblo Libre',false),('Cercado de Lima',false),('El Agustino',false),('Santa Anita',false),('Ate',false),('Chaclacayo',true),('Lurigancho-Chosica',true),('Magdalena del Mar',false),('Jesús María',false),('Breña',false),('La Victoria',false),('San Luis',false),('La Molina',false),('Cieneguilla',true),('San Isidro',false),('Lince',false),('Surquillo',false),('San Borja',false),('Santiago de Surco',false),('Miraflores',false),('Barranco',false),('Chorrillos',false),('San Juan de Miraflores',false),('Villa María del Triunfo',false),('Pachacámac',true),('Villa El Salvador',false),('Lurín',true),('Punta Hermosa',true),('Punta Negra',true),('San Bartolo',true),('Santa María del Mar',true),('Pucusana',true)) as zone(district, is_restricted)
on conflict do nothing;

-- Whole-bottle catalog (/parfums/frascos) + the free 2 ml gift (docs/commercial-rules.md). Synthetic, local stack only.
-- An Arabic commercial_type category so these classify as "arab" (the public storefront only shows a product with a
-- published commercial_type category and a gender), one Arabic perfume with a sealed bottle (its own card and a full
-- bottle for the gift), one Arabic decant-only perfume (a gift candidate), and one Arabic decant-only perfume that the
-- active gift_exclusion rule excludes. The gift rule is a single row per unit (unique business_unit_id, rule_type).
insert into public.categories(id,business_unit_id,kind,slug,name,publication_status)
values ('99005000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','commercial_type','arabic','LOCAL QA Árabe','published') on conflict do nothing;
insert into public.products(id,business_unit_id,slug,name,brand,gender,sales_mode,publication_status)
values ('99005000-0000-4000-8000-000000000010','11111111-1111-4111-8111-111111111111','local-qa-frasco','LOCAL QA — Frasco árabe','LOCAL QA','unisex','always_available','published'),
('99005000-0000-4000-8000-000000000020','11111111-1111-4111-8111-111111111111','local-qa-arabe-regalo','LOCAL QA — Árabe de regalo','LOCAL QA','unisex','always_available','published'),
('99005000-0000-4000-8000-000000000030','11111111-1111-4111-8111-111111111111','local-qa-arabe-excluido','LOCAL QA — Árabe excluido','LOCAL QA','unisex','always_available','published') on conflict do nothing;
insert into public.product_categories(product_id,category_id)
values ('99005000-0000-4000-8000-000000000010','99005000-0000-4000-8000-000000000001'),
('99005000-0000-4000-8000-000000000020','99005000-0000-4000-8000-000000000001'),
('99005000-0000-4000-8000-000000000030','99005000-0000-4000-8000-000000000001') on conflict do nothing;
insert into public.product_variants(id,product_id,variant_kind,size_ml,label,price_amount,currency,publication_status,price_verification_status)
values ('99005000-0000-4000-8000-000000000011','99005000-0000-4000-8000-000000000010','decant',5,'LOCAL QA Frasco 5 ml',10,'PEN','published','client_confirmed'),
('99005000-0000-4000-8000-000000000012','99005000-0000-4000-8000-000000000010','bottle',50,'LOCAL QA Frasco 50 ml',90,'PEN','published','client_confirmed'),
('99005000-0000-4000-8000-000000000013','99005000-0000-4000-8000-000000000010','bottle',100,'LOCAL QA Frasco 100 ml',140,'PEN','published','client_confirmed'),
('99005000-0000-4000-8000-000000000021','99005000-0000-4000-8000-000000000020','decant',5,'LOCAL QA Regalo 5 ml',12,'PEN','published','client_confirmed'),
('99005000-0000-4000-8000-000000000031','99005000-0000-4000-8000-000000000030','decant',5,'LOCAL QA Excluido 5 ml',12,'PEN','published','client_confirmed') on conflict do nothing;
insert into public.inventory(product_variant_id,inventory_mode,availability_status)
values ('99005000-0000-4000-8000-000000000011','status_only','available'),
('99005000-0000-4000-8000-000000000012','status_only','available'),
('99005000-0000-4000-8000-000000000013','status_only','available'),
('99005000-0000-4000-8000-000000000021','status_only','available'),
('99005000-0000-4000-8000-000000000031','status_only','available') on conflict do nothing;
insert into public.product_media(id,product_id,provider,secure_url,alt,is_primary)
values ('99005000-0000-4000-8000-000000000014','99005000-0000-4000-8000-000000000010','legacy_static','/icon.png','LOCAL QA — frasco de prueba',true),
('99005000-0000-4000-8000-000000000022','99005000-0000-4000-8000-000000000020','legacy_static','/icon.png','LOCAL QA — regalo de prueba',true),
('99005000-0000-4000-8000-000000000032','99005000-0000-4000-8000-000000000030','legacy_static','/icon.png','LOCAL QA — excluido de prueba',true) on conflict do nothing;
insert into public.promotion_rules (business_unit_id, rule_type, conditions, actions, is_active)
values ('11111111-1111-4111-8111-111111111111','gift_exclusion',jsonb_build_object('excluded_product_ids', jsonb_build_array('99005000-0000-4000-8000-000000000030'::text)),'{}'::jsonb,true)
on conflict (business_unit_id, rule_type) do update set conditions = excluded.conditions, actions = excluded.actions, is_active = excluded.is_active;
commit;
