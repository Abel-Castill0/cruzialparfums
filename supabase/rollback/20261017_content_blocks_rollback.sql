-- Rollback of 20261017120000_content_blocks.sql. The storefront falls back to its hard-coded content (the TSX is the
-- fallback), so no public page breaks; the edited copy, the carousel selections and their order are lost. Run only on purpose.
begin;

drop function if exists public.admin_set_carousel_items(text, text, uuid[]);
drop function if exists public.admin_delete_content_block(text, uuid);
drop function if exists public.admin_move_content_block(text, text, uuid, text);
drop function if exists public.admin_set_content_block_visibility(text, uuid, timestamptz, boolean);
drop function if exists public.admin_save_content_block(text, text, text, text, jsonb, boolean);

drop trigger if exists content_blocks_validate on public.content_blocks;
drop trigger if exists carousel_items_enforce_unit on public.carousel_items;
drop table if exists public.carousel_items;
drop table if exists public.content_blocks;

drop function if exists app.validate_content_block();
drop function if exists app.enforce_carousel_item_unit();

commit;
