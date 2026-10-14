-- Rollback of 20261014130000_notes_model.sql. products.specs->'notes' keeps the last mirrored names (it is the legacy
-- source the storefront always read), so the public pages are unaffected. The notes catalogue, the order of each product's
-- notes and the note descriptions/images are lost. Run only on purpose.
begin;

drop function if exists public.admin_set_product_notes(uuid, uuid[]);
drop function if exists public.admin_delete_note(text, uuid);
drop function if exists public.admin_save_note(text, uuid, timestamptz, text, text, text, text, boolean);

drop trigger if exists notes_mirror on public.notes;
drop trigger if exists product_notes_mirror on public.product_notes;
drop trigger if exists product_notes_enforce_unit on public.product_notes;
drop table if exists public.product_notes;
drop table if exists public.notes;

drop function if exists app.note_mirror_trigger();
drop function if exists app.product_notes_mirror_trigger();
drop function if exists app.refresh_product_notes_mirror(uuid);
drop function if exists app.enforce_product_note_unit();
drop function if exists app.backfill_product_notes();
drop function if exists app.note_slug(text);

commit;
