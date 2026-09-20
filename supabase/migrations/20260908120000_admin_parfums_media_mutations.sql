-- Cruzial Platform V2 — Admin Parfums media mutations (Phase 4F1)
--
-- Same pattern as the other admin_* mutation files: SECURITY INVOKER
-- functions in `public` (PostgREST-exposed), app.assert_admin_for() as an
-- explicit authorization check, app.write_audit_log() for a non-spoofable
-- audit trail in the same transaction as the mutation, and optimistic
-- concurrency via `UPDATE ... WHERE id = $1 AND updated_at = $2` raising
-- SQLSTATE 40001 on zero rows. No DELETE anywhere — archive/restore only,
-- and no Cloudinary asset is ever deleted from a mutation in this file.
--
-- `product_media` (20260907154348_catalog.sql) already carries a partial
-- unique index — `product_media_single_primary_idx on (product_id) where
-- is_primary and archived_at is null` — so "one active primary per product"
-- is a database invariant, not something these functions have to re-derive.
-- Every function that could otherwise violate it (register-with-primary,
-- set_primary) explicitly demotes the product's other primary row first, in
-- the same statement ordering, so the invariant is never even transiently
-- broken within a transaction.
--
-- Cloudinary itself is never called from SQL. The browser gets a signed
-- upload authorization from a server action (src/lib/media/cloudinary.ts),
-- uploads directly to Cloudinary, and only the *returned* metadata
-- (secure_url, public_id, width, height, bytes, format) is ever persisted
-- here — via admin_register_media, called after the upload already
-- succeeded. Nothing in this file can forge that metadata; it only trusts
-- what admin_register_media's caller (a Server Action, never the browser
-- directly) passes after receiving Cloudinary's own response.

-- ---------------------------------------------------------------------------
-- audit_log action vocabulary (additive)
-- ---------------------------------------------------------------------------

alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check check (
  action in (
    'create', 'update', 'archive', 'restore', 'publish', 'unpublish',
    'price_change', 'inventory_change', 'campaign_state_change',
    'order_state_change', 'settings_change', 'membership_change',
    'customer_verification_change', 'composition_update', 'verification_update',
    'wholesale.policy_update', 'wholesale.enable', 'wholesale.disable',
    'primary_change', 'reorder'
  )
);

-- ---------------------------------------------------------------------------
-- app.media_unit — same shape as app.combo_unit/app.variant_unit
-- ---------------------------------------------------------------------------

