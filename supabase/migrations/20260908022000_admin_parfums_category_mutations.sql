-- Cruzial Platform V2 — Admin Parfums category CRUD (Phase 4b)
--
-- Additive hierarchy hardening plus audited, optimistic-concurrency RPCs.
-- Category `spec_schema` deliberately remains untouched: Phase 4b has no
-- confirmed use case for exposing arbitrary JSON to an administrator.

-- ---------------------------------------------------------------------------
-- Category state and hierarchy integrity
-- ---------------------------------------------------------------------------

alter table public.categories
  add constraint categories_archive_state_check check (
    (archived_at is null and publication_status in ('draft', 'published'))
    or
    (archived_at is not null and publication_status = 'archived')
  );

-- Extends the Phase 3 same-unit guard with self/cycle detection, kind
-- compatibility, archived-parent protection and conservative archive rules.
-- The per-unit advisory lock prevents two concurrent parent changes from
-- creating a write-skew cycle while keeping unrelated units independent.
create or replace function app.enforce_category_parent_unit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent public.categories%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.business_unit_id::text, 0)
  );

  if new.parent_id is not null then
    if new.parent_id = new.id then
      raise exception 'a category cannot be its own parent' using errcode = 'P2001';
    end if;

    select * into v_parent
    from public.categories
    where id = new.parent_id;

    if not found or v_parent.business_unit_id is distinct from new.business_unit_id then
      raise exception 'category parent must belong to the same business unit'
        using errcode = 'check_violation';
    end if;

    if v_parent.kind is distinct from new.kind then
      raise exception 'category parent and child must have the same kind'
        using errcode = 'P2001';
    end if;

    if new.archived_at is null and v_parent.archived_at is not null then
      raise exception 'an active category cannot use an archived parent'
        using errcode = 'P2003';
    end if;

    if exists (
      with recursive ancestors as (
        select category.id, category.parent_id
        from public.categories category
        where category.id = new.parent_id

        union

        select category.id, category.parent_id
        from public.categories category
        join ancestors on ancestors.parent_id = category.id
      )
      select 1 from ancestors where id = new.id
    ) then
      raise exception 'category hierarchy cannot contain a cycle'
        using errcode = 'P2001';
    end if;
  end if;

  if exists (
    select 1
    from public.categories child
    where child.parent_id = new.id
      and (
        child.business_unit_id is distinct from new.business_unit_id
        or child.kind is distinct from new.kind
      )
  ) then
    raise exception 'category changes cannot invalidate existing children'
      using errcode = 'P2001';
  end if;

  if new.archived_at is not null then
    if exists (
      select 1 from public.categories child
      where child.parent_id = new.id and child.archived_at is null
    ) then
      raise exception 'archive child categories first' using errcode = 'P2002';
    end if;

    if exists (
      select 1 from public.product_categories assignment
      where assignment.category_id = new.id
    ) then
      raise exception 'remove product assignments before archiving the category'
        using errcode = 'P2002';
    end if;
  end if;

  return new;
end;
$$;

drop trigger categories_enforce_parent_unit on public.categories;

create trigger categories_enforce_parent_unit
  before insert or update of parent_id, business_unit_id, kind, archived_at
  on public.categories
  for each row execute function app.enforce_category_parent_unit();

-- Existing assignments are preserved, but archived categories cannot be
-- introduced into a product's desired category set by a new write.
create or replace function app.enforce_product_category_unit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product_unit uuid;
  v_category_unit uuid;
  v_category_archived_at timestamptz;
begin
  select business_unit_id into v_product_unit
  from public.products where id = new.product_id;

  select business_unit_id, archived_at
    into v_category_unit, v_category_archived_at
  from public.categories where id = new.category_id;

  if v_product_unit is null
    or v_category_unit is null
    or v_product_unit is distinct from v_category_unit
  then
    raise exception 'product and category must belong to the same business unit'
      using errcode = 'check_violation';
  end if;

  if v_category_archived_at is not null then
    raise exception 'an archived category cannot be assigned to a product'
      using errcode = 'P2004';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Category mutations
-- ---------------------------------------------------------------------------

create or replace function public.admin_create_category(
  p_business_unit_code text,
  p_kind text,
  p_slug text,
  p_name text,
  p_description text default null,
  p_parent_id uuid default null,
  p_publication_status text default 'draft',
  p_sort_order integer default 0
)
returns public.categories
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_business_unit_id uuid;
  v_row public.categories%rowtype;
begin
  select id into v_business_unit_id
  from public.business_units
  where code = p_business_unit_code;

  if v_business_unit_id is null then
    raise exception 'business unit not found' using errcode = '22023';
  end if;

  perform app.assert_admin_for(v_business_unit_id);

  if p_business_unit_code = 'parfums'
    and p_kind not in ('commercial_type', 'olfactory_family')
  then
    raise exception 'invalid category kind for Parfums' using errcode = '22023';
  end if;

  if p_publication_status not in ('draft', 'published') then
    raise exception 'new categories must be draft or published' using errcode = '22023';
  end if;

  insert into public.categories (
    business_unit_id,
    parent_id,
    kind,
    slug,
    name,
    description,
    publication_status,
    sort_order
  ) values (
    v_business_unit_id,
    p_parent_id,
    p_kind,
    p_slug,
    p_name,
    p_description,
    p_publication_status,
    p_sort_order
  ) returning * into v_row;

  perform app.write_audit_log(
    v_business_unit_id,
    'create',
    'category',
    v_row.id,
    null,
    to_jsonb(v_row)
  );

  return v_row;
