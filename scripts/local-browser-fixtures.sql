-- Synthetic fixtures for disposable LOCAL browser verification only.
-- Invoked by local-admin-browser.mjs --seed through the loopback-only runner.
-- Never represents client prices, availability, identity, or product imagery.
begin;
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
('99001000-0000-4000-8000-000000000005','22222222-2222-4222-8222-222222222222',9902,'LOCAL QA cerrado','closed',now()-interval '2 days',now()-interval '1 day') on conflict do nothing;
insert into public.campaign_products(id,campaign_id,product_id,import_presentation_id,price_amount,availability_status)
values ('99001000-0000-4000-8000-000000000006','99001000-0000-4000-8000-000000000004','99001000-0000-4000-8000-000000000002','99001000-0000-4000-8000-000000000003',10,'available'),
('99001000-0000-4000-8000-000000000007','99001000-0000-4000-8000-000000000005','99001000-0000-4000-8000-000000000002','99001000-0000-4000-8000-000000000003',20,'available') on conflict do nothing;
-- A generic brand mark labels synthetic QA data; never a substituted perfume.
insert into public.product_media(id,product_id,provider,secure_url,alt,is_primary)
values ('99001000-0000-4000-8000-000000000008','99001000-0000-4000-8000-000000000002','legacy_static','/icon.png','LOCAL QA — imagen de prueba',true) on conflict do nothing;

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
commit;
