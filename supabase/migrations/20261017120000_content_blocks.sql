-- Content blocks (2026-10-17): editable page content for the storefront.
-- docs/content-editor-architecture.md §5.2–§5.3 and docs/content-editor.md explain the decisions.
--
-- Two tables. `content_blocks` is the typed JSONB content of one section of one public page (`home`, `parfums`, `import`);
-- `carousel_items` is the ordered list of products of a carousel. With both empty the public pages render their current
-- hard-coded content unchanged (the "fallback" is the TSX, not a row). A row only exists once the owner edits a section.
--
-- The registry of allowed pages and sections lives in the application (`apps/web/src/lib/content/registry.ts`): the admin
-- never invents a new section, it only edits the ones the code knows, so a block can never point at a section no page
-- renders. The database still enforces the closed sets it can (page_slug, block_type, key shape) and the shape of `content`
-- (app.validate_content_block), so a corrupt row is impossible even if a future caller skips the app schema.

create table public.content_blocks (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units (id) on delete restrict,
  page_slug text not null,
  section_key text not null,
  block_type text not null,
  content jsonb not null default '{}'::jsonb,
  display_order integer not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_blocks_page_slug_check check (page_slug in ('home', 'parfums', 'import')),
  constraint content_blocks_section_key_check check (section_key ~ '^[a-z0-9]+(_[a-z0-9]+)*$' and char_length(section_key) <= 40),
  constraint content_blocks_block_type_check check (block_type in ('hero', 'text_banner', 'carousel')),
  constraint content_blocks_content_check check (jsonb_typeof(content) = 'object' and pg_column_size(content) <= 20000),
  constraint content_blocks_display_order_check check (display_order >= 0 and display_order < 10000),
  -- One block per named section: the public page looks a section up by (page_slug, section_key).
  constraint content_blocks_unit_page_section_unique unique (business_unit_id, page_slug, section_key)
);

create trigger content_blocks_set_updated_at
  before update on public.content_blocks
  for each row execute function app.set_updated_at();

create index content_blocks_page_idx on public.content_blocks (business_unit_id, page_slug, display_order);

create table public.carousel_items (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units (id) on delete restrict,
  carousel_key text not null,
  product_id uuid not null references public.products (id) on delete cascade,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint carousel_items_key_check check (carousel_key ~ '^[a-z0-9]+(_[a-z0-9]+)*$' and char_length(carousel_key) <= 40),
  constraint carousel_items_display_order_check check (display_order >= 0 and display_order < 1000),
  constraint carousel_items_unique unique (business_unit_id, carousel_key, product_id)
);

create index carousel_items_key_idx on public.carousel_items (business_unit_id, carousel_key, display_order);
create index carousel_items_product_idx on public.carousel_items (product_id);

-- A carousel and the products it lists always belong to the same business unit.
create or replace function app.enforce_carousel_item_unit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select business_unit_id from public.products where id = new.product_id) is distinct from new.business_unit_id then
    raise exception 'a carousel can only list products of its own business unit' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger carousel_items_enforce_unit
  before insert or update on public.carousel_items
  for each row execute function app.enforce_carousel_item_unit();

-- ---------------------------------------------------------------------------------------------------------------
-- Shape of `content`, mirrored from the Zod schemas in apps/web/src/lib/content/schemas.ts. The database repeats the
-- checks the application already makes so a corrupt block can never be stored, whatever wrote it. The message language is
-- English on purpose (it is an operational error, not a form message the visitor sees).
-- ---------------------------------------------------------------------------------------------------------------
create or replace function app.validate_content_block()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  c jsonb := new.content;
  title text;
  body text;
  cta_label text;
  cta_href text;
