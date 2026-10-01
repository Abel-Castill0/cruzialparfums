-- Owner-delegated launch prices stay owner-editable through the normal Admin RPC:
-- an amount edit keeps owner_selected_provisional, a viewer cannot change it, a stale
-- write is rejected, and only the explicit confirmation moves it to client_confirmed
-- (audited, same row).
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('54000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-edit-admin@example.test', '', now(), now()),
  ('54000000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-edit-viewer@example.test', '', now(), now());
insert into public.admin_memberships (user_id, business_unit_id, role) values
  ('54000000-0000-4000-8000-0000000000a1', '11111111-1111-4111-8111-111111111111', 'admin'),
  ('54000000-0000-4000-8000-0000000000a2', '11111111-1111-4111-8111-111111111111', 'viewer');
insert into public.products (id, business_unit_id, legacy_id, slug, brand, name, description, gender, concentration,
  production_status, availability_status, publication_status, verification_status, specs)
values ('a5400000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'owner-edit', 'owner-edit',
  'Owner', 'Owner Edit Parfum', 'Test', 'unisex', 'EDP', 'active', 'available', 'published', 'legacy', '{"notes":["t"],"tag":"t"}'::jsonb);
insert into public.product_variants (id, product_id, label, variant_kind, size_ml, price_amount, currency,
  publication_status, price_verification_status, sort_order)
values ('b5400000-0000-4000-8000-000000000001', 'a5400000-0000-4000-8000-000000000001', '100 ml', 'bottle', 100, 250.00,
  'PEN', 'published', 'owner_selected_provisional', 0);

-- viewer cannot edit
select set_config('request.jwt.claims', '{"sub":"54000000-0000-4000-8000-0000000000a2","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select throws_ok(
  $$select public.admin_update_variant('b5400000-0000-4000-8000-000000000001',
      (select updated_at from public.product_variants where id = 'b5400000-0000-4000-8000-000000000001'),
      '100 ml', 'bottle', 100, 260.00, 'PEN', null, 'published', 0)$$,
  '42501', null, 'a viewer cannot edit a provisional launch price');
reset role;

-- admin edits the amount: still provisional, price changed
select set_config('request.jwt.claims', '{"sub":"54000000-0000-4000-8000-0000000000a1","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select lives_ok(
  $$select public.admin_update_variant('b5400000-0000-4000-8000-000000000001',
      (select updated_at from public.product_variants where id = 'b5400000-0000-4000-8000-000000000001'),
      '100 ml', 'bottle', 100, 275.50, 'PEN', null, 'published', 0)$$,
  'an admin edits a provisional launch price');
reset role;
select is((select price_verification_status || ':' || price_amount from public.product_variants where id = 'b5400000-0000-4000-8000-000000000001'),
  'owner_selected_provisional:275.50', 'the edit keeps it provisional with the new amount');

-- a stale write is rejected
select set_config('request.jwt.claims', '{"sub":"54000000-0000-4000-8000-0000000000a1","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select throws_ok(
  $$select public.admin_update_variant('b5400000-0000-4000-8000-000000000001', now() - interval '1 day',
      '100 ml', 'bottle', 100, 290.00, 'PEN', null, 'published', 0)$$,
  'P2011', null, 'a stale write to a provisional price is rejected');

-- explicit confirmation moves the same row to client_confirmed and is audited
select lives_ok(
  $$select public.admin_update_variant('b5400000-0000-4000-8000-000000000001',
      (select updated_at from public.product_variants where id = 'b5400000-0000-4000-8000-000000000001'),
      '100 ml', 'bottle', 100, 275.50, 'PEN', null, 'published', 0, p_confirm_client_price => true)$$,
  'explicit confirmation of the provisional launch price');
reset role;
select is((select price_verification_status from public.product_variants where id = 'b5400000-0000-4000-8000-000000000001'),
  'client_confirmed', 'only the explicit step makes it client_confirmed');
select is((select count(*)::int from public.product_variants where product_id = 'a5400000-0000-4000-8000-000000000001'), 1,
  'the same variant row was transitioned, not duplicated');
select is((select count(*)::int from public.audit_log where entity_type = 'product_variant' and action = 'verification_update'
    and entity_id = 'b5400000-0000-4000-8000-000000000001'), 1, 'the confirmation is audited');

select * from finish();
rollback;
