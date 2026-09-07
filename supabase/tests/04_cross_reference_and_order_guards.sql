-- Cruzial Platform V2 — cross-reference isolation and order snapshot guards
--
-- A row-level policy on a child table is insufficient when that row points to
-- several parents. These assertions prove that no combination of foreign keys
-- can bridge Parfums and Import, and that claimed customer status never drives
-- the Import deposit snapshot.

begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'parfums-admin@example.test', '', now(), now()),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'other-user@example.test', '', now(), now());

insert into public.admin_memberships (user_id, business_unit_id, role)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        '11111111-1111-4111-8111-111111111111', 'admin');

insert into public.products (id, business_unit_id, slug, name, publication_status) values
  ('11111111-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
   'parfums-one', 'Parfums One', 'published'),
  ('11111111-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
   'parfums-two', 'Parfums Two', 'published'),
  ('22222222-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
   'import-one', 'Import One', 'published');

insert into public.product_variants
  (id, product_id, variant_kind, label, price_amount, publication_status) values
  ('11111111-0000-4000-8000-000000000011', '11111111-0000-4000-8000-000000000001',
   'decant', 'Parfums 3 ml', 10.00, 'published'),
  ('11111111-0000-4000-8000-000000000012', '11111111-0000-4000-8000-000000000002',
   'decant', 'Parfums Two 3 ml', 11.00, 'published'),
  ('22222222-0000-4000-8000-000000000011', '22222222-0000-4000-8000-000000000001',
   'decant', 'Import 3 ml', 12.00, 'published');

insert into public.categories (id, business_unit_id, kind, slug, name, publication_status) values
  ('11111111-0000-4000-8000-000000000021', '11111111-1111-4111-8111-111111111111',
   'commercial_type', 'parfums-category', 'Parfums Category', 'published'),
  ('22222222-0000-4000-8000-000000000021', '22222222-2222-4222-8222-222222222222',
   'import_category', 'import-category', 'Import Category', 'published');

insert into public.combos (id, product_id, composition_verification_status)
values ('11111111-0000-4000-8000-000000000031',
        '11111111-0000-4000-8000-000000000001', 'client_confirmed');

insert into public.wholesale_policies (id, business_unit_id, name, scope)
values ('22222222-0000-4000-8000-000000000041',
        '22222222-2222-4222-8222-222222222222', 'Import Policy', 'per_order');

insert into public.campaigns (id, business_unit_id, number, name, status) values
  ('11111111-0000-4000-8000-000000000051', '11111111-1111-4111-8111-111111111111',
   1, 'Parfums Campaign', 'scheduled'),
  ('22222222-0000-4000-8000-000000000051', '22222222-2222-4222-8222-222222222222',
   1, 'Import Campaign', 'scheduled');

insert into public.customers (id, business_unit_id, full_name, verified_customer_status) values
  ('11111111-0000-4000-8000-000000000061', '11111111-1111-4111-8111-111111111111',
   'Parfums Customer', 'pending_verification'),
  ('22222222-0000-4000-8000-000000000061', '22222222-2222-4222-8222-222222222222',
   'Import Customer', 'pending_verification');

-- Every cross-unit relationship is rejected even while running as the owner,
-- where RLS is not filtering either parent out of sight.
select throws_ok(
  $$update public.categories
      set parent_id = '22222222-0000-4000-8000-000000000021'
    where id = '11111111-0000-4000-8000-000000000021'$$,
  '23514', null, 'a category cannot use a parent from the other unit'
);

select throws_ok(
  $$insert into public.product_categories (product_id, category_id)
    values ('11111111-0000-4000-8000-000000000001',
            '22222222-0000-4000-8000-000000000021')$$,
  '23514', null, 'a product cannot use a category from the other unit'
);

select throws_ok(
  $$insert into public.product_media (product_id, product_variant_id, secure_url)
    values ('11111111-0000-4000-8000-000000000001',
            '22222222-0000-4000-8000-000000000011', '/wrong.webp')$$,
  '23514', null, 'media cannot point at a variant from another product'
);

select throws_ok(
  $$insert into public.combo_items (combo_id, product_variant_id)
    values ('11111111-0000-4000-8000-000000000031',
            '22222222-0000-4000-8000-000000000011')$$,
  '23514', null, 'a combo cannot contain a variant from the other unit'
);

select throws_ok(
  $$insert into public.variant_price_tiers
      (product_variant_id, wholesale_policy_id, min_quantity, price_amount)
    values ('11111111-0000-4000-8000-000000000011',
            '22222222-0000-4000-8000-000000000041', 40, 8.00)$$,
  '23514', null, 'a price tier cannot use another unit wholesale policy'
);

select throws_ok(
  $$insert into public.campaign_products (campaign_id, product_id, price_amount)
    values ('22222222-0000-4000-8000-000000000051',
            '11111111-0000-4000-8000-000000000001', 100.00)$$,
  '23514', null, 'a campaign cannot offer a product from the other unit'
);

select throws_ok(
  $$insert into public.campaign_products
      (campaign_id, product_id, product_variant_id, price_amount)
    values ('11111111-0000-4000-8000-000000000051',
            '11111111-0000-4000-8000-000000000001',
            '11111111-0000-4000-8000-000000000012', 100.00)$$,
  '23514', null, 'a campaign variant must belong to the offered product'
);

select throws_ok(
  $$insert into public.orders (business_unit_id, order_number, customer_id)
    values ('11111111-1111-4111-8111-111111111111', 'CROSS-CUSTOMER',
            '22222222-0000-4000-8000-000000000061')$$,
  '23514', null, 'an order cannot use a customer from the other unit'
);