begin
  if jsonb_typeof(c) <> 'object' then
    raise exception 'content must be a JSON object' using errcode = '22023';
  end if;

  -- No raw HTML and no control characters anywhere in the values: the renderer escapes text, but a stored tag is a bug
  -- (the author meant it as markup) so it is refused up front, exactly like the form does. Tab (09), newline (0A) and
  -- carriage return (0D) are whitespace, not control data, and are allowed so markdown lists in a body stay usable —
  -- the same set `findRichTextProblems` uses in apps/web/src/lib/rich-text/schema.ts.
  if exists (
    select 1 from jsonb_each_text(c) kv
    where position('<' in kv.value) > 0 or kv.value ~ '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]'
  ) then
    raise exception 'content must not contain HTML or control characters' using errcode = '22023';
  end if;

  title := c ->> 'title';
  if new.block_type in ('hero', 'text_banner') then
    if title is null or char_length(btrim(title)) < 1 or char_length(title) > 80 then
      raise exception 'title is required (1 to 80 characters)' using errcode = '22023';
    end if;
  elsif title is not null and char_length(title) > 80 then
    raise exception 'title is too long (max 80 characters)' using errcode = '22023';
  end if;

  if new.block_type = 'text_banner' then
    body := coalesce(c ->> 'body', '');
    if char_length(btrim(body)) < 1 or char_length(body) > 2000 then
      raise exception 'body is required (1 to 2000 characters)' using errcode = '22023';
    end if;
    if position('![' in body) > 0 then
      raise exception 'images are not allowed inside the body' using errcode = '22023';
    end if;
  end if;

  cta_label := nullif(btrim(coalesce(c ->> 'ctaLabel', '')), '');
  cta_href := nullif(btrim(coalesce(c ->> 'ctaHref', '')), '');
  if cta_label is not null and cta_href is null then
    raise exception 'a button label needs a destination' using errcode = '22023';
  end if;
  if cta_href is not null
     and not ((cta_href ~ '^/' and cta_href !~ '^//') or cta_href ~ '^https://') then
    raise exception 'ctaHref must be an internal path or an https URL' using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger content_blocks_validate
  before insert or update on public.content_blocks
  for each row execute function app.validate_content_block();

-- ---------------------------------------------------------------------------------------------------------------
-- RLS and grants. Public read of visible blocks and of the carousels of public products; writes only through the RPCs below.
-- ---------------------------------------------------------------------------------------------------------------
alter table public.content_blocks enable row level security;
alter table public.carousel_items enable row level security;

create policy content_blocks_public_read on public.content_blocks
  for select to anon, authenticated
  using (is_visible);

create policy content_blocks_admin_read on public.content_blocks
  for select to authenticated
  using (app.can_read_unit(business_unit_id));

create policy carousel_items_public_read on public.carousel_items
  for select to anon, authenticated
  using (app.product_is_public(product_id));

create policy carousel_items_admin_read on public.carousel_items
  for select to authenticated
  using (app.can_read_unit(business_unit_id));

revoke all on public.content_blocks, public.carousel_items from anon, authenticated;
grant select on public.content_blocks, public.carousel_items to anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Admin functions (SECURITY DEFINER, empty search_path, explicit admin check, audit log).
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.admin_save_content_block(
  p_unit_code text,
  p_page_slug text,
  p_section_key text,
  p_block_type text,
  p_content jsonb,
  p_is_visible boolean
)
returns public.content_blocks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit uuid;
  v_before public.content_blocks;
  v_after public.content_blocks;
begin
  select id into v_unit from public.business_units where code = p_unit_code;
  perform app.assert_admin_for(v_unit);
  if p_page_slug not in ('home', 'parfums', 'import') then
    raise exception 'unknown page' using errcode = '22023';
  end if;
  if p_block_type not in ('hero', 'text_banner', 'carousel') then
    raise exception 'unknown block type' using errcode = '22023';
  end if;

  select * into v_before from public.content_blocks
   where business_unit_id = v_unit and page_slug = p_page_slug and section_key = p_section_key;

  if v_before.id is null then
    insert into public.content_blocks (business_unit_id, page_slug, section_key, block_type, content, is_visible, display_order)
    values (
      v_unit, p_page_slug, p_section_key, p_block_type, p_content, coalesce(p_is_visible, true),
      coalesce((select max(display_order) + 1 from public.content_blocks where business_unit_id = v_unit and page_slug = p_page_slug), 0)
    )
    returning * into v_after;
    perform app.write_audit_log(v_unit, 'create', 'content_block', v_after.id, null,
      jsonb_build_object('page_slug', v_after.page_slug, 'section_key', v_after.section_key, 'block_type', v_after.block_type, 'is_visible', v_after.is_visible));
    return v_after;
  end if;

  update public.content_blocks
     set block_type = p_block_type, content = p_content, is_visible = coalesce(p_is_visible, true)
   where id = v_before.id
  returning * into v_after;
  perform app.write_audit_log(v_unit, 'update', 'content_block', v_after.id,
    jsonb_build_object('block_type', v_before.block_type, 'is_visible', v_before.is_visible),
    jsonb_build_object('block_type', v_after.block_type, 'is_visible', v_after.is_visible));
  return v_after;
