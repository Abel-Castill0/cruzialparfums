-- Cruzial Platform V2 — 4J4A Import presentations + unconfirmed availability

begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('89000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'import-admin-4j4a@example.test', '', now(), now()),
  ('89000000-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'import-viewer-4j4a@example.test', '', now(), now()),
  ('89000000-cccc-4ccc-8ccc-cccccccccccc', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'parfums-admin-4j4a@example.test', '', now(), now());

insert into public.admin_memberships (user_id, business_unit_id, role) values
  ('89000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'admin'),
  ('89000000-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'viewer'),
  ('89000000-cccc-4ccc-8ccc-cccccccccccc', '11111111-1111-4111-8111-111111111111', 'admin');

insert into public.products (id, business_unit_id, slug, name, publication_status) values
  ('89001000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'j4a-product-a', 'J4A Product A', 'published'),
  ('89001000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'j4a-product-b', 'J4A Product B', 'published'),
  ('89001000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'j4a-parfums', 'J4A Parfums', 'published');

select lives_ok(
  $$insert into public.import_presentations
      (id, product_id, stable_key, label, presentation_class, capacity_ml, publication_status)
    values ('89002000-0000-4000-8000-000000000001', '89001000-0000-4000-8000-000000000001', '50ml', '50 ml', 'multi_presentation', 50, 'published')$$,
  'an Import presentation belongs to an Import product'
);

select throws_ok(
  $$insert into public.import_presentations
      (id, product_id, stable_key, label, presentation_class, capacity_ml)
    values ('89002000-0000-4000-8000-000000000099', '89001000-0000-4000-8000-000000000003', 'bad', 'Bad', 'single_fixed', 100)$$,
  '23514', null, 'a Parfums product cannot own an Import presentation'
);

insert into public.import_presentations
  (id, product_id, stable_key, label, presentation_class, capacity_ml, composition, publication_status) values
  ('89002000-0000-4000-8000-000000000002', '89001000-0000-4000-8000-000000000001', '100ml', '100 ml', 'multi_presentation', 100, null, 'published'),
  ('89002000-0000-4000-8000-000000000003', '89001000-0000-4000-8000-000000000001', 'pack', 'Pack 3 piezas', 'pack_set', null, '{"item_count":3}', 'published'),
  ('89002000-0000-4000-8000-000000000004', '89001000-0000-4000-8000-000000000001', 'draft', 'Borrador', 'single_fixed', 75, null, 'draft'),
  ('89002000-0000-4000-8000-000000000005', '89001000-0000-4000-8000-000000000001', 'archived', 'Archivada', 'ambiguous', null, null, 'archived');
update public.import_presentations set archived_at = now() where id = '89002000-0000-4000-8000-000000000005';

insert into public.product_variants (id, product_id, variant_kind, label, price_amount, publication_status)
values ('89002500-0000-4000-8000-000000000001', '89001000-0000-4000-8000-000000000001', 'bottle', 'Legacy Import variant', 1, 'published');

insert into public.campaigns (id, business_unit_id, number, name, status) values
  ('89003000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 941, 'J4A Import Open', 'open'),
  ('89003000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 942, 'J4A Parfums Open', 'open');

select ok(app.import_presentation_is_public('89002000-0000-4000-8000-000000000001'), 'published presentation with public parent is publicly eligible');
select isnt(app.import_presentation_is_public('89002000-0000-4000-8000-000000000004'), true, 'draft presentation is not publicly eligible');
select isnt(app.import_presentation_is_public('89002000-0000-4000-8000-000000000005'), true, 'archived presentation is not publicly eligible');
select ok(
  not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'import_presentations' and column_name = 'price_amount'),
  'presentation has no price_amount column'
);
select ok(
  not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'import_presentations' and column_name = 'availability_status'),
  'presentation has no availability_status column'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"89000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
select lives_ok(
  $$select public.admin_set_campaign_products(
    '89003000-0000-4000-8000-000000000001',
    (select updated_at from public.campaigns where id = '89003000-0000-4000-8000-000000000001'),
    '[
      {"product_id":"89001000-0000-4000-8000-000000000001","import_presentation_id":"89002000-0000-4000-8000-000000000001","price_amount":"129.90","availability_status":"available","sort_order":0},
      {"product_id":"89001000-0000-4000-8000-000000000001","import_presentation_id":"89002000-0000-4000-8000-000000000002","price_amount":"150.00","availability_status":"out_of_stock","sort_order":1},
      {"product_id":"89001000-0000-4000-8000-000000000001","import_presentation_id":"89002000-0000-4000-8000-000000000003","price_amount":"175.00","availability_status":"unconfirmed","sort_order":2},
      {"product_id":"89001000-0000-4000-8000-000000000001","import_presentation_id":"89002000-0000-4000-8000-000000000004","price_amount":"99.00","availability_status":"available","sort_order":3}
    ]'::jsonb)$$,
  'Import admin can save multiple presentations and unconfirmed availability'
);
reset role;

select is((select count(*)::integer from public.campaign_products where campaign_id = '89003000-0000-4000-8000-000000000001'), 4, 'same product with four distinct presentations coexists');

set local role authenticated;
set local request.jwt.claims to '{"sub":"89000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
select throws_ok(
  $$select public.admin_set_campaign_products(
    '89003000-0000-4000-8000-000000000001',
    (select updated_at from public.campaigns where id = '89003000-0000-4000-8000-000000000001'),
    '[
      {"product_id":"89001000-0000-4000-8000-000000000001","import_presentation_id":"89002000-0000-4000-8000-000000000001","price_amount":"10.00","availability_status":"available","sort_order":0},
      {"product_id":"89001000-0000-4000-8000-000000000001","import_presentation_id":"89002000-0000-4000-8000-000000000001","price_amount":"11.00","availability_status":"available","sort_order":1}
    ]'::jsonb)$$,
  '23505', null, 'duplicate identical presentation offer is rejected'
);
select throws_ok(
  $$select public.admin_set_campaign_products(
    '89003000-0000-4000-8000-000000000001',
    (select updated_at from public.campaigns where id = '89003000-0000-4000-8000-000000000001'),
    '[{"product_id":"89001000-0000-4000-8000-000000000002","import_presentation_id":"89002000-0000-4000-8000-000000000001","price_amount":"10.00","availability_status":"available","sort_order":0}]'::jsonb)$$,
  'P2004', null, 'presentation from another product is rejected'
);
select throws_ok(
  $$select public.admin_set_campaign_products(
    '89003000-0000-4000-8000-000000000001',
    (select updated_at from public.campaigns where id = '89003000-0000-4000-8000-000000000001'),
    '[{"product_id":"89001000-0000-4000-8000-000000000001","product_variant_id":"89002500-0000-4000-8000-000000000001","import_presentation_id":"89002000-0000-4000-8000-000000000001","price_amount":"10.00","availability_status":"available","sort_order":0}]'::jsonb)$$,
  'P2004', null, 'variant and Import presentation cannot both be referenced'
);
select throws_ok(
  $$select public.admin_set_campaign_products(
    '89003000-0000-4000-8000-000000000001',
    (select updated_at from public.campaigns where id = '89003000-0000-4000-8000-000000000001'),
    '[{"product_id":"89001000-0000-4000-8000-000000000001","import_presentation_id":"89002000-0000-4000-8000-000000000005","price_amount":"10.00","availability_status":"available","sort_order":0}]'::jsonb)$$,
  '22023', null, 'archived presentation is blocked from a new offer'
);
select throws_ok(
  $$select public.admin_set_campaign_products(
    '89003000-0000-4000-8000-000000000001',
    (select updated_at from public.campaigns where id = '89003000-0000-4000-8000-000000000001'),
    '[{"product_id":"89001000-0000-4000-8000-000000000001","import_presentation_id":"89002000-0000-4000-8000-000000000001","price_amount":"10.00","availability_status":"unknown","sort_order":0}]'::jsonb)$$,
  'P2008', null, 'invalid availability is rejected fail-closed'
);
reset role;

select throws_ok(
  $$insert into public.campaign_products
      (campaign_id, product_id, import_presentation_id, price_amount, availability_status)
    values ('89003000-0000-4000-8000-000000000002', '89001000-0000-4000-8000-000000000003', '89002000-0000-4000-8000-000000000001', 10, 'available')$$,
  '23514', null, 'Parfums campaign cannot reference an Import presentation'
);

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select is((select count(*)::integer from public.campaign_products where import_presentation_id = '89002000-0000-4000-8000-000000000001'), 1, 'published presentation plus available is anonymous-visible');
select is((select count(*)::integer from public.campaign_products where import_presentation_id = '89002000-0000-4000-8000-000000000002'), 1, 'published presentation plus out_of_stock is anonymous-visible');
select is((select count(*)::integer from public.campaign_products where import_presentation_id = '89002000-0000-4000-8000-000000000003'), 0, 'unconfirmed offer is hidden from anonymous readers');
select is((select count(*)::integer from public.campaign_products where import_presentation_id = '89002000-0000-4000-8000-000000000004'), 0, 'draft presentation offer is hidden from anonymous readers');
select throws_ok($$select public.admin_set_campaign_products('89003000-0000-4000-8000-000000000001', now(), '[]'::jsonb)$$, '42501', null, 'anonymous cannot call admin mutation RPC');
reset role;

-- Seed separate hidden limits, then prove full-replace identity includes the presentation.
update public.campaign_products set quantity_limit = 5 where import_presentation_id = '89002000-0000-4000-8000-000000000001';
update public.campaign_products set quantity_limit = 9 where import_presentation_id = '89002000-0000-4000-8000-000000000002';
set local role authenticated;
set local request.jwt.claims to '{"sub":"89000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
select lives_ok(
  $$select public.admin_set_campaign_products(
    '89003000-0000-4000-8000-000000000001',
    (select updated_at from public.campaigns where id = '89003000-0000-4000-8000-000000000001'),
    '[
      {"product_id":"89001000-0000-4000-8000-000000000001","import_presentation_id":"89002000-0000-4000-8000-000000000002","price_amount":"151.00","availability_status":"out_of_stock","sort_order":0},
      {"product_id":"89001000-0000-4000-8000-000000000001","import_presentation_id":"89002000-0000-4000-8000-000000000001","price_amount":"129.90","availability_status":"available","sort_order":1}
    ]'::jsonb)$$,
  'full replace preserves limits using complete presentation identity'
);
reset role;
select is((select quantity_limit from public.campaign_products where import_presentation_id = '89002000-0000-4000-8000-000000000001'), 5, 'presentation A keeps its own quantity_limit');
select is((select quantity_limit from public.campaign_products where import_presentation_id = '89002000-0000-4000-8000-000000000002'), 9, 'presentation B keeps its own quantity_limit');

set local role authenticated;
set local request.jwt.claims to '{"sub":"89000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
select is((select price_amount from public.admin_get_import_campaign_products('89003000-0000-4000-8000-000000000001') where import_presentation_id = '89002000-0000-4000-8000-000000000001'), '129.90', 'admin read RPC preserves exact decimal text');
select is((select presentation_label from public.admin_get_import_campaign_products('89003000-0000-4000-8000-000000000001') where import_presentation_id = '89002000-0000-4000-8000-000000000001'), '50 ml', 'admin read RPC returns presentation information');
select throws_ok($$update public.import_presentations set label = label where id = '89002000-0000-4000-8000-000000000001'$$, '42501', null, 'direct authenticated presentation writes remain denied');
select throws_ok($$update public.campaign_products set price_amount = price_amount where campaign_id = '89003000-0000-4000-8000-000000000001'$$, '42501', null, 'direct authenticated campaign offer writes remain denied');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"89000000-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}';
select throws_ok($$select public.admin_set_campaign_products('89003000-0000-4000-8000-000000000001', now(), '[]'::jsonb)$$, '42501', null, 'Import viewer cannot mutate offers');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"89000000-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}';
select throws_ok($$select public.admin_set_campaign_products('89003000-0000-4000-8000-000000000001', now(), '[]'::jsonb)$$, '42501', null, 'Parfums admin cannot mutate Import offers');
reset role;

-- archived presentation with publication_status='archived' but archived_at=NULL must be rejected
insert into public.import_presentations
  (id, product_id, stable_key, label, presentation_class, capacity_ml, publication_status) values
  ('89002000-0000-4000-8000-000000000010', '89001000-0000-4000-8000-000000000001', 'archived-status-only', 'Archived Status Only', 'single_fixed', 30, 'archived');
set local role authenticated;
set local request.jwt.claims to '{"sub":"89000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
select throws_ok(
  $$select public.admin_set_campaign_products(
    '89003000-0000-4000-8000-000000000001',
    (select updated_at from public.campaigns where id = '89003000-0000-4000-8000-000000000001'),
    '[{"product_id":"89001000-0000-4000-8000-000000000001","import_presentation_id":"89002000-0000-4000-8000-000000000010","price_amount":"10.00","availability_status":"available","sort_order":0}]'::jsonb)$$,
  '22023', null, 'presentation with publication_status=archived (even archived_at=NULL) is rejected'
);
reset role;

-- RPC hard cap: non-array rejected
set local role authenticated;
set local request.jwt.claims to '{"sub":"89000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
select throws_ok(
  $$select public.admin_set_campaign_products(
    '89003000-0000-4000-8000-000000000001',
    (select updated_at from public.campaigns where id = '89003000-0000-4000-8000-000000000001'),
    '"not an array"'::jsonb)$$,
  'P2009', null, 'non-array p_items is rejected'
);
reset role;

-- RPC hard cap: oversized payload rejected
set local role authenticated;
set local request.jwt.claims to '{"sub":"89000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
select throws_ok(
  $$select public.admin_set_campaign_products(
    '89003000-0000-4000-8000-000000000001',
    (select updated_at from public.campaigns where id = '89003000-0000-4000-8000-000000000001'),
    (select jsonb_agg(jsonb_build_object('product_id','89001000-0000-4000-8000-000000000001','import_presentation_id','89002000-0000-4000-8000-000000000001','price_amount','10.00','availability_status','available','sort_order', g))
     from generate_series(1, 1501) g)::jsonb)$$,
  'P2009', null, 'p_items exceeding 1500 limit is rejected'
);
reset role;

select * from finish();
rollback;
