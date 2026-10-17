-- Carousel speed (2026-10-17): the `carousel` content block may carry an integer `speed` (px/s, 20–60) that the owner
-- sets from /admin/contenido and the storefront rail (ProductMarquee) applies. Mirrors apps/web/src/lib/content/schemas.ts
-- (`carouselContentSchema.speed`).
--
-- This replaces app.validate_content_block() from 20261017120000_content_blocks.sql only to add the carousel branch below;
-- every other check (HTML/control characters, title/body lengths, paired CTA, safe href) is byte-for-byte unchanged.

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
  speed text;
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

  -- A carousel may carry the rail's drift speed in px/s. Optional, but when present it must be a whole number 20..60
  -- (the same range the admin slider and the Zod schema enforce). numeric, not integer, so an absurdly long digit string
  -- reports the range error instead of an overflow.
  if new.block_type = 'carousel' then
    speed := c ->> 'speed';
    if speed is not null and (speed !~ '^[0-9]+$' or speed::numeric < 20 or speed::numeric > 60) then
      raise exception 'carousel speed must be an integer between 20 and 60' using errcode = '22023';
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
