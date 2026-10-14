-- Notes model (2026-10-14): `notes` + `product_notes`, back-filled from products.specs->'notes'.
-- docs/notes-model.md explains the decisions.
--
-- The public catalog keeps reading `products.specs->'notes'` (an array of names, in order): that array is now a MIRROR of the
-- relational tables, rewritten by triggers whenever a product's notes, or a note's name or visibility, change. The storefront,
-- the search box, the Finder and the product page therefore read the same `notes: string[]` as before and need no change.
--
-- `type` allows the olfactory pyramid (top / heart / base) and the flat list (general). Which one the shop uses is the
-- owner's decision (docs/content-editor-architecture.md §7.1), so the back-fill puts every note in `general`.

create or replace function app.note_slug(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(
    regexp_replace(
      lower(translate(coalesce(p_name, ''),
        'ÁÀÄÂáàäâÉÈËÊéèëêÍÌÏÎíìïîÓÒÖÔóòöôÚÙÜÛúùüûÑñÇç',
        'AAAAaaaaEEEEeeeeIIIIiiiiOOOOooooUUUUuuuuNnCc')),
      '[^a-z0-9]+', '-', 'g'),
    '-')
$$;

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units (id) on delete restrict,
  slug text not null,
  name text not null,
  type text not null default 'general',
  description text,
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notes_name_check check (char_length(btrim(name)) between 2 and 60),
  constraint notes_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint notes_type_check check (type in ('top', 'heart', 'base', 'general')),
  constraint notes_description_check check (description is null or char_length(description) <= 300),
  constraint notes_image_url_check check (image_url is null or image_url ~ '^https://[^\s]+$'),
  constraint notes_unit_slug_unique unique (business_unit_id, slug)
);

create trigger notes_set_updated_at
  before update on public.notes
  for each row execute function app.set_updated_at();

create table public.product_notes (
  product_id uuid not null references public.products (id) on delete cascade,
  note_id uuid not null references public.notes (id) on delete restrict,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (product_id, note_id),
  constraint product_notes_position_check check (position >= 0 and position < 1000)
);

create index product_notes_note_id_idx on public.product_notes (note_id);

-- A product and its notes always belong to the same business unit.
create or replace function app.enforce_product_note_unit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select business_unit_id from public.products where id = new.product_id)
     is distinct from (select business_unit_id from public.notes where id = new.note_id) then
    raise exception 'a product can only use notes of its own business unit' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger product_notes_enforce_unit
  before insert or update on public.product_notes
  for each row execute function app.enforce_product_note_unit();

