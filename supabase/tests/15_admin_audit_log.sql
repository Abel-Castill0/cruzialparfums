-- Cruzial Platform V2 — Audit Log integrity + read model (Phase 4G2)

begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaf', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'parfums-admin-audit@example.test', '', now(), now()),
  ('22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbf', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'import-admin-audit@example.test', '', now(), now()),
  ('33333333-cccc-4ccc-8ccc-ccccccccccdf', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'parfums-viewer-audit@example.test', '', now(), now());

insert into public.admin_memberships (user_id, business_unit_id, role) values
  ('11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaf', '11111111-1111-4111-8111-111111111111', 'admin'),
  ('22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbf', '22222222-2222-4222-8222-222222222222', 'admin'),
  ('33333333-cccc-4ccc-8ccc-ccccccccccdf', '11111111-1111-4111-8111-111111111111', 'viewer');

-- ---------------------------------------------------------------------------
-- 1. Direct-insert fabrication gap is closed
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaf","role":"authenticated"}';
select throws_ok(
  $$insert into public.audit_log (business_unit_id, actor_user_id, action, entity_type, entity_id, before, after)
    values ('11111111-1111-4111-8111-111111111111', '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaf', 'update', 'product', gen_random_uuid(), null, '{}'::jsonb)$$,
  '42501', null, 'a Parfums admin cannot fabricate an audit row via direct INSERT any more'
);
reset role;

-- ---------------------------------------------------------------------------
-- 2. A real audited mutation still writes an audit_log row (via a real RPC)
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaf","role":"authenticated"}';
select lives_ok(
  $$select public.admin_create_product(
      'parfums', 'audit-4g2-test', 'Producto Auditoría 4G2', null, null, null, null, null,
      'always_available', 'active', 'draft', false)$$,
  'Parfums admin creates a product (real mutation)'
);
select is(
  (select action from public.audit_log where entity_type = 'product' and entity_id = (select id from public.products where slug = 'audit-4g2-test') order by created_at desc limit 1),
  'create', 'the real mutation produced a create audit row'
);
select is(
  (select actor_user_id from public.audit_log where entity_type = 'product' and entity_id = (select id from public.products where slug = 'audit-4g2-test') order by created_at desc limit 1),
  '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaf'::uuid, 'actor is the real auth.uid, never client-supplied'
);
reset role;

-- ---------------------------------------------------------------------------
-- 3. Actor spoofing is impossible: write_audit_log has no actor parameter
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'app' and p.proname = 'write_audit_log'
       and pg_get_function_identity_arguments(p.oid) ilike '%actor%'),
  0, 'app.write_audit_log takes no actor_user_id parameter of any kind'
);

-- ---------------------------------------------------------------------------
-- 4. Cross-unit isolation on the fabrication attempt
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbf","role":"authenticated"}';
select throws_ok(
  $$insert into public.audit_log (business_unit_id, actor_user_id, action, entity_type, entity_id, before, after)
    values ('11111111-1111-4111-8111-111111111111', '22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbf', 'update', 'product', gen_random_uuid(), null, '{}'::jsonb)$$,
  '42501', null, 'an Import-only admin cannot insert into the Parfums audit_log either'
);
reset role;

-- ---------------------------------------------------------------------------
-- 5. UPDATE/DELETE remain impossible for everyone, including postgres
-- ---------------------------------------------------------------------------

select throws_ok(
  $$update public.audit_log set action = 'update' where entity_type = 'product'$$,
  null, null, 'audit_log rows cannot be updated, even by the table owner'
);
select throws_ok(
  $$delete from public.audit_log where entity_type = 'product'$$,
  null, null, 'audit_log rows cannot be deleted, even by the table owner'
);

-- ---------------------------------------------------------------------------
-- 6. Read model — admin/viewer Parfums read, Import-only denied, anon denied
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaf","role":"authenticated"}';
select isnt(
  (select count(*)::integer from public.admin_list_audit_log('parfums', 1, 20, null, null)),
  0, 'Parfums admin can list the Parfums audit log'
);
select is(
  (select actor_email from public.admin_list_audit_log('parfums', 1, 20, 'create', 'product') limit 1),
  'parfums-admin-audit@example.test', 'actor email is resolved at read time from auth.users'
);
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"33333333-cccc-4ccc-8ccc-ccccccccccdf","role":"authenticated"}';
select isnt(
  (select count(*)::integer from public.admin_list_audit_log('parfums', 1, 20, null, null)),
  0, 'Parfums viewer can also read the Parfums audit log'
);
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbf","role":"authenticated"}';
select throws_ok(
  $$select * from public.admin_list_audit_log('parfums', 1, 20, null, null)$$,
  '42501', null, 'an Import-only admin cannot read the Parfums audit log'
);
reset role;

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select throws_ok(
  $$select * from public.admin_list_audit_log('parfums', 1, 20, null, null)$$,
  null, null, 'anon cannot execute admin_list_audit_log at all (no grant)'
);
reset role;

-- ---------------------------------------------------------------------------
-- 7. Pagination and filters
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaf","role":"authenticated"}';
select is(
  (select count(*)::integer from public.admin_list_audit_log('parfums', 1, 1, null, null)),
  1, 'page_size is respected (capped small page returns exactly one row)'
);
select is(
  (select count(*)::integer from public.admin_list_audit_log('parfums', 1, 20, 'create', 'product')),
  1, 'action + entity_type filters narrow to the seeded create/product row'
);
select is(
  (select count(*)::integer from public.admin_list_audit_log('parfums', 1, 20, 'archive', 'product')),
  0, 'a non-matching action filter returns zero rows, not an error'
);
reset role;

-- ---------------------------------------------------------------------------
-- 8. Detail belongs to the requested unit; cross-unit detail is not_found
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaf","role":"authenticated"}';
select isnt(
  (select id from public.admin_get_audit_log_entry(
    'parfums',
    (select id from public.audit_log where entity_type = 'product' and entity_id = (select id from public.products where slug = 'audit-4g2-test') order by created_at desc limit 1)
  )),
  null, 'the Parfums admin can fetch the detail of their own unit''s entry'
);
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbf","role":"authenticated"}';
select throws_ok(
  $$select * from public.admin_get_audit_log_entry(
    'parfums',
    (select id from public.audit_log where entity_type = 'product' and entity_id = (select id from public.products where slug = 'audit-4g2-test') order by created_at desc limit 1)
  )$$,
  '42501', null, 'an Import-only admin is denied outright (can_read_unit fails before the row lookup)'
);
reset role;

-- ---------------------------------------------------------------------------
-- 9. Actor resolution authorization: no N+1 auth.users leak to callers
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('admin_list_audit_log', 'admin_get_audit_log_entry')
       and p.prosecdef),
  2, 'both read-model functions are SECURITY DEFINER (required to join auth.users)'
);

select * from finish();
rollback;
