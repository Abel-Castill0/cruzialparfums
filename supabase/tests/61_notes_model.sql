-- Notes model (2026-10-14): notes + product_notes, back-fill from specs->notes, mirror kept in sync, admin functions, RLS.

begin;
create extension if not exists pgtap with schema extensions;
select plan(44);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('11111111-aaaa-4aaa-8aaa-61aaaaaaaaaa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'parfums-admin-notes@example.test', '', now(), now()),
  ('22222222-bbbb-4bbb-8bbb-61bbbbbbbbbb', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'import-admin-notes@example.test', '', now(), now()),
  ('33333333-cccc-4ccc-8ccc-61cccccccccc', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'parfums-viewer-notes@example.test', '', now(), now());

insert into public.admin_memberships (user_id, business_unit_id, role) values
  ('11111111-aaaa-4aaa-8aaa-61aaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'admin'),
  ('22222222-bbbb-4bbb-8bbb-61bbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'admin'),
  ('33333333-cccc-4ccc-8ccc-61cccccccccc', '11111111-1111-4111-8111-111111111111', 'viewer');

-- Fixtures: A and B carry legacy notes (with two spellings of the same note), C has none, D is a draft.
insert into public.products (id, business_unit_id, slug, name, brand, publication_status, specs) values
  ('b7000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'notes-a', 'NOTES A', 'TEST', 'draft', '{"notes": ["Vainilla", "Ámbar", "vainilla "], "tag": "x"}'),
  ('b7000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'notes-b', 'NOTES B', 'TEST', 'draft', '{"notes": ["Vainilla", "Pachulí"]}'),
  ('b7000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'notes-c', 'NOTES C', 'TEST', 'draft', '{}'),
  ('b7000000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-222222222222', 'notes-imp', 'NOTES IMP', 'TEST', 'draft', '{}');

-- ---- 1. Slug ------------------------------------------------------------------------------------------------
select is(app.note_slug('Ámbar Gris'), 'ambar-gris', 'accents and spaces become a slug');
select is(app.note_slug('  Piña  colada! '), 'pina-colada', 'punctuation is dropped');
select is(app.note_slug('   '), '', 'a blank name has no slug');

-- ---- 2. Back-fill --------------------------------------------------------------------------------------------
select is((select notes_created from app.backfill_product_notes()), 3, 'the back-fill creates one note per distinct note (Vainilla, Ámbar, Pachulí)');
select is((select count(*)::integer from public.notes where business_unit_id = '11111111-1111-4111-8111-111111111111'), 3, 'two spellings of Vainilla collapse into one note');
select is((select name from public.notes where slug = 'vainilla'), 'Vainilla', 'the most frequent spelling is kept');
select is((select type from public.notes where slug = 'ambar'), 'general', 'every back-filled note is general (the pyramid is the owner''s decision)');
select is(
  (select array_agg(n.name order by pn.position) from public.product_notes pn join public.notes n on n.id = pn.note_id where pn.product_id = 'b7000000-0000-4000-8000-000000000001'),
  array['Vainilla', 'Ámbar'], 'a product keeps its notes in the original order, without the duplicate'
);
select is((select specs -> 'notes' from public.products where id = 'b7000000-0000-4000-8000-000000000001'), '["Vainilla", "Ámbar"]'::jsonb, 'the public mirror matches');
select is((select specs ->> 'tag' from public.products where id = 'b7000000-0000-4000-8000-000000000001'), 'x', 'the mirror leaves the rest of specs alone');
select is((select count(*)::integer from public.product_notes where product_id = 'b7000000-0000-4000-8000-000000000003'), 0, 'a product without notes gets none');
select is((select links_created from app.backfill_product_notes()), 0, 'the back-fill is idempotent');

-- ---- 3. Admin: notes -----------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"aal":"aal2","sub":"11111111-aaaa-4aaa-8aaa-61aaaaaaaaaa","role":"authenticated"}';

create temp table _n (id uuid, updated_at timestamptz) on commit drop;
grant all on _n to authenticated;
insert into _n select id, updated_at from public.admin_save_note('parfums', null, null, 'Cuero', 'base', 'Notas de cuero', null, true);
select is((select slug from public.notes where name = 'Cuero'), 'cuero', 'an admin creates a note and the slug is derived');
select throws_ok($$select public.admin_save_note('parfums', null, null, 'cuero', 'general', null, null, true)$$, '23505', null, 'the same note spelled differently is a duplicate');
select throws_ok($$select public.admin_save_note('parfums', null, null, 'Hoja', 'middle', null, null, true)$$, '23514', null, 'the type is a closed list');
select throws_ok($$select public.admin_save_note('parfums', null, null, 'Hoja', 'general', null, 'http://insecure.test/x.png', true)$$, '23514', null, 'an image must be https');
select throws_ok($$select public.admin_save_note('parfums', null, null, '!!', 'general', null, null, true)$$, '22023', null, 'a name without letters is rejected');
select is((select type from public.admin_save_note('parfums', (select id from _n), (select updated_at from _n), 'Cuero', 'general', null, null, true)), 'general', 'an admin edits a note');
select throws_ok(
  format($$select public.admin_save_note('parfums', %L, '2000-01-01T00:00:00Z', 'Cuero', 'general', null, null, true)$$, (select id from _n)),
  '40001', null, 'a stale edit is rejected'
);

-- ---- 4. Admin: assigning to a product, with order --------------------------------------------------------------
select is(
  (select array_agg(n.name order by pn.position) from public.admin_set_product_notes('b7000000-0000-4000-8000-000000000003',
     array[(select id from public.notes where slug = 'cuero'), (select id from public.notes where slug = 'vainilla'), (select id from public.notes where slug = 'ambar')]) pn
   join public.notes n on n.id = pn.note_id),
  array['Cuero', 'Vainilla', 'Ámbar'], 'an admin assigns notes in order'
);
select is((select specs -> 'notes' from public.products where id = 'b7000000-0000-4000-8000-000000000003'), '["Cuero", "Vainilla", "Ámbar"]'::jsonb, 'the mirror follows the order');
select is(
  (select array_agg(n.name order by pn.position) from public.admin_set_product_notes('b7000000-0000-4000-8000-000000000003',
     array[(select id from public.notes where slug = 'ambar'), (select id from public.notes where slug = 'cuero')]) pn
   join public.notes n on n.id = pn.note_id),
  array['Ámbar', 'Cuero'], 'moving up/down and removing is one replace with the new order'
);
select is((select specs -> 'notes' from public.products where id = 'b7000000-0000-4000-8000-000000000003'), '["Ámbar", "Cuero"]'::jsonb, 'the mirror drops the removed note');
select is((select count(*)::integer from public.admin_set_product_notes('b7000000-0000-4000-8000-000000000003', '{}')), 0, 'an empty list clears the product');
select is((select specs -> 'notes' from public.products where id = 'b7000000-0000-4000-8000-000000000003'), '[]'::jsonb, 'and the mirror is empty, so the legacy notes never come back');
select throws_ok(
  $$select public.admin_set_product_notes('b7000000-0000-4000-8000-000000000003', array[(select id from public.notes where slug = 'cuero'), (select id from public.notes where slug = 'cuero')])$$,
  '22023', null, 'a note cannot be listed twice'
);
select throws_ok(
  $$select public.admin_set_product_notes('b7000000-0000-4000-8000-000000000003', array['aaaaaaaa-0000-4000-8000-0000000000ff'::uuid])$$,
  '23503', null, 'an unknown note is rejected'
);

-- A rename reaches every product that uses the note.
select lives_ok(
  $$select public.admin_save_note('parfums', (select id from public.notes where slug = 'vainilla'), (select updated_at from public.notes where slug = 'vainilla'), 'Vainilla de Madagascar', 'general', null, null, true)$$,
  'an admin renames a note in use'
);
select is((select specs -> 'notes' from public.products where id = 'b7000000-0000-4000-8000-000000000001'), '["Vainilla de Madagascar", "Ámbar"]'::jsonb, 'the rename shows on the products that use it');
select is((select specs -> 'notes' from public.products where id = 'b7000000-0000-4000-8000-000000000002'), '["Vainilla de Madagascar", "Pachulí"]'::jsonb, 'including the other product');

-- Hiding a note removes it from the public list without deleting it.
select lives_ok(
  $$select public.admin_save_note('parfums', (select id from public.notes where slug = 'pachuli'), (select updated_at from public.notes where slug = 'pachuli'), 'Pachulí', 'general', null, null, false)$$,
  'an admin hides a note'
);
select is((select specs -> 'notes' from public.products where id = 'b7000000-0000-4000-8000-000000000002'), '["Vainilla de Madagascar"]'::jsonb, 'a hidden note disappears from the mirror');
select throws_ok(
  $$select public.admin_set_product_notes('b7000000-0000-4000-8000-000000000003', array[(select id from public.notes where slug = 'pachuli')])$$,
  '23503', null, 'a hidden note cannot be assigned'
);

-- ---- 5. Delete ------------------------------------------------------------------------------------------------
select throws_ok($$select public.admin_delete_note('parfums', (select id from public.notes where slug = 'ambar'))$$, 'P2050', null, 'a note in use is not deleted');
select lives_ok($$select public.admin_delete_note('parfums', (select id from public.notes where slug = 'cuero'))$$, 'an unused note is deleted');
select is((select count(*)::integer from public.notes where slug = 'cuero'), 0, 'and it is gone');

-- ---- 6. Roles and unit isolation -------------------------------------------------------------------------------
select throws_ok(
  $$select public.admin_set_product_notes('b7000000-0000-4000-8000-000000000004', '{}')$$,
  '42501', null, 'a Parfums admin cannot edit the notes of an Import product'
);
select throws_ok(
  $$select public.admin_save_note('import', null, null, 'Rosa', 'general', null, null, true)$$,
  '42501', null, 'a Parfums admin cannot create Import notes'
);
set local request.jwt.claims to '{"aal":"aal2","sub":"33333333-cccc-4ccc-8ccc-61cccccccccc","role":"authenticated"}';
select throws_ok($$select public.admin_save_note('parfums', null, null, 'Rosa', 'general', null, null, true)$$, '42501', null, 'a viewer cannot create notes');
select throws_ok($$insert into public.notes (business_unit_id, slug, name) values ('11111111-1111-4111-8111-111111111111', 'rosa', 'Rosa')$$, '42501', null, 'no one writes straight into the table');
reset role;

-- A product and a note of different units cannot be linked (even with the table access of the owner).
select throws_ok(
  $$insert into public.product_notes (product_id, note_id) values ('b7000000-0000-4000-8000-000000000004', (select id from public.notes where slug = 'ambar'))$$,
  '23514', null, 'a product only uses notes of its own unit'
);

-- ---- 7. Public read ---------------------------------------------------------------------------------------------
set local role anon;
select is((select count(*)::integer from public.notes where slug = 'ambar'), 1, 'anyone reads an active note');
select is((select count(*)::integer from public.notes where slug = 'pachuli'), 0, 'but not a hidden one');
select is((select count(*)::integer from public.product_notes), 0, 'and not the notes of a draft product');
reset role;

select * from finish();
rollback;
