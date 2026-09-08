-- Cruzial Platform V2 — Admin Parfums Wholesale (Phase 4d)

begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'parfums-admin-wholesale@example.test', '', now(), now()),
  ('22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'import-admin-wholesale@example.test', '', now(), now()),
  ('33333333-cccc-4ccc-8ccc-cccccccccccc', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'parfums-viewer-wholesale@example.test', '', now(), now());

insert into public.admin_memberships (user_id, business_unit_id, role) values
  ('11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'admin'),
  ('22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'admin'),
  ('33333333-cccc-4ccc-8ccc-cccccccccccc', '11111111-1111-4111-8111-111111111111', 'viewer');

insert into public.categories (id, business_unit_id, kind, slug, name, publication_status) values
  ('a1000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'commercial_type', 'arabic', 'TEST Árabe', 'draft'),
  ('a1000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'commercial_type', 'designer', 'TEST Diseñador', 'draft'),
  ('a1000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'commercial_type', 'niche', 'TEST Nicho', 'draft');

insert into public.products (id, business_unit_id, slug, name, brand, publication_status) values
  ('b1000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'test-arabic-a', 'TEST Arabic A', 'TEST Brand', 'draft'),
  ('b1000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'test-arabic-b', 'TEST Arabic B', 'TEST Brand', 'draft'),
  ('b1000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'test-designer', 'TEST Designer', 'TEST Brand', 'draft'),
  ('b1000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'test-niche', 'TEST Niche', 'TEST Brand', 'draft'),
  ('b1000000-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', 'test-unclassified', 'TEST Unclassified', 'TEST Brand', 'draft'),
  ('b1000000-0000-4000-8000-000000000006', '11111111-1111-4111-8111-111111111111', 'test-ambiguous', 'TEST Ambiguous', 'TEST Brand', 'draft');

insert into public.product_categories (product_id, category_id, sort_order) values
  ('b1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 0),
  ('b1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', 0),
  ('b1000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000002', 0),
  ('b1000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000003', 0),
  ('b1000000-0000-4000-8000-000000000006', 'a1000000-0000-4000-8000-000000000001', 0),
  ('b1000000-0000-4000-8000-000000000006', 'a1000000-0000-4000-8000-000000000002', 1);

insert into public.product_variants (id, product_id, label, variant_kind, price_amount, currency, publication_status) values
  ('c1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'Frasco A', 'bottle', 100.00, 'PEN', 'draft'),
  ('c1000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002', 'Frasco B', 'bottle', 120.00, 'PEN', 'draft'),
  ('c1000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-000000000003', 'Frasco Designer', 'bottle', 200.00, 'PEN', 'draft'),
  ('c1000000-0000-4000-8000-000000000004', 'b1000000-0000-4000-8000-000000000004', 'Frasco Niche', 'bottle', 300.00, 'PEN', 'draft'),
  ('c1000000-0000-4000-8000-000000000005', 'b1000000-0000-4000-8000-000000000001', 'Decant A', 'decant', 15.00, 'PEN', 'draft'),
  ('c1000000-0000-4000-8000-000000000006', 'b1000000-0000-4000-8000-000000000005', 'Frasco sin clasificación', 'bottle', 90.00, 'PEN', 'draft'),
  ('c1000000-0000-4000-8000-000000000007', 'b1000000-0000-4000-8000-000000000006', 'Frasco ambiguo', 'bottle', 80.00, 'PEN', 'draft');

insert into public.inventory (product_variant_id, inventory_mode, availability_status)
select id, 'status_only', 'available' from public.product_variants
where product_id in (
  'b1000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000002',
  'b1000000-0000-4000-8000-000000000003',
  'b1000000-0000-4000-8000-000000000004',
  'b1000000-0000-4000-8000-000000000005',
  'b1000000-0000-4000-8000-000000000006'
);

select is((select count(*)::integer from public.wholesale_policies where scope = 'per_commercial_type'), 3, 'three confirmed commercial-type policies are seeded');
select is((select discount_amount from public.wholesale_policies where commercial_type = 'arabic'), 5.00::numeric, 'Arabic discount is S/5');
select is((select discount_amount from public.wholesale_policies where commercial_type = 'designer'), 7.00::numeric, 'Designer discount is S/7');
select is((select discount_amount from public.wholesale_policies where commercial_type = 'niche'), 10.00::numeric, 'Niche discount is S/10');

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';

select is(
  (select final_unit_price from public.calculate_parfums_wholesale_quote('[{"variant_id":"c1000000-0000-4000-8000-000000000001","quantity":39}]') where product_variant_id = 'c1000000-0000-4000-8000-000000000001'),
  100.00::numeric, '39 Arabic bottles do not receive a discount'
);
select is(
  (select final_unit_price from public.calculate_parfums_wholesale_quote('[{"variant_id":"c1000000-0000-4000-8000-000000000001","quantity":40}]') where product_variant_id = 'c1000000-0000-4000-8000-000000000001'),
  95.00::numeric, '40 Arabic bottles receive S/5 off each'
);
select is(
  (select final_unit_price from public.calculate_parfums_wholesale_quote('[{"variant_id":"c1000000-0000-4000-8000-000000000001","quantity":41}]') where product_variant_id = 'c1000000-0000-4000-8000-000000000001'),
  95.00::numeric, '41 Arabic bottles remain qualified'
);
select is(
  (select count(*)::integer from public.calculate_parfums_wholesale_quote('[{"variant_id":"c1000000-0000-4000-8000-000000000001","quantity":20},{"variant_id":"c1000000-0000-4000-8000-000000000002","quantity":20}]') where threshold_reached),
  2, '20 Arabic A plus 20 Arabic B qualifies both lines'
);
select is(
  (select count(*)::integer from public.calculate_parfums_wholesale_quote('[{"variant_id":"c1000000-0000-4000-8000-000000000001","quantity":20},{"variant_id":"c1000000-0000-4000-8000-000000000003","quantity":20}]') where threshold_reached),
  0, '20 Arabic plus 20 Designer qualifies neither group'
);
select is(
  (select eligibility_status from public.calculate_parfums_wholesale_quote('[{"variant_id":"c1000000-0000-4000-8000-000000000005","quantity":40}]')),
  'not_bottle', '40 Arabic decants are excluded'
);
select is(
  (select bottle_group_quantity from public.calculate_parfums_wholesale_quote('[{"variant_id":"c1000000-0000-4000-8000-000000000001","quantity":39},{"variant_id":"c1000000-0000-4000-8000-000000000005","quantity":1}]') where product_variant_id = 'c1000000-0000-4000-8000-000000000001'),
  39::bigint, '39 bottles plus one decant still counts only 39 bottles'
);
select is(
  (select count(*)::integer from public.calculate_parfums_wholesale_quote('[{"variant_id":"c1000000-0000-4000-8000-000000000001","quantity":40},{"variant_id":"c1000000-0000-4000-8000-000000000003","quantity":40}]') where threshold_reached),
  2, '40 Arabic and 40 Designer qualify independently'
);
select is(
  (select final_unit_price from public.calculate_parfums_wholesale_quote('[{"variant_id":"c1000000-0000-4000-8000-000000000004","quantity":41}]')),
  290.00::numeric, '41 Niche bottles receive only the S/10 Niche discount'
);
select is(
  (select eligibility_status from public.calculate_parfums_wholesale_quote('[{"variant_id":"c1000000-0000-4000-8000-000000000006","quantity":40}]')),
  'missing_classification', 'an unclassified bottle is explicitly ineligible'
);
select is(
  (select eligibility_status from public.calculate_parfums_wholesale_quote('[{"variant_id":"c1000000-0000-4000-8000-000000000007","quantity":40}]')),
  'ambiguous_classification', 'multiple commercial classifications are explicitly ineligible'
);
select throws_ok(
  $$select * from public.calculate_parfums_wholesale_quote('{"not":"an array"}'::jsonb)$$,
  '22023', null, 'malformed quote input is rejected'
);
select is(
  (select count(*)::integer from public.admin_parfums_wholesale_catalog where eligibility_status = 'eligible'),
  4, 'admin catalog includes the four correctly classified bottle fixtures as eligible'
);

select throws_ok(
  $$insert into public.variant_price_tiers (product_variant_id, wholesale_policy_id, min_quantity, price_amount)
    values ('c1000000-0000-4000-8000-000000000001',
      (select id from public.wholesale_policies where commercial_type = 'arabic'), 40, 94.00)$$,
  '23514', null, 'a manual tier cannot duplicate a per-commercial-type derived policy'
);

select lives_ok(
  $$select public.admin_update_wholesale_policy(
      (select id from public.wholesale_policies where commercial_type = 'arabic'),
      (select updated_at from public.wholesale_policies where commercial_type = 'arabic'),
      41, 6.00, true)$$,
  'Parfums admin updates threshold and discount atomically'
);
select is((select action from public.audit_log where entity_type = 'wholesale_policy' order by created_at desc limit 1), 'wholesale.policy_update', 'policy edit is audited with its dedicated action');
select is((select actor_user_id from public.audit_log where entity_type = 'wholesale_policy' order by created_at desc limit 1), '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 'audit actor is the real auth.uid');

select lives_ok(
  $$select public.admin_update_wholesale_policy(
      (select id from public.wholesale_policies where commercial_type = 'arabic'),
      (select updated_at from public.wholesale_policies where commercial_type = 'arabic'),
      41, 6.00, false)$$,
  'Parfums admin disables a policy'
);
select is((select count(*)::integer from public.audit_log where entity_type = 'wholesale_policy' and action = 'wholesale.disable'), 1, 'disable is audited explicitly');

select lives_ok(
  $$select public.admin_update_wholesale_policy(
      (select id from public.wholesale_policies where commercial_type = 'arabic'),
      (select updated_at from public.wholesale_policies where commercial_type = 'arabic'),
      40, 5.00, true)$$,
  'Parfums admin enables a policy again'
);
select is((select count(*)::integer from public.audit_log where entity_type = 'wholesale_policy' and action = 'wholesale.enable'), 1, 'enable is audited explicitly');
select throws_ok(
  $$select public.admin_update_wholesale_policy(
      (select id from public.wholesale_policies where commercial_type = 'arabic'),
      '2000-01-01T00:00:00Z', 50, 8.00, true)$$,
  '40001', null, 'a stale policy update is rejected without silent overwrite'
);

set local request.jwt.claims to '{"sub":"33333333-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}';
select throws_ok(
  $$select public.admin_update_wholesale_policy(
      (select id from public.wholesale_policies where commercial_type = 'arabic'),
      (select updated_at from public.wholesale_policies where commercial_type = 'arabic'), 40, 5.00, true)$$,
  '42501', null, 'Parfums viewer cannot mutate Wholesale policies'
);

set local request.jwt.claims to '{"sub":"22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}';
select throws_ok(
  $$select public.admin_update_wholesale_policy(
      (select id from public.wholesale_policies where commercial_type = 'arabic'),
      (select updated_at from public.wholesale_policies where commercial_type = 'arabic'), 40, 5.00, true)$$,
  '42501', null, 'Import-only admin cannot mutate Parfums Wholesale policies'
);

reset role;
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select throws_ok(
  $$select public.admin_update_wholesale_policy(
      (select id from public.wholesale_policies where commercial_type = 'arabic'), now(), 40, 5.00, true)$$,
  '42501', null, 'anonymous cannot execute Wholesale mutations'
);

select * from finish();
rollback;