end;
$$;

create or replace function public.admin_set_content_block_visibility(
  p_unit_code text,
  p_id uuid,
  p_expected_updated_at timestamptz,
  p_is_visible boolean
)
returns public.content_blocks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit uuid;
  v_before public.content_blocks;
  v_after public.content_blocks;
begin
  select id into v_unit from public.business_units where code = p_unit_code;
  perform app.assert_admin_for(v_unit);
  select * into v_before from public.content_blocks where id = p_id and business_unit_id = v_unit;
  if v_before.id is null then
    raise exception 'content block not found' using errcode = 'P0002';
  end if;
  update public.content_blocks
     set is_visible = coalesce(p_is_visible, true)
   where id = p_id and business_unit_id = v_unit and updated_at = p_expected_updated_at
  returning * into v_after;
  if v_after.id is null then
    raise exception 'content block was modified by another session' using errcode = '40001';
  end if;
  perform app.write_audit_log(v_unit, 'update', 'content_block', v_after.id,
    jsonb_build_object('section_key', v_before.section_key, 'is_visible', v_before.is_visible),
    jsonb_build_object('section_key', v_after.section_key, 'is_visible', v_after.is_visible));
  return v_after;
end;
$$;

-- Moves one block up or down inside its page by exchanging it with its neighbour, then re-numbering the page 0..n-1 so
-- the order is always dense and ties can never appear.
create or replace function public.admin_move_content_block(
  p_unit_code text,
  p_page_slug text,
  p_id uuid,
  p_direction text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit uuid;
  v_ids uuid[];
  v_index integer;
  v_target integer;
  v_swap uuid;
  v_position integer := 0;
  v_block uuid;
begin
  select id into v_unit from public.business_units where code = p_unit_code;
  perform app.assert_admin_for(v_unit);
  if p_direction not in ('up', 'down') then
    raise exception 'direction must be up or down' using errcode = '22023';
  end if;

  select array_agg(id order by display_order, section_key) into v_ids
    from public.content_blocks where business_unit_id = v_unit and page_slug = p_page_slug;

  v_index := array_position(v_ids, p_id);
  if v_index is null then
    raise exception 'content block not found' using errcode = 'P0002';
  end if;

  if p_direction = 'up' then
    v_target := v_index - 1;
  else
    v_target := v_index + 1;
  end if;
  if v_target < 1 or v_target > array_length(v_ids, 1) then
    return; -- already at the edge: a no-op, never an error.
  end if;

  v_swap := v_ids[v_target];
  v_ids[v_target] := v_ids[v_index];
  v_ids[v_index] := v_swap;

  foreach v_block in array v_ids loop
    update public.content_blocks set display_order = v_position where id = v_block;
    v_position := v_position + 1;
  end loop;

  perform app.write_audit_log(v_unit, 'update', 'content_block', p_id,
    jsonb_build_object('direction', p_direction), jsonb_build_object('display_order', v_target - 1));
end;
$$;

create or replace function public.admin_delete_content_block(p_unit_code text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit uuid;
  v_before public.content_blocks;
begin
  select id into v_unit from public.business_units where code = p_unit_code;
  perform app.assert_admin_for(v_unit);
  select * into v_before from public.content_blocks where id = p_id and business_unit_id = v_unit for update;
  if v_before.id is null then
    raise exception 'content block not found' using errcode = 'P0002';
  end if;
  delete from public.content_blocks where id = p_id;
  perform app.write_audit_log(v_unit, 'settings_change', 'content_block', v_before.id,
    jsonb_build_object('page_slug', v_before.page_slug, 'section_key', v_before.section_key), null);
end;
$$;

-- Replaces the products of one carousel with the given list; the array order is the display order (the up/down buttons).
-- A product that is later unpublished simply disappears from the public read; its row is not deleted here.
create or replace function public.admin_set_carousel_items(p_unit_code text, p_carousel_key text, p_product_ids uuid[])
returns setof public.carousel_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit uuid;
  v_before jsonb;
  v_after jsonb;
begin
  select id into v_unit from public.business_units where code = p_unit_code;
  perform app.assert_admin_for(v_unit);
  if p_carousel_key !~ '^[a-z0-9]+(_[a-z0-9]+)*$' then
    raise exception 'invalid carousel key' using errcode = '22023';
  end if;
  if coalesce(array_length(p_product_ids, 1), 0) > 50 then
    raise exception 'a carousel can list at most 50 products' using errcode = '22023';
  end if;
  if (select count(distinct x) from unnest(p_product_ids) x) <> coalesce(array_length(p_product_ids, 1), 0) then
    raise exception 'a product cannot be listed twice' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(p_product_ids) x
     where not exists (
       select 1 from public.products p
        where p.id = x and p.business_unit_id = v_unit and p.publication_status = 'published' and p.archived_at is null
     )
  ) then
    raise exception 'every product must exist, be published and belong to this business unit' using errcode = '23503';
  end if;

  select coalesce(jsonb_agg(to_jsonb(ci) order by ci.display_order), '[]'::jsonb) into v_before
    from public.carousel_items ci where ci.business_unit_id = v_unit and ci.carousel_key = p_carousel_key;

  delete from public.carousel_items
   where business_unit_id = v_unit and carousel_key = p_carousel_key
     and product_id <> all (coalesce(p_product_ids, '{}'));
  insert into public.carousel_items (business_unit_id, carousel_key, product_id, display_order)
  select v_unit, p_carousel_key, x.product_id, (x.ord - 1)::integer
    from unnest(p_product_ids) with ordinality as x(product_id, ord)
  on conflict (business_unit_id, carousel_key, product_id) do update set display_order = excluded.display_order;

  select coalesce(jsonb_agg(to_jsonb(ci) order by ci.display_order), '[]'::jsonb) into v_after
    from public.carousel_items ci where ci.business_unit_id = v_unit and ci.carousel_key = p_carousel_key;
  perform app.write_audit_log(v_unit, 'update', 'carousel_items', null, v_before, v_after);

  return query select * from public.carousel_items
    where business_unit_id = v_unit and carousel_key = p_carousel_key order by display_order;
end;
$$;

revoke all on function public.admin_save_content_block(text, text, text, text, jsonb, boolean) from public, anon;
revoke all on function public.admin_set_content_block_visibility(text, uuid, timestamptz, boolean) from public, anon;
revoke all on function public.admin_move_content_block(text, text, uuid, text) from public, anon;
revoke all on function public.admin_delete_content_block(text, uuid) from public, anon;
revoke all on function public.admin_set_carousel_items(text, text, uuid[]) from public, anon;
revoke all on function app.validate_content_block() from public, anon, authenticated;
revoke all on function app.enforce_carousel_item_unit() from public, anon, authenticated;
grant execute on function public.admin_save_content_block(text, text, text, text, jsonb, boolean) to authenticated;
grant execute on function public.admin_set_content_block_visibility(text, uuid, timestamptz, boolean) to authenticated;
grant execute on function public.admin_move_content_block(text, text, uuid, text) to authenticated;
grant execute on function public.admin_delete_content_block(text, uuid) to authenticated;
grant execute on function public.admin_set_carousel_items(text, text, uuid[]) to authenticated;
