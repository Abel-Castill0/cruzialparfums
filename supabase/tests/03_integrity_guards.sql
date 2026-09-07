-- Cruzial Platform V2 — integrity guards
--
-- Rules that must hold regardless of who is asking: order history stays
-- immutable, the audit log stays append-only, and the product state model
-- keeps "discontinued" and "out of stock" as separate facts.

begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'parfums-admin@example.test', '', now(), now());

insert into public.admin_memberships (user_id, business_unit_id, role)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'admin');

insert into public.products (id, business_unit_id, slug, name, publication_status)
values ('11111111-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
        'khamrah-clasico', 'Khamrah Clásico', 'published');

insert into public.product_variants (id, product_id, variant_kind, size_ml, label, price_amount, publication_status)
values ('11111111-0000-4000-8000-00000000000a', '11111111-0000-4000-8000-000000000001',
        'decant', 3, '3 ml', 12.00, 'published');

insert into public.orders (id, business_unit_id, order_number, subtotal_amount)
values ('11111111-0000-4000-8000-0000000000d1', '11111111-1111-4111-8111-111111111111',
        'TEST-0001', 24.00);

insert into public.order_lines (
  id, order_id, product_id, product_variant_id,
  product_name_snapshot, variant_label_snapshot,
  unit_price_amount, quantity, line_total_amount
) values (
  '11111111-0000-4000-8000-0000000000e1', '11111111-0000-4000-8000-0000000000d1',
  '11111111-0000-4000-8000-000000000001', '11111111-0000-4000-8000-00000000000a',
  'Khamrah Clásico', '3 ml', 12.00, 2, 24.00
);

-- ---------------------------------------------------------------------------
-- A historical order does not move when the catalogue does
-- ---------------------------------------------------------------------------

update public.product_variants set price_amount = 99.00
where id = '11111111-0000-4000-8000-00000000000a';

select is(
  (select unit_price_amount from public.order_lines where id = '11111111-0000-4000-8000-0000000000e1'),
  12.00::numeric(12, 2),
  'raising a variant price does not change an existing order line'
);

select throws_ok(
  $$update public.order_lines set unit_price_amount = 1.00
    where id = '11111111-0000-4000-8000-0000000000e1'$$,
  '23001',
  null,
  'order line unit price is immutable'
);

select throws_ok(
  $$update public.order_lines set quantity = 99
    where id = '11111111-0000-4000-8000-0000000000e1'$$,
  '23001',
  null,
  'order line quantity is immutable'
);

select throws_ok(
  $$update public.order_lines set product_name_snapshot = 'Something else'
    where id = '11111111-0000-4000-8000-0000000000e1'$$,
  '23001',
  null,
  'order line product name snapshot is immutable'
);

-- Archiving a product must not erase the line that references it.
update public.products set archived_at = now(), publication_status = 'archived'
where id = '11111111-0000-4000-8000-000000000001';

select is(
  (select count(*)::int from public.order_lines where id = '11111111-0000-4000-8000-0000000000e1'),
  1,
  'archiving a product keeps its order history'
);

select throws_ok(
  $$delete from public.order_lines
    where id = '11111111-0000-4000-8000-0000000000e1'$$,
  '42501',
  null,
  'even the owner cannot delete a historical order line'
);

select throws_ok(
  $$delete from public.orders
    where id = '11111111-0000-4000-8000-0000000000d1'$$,
  '42501',
  null,
  'even the owner cannot delete an order and cascade its history'
);

-- ---------------------------------------------------------------------------
-- Audit log is append-only
-- ---------------------------------------------------------------------------

insert into public.audit_log (id, business_unit_id, actor_user_id, action, entity_type)
values ('11111111-0000-4000-8000-0000000000f1', '11111111-1111-4111-8111-111111111111',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'price_change', 'product_variant');

-- Run as the owner first. A row-level trigger only fires for rows a statement
-- actually reaches, so testing this as `authenticated` would prove nothing:
-- RLS filters the row out beforehand and the UPDATE would quietly match zero
-- rows without ever entering the trigger. As the owner there is no such
-- filtering, so this is the assertion that the append-only guard really holds
-- even for a privileged caller.
select throws_ok(
  $$update public.audit_log set action = 'create'
    where id = '11111111-0000-4000-8000-0000000000f1'$$,
  '42501',
  null,
  'even the table owner cannot rewrite an audit entry'
);

select throws_ok(
  $$delete from public.audit_log where id = '11111111-0000-4000-8000-0000000000f1'$$,
  '42501',
  null,
  'even the table owner cannot delete an audit entry'
);

-- And the RLS layer independently gives an admin no UPDATE policy at all, so
-- the statement matches nothing and the entry survives untouched.
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';

update public.audit_log set action = 'create'
where id = '11111111-0000-4000-8000-0000000000f1';

reset role;

select is(
  (select action from public.audit_log where id = '11111111-0000-4000-8000-0000000000f1'),
  'price_change',
  'an admin UPDATE against audit_log matches no row and leaves it unchanged'
);

-- ---------------------------------------------------------------------------
-- Product state model: three independent axes
-- ---------------------------------------------------------------------------

select lives_ok(
  $$insert into public.products
      (business_unit_id, slug, name, production_status, availability_status, publication_status)
    values ('11111111-1111-4111-8111-111111111111', 'discontinued-but-in-stock',
            'Discontinued But In Stock', 'discontinued', 'available', 'published')$$,
  'a discontinued product can still be available and published'
);

select lives_ok(
  $$insert into public.products
      (business_unit_id, slug, name, production_status, availability_status, publication_status)
    values ('11111111-1111-4111-8111-111111111111', 'hidden-but-available',
            'Hidden But Available', 'active', 'available', 'hidden')$$,
  'a hidden product can remain available without conflating publication and stock'
);

-- ---------------------------------------------------------------------------
-- Inventory cannot hold an impossible state
-- ---------------------------------------------------------------------------

select throws_ok(
  $$insert into public.inventory (product_variant_id, inventory_mode, quantity_on_hand)
    values ('11111111-0000-4000-8000-00000000000a', 'status_only', 5)$$,
  '23514',
  null,
  'a status_only inventory row cannot carry a quantity'
);

select throws_ok(
  $$insert into public.inventory (product_variant_id, inventory_mode, quantity_on_hand)
    values ('11111111-0000-4000-8000-00000000000a', 'tracked_quantity', null)$$,
  '23514',
  null,
  'a tracked_quantity inventory row must carry a quantity'
);

-- ---------------------------------------------------------------------------
-- Money and deposit guards
-- ---------------------------------------------------------------------------

select throws_ok(
  $$insert into public.product_variants
      (product_id, variant_kind, label, price_amount)
    values ('11111111-0000-4000-8000-000000000001', 'decant', 'negative', -1.00)$$,
  '23514',
  null,
  'a variant price cannot be negative'
);

select throws_ok(
  $$insert into public.deposit_policies
      (business_unit_id, customer_status, deposit_percentage)
    values ('22222222-2222-4222-8222-222222222222', 'new', 150.00)$$,
  '23514',
  null,
  'a deposit percentage above 100 is rejected'
);

select * from finish();
rollback;