-- The mirror: products.specs->'notes' = the names of the product's active notes, in position order. Written only when it
-- changes, so a no-op never bumps products.updated_at.
create or replace function app.refresh_product_notes_mirror(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_names jsonb;
begin
  select coalesce(jsonb_agg(n.name order by pn.position, n.name), '[]'::jsonb) into v_names
    from public.product_notes pn
    join public.notes n on n.id = pn.note_id
   where pn.product_id = p_product_id and n.is_active;

  update public.products
     set specs = jsonb_set(coalesce(specs, '{}'::jsonb), '{notes}', v_names)
   where id = p_product_id
     and (specs -> 'notes') is distinct from v_names;
end;
$$;

create or replace function app.product_notes_mirror_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform app.refresh_product_notes_mirror(old.product_id);
  else
    perform app.refresh_product_notes_mirror(new.product_id);
    if tg_op = 'UPDATE' and old.product_id is distinct from new.product_id then
      perform app.refresh_product_notes_mirror(old.product_id);
    end if;
  end if;
  return null;
end;
$$;

create trigger product_notes_mirror
  after insert or update or delete on public.product_notes
  for each row execute function app.product_notes_mirror_trigger();

-- Renaming or hiding a note rewrites the mirror of every product that uses it.
create or replace function app.note_mirror_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product uuid;
begin
  for v_product in select product_id from public.product_notes where note_id = new.id
  loop
    perform app.refresh_product_notes_mirror(v_product);
  end loop;
  return null;
end;
$$;

create trigger notes_mirror
  after update of name, is_active on public.notes
  for each row
  when (old.name is distinct from new.name or old.is_active is distinct from new.is_active)
  execute function app.note_mirror_trigger();

-- ---------------------------------------------------------------------------------------------------------------
-- Back-fill from products.specs->'notes'. Idempotent (a function so the tests can run it on fixtures). Two spellings of the
-- same note ("Vainilla", "vainilla ") collapse into one note (the most frequent spelling wins); a product listing both ends
-- up with one. Returns the number of notes and product links it created.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function app.backfill_product_notes()
returns table (notes_created integer, links_created integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_notes integer;
  v_links integer;
begin
  create temporary table _note_raw on commit drop as
  select p.id as product_id, p.business_unit_id, btrim(e.value) as name, e.ord, app.note_slug(e.value) as slug
    from public.products p
    cross join lateral jsonb_array_elements_text(
      case when jsonb_typeof(p.specs -> 'notes') = 'array' then p.specs -> 'notes' else '[]'::jsonb end
    ) with ordinality as e(value, ord)
   where char_length(btrim(e.value)) between 2 and 60 and app.note_slug(e.value) <> '';

  with created as (
    insert into public.notes (business_unit_id, slug, name, type)
    select distinct on (business_unit_id, slug) business_unit_id, slug, name, 'general'
      from (
        select business_unit_id, slug, name, count(*) as uses from _note_raw group by business_unit_id, slug, name
      ) spelling
     order by business_unit_id, slug, uses desc, name
    on conflict (business_unit_id, slug) do nothing
    returning 1
  )
  select count(*)::integer into v_notes from created;

  with linked as (
    insert into public.product_notes (product_id, note_id, position)
    select raw.product_id, n.id, (min(raw.ord) - 1)::integer
      from _note_raw raw
      join public.notes n on n.business_unit_id = raw.business_unit_id and n.slug = raw.slug
     group by raw.product_id, n.id
    on conflict (product_id, note_id) do nothing
    returning 1
  )
  select count(*)::integer into v_links from linked;

  drop table _note_raw;
  return query select v_notes, v_links;
end;
$$;

revoke all on function app.backfill_product_notes() from public, anon, authenticated;

select * from app.backfill_product_notes();

-- ---------------------------------------------------------------------------------------------------------------
-- RLS and grants. Public read of active notes and of the notes of public products; writes only through the functions below.
-- ---------------------------------------------------------------------------------------------------------------
alter table public.notes enable row level security;
alter table public.product_notes enable row level security;

create policy notes_public_read on public.notes
  for select to anon, authenticated
  using (is_active);

create policy notes_admin_read on public.notes
  for select to authenticated
  using (app.can_read_unit(business_unit_id));

create policy product_notes_public_read on public.product_notes
  for select to anon, authenticated
  using (app.product_is_public(product_id));

create policy product_notes_admin_read on public.product_notes
  for select to authenticated
  using (app.can_read_unit(app.product_unit(product_id)));

revoke all on public.notes, public.product_notes from anon, authenticated;
grant select on public.notes, public.product_notes to anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Admin functions (SECURITY DEFINER, empty search_path, explicit admin check, audit log).
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.admin_save_note(
  p_unit_code text,
  p_id uuid,
  p_expected_updated_at timestamptz,
  p_name text,
  p_type text,
  p_description text,
  p_image_url text,
  p_is_active boolean
)
returns public.notes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit uuid;
  v_before public.notes;
  v_after public.notes;
  v_slug text := app.note_slug(p_name);
begin
  select id into v_unit from public.business_units where code = p_unit_code;
  perform app.assert_admin_for(v_unit);
  if v_slug = '' then
    raise exception 'the note needs a name with letters or digits' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.notes (business_unit_id, slug, name, type, description, image_url, is_active)
    values (v_unit, v_slug, btrim(p_name), coalesce(p_type, 'general'), nullif(btrim(coalesce(p_description, '')), ''),
            nullif(btrim(coalesce(p_image_url, '')), ''), coalesce(p_is_active, true))
    returning * into v_after;
    perform app.write_audit_log(v_unit, 'create', 'note', v_after.id, null,
      jsonb_build_object('name', v_after.name, 'type', v_after.type, 'is_active', v_after.is_active));
    return v_after;
  end if;

  select * into v_before from public.notes where id = p_id and business_unit_id = v_unit;
  if v_before.id is null then
    raise exception 'note not found' using errcode = 'P0002';
  end if;
  update public.notes
     set slug = v_slug, name = btrim(p_name), type = coalesce(p_type, 'general'),
         description = nullif(btrim(coalesce(p_description, '')), ''),
         image_url = nullif(btrim(coalesce(p_image_url, '')), ''), is_active = coalesce(p_is_active, true)
   where id = p_id and business_unit_id = v_unit and updated_at = p_expected_updated_at
  returning * into v_after;
  if v_after.id is null then
    raise exception 'note was modified by another session' using errcode = '40001';
  end if;
  perform app.write_audit_log(v_unit, 'update', 'note', v_after.id,
    jsonb_build_object('name', v_before.name, 'type', v_before.type, 'is_active', v_before.is_active),
    jsonb_build_object('name', v_after.name, 'type', v_after.type, 'is_active', v_after.is_active));
  return v_after;
end;
$$;

-- A note that products still use is not deleted: take it off those products first (or hide it with is_active = false).
create or replace function public.admin_delete_note(p_unit_code text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit uuid;
  v_before public.notes;
  v_uses integer;
begin
  select id into v_unit from public.business_units where code = p_unit_code;
  perform app.assert_admin_for(v_unit);
  select * into v_before from public.notes where id = p_id and business_unit_id = v_unit for update;
  if v_before.id is null then
    raise exception 'note not found' using errcode = 'P0002';
  end if;
  select count(*) into v_uses from public.product_notes where note_id = p_id;
  if v_uses > 0 then
    raise exception 'the note is used by % product(s)', v_uses using errcode = 'P2050';
  end if;
  delete from public.notes where id = p_id;
  perform app.write_audit_log(v_unit, 'settings_change', 'note', v_before.id,
    jsonb_build_object('name', v_before.name, 'type', v_before.type, 'is_active', v_before.is_active), null);
end;
$$;

-- Replaces the notes of a product with the given list; the array order is the display order (the up/down buttons).
create or replace function public.admin_set_product_notes(p_product_id uuid, p_note_ids uuid[])
returns setof public.product_notes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit uuid;
  v_before jsonb;
  v_after jsonb;
begin
  v_unit := app.product_unit(p_product_id);
  if v_unit is null then
    raise exception 'product not found' using errcode = 'P0002';
  end if;
  perform app.assert_admin_for(v_unit);
  if coalesce(array_length(p_note_ids, 1), 0) > 30 then
    raise exception 'a product can have at most 30 notes' using errcode = '22023';
  end if;
  if (select count(distinct x) from unnest(p_note_ids) x) <> coalesce(array_length(p_note_ids, 1), 0) then
    raise exception 'a note cannot be listed twice' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(p_note_ids) x
     where not exists (select 1 from public.notes n where n.id = x and n.business_unit_id = v_unit and n.is_active)
  ) then
    raise exception 'every note must exist, be active and belong to this business unit' using errcode = '23503';
  end if;

  select coalesce(jsonb_agg(to_jsonb(pn) order by pn.position), '[]'::jsonb) into v_before
    from public.product_notes pn where pn.product_id = p_product_id;

  delete from public.product_notes where product_id = p_product_id and note_id <> all (coalesce(p_note_ids, '{}'));
  insert into public.product_notes (product_id, note_id, position)
  select p_product_id, x.note_id, (x.ord - 1)::integer
    from unnest(p_note_ids) with ordinality as x(note_id, ord)
  on conflict (product_id, note_id) do update set position = excluded.position;

  select coalesce(jsonb_agg(to_jsonb(pn) order by pn.position), '[]'::jsonb) into v_after
    from public.product_notes pn where pn.product_id = p_product_id;
  perform app.write_audit_log(v_unit, 'update', 'product_notes', p_product_id, v_before, v_after);

  return query select * from public.product_notes where product_id = p_product_id order by position;
end;
$$;

revoke all on function public.admin_save_note(text, uuid, timestamptz, text, text, text, text, boolean) from public, anon;
revoke all on function public.admin_delete_note(text, uuid) from public, anon;
revoke all on function public.admin_set_product_notes(uuid, uuid[]) from public, anon;
revoke all on function app.refresh_product_notes_mirror(uuid) from public, anon, authenticated;
revoke all on function app.product_notes_mirror_trigger() from public, anon, authenticated;
revoke all on function app.note_mirror_trigger() from public, anon, authenticated;
grant execute on function public.admin_save_note(text, uuid, timestamptz, text, text, text, text, boolean) to authenticated;
grant execute on function public.admin_delete_note(text, uuid) to authenticated;
grant execute on function public.admin_set_product_notes(uuid, uuid[]) to authenticated;
