-- Rollback of 20261017130000_content_carousel_speed.sql: restores app.validate_content_block() to the version from
-- 20261017120000_content_blocks.sql (no carousel speed branch). Existing blocks keep any stored `speed`; the database
-- simply stops checking it (the app, the admin slider and the marquee default still work). Run only on purpose.
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