end;
$$;

revoke all on function public.admin_create_category(text, text, text, text, text, uuid, text, integer) from public;
grant execute on function public.admin_create_category(text, text, text, text, text, uuid, text, integer) to authenticated;

create or replace function public.admin_update_category(
  p_category_id uuid,
  p_expected_updated_at timestamptz,
  p_kind text,
  p_slug text,
  p_name text,
  p_description text,
  p_parent_id uuid,
  p_publication_status text,
  p_sort_order integer
)
returns public.categories
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_before public.categories%rowtype;
  v_after public.categories%rowtype;
begin
  select * into v_before
  from public.categories
  where id = p_category_id;

  if not found then
    raise exception 'category not found' using errcode = 'P0002';
  end if;

  perform app.assert_admin_for(v_before.business_unit_id);

  if v_before.archived_at is not null then
    raise exception 'restore the category before editing it' using errcode = 'P2005';
  end if;

  if v_before.updated_at is distinct from p_expected_updated_at then
    raise exception 'category was modified by another session' using errcode = '40001';
  end if;

  if p_publication_status not in ('draft', 'published') then
    raise exception 'active categories must be draft or published' using errcode = '22023';
  end if;

  if p_kind not in ('commercial_type', 'olfactory_family') then
    raise exception 'Parfums categories must use a Parfums category kind' using errcode = '22023';
  end if;

  update public.categories
  set
    kind = p_kind,
    slug = p_slug,
    name = p_name,
    description = p_description,
    parent_id = p_parent_id,
    publication_status = p_publication_status,
    sort_order = p_sort_order
  where id = p_category_id
    and updated_at = p_expected_updated_at
    and archived_at is null
  returning * into v_after;

  if not found then
    raise exception 'category was modified by another session' using errcode = '40001';
  end if;

  perform app.write_audit_log(
    v_before.business_unit_id,
    'update',
    'category',
    p_category_id,
    to_jsonb(v_before),
    to_jsonb(v_after)
  );

  return v_after;
end;
$$;

revoke all on function public.admin_update_category(uuid, timestamptz, text, text, text, text, uuid, text, integer) from public;
grant execute on function public.admin_update_category(uuid, timestamptz, text, text, text, text, uuid, text, integer) to authenticated;

create or replace function public.admin_archive_category(
  p_category_id uuid,
  p_expected_updated_at timestamptz
)
returns public.categories
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_before public.categories%rowtype;
  v_after public.categories%rowtype;
begin
  select * into v_before
  from public.categories
  where id = p_category_id;

  if not found then
    raise exception 'category not found' using errcode = 'P0002';
  end if;

  perform app.assert_admin_for(v_before.business_unit_id);

  if v_before.updated_at is distinct from p_expected_updated_at
    or v_before.archived_at is not null
  then
    raise exception 'category was modified by another session' using errcode = '40001';
  end if;

  update public.categories
  set archived_at = now(), publication_status = 'archived'
  where id = p_category_id and updated_at = p_expected_updated_at
  returning * into v_after;

  if not found then
    raise exception 'category was modified by another session' using errcode = '40001';
  end if;

  perform app.write_audit_log(
    v_before.business_unit_id,
    'archive',
    'category',
    p_category_id,
    to_jsonb(v_before),
    to_jsonb(v_after)
  );

  return v_after;
end;
$$;

revoke all on function public.admin_archive_category(uuid, timestamptz) from public;
grant execute on function public.admin_archive_category(uuid, timestamptz) to authenticated;

create or replace function public.admin_restore_category(
  p_category_id uuid,
  p_expected_updated_at timestamptz
)
returns public.categories
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_before public.categories%rowtype;
  v_after public.categories%rowtype;
begin
  select * into v_before
  from public.categories
  where id = p_category_id;

  if not found then
    raise exception 'category not found' using errcode = 'P0002';
  end if;

  perform app.assert_admin_for(v_before.business_unit_id);

  if v_before.updated_at is distinct from p_expected_updated_at
    or v_before.archived_at is null
  then
    raise exception 'category was modified by another session' using errcode = '40001';
  end if;

  update public.categories
  set archived_at = null, publication_status = 'draft'
  where id = p_category_id and updated_at = p_expected_updated_at
  returning * into v_after;

  if not found then
    raise exception 'category was modified by another session' using errcode = '40001';
  end if;

  perform app.write_audit_log(
    v_before.business_unit_id,
    'restore',
    'category',
    p_category_id,
    to_jsonb(v_before),
    to_jsonb(v_after)
  );

  return v_after;
end;
$$;

revoke all on function public.admin_restore_category(uuid, timestamptz) from public;
grant execute on function public.admin_restore_category(uuid, timestamptz) to authenticated;

revoke all on function app.enforce_category_parent_unit() from public;
revoke all on function app.enforce_product_category_unit() from public;
