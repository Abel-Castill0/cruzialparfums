-- Synthetic Gate B fixtures: disposable LOCAL stack only; runner rejects hosted URLs.
update public.inventory set inventory_mode='tracked_quantity',quantity_on_hand=5
 where product_variant_id='99002000-0000-4000-8000-000000000002' and reserved_quantity=0;
insert into public.orders(id,business_unit_id,order_number,customer_snapshot,subtotal_amount) values
 ('99003000-0000-4000-8000-000000000010','11111111-1111-4111-8111-111111111111','CRP-LOCAL-GATE-B','{"name":"LOCAL QA Gate B","phone":"987999003"}',20),
 ('99003000-0000-4000-8000-000000000011','22222222-2222-4222-8222-222222222222','CRI-LOCAL-GATE-B','{"name":"LOCAL QA Gate B","phone":"987999003"}',20) on conflict do nothing;
insert into public.order_lines(id,order_id,product_id,product_variant_id,product_name_snapshot,variant_label_snapshot,unit_price_amount,quantity,line_total_amount) values
 ('99003000-0000-4000-8000-000000000012','99003000-0000-4000-8000-000000000010','99002000-0000-4000-8000-000000000001','99002000-0000-4000-8000-000000000002','LOCAL QA','5 ml',10,2,20) on conflict do nothing;
insert into public.products(id,business_unit_id,slug,name,brand,publication_status) values
 ('99003000-0000-4000-8000-000000000020','22222222-2222-4222-8222-222222222222','local-gate-b-bulk','LOCAL Gate B lote','LOCAL QA','draft') on conflict do nothing;
insert into public.import_presentations(id,product_id,stable_key,label,presentation_class,publication_status) values
 ('99003000-0000-4000-8000-000000000021','99003000-0000-4000-8000-000000000020','local-gate-b-bulk','LOCAL Gate B presentación','single_fixed','draft') on conflict do nothing;
insert into public.campaigns(id,business_unit_id,number,name,status) values
 ('99003000-0000-4000-8000-000000000030','22222222-2222-4222-8222-222222222222',9999,'LOCAL Gate B borrador','draft') on conflict do nothing;
insert into public.campaign_products(id,campaign_id,product_id,import_presentation_id,price_amount,availability_status) values
 ('99003000-0000-4000-8000-000000000031','99003000-0000-4000-8000-000000000030','99003000-0000-4000-8000-000000000020','99003000-0000-4000-8000-000000000021',50,'available') on conflict do nothing;
insert into public.product_media(id,product_id,provider,secure_url,alt,is_primary) values
 ('99003000-0000-4000-8000-000000000032','99003000-0000-4000-8000-000000000020','legacy_static','/icon.png','LOCAL QA fixture',true) on conflict do nothing;
insert into public.complaint_book_entries(id,business_unit_id,request_id,complaint_type,full_name,document_type,document_number,address,phone,email,detail,consumer_request,created_at) values
 ('99003000-0000-4000-8000-000000000040','11111111-1111-4111-8111-111111111111','99003000-0000-4000-8000-000000000041','reclamo','LOCAL Gate B reclamo','dni','12345678','LOCAL QA','987999003','local-qa@example.test','LOCAL QA sin consumidor real','LOCAL QA respuesta humana',now()-interval '60 days') on conflict do nothing;
insert into public.notification_outbox(id,business_unit_id,event_type,entity_type,entity_id,channel,recipient,template_key,template_data,status,attempts,last_error_safe,idempotency_key) values
 ('99003000-0000-4000-8000-000000000050','22222222-2222-4222-8222-222222222222','order_confirmed','order','99003000-0000-4000-8000-000000000011','whatsapp','51987999003','order_confirmed','{"reference":"CRI-LOCAL-GATE-B"}','failed',1,'provider_rejected','local-gate-b-retry-fixture') on conflict do nothing;