insert into public.orders
  (id, business_unit_id, order_number, customer_snapshot, subtotal_amount)
values
  ('11111111-0000-4000-8000-000000000071',
   '11111111-1111-4111-8111-111111111111', 'PARFUMS-ORDER',
   '{"name":"Original"}'::jsonb, 10.00);

select throws_ok(
  $$insert into public.order_lines
      (order_id, product_id, product_variant_id, product_name_snapshot,
       variant_label_snapshot, unit_price_amount, quantity, line_total_amount)
    values ('11111111-0000-4000-8000-000000000071',
            '22222222-0000-4000-8000-000000000001',
            '22222222-0000-4000-8000-000000000011',
            'Wrong Unit', 'Import 3 ml', 12.00, 1, 12.00)$$,
  '23514', null, 'an order line cannot point into the other unit'
);

insert into public.order_lines
  (id, order_id, product_id, product_variant_id, product_name_snapshot,
   variant_label_snapshot, unit_price_amount, quantity, line_total_amount)
values
  ('11111111-0000-4000-8000-000000000072',
   '11111111-0000-4000-8000-000000000071',
   '11111111-0000-4000-8000-000000000001',
   '11111111-0000-4000-8000-000000000011',
   'Parfums One', 'Parfums 3 ml', 10.00, 1, 10.00);

select throws_ok(
  $$update public.order_lines
      set product_id = '11111111-0000-4000-8000-000000000002',
          product_variant_id = '11111111-0000-4000-8000-000000000012'
    where id = '11111111-0000-4000-8000-000000000072'$$,
  '23001', null, 'order-line provenance references are immutable'
);

select throws_ok(
  $$update public.orders set customer_snapshot = '{"name":"Rewritten"}'::jsonb
    where id = '11111111-0000-4000-8000-000000000071'$$,
  '23001', null, 'order header snapshots are immutable after draft'
);

select throws_ok(
  $$update public.orders set status = 'draft'
    where id = '11111111-0000-4000-8000-000000000071'$$,
  '23001', null, 'a pending order cannot return to draft to unlock its snapshot'
);

select throws_ok(
  $$update public.orders set status = 'confirmed'
    where id = '11111111-0000-4000-8000-000000000071'$$,
  '23514', null, 'an unconfirmed future order state cannot be invented'
);

-- Claimed status is stored for audit, but the verified status selects the
-- policy. A caller may claim returning while the verified snapshot remains new;
-- the applied percentage is still 50, not 70.
select lives_ok(
  $$insert into public.orders (
      id, business_unit_id, order_number, claimed_customer_status,
      verified_customer_status_snapshot, deposit_policy_snapshot,
      deposit_percentage_snapshot
    )
    select
      '22222222-0000-4000-8000-000000000081',
      policy.business_unit_id,
      'IMPORT-VALID-DEPOSIT',
      'returning',
      'new',
      jsonb_build_object(
        'policy_id', policy.id::text,
        'customer_status', policy.customer_status,
        'deposit_percentage', policy.deposit_percentage,
        'source', policy.source
      ),
      policy.deposit_percentage
    from public.deposit_policies policy
    where policy.business_unit_id = '22222222-2222-4222-8222-222222222222'
      and policy.customer_status = 'new'$$,
  'a deposit snapshot can preserve a conflicting claim without trusting it'
);

select results_eq(
  $$select claimed_customer_status, verified_customer_status_snapshot,
           deposit_percentage_snapshot
    from public.orders
    where id = '22222222-0000-4000-8000-000000000081'$$,
  $$values ('returning'::text, 'new'::text, 50.00::numeric(5, 2))$$,
  'the verified new status, not the returning claim, applies 50 percent'
);

select throws_ok(
  $$insert into public.orders (
      business_unit_id, order_number, claimed_customer_status,
      verified_customer_status_snapshot, deposit_policy_snapshot,
      deposit_percentage_snapshot
    )
    select
      policy.business_unit_id,
      'IMPORT-WRONG-DEPOSIT',
      'new',
      'returning',
      jsonb_build_object(
        'policy_id', policy.id::text,
        'customer_status', policy.customer_status,
        'deposit_percentage', policy.deposit_percentage,
        'source', policy.source
      ),
      policy.deposit_percentage
    from public.deposit_policies policy
    where policy.business_unit_id = '22222222-2222-4222-8222-222222222222'
      and policy.customer_status = 'new'$$,
  '23514', null, 'a policy that disagrees with verified status is rejected'
);

update public.deposit_policies set deposit_percentage = 55.00
where business_unit_id = '22222222-2222-4222-8222-222222222222'
  and customer_status = 'new';

select is(
  (select deposit_percentage_snapshot from public.orders
   where id = '22222222-0000-4000-8000-000000000081'),
  50.00::numeric(5, 2),
  'changing a policy later does not rewrite an existing order snapshot'
);

-- An authenticated admin may only attribute an audit row to itself.
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';

select throws_ok(
  $$insert into public.audit_log
      (business_unit_id, actor_user_id, action, entity_type)
    values ('11111111-1111-4111-8111-111111111111',
            'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'update', 'product')$$,
  '42501', null, 'an admin cannot impersonate another audit actor'
);

reset role;

select is(
  (select count(*)::int from public.audit_log
   where actor_user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  0,
  'the forged audit row does not exist in owner context'
);

select * from finish();
rollback;
