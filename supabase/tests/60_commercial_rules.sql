-- Commercial rules (2026-10-14): shipping agencies, delivery zones, promotion rules, order shipping cost and gift.

begin;
create extension if not exists pgtap with schema extensions;
select plan(51);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('11111111-aaaa-4aaa-8aaa-60aaaaaaaaaa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'parfums-admin-rules@example.test', '', now(), now()),
  ('22222222-bbbb-4bbb-8bbb-60bbbbbbbbbb', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'import-admin-rules@example.test', '', now(), now()),
  ('33333333-cccc-4ccc-8ccc-60cccccccccc', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'parfums-viewer-rules@example.test', '', now(), now());

insert into public.admin_memberships (user_id, business_unit_id, role) values
  ('11111111-aaaa-4aaa-8aaa-60aaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'admin'),
  ('22222222-bbbb-4bbb-8bbb-60bbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'admin'),
  ('33333333-cccc-4ccc-8ccc-60cccccccccc', '11111111-1111-4111-8111-111111111111', 'viewer');

-- Fixtures. Parfums: two Arabic products (one will be excluded), one designer, one draft Arabic; Import: a mix of the three types.
insert into public.categories (id, business_unit_id, kind, slug, name, publication_status) values
  ('a6000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'commercial_type', 'arabic', 'TEST Árabe', 'draft'),
  ('a6000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'commercial_type', 'designer', 'TEST Diseñador', 'draft'),
  ('a6000000-0000-4000-8000-000000000011', '22222222-2222-4222-8222-222222222222', 'commercial_type', 'arabic', 'TEST Árabe Import', 'draft'),
  ('a6000000-0000-4000-8000-000000000012', '22222222-2222-4222-8222-222222222222', 'commercial_type', 'designer', 'TEST Diseñador Import', 'draft'),
  ('a6000000-0000-4000-8000-000000000013', '22222222-2222-4222-8222-222222222222', 'commercial_type', 'niche', 'TEST Nicho Import', 'draft');

insert into public.products (id, business_unit_id, slug, name, brand, publication_status) values
  ('b6000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'rules-arabic-a', 'RULES Arabic A', 'TEST', 'draft'),
  ('b6000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'rules-arabic-b', 'RULES Arabic B', 'TEST', 'draft'),
  ('b6000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'rules-designer', 'RULES Designer', 'TEST', 'draft'),
  ('b6000000-0000-4000-8000-000000000011', '22222222-2222-4222-8222-222222222222', 'rules-imp-arabic', 'RULES Imp Arabic', 'TEST', 'draft'),
  ('b6000000-0000-4000-8000-000000000012', '22222222-2222-4222-8222-222222222222', 'rules-imp-designer', 'RULES Imp Designer', 'TEST', 'draft'),
  ('b6000000-0000-4000-8000-000000000013', '22222222-2222-4222-8222-222222222222', 'rules-imp-niche', 'RULES Imp Niche', 'TEST', 'draft');

insert into public.product_categories (product_id, category_id, sort_order) values
  ('b6000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000001', 0),
  ('b6000000-0000-4000-8000-000000000002', 'a6000000-0000-4000-8000-000000000001', 0),
  ('b6000000-0000-4000-8000-000000000003', 'a6000000-0000-4000-8000-000000000002', 0),
  ('b6000000-0000-4000-8000-000000000011', 'a6000000-0000-4000-8000-000000000011', 0),
  ('b6000000-0000-4000-8000-000000000012', 'a6000000-0000-4000-8000-000000000012', 0),
  ('b6000000-0000-4000-8000-000000000013', 'a6000000-0000-4000-8000-000000000013', 0);

insert into public.product_variants (id, product_id, label, variant_kind, price_amount, currency, publication_status) values
  ('c6000000-0000-4000-8000-000000000011', 'b6000000-0000-4000-8000-000000000011', 'Frasco Imp Árabe', 'bottle', 100.00, 'PEN', 'draft'),
  ('c6000000-0000-4000-8000-000000000012', 'b6000000-0000-4000-8000-000000000012', 'Frasco Imp Diseñador', 'bottle', 200.00, 'PEN', 'draft'),
  ('c6000000-0000-4000-8000-000000000013', 'b6000000-0000-4000-8000-000000000013', 'Frasco Imp Nicho', 'bottle', 300.00, 'PEN', 'draft'),
  ('c6000000-0000-4000-8000-000000000014', 'b6000000-0000-4000-8000-000000000011', 'Decant Imp Árabe', 'decant', 15.00, 'PEN', 'draft');

-- Parfums products 1 and 2 are published (the gift candidates); 3 stays a designer.
update public.products set publication_status = 'published'
 where id in ('b6000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000002', 'b6000000-0000-4000-8000-000000000003');

-- Orders: one with a full bottle, one with only a decant.
insert into public.orders (id, business_unit_id, order_number, request_id, channel, status, customer_snapshot, delivery_snapshot) values
  ('d6000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'CRP-RULES-BOTTLE', 'e6000000-0000-4000-8000-000000000001', 'whatsapp', 'pending_whatsapp_confirmation', '{"name":"T","phone":"900000001"}', '{"district":"Miraflores","delivery":"Agencia Shalom (Lima y todo el Perú)","note":""}'),
  ('d6000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'CRP-RULES-DECANT', 'e6000000-0000-4000-8000-000000000002', 'whatsapp', 'pending_whatsapp_confirmation', '{"name":"T","phone":"900000002"}', '{"district":"Miraflores","delivery":"Agencia Shalom (Lima y todo el Perú)","note":""}');

insert into public.order_lines (order_id, product_name_snapshot, variant_label_snapshot, variant_snapshot, unit_price_amount, quantity, line_total_amount) values
  ('d6000000-0000-4000-8000-000000000001', 'RULES Designer', 'Frasco 100 ml', '{"group":"bottle","size_ml":100,"brand":"TEST"}', 200.00, 1, 200.00),
  ('d6000000-0000-4000-8000-000000000002', 'RULES Designer', 'Decant 10 ml', '{"group":"decant","size_ml":10,"brand":"TEST"}', 40.00, 1, 40.00);

-- ---- 1. Structure and confirmed data -------------------------------------------------------------------------
select has_table('public', 'shipping_agencies', 'shipping_agencies exists');
select has_table('public', 'delivery_zones', 'delivery_zones exists');
select has_table('public', 'promotion_rules', 'promotion_rules exists');
select has_column('public', 'orders', 'shipping_cost_cents', 'orders.shipping_cost_cents exists');
select has_column('public', 'orders', 'gift_product_id', 'orders.gift_product_id exists');
select is(
  (select count(*)::integer from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('shipping_agencies', 'delivery_zones', 'promotion_rules') and c.relrowsecurity),
  3, 'row level security is on for the three tables'
);
select is((select coverage from public.shipping_agencies where name = 'Shalom'), 'Todo Perú', 'Shalom covers Todo Perú');
select is((select description from public.shipping_agencies where name = 'Shalom'), 'Cotización por WhatsApp', 'Shalom is quoted over WhatsApp');
select is((select count(*)::integer from public.delivery_zones), 0, 'the migration loads no district: the list is validated by the owner first');
select is(
  (select conditions || actions from public.promotion_rules where rule_type = 'wholesale_mixed' and business_unit_id = '22222222-2222-4222-8222-222222222222'),
  '{"count":"bottles","min_units":40,"currency":"PEN","discount_per_unit":{"niche":10,"arabic":5,"designer":7}}'::jsonb,
  'the mixed wholesale rule is 40 bottles with S/5, S/7 and S/10 per type'
);
select is((select count(*)::integer from public.promotion_rules where rule_type = 'wholesale_mixed'), 1, 'there is no tier above 40 (T28)');

-- ---- 2. Rule shapes ------------------------------------------------------------------------------------------
select throws_ok(
  $$insert into public.promotion_rules (business_unit_id, rule_type, conditions) values ('11111111-1111-4111-8111-111111111111', 'gift_exclusion', '{"excluded_product_ids":["not-a-uuid"]}')$$,
  '22023', 'excluded_product_ids must be product UUIDs', 'a gift exclusion must list UUIDs'
);
select throws_ok(
  $$insert into public.promotion_rules (business_unit_id, rule_type, conditions) values ('11111111-1111-4111-8111-111111111111', 'gift_exclusion', '{"excluded_product_ids":["b6000000-0000-4000-8000-0000000000ff"]}')$$,
  '23503', null, 'a gift exclusion must name a product of the unit'
);
select throws_ok(
  $$insert into public.promotion_rules (business_unit_id, rule_type, conditions) values ('11111111-1111-4111-8111-111111111111', 'gift_exclusion', '{"excluded_product_ids":["b6000000-0000-4000-8000-000000000011"]}')$$,
  '23503', null, 'a product of another unit cannot be excluded'
);
select throws_ok(
  $$insert into public.promotion_rules (business_unit_id, rule_type, conditions, actions) values ('11111111-1111-4111-8111-111111111111', 'wholesale_mixed', '{"min_units":0,"count":"bottles"}', '{"discount_per_unit":{"arabic":5,"designer":7,"niche":10},"currency":"PEN"}')$$,
  '22023', null, 'the wholesale threshold must be at least 1'
);
select throws_ok(
  $$insert into public.promotion_rules (business_unit_id, rule_type, conditions, actions) values ('11111111-1111-4111-8111-111111111111', 'wholesale_mixed', '{"min_units":40,"count":"bottles"}', '{"discount_per_unit":{"arabic":5,"designer":0,"niche":10},"currency":"PEN"}')$$,
  '22023', null, 'every type needs a positive discount'
);
select throws_ok(
  $$insert into public.promotion_rules (business_unit_id, rule_type, conditions, actions) values ('11111111-1111-4111-8111-111111111111', 'wholesale_mixed', '{"min_units":40,"count":"bottles"}', '{"discount_per_unit":{"arabic":5,"designer":7,"niche":10,"vip":99},"currency":"PEN"}')$$,
  '22023', 'discount_per_unit accepts only arabic, designer and niche', 'no invented type'
);
select throws_ok(
  $$insert into public.promotion_rules (business_unit_id, rule_type, conditions, actions) values ('11111111-1111-4111-8111-111111111111', 'wholesale_mixed', '{"min_units":40,"count":"bottles"}', '{"discount_per_unit":{"arabic":5,"designer":7,"niche":10},"currency":"USD"}')$$,
  '22023', null, 'the currency is PEN'
);
select throws_ok(
  $$insert into public.promotion_rules (business_unit_id, rule_type) values ('11111111-1111-4111-8111-111111111111', 'free_shipping')$$,
  '23514', null, 'the rule types are a closed list'
);

-- ---- 3. Gift (the database enforces the rule too) --------------------------------------------------------------
insert into public.promotion_rules (business_unit_id, rule_type, conditions) values
  ('11111111-1111-4111-8111-111111111111', 'gift_exclusion', '{"excluded_product_ids":["b6000000-0000-4000-8000-000000000002"]}');

set local role service_role;

select is(
  (select gift_product_id from public.attach_parfums_order_gift('e6000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001')),
  'b6000000-0000-4000-8000-000000000001'::uuid, 'an Arabic gift attaches to an order with a full bottle'
);
select is(
  (select gift_product_id from public.attach_parfums_order_gift('e6000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001')),
  'b6000000-0000-4000-8000-000000000001'::uuid, 'attaching the same gift again is idempotent'
);
select throws_ok(
  $$select public.attach_parfums_order_gift('e6000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000003')$$,
  'P2041', null, 'an order keeps its first gift'
);
select throws_ok(
  $$select public.attach_parfums_order_gift('e6000000-0000-4000-8000-000000000002', 'b6000000-0000-4000-8000-000000000001')$$,
  'P2042', null, 'an order with only decants gets no gift'
);
reset role;
update public.orders set gift_product_id = null where id = 'd6000000-0000-4000-8000-000000000001';
set local role service_role;
select throws_ok(
  $$select public.attach_parfums_order_gift('e6000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000003')$$,
  'P2043', null, 'a designer perfume cannot be the gift'
);
select throws_ok(
  $$select public.attach_parfums_order_gift('e6000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000002')$$,
  'P2044', null, 'an excluded Arabic perfume cannot be the gift'
);
select throws_ok(
  $$select public.attach_parfums_order_gift('e6000000-0000-4000-8000-0000000000ff', 'b6000000-0000-4000-8000-000000000001')$$,
  'P0002', null, 'an unknown order is rejected'
);
reset role;

set local role authenticated;
set local request.jwt.claims to '{"aal":"aal2","sub":"11111111-aaaa-4aaa-8aaa-60aaaaaaaaaa","role":"authenticated"}';
select throws_ok(
  $$select public.attach_parfums_order_gift('e6000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'not even an admin can attach a gift from the browser'
);

-- ---- 4. Admin CRUD: zones ------------------------------------------------------------------------------------
create temp table _zone (id uuid, updated_at timestamptz) on commit drop;
grant all on _zone to authenticated;
insert into _zone select id, updated_at from public.admin_save_delivery_zone('parfums', null, null, 'Miraflores', false);
select is((select count(*)::integer from public.delivery_zones where district = 'Miraflores' and not is_restricted), 1, 'an admin creates a zone');
select throws_ok(
  $$select public.admin_save_delivery_zone('parfums', null, null, 'miraflores', true)$$,
  '23505', null, 'a district is unique per unit regardless of case'
);
select is(
  (select is_restricted from public.admin_save_delivery_zone('parfums', (select id from _zone), (select updated_at from _zone), 'Miraflores', true)),
  true, 'an admin restricts a zone'
);
select throws_ok(
  format($$select public.admin_save_delivery_zone('parfums', %L, '2000-01-01T00:00:00Z', 'Miraflores', false)$$, (select id from _zone)),
  '40001', null, 'a stale save of a zone is rejected'
);
select is(
  (select count(*)::integer from public.audit_log where entity_type = 'delivery_zone' and action in ('create', 'update')),
  2, 'zone changes are audited'
);

-- ---- 5. Admin CRUD: agency and rules ------------------------------------------------------------------------
select is(
  (select name from public.admin_save_shipping_agency('parfums', null, null, 'Olva', 'Lima y provincias', null, true)),
  'Olva', 'an admin creates a shipping agency'
);
select throws_ok(
  $$select public.admin_save_shipping_agency('parfums', null, null, ' shalom ', 'Todo Perú', null, true)$$,
  '23505', null, 'an agency name is unique per unit regardless of case'
);
select lives_ok(
  $$select public.admin_delete_shipping_agency('parfums', (select id from public.shipping_agencies where name = 'Olva'))$$,
  'an admin deletes an agency'
);
set local request.jwt.claims to '{"aal":"aal2","sub":"22222222-bbbb-4bbb-8bbb-60bbbbbbbbbb","role":"authenticated"}';
select is(
  (select actions -> 'discount_per_unit' ->> 'arabic' from public.admin_save_promotion_rule(
    'import', (select id from public.promotion_rules where rule_type = 'wholesale_mixed' and business_unit_id = '22222222-2222-4222-8222-222222222222'),
    (select updated_at from public.promotion_rules where rule_type = 'wholesale_mixed' and business_unit_id = '22222222-2222-4222-8222-222222222222'),
    'wholesale_mixed', '{"min_units":40,"count":"bottles"}', '{"discount_per_unit":{"arabic":6,"designer":7,"niche":10},"currency":"PEN"}', true)),
  '6', 'an Import admin edits the wholesale rule'
);

set local request.jwt.claims to '{"aal":"aal2","sub":"11111111-aaaa-4aaa-8aaa-60aaaaaaaaaa","role":"authenticated"}';
-- ---- 6. Roles ------------------------------------------------------------------------------------------------
select throws_ok(
  $$select public.admin_save_delivery_zone('import', null, null, 'Barranco', false)$$,
  '42501', null, 'a Parfums admin cannot write Import zones'
);
set local request.jwt.claims to '{"aal":"aal2","sub":"33333333-cccc-4ccc-8ccc-60cccccccccc","role":"authenticated"}';
select throws_ok(
  $$select public.admin_save_delivery_zone('parfums', null, null, 'Barranco', false)$$,
  '42501', null, 'a viewer cannot write zones'
);
select throws_ok(
  $$select public.admin_parfums_set_order_shipping_cost('d6000000-0000-4000-8000-000000000001', 1500)$$,
  '42501', null, 'a viewer cannot set a shipping cost'
);
select throws_ok(
  $$insert into public.delivery_zones (business_unit_id, district) values ('11111111-1111-4111-8111-111111111111', 'Barranco')$$,
  '42501', null, 'no one writes a zone straight into the table'
);

-- ---- 7. Shipping cost ----------------------------------------------------------------------------------------
set local request.jwt.claims to '{"aal":"aal2","sub":"11111111-aaaa-4aaa-8aaa-60aaaaaaaaaa","role":"authenticated"}';
select is(
  (select shipping_cost_cents from public.admin_parfums_set_order_shipping_cost('d6000000-0000-4000-8000-000000000001', 1550)),
  1550, 'an admin quotes a shipping cost in cents'
);
select is(
  (select shipping_cost_cents from public.admin_parfums_set_order_shipping_cost('d6000000-0000-4000-8000-000000000001', null)),
  null::integer, 'an admin clears the shipping cost'
);
select throws_ok(
  $$select public.admin_parfums_set_order_shipping_cost('d6000000-0000-4000-8000-000000000001', -1)$$,
  '22023', null, 'a negative cost is rejected'
);
select throws_ok(
  $$select public.admin_parfums_set_order_shipping_cost('d6000000-0000-4000-8000-0000000000ff', 100)$$,
  'P0002', null, 'an unknown order is rejected'
);

-- ---- 8. Mixed wholesale quote ---------------------------------------------------------------------------------
-- Rule edited above to S/6 Arabic; put it back to the confirmed S/5 to assert the confirmed numbers.
set local request.jwt.claims to '{"aal":"aal2","sub":"22222222-bbbb-4bbb-8bbb-60bbbbbbbbbb","role":"authenticated"}';
select lives_ok(
  $$select public.admin_save_promotion_rule(
    'import', (select id from public.promotion_rules where rule_type = 'wholesale_mixed' and business_unit_id = '22222222-2222-4222-8222-222222222222'),
    (select updated_at from public.promotion_rules where rule_type = 'wholesale_mixed' and business_unit_id = '22222222-2222-4222-8222-222222222222'),
    'wholesale_mixed', '{"min_units":40,"count":"bottles"}', '{"discount_per_unit":{"arabic":5,"designer":7,"niche":10},"currency":"PEN"}', true)$$,
  'the rule goes back to S/5, S/7, S/10'
);
select is(
  (select sum(line_total) from public.calculate_mixed_wholesale_quote('import',
    '[{"variant_id":"c6000000-0000-4000-8000-000000000011","quantity":15},{"variant_id":"c6000000-0000-4000-8000-000000000012","quantity":15},{"variant_id":"c6000000-0000-4000-8000-000000000013","quantity":10}]')),
  (15 * (100 - 5) + 15 * (200 - 7) + 10 * (300 - 10))::numeric,
  '15 Arabic + 15 designer + 10 niche = 40 mixed units: each type gets its own discount'
);
select is(
  (select count(*)::integer from public.calculate_mixed_wholesale_quote('import',
    '[{"variant_id":"c6000000-0000-4000-8000-000000000011","quantity":15},{"variant_id":"c6000000-0000-4000-8000-000000000012","quantity":15},{"variant_id":"c6000000-0000-4000-8000-000000000013","quantity":9}]') where threshold_reached),
  0, '39 mixed units qualify no line'
);
select is(
  (select sum(line_total) from public.calculate_mixed_wholesale_quote('import',
    '[{"variant_id":"c6000000-0000-4000-8000-000000000011","quantity":50}]')),
  (50 * (100 - 5))::numeric, 'above 40 the same per-type amounts apply: there is no second tier'
);
select is(
  (select eligibility_status from public.calculate_mixed_wholesale_quote('import',
    '[{"variant_id":"c6000000-0000-4000-8000-000000000014","quantity":40}]')),
  'not_bottle', 'decants do not count and get no discount'
);
select is(
  (select count(*)::integer from public.calculate_mixed_wholesale_quote('import',
    '[{"variant_id":"c6000000-0000-4000-8000-000000000014","quantity":40},{"variant_id":"c6000000-0000-4000-8000-000000000011","quantity":39}]') where threshold_reached),
  0, '39 bottles plus 40 decants stay below the threshold'
);
select is(
  (select eligibility_status from public.calculate_mixed_wholesale_quote('parfums',
    '[{"variant_id":"c6000000-0000-4000-8000-000000000011","quantity":40}]')),
  'variant_not_found', 'a variant of another unit is not quoted'
);

select * from finish();
rollback;