create or replace function app.media_unit(target_media uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.business_unit_id
  from public.product_media m
  join public.products p on p.id = m.product_id
  where m.id = target_media
$$;

revoke all on function app.media_unit(uuid) from public;
grant execute on function app.media_unit(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- admin_register_media
--
-- Persists a media row AFTER a Cloudinary (or, for tests/fixtures, any other
-- provider) upload already succeeded. Never trusts product_id/variant_id
-- authority beyond "does this UUID resolve, and is the caller an admin for
-- its business unit" — cross-product and cross-unit variant assignment are
-- both rejected here, not left to the client.
-- ---------------------------------------------------------------------------

create or replace function public.admin_register_media(
  p_product_id uuid,
  p_secure_url text,
  p_provider text default 'cloudinary',
  p_variant_id uuid default null,
  p_public_id text default null,
  p_width integer default null,
  p_height integer default null,
  p_bytes integer default null,
  p_format text default null,
  p_alt text default null,
  p_set_primary boolean default false
)
returns public.product_media
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_product public.products;
  v_variant_product_id uuid;
  v_row public.product_media;
begin
  select * into v_product from public.products where id = p_product_id;
  if v_product.id is null then
    raise exception 'product not found' using errcode = 'P0002';
  end if;

  perform app.assert_admin_for(v_product.business_unit_id);

  if p_variant_id is not null then
    select product_id into v_variant_product_id
    from public.product_variants
    where id = p_variant_id;

    if v_variant_product_id is null then
      raise exception 'variant not found' using errcode = 'P0002';
    end if;
    if v_variant_product_id <> p_product_id then
      raise exception 'variant does not belong to this product' using errcode = 'P2004';
    end if;
  end if;

  if p_provider not in ('legacy_static', 'cloudinary') then
    raise exception 'unsupported media provider' using errcode = '22023';
  end if;

  insert into public.product_media (
    product_id, product_variant_id, provider, public_id, secure_url,
    width, height, bytes, format, alt, sort_order, is_primary
  )
  values (
    p_product_id, p_variant_id, p_provider, p_public_id, p_secure_url,
    p_width, p_height, p_bytes, p_format, p_alt,
    coalesce((select max(sort_order) + 1 from public.product_media where product_id = p_product_id), 0),
    false
  )
  returning * into v_row;

  if p_set_primary then
    update public.product_media
    set is_primary = false
    where product_id = p_product_id and id <> v_row.id and is_primary and archived_at is null;

    update public.product_media
    set is_primary = true
    where id = v_row.id
    returning * into v_row;
  end if;

  perform app.write_audit_log(v_product.business_unit_id, 'create', 'product_media', v_row.id, null, to_jsonb(v_row));

  return v_row;
end;
$$;

revoke all on function public.admin_register_media(uuid, text, text, uuid, text, integer, integer, integer, text, text, boolean) from public;
grant execute on function public.admin_register_media(uuid, text, text, uuid, text, integer, integer, integer, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- admin_update_media — alt text and/or variant association, full replace
-- like admin_update_product: both fields are always sent, either can be null.
-- ---------------------------------------------------------------------------

create or replace function public.admin_update_media(
  p_media_id uuid,
  p_expected_updated_at timestamptz,
  p_alt text,
  p_variant_id uuid
)
returns public.product_media
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_business_unit_id uuid;
  v_before public.product_media;
  v_after public.product_media;
  v_variant_product_id uuid;
begin
  select * into v_before from public.product_media where id = p_media_id;
  if v_before.id is null then
    raise exception 'media not found' using errcode = 'P0002';
  end if;

  v_business_unit_id := app.media_unit(p_media_id);
  perform app.assert_admin_for(v_business_unit_id);

  if p_variant_id is not null then
    select product_id into v_variant_product_id
    from public.product_variants
    where id = p_variant_id;

    if v_variant_product_id is null then
      raise exception 'variant not found' using errcode = 'P0002';
    end if;
    if v_variant_product_id <> v_before.product_id then
      raise exception 'variant does not belong to this product' using errcode = 'P2004';
    end if;
  end if;

  update public.product_media
  set alt = p_alt, product_variant_id = p_variant_id
  where id = p_media_id and updated_at = p_expected_updated_at
  returning * into v_after;

  if v_after.id is null then
    raise exception 'media was modified by another session' using errcode = '40001';
  end if;

  perform app.write_audit_log(v_business_unit_id, 'update', 'product_media', p_media_id, to_jsonb(v_before), to_jsonb(v_after));

  return v_after;
end;
$$;

revoke all on function public.admin_update_media(uuid, timestamptz, text, uuid) from public;
grant execute on function public.admin_update_media(uuid, timestamptz, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- admin_set_media_primary — demotes the product's current active primary (if
-- any) and promotes this one, atomically. Refuses to promote an archived row.
-- ---------------------------------------------------------------------------

create or replace function public.admin_set_media_primary(
  p_media_id uuid,
  p_expected_updated_at timestamptz
)
returns public.product_media
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_business_unit_id uuid;
  v_before public.product_media;
  v_after public.product_media;
begin
  select * into v_before from public.product_media where id = p_media_id;
  if v_before.id is null then
    raise exception 'media not found' using errcode = 'P0002';
  end if;

  v_business_unit_id := app.media_unit(p_media_id);
  perform app.assert_admin_for(v_business_unit_id);

  if v_before.archived_at is not null then
    raise exception 'cannot set an archived media row as primary' using errcode = '22023';
  end if;

  update public.product_media
  set is_primary = false
  where product_id = v_before.product_id and id <> p_media_id and is_primary and archived_at is null;

  update public.product_media
  set is_primary = true
  where id = p_media_id and updated_at = p_expected_updated_at
  returning * into v_after;

  if v_after.id is null then
    raise exception 'media was modified by another session' using errcode = '40001';
  end if;

  perform app.write_audit_log(v_business_unit_id, 'primary_change', 'product_media', p_media_id, to_jsonb(v_before), to_jsonb(v_after));

  return v_after;
end;
$$;

revoke all on function public.admin_set_media_primary(uuid, timestamptz) from public;
grant execute on function public.admin_set_media_primary(uuid, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- admin_archive_media / admin_restore_media
--
-- Archiving a primary row explicitly clears is_primary (docs: Phase 4F1
-- section 11 — "should not remain active primary"). It does NOT promote
-- another row: the product may end up with no active primary, and the Admin
-- UI is expected to surface that as a warning rather than guessing which
-- remaining image should take over. Restoring a row never re-sets
-- is_primary — a restored row comes back as a plain, non-primary image, so
-- restore can never collide with product_media_single_primary_idx and never
-- "steals" primary status from whatever is active at the time.
-- ---------------------------------------------------------------------------

create or replace function public.admin_archive_media(
  p_media_id uuid,
  p_expected_updated_at timestamptz
)
returns public.product_media
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_business_unit_id uuid;
  v_before public.product_media;
  v_after public.product_media;
begin
  select * into v_before from public.product_media where id = p_media_id;
  if v_before.id is null then
    raise exception 'media not found' using errcode = 'P0002';
  end if;

  v_business_unit_id := app.media_unit(p_media_id);
  perform app.assert_admin_for(v_business_unit_id);

  update public.product_media
  set archived_at = now(), is_primary = false
  where id = p_media_id and updated_at = p_expected_updated_at
  returning * into v_after;

  if v_after.id is null then
    raise exception 'media was modified by another session' using errcode = '40001';
  end if;

  perform app.write_audit_log(v_business_unit_id, 'archive', 'product_media', p_media_id, to_jsonb(v_before), to_jsonb(v_after));

  return v_after;
end;
$$;

revoke all on function public.admin_archive_media(uuid, timestamptz) from public;
grant execute on function public.admin_archive_media(uuid, timestamptz) to authenticated;

create or replace function public.admin_restore_media(
  p_media_id uuid,
  p_expected_updated_at timestamptz
)
returns public.product_media
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_business_unit_id uuid;
  v_before public.product_media;
  v_after public.product_media;
begin
  select * into v_before from public.product_media where id = p_media_id;
  if v_before.id is null then
    raise exception 'media not found' using errcode = 'P0002';
  end if;

  v_business_unit_id := app.media_unit(p_media_id);
  perform app.assert_admin_for(v_business_unit_id);

  update public.product_media
  set archived_at = null
  where id = p_media_id and updated_at = p_expected_updated_at
  returning * into v_after;

  if v_after.id is null then
    raise exception 'media was modified by another session' using errcode = '40001';
  end if;

  perform app.write_audit_log(v_business_unit_id, 'restore', 'product_media', p_media_id, to_jsonb(v_before), to_jsonb(v_after));

  return v_after;
end;
$$;

revoke all on function public.admin_restore_media(uuid, timestamptz) from public;
grant execute on function public.admin_restore_media(uuid, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- admin_reorder_media — full-replace sort_order for a product's media rows,
-- one transaction. Same "client holds the desired order, submits it whole"
-- shape as admin_set_combo_composition. Every id in p_items must already
-- belong to p_product_id — an id from another product (or another business
-- unit) is rejected outright, not silently skipped.
-- ---------------------------------------------------------------------------

create or replace function public.admin_reorder_media(
  p_product_id uuid,
  p_items jsonb
)
returns setof public.product_media
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_product public.products;
  v_before jsonb;
  v_after jsonb;
  item jsonb;
  v_media_id uuid;
  v_media_product_id uuid;
begin
  select * into v_product from public.products where id = p_product_id;
  if v_product.id is null then
    raise exception 'product not found' using errcode = 'P0002';
  end if;

  perform app.assert_admin_for(v_product.business_unit_id);

  select coalesce(jsonb_agg(to_jsonb(m) order by m.sort_order), '[]'::jsonb) into v_before
  from public.product_media m where m.product_id = p_product_id;

  for item in select * from jsonb_array_elements(p_items)
  loop
    v_media_id := (item->>'id')::uuid;

    select product_id into v_media_product_id
    from public.product_media
    where id = v_media_id;

    if v_media_product_id is null then
      raise exception 'media not found' using errcode = 'P0002';
    end if;
    if v_media_product_id <> p_product_id then
      raise exception 'media does not belong to this product' using errcode = 'P2004';
    end if;

    update public.product_media
    set sort_order = (item->>'sort_order')::integer
    where id = v_media_id;
  end loop;

  select coalesce(jsonb_agg(to_jsonb(m) order by m.sort_order), '[]'::jsonb) into v_after
  from public.product_media m where m.product_id = p_product_id;

  perform app.write_audit_log(v_product.business_unit_id, 'reorder', 'product_media', p_product_id, v_before, v_after);

  return query select * from public.product_media where product_id = p_product_id order by sort_order;
end;
$$;

revoke all on function public.admin_reorder_media(uuid, jsonb) from public;
grant execute on function public.admin_reorder_media(uuid, jsonb) to authenticated;
