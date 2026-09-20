-- 4K-C1A: each combo presentation owns an independent composition.

alter table public.combo_items
  add column combo_product_variant_id uuid;

-- Historical rows are only safe to map when the combo product has exactly
-- one variant in total. Active/archive state and labels are deliberately not
-- used as inference signals.
update public.combo_items ci
set combo_product_variant_id = candidate.variant_id
from (
  select c.id as combo_id, min(pv.id::text)::uuid as variant_id
  from public.combos c
  join public.product_variants pv on pv.product_id = c.product_id
  group by c.id
  having count(*) = 1
) candidate
where candidate.combo_id = ci.combo_id;

do $$
begin
  if exists (select 1 from public.combo_items where combo_product_variant_id is null) then
    raise exception 'cannot map historical combo_items: combo product variant is ambiguous'
      using errcode = 'data_exception';
  end if;
end;
$$;

alter table public.combo_items
  alter column combo_product_variant_id set not null,
  add constraint combo_items_combo_product_variant_id_fkey
    foreign key (combo_product_variant_id) references public.product_variants (id) on delete restrict;

alter table public.combo_items
  drop constraint combo_items_combo_variant_unique,
  add constraint combo_items_presentation_ingredient_unique
    unique (combo_id, combo_product_variant_id, product_variant_id);

drop index public.combo_items_combo_id_idx;
create index combo_items_presentation_sort_idx
  on public.combo_items (combo_id, combo_product_variant_id, sort_order);

alter table public.combos drop constraint combos_composition_verification_check;
alter table public.combos add constraint combos_composition_verification_check check (
  composition_verification_status in (
    'pending_reconfirmation', 'client_confirmed', 'official_pdf', 'unknown'
  )
);

create or replace function app.enforce_combo_item_unit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  combo_product_id uuid;
  combo_business_unit uuid;
  presentation_product_id uuid;
  ingredient_product_id uuid;
  ingredient_business_unit uuid;
begin
  select combo.product_id, product.business_unit_id
    into combo_product_id, combo_business_unit
  from public.combos combo
  join public.products product on product.id = combo.product_id
  where combo.id = new.combo_id;

  if combo_product_id is null then
    raise exception 'combo item must resolve to an existing combo product'
      using errcode = 'check_violation';
  end if;

  select variant.product_id into presentation_product_id
  from public.product_variants variant
  where variant.id = new.combo_product_variant_id;

  if presentation_product_id is null or presentation_product_id <> combo_product_id then
    raise exception 'combo product variant must belong to the combo product'
      using errcode = 'check_violation';
  end if;

  select variant.product_id, product.business_unit_id
    into ingredient_product_id, ingredient_business_unit
  from public.product_variants variant
  join public.products product on product.id = variant.product_id
  where variant.id = new.product_variant_id;

  if ingredient_product_id is null
     or ingredient_business_unit is distinct from combo_business_unit then
    raise exception 'combo item must belong to the combo business unit'
      using errcode = 'check_violation';
  end if;

  if ingredient_product_id = combo_product_id then
    raise exception 'a combo cannot include a variant of its own product (self-reference)'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger combo_items_enforce_unit on public.combo_items;
create trigger combo_items_enforce_unit
  before insert or update of combo_id, combo_product_variant_id, product_variant_id
  on public.combo_items
  for each row execute function app.enforce_combo_item_unit();

-- Source authority may be persisted by controlled ingestion, but neither
-- combo creation nor the ordinary Admin verification mutation may create it.
create or replace function public.admin_create_combo(
  p_product_id uuid,
  p_composition_verification_status text default 'pending_reconfirmation'
)
returns public.combos
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_product public.products;
  v_row public.combos;
begin
  select * into v_product from public.products where id = p_product_id;
  if v_product.id is null then
    raise exception 'product not found' using errcode = 'P0002';
  end if;

  perform app.assert_admin_for(v_product.business_unit_id);

  if p_composition_verification_status not in ('pending_reconfirmation', 'client_confirmed', 'unknown') then
    raise exception 'verification status is not manually assignable' using errcode = '22023';
  end if;

  if v_product.archived_at is not null then
    raise exception 'cannot create a combo for an archived product' using errcode = '22023';
  end if;

  insert into public.combos (product_id, composition_verification_status)
  values (p_product_id, p_composition_verification_status)
  returning * into v_row;

  perform app.write_audit_log(v_product.business_unit_id, 'create', 'combo', v_row.id, null, to_jsonb(v_row));
  return v_row;
end;
$$;

create or replace function public.admin_update_combo_verification(
  p_combo_id uuid,
  p_expected_updated_at timestamptz,
  p_composition_verification_status text
)
returns public.combos
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_business_unit_id uuid;
  v_before public.combos;
  v_after public.combos;
begin
  select * into v_before from public.combos where id = p_combo_id;
  if v_before.id is null then
    raise exception 'combo not found' using errcode = 'P0002';
  end if;

  v_business_unit_id := app.combo_unit(p_combo_id);
  perform app.assert_admin_for(v_business_unit_id);

  if p_composition_verification_status not in ('pending_reconfirmation', 'client_confirmed', 'unknown') then
    raise exception 'verification status is not manually assignable' using errcode = '22023';
  end if;

  update public.combos
  set composition_verification_status = p_composition_verification_status
  where id = p_combo_id and updated_at = p_expected_updated_at
  returning * into v_after;

  if v_after.id is null then
    raise exception 'combo was modified by another session' using errcode = 'P2011';
  end if;

  perform app.write_audit_log(
    v_business_unit_id, 'verification_update', 'combo', p_combo_id, to_jsonb(v_before), to_jsonb(v_after)
  );
  return v_after;
end;
$$;

create or replace function public.admin_set_combo_composition(
  p_combo_id uuid,
  p_expected_updated_at timestamptz,
  p_items jsonb
)
returns setof public.combo_items
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_combo_before public.combos;
  v_combo_after public.combos;
  v_business_unit_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_semantic_changed boolean;
  item jsonb;
  v_combo_variant_id uuid;
  v_variant_id uuid;
  v_variant_archived boolean;
  v_variant_product_id uuid;
  v_variant_product_archived boolean;
begin
  select * into v_combo_before from public.combos where id = p_combo_id;
  if v_combo_before.id is null then
    raise exception 'combo not found' using errcode = 'P0002';
  end if;

  v_business_unit_id := app.combo_unit(p_combo_id);
  perform app.assert_admin_for(v_business_unit_id);

  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'combo composition must be an array' using errcode = '22023';
  end if;

  -- Archived sellable presentations retain their exact semantic composition.
  -- Sort order may change, but additions/removals/replacements/quantity changes
  -- under that presentation are rejected.
  if exists (
    select 1
    from public.product_variants presentation
    where presentation.product_id = v_combo_before.product_id
      and presentation.archived_at is not null
      and (
        exists (
          (select ci.product_variant_id, ci.quantity
           from public.combo_items ci
           where ci.combo_id = p_combo_id and ci.combo_product_variant_id = presentation.id)
          except
          (select (elem->>'product_variant_id')::uuid, (elem->>'quantity')::integer
           from jsonb_array_elements(p_items) elem
           where (elem->>'combo_product_variant_id')::uuid = presentation.id)
        )
        or exists (
          (select (elem->>'product_variant_id')::uuid, (elem->>'quantity')::integer
           from jsonb_array_elements(p_items) elem
           where (elem->>'combo_product_variant_id')::uuid = presentation.id)
          except
          (select ci.product_variant_id, ci.quantity
           from public.combo_items ci
           where ci.combo_id = p_combo_id and ci.combo_product_variant_id = presentation.id)
        )
      )
  ) then
    raise exception 'cannot change composition under an archived combo product variant'
      using errcode = '22023';
  end if;

  for item in select * from jsonb_array_elements(p_items)
  loop
    v_combo_variant_id := (item->>'combo_product_variant_id')::uuid;
    v_variant_id := (item->>'product_variant_id')::uuid;

    -- Existing composite identities remain representable after an ingredient
    -- variant or product is archived. The same ingredient in a new combo
    -- presentation is a new line and must still be active.
    if exists (
      select 1 from public.combo_items ci
      where ci.combo_id = p_combo_id
        and ci.combo_product_variant_id = v_combo_variant_id
        and ci.product_variant_id = v_variant_id
    ) then
      continue;
    end if;

    select variant.archived_at is not null, product.id, product.archived_at is not null
      into v_variant_archived, v_variant_product_id, v_variant_product_archived
    from public.product_variants variant
    join public.products product on product.id = variant.product_id
    where variant.id = v_variant_id;

    if v_variant_product_id is null then
      raise exception 'variant not found' using errcode = 'P0002';
    end if;
    if v_variant_product_id = v_combo_before.product_id then
      raise exception 'a combo cannot include a variant of its own product (self-reference)'
        using errcode = 'check_violation';
    end if;
    if v_variant_archived then
      raise exception 'cannot add an archived variant to a combo' using errcode = '22023';
    end if;
    if v_variant_product_archived then
      raise exception 'cannot add a variant of an archived product to a combo' using errcode = '22023';
    end if;
  end loop;

  select exists (
    (select ci.combo_product_variant_id, ci.product_variant_id, ci.quantity
     from public.combo_items ci where ci.combo_id = p_combo_id)
    except
    (select (elem->>'combo_product_variant_id')::uuid,
            (elem->>'product_variant_id')::uuid,
            (elem->>'quantity')::integer
     from jsonb_array_elements(p_items) elem)
  ) or exists (
    (select (elem->>'combo_product_variant_id')::uuid,
            (elem->>'product_variant_id')::uuid,
            (elem->>'quantity')::integer
     from jsonb_array_elements(p_items) elem)
    except
    (select ci.combo_product_variant_id, ci.product_variant_id, ci.quantity
     from public.combo_items ci where ci.combo_id = p_combo_id)
  ) into v_semantic_changed;

  update public.combos
  set composition_verification_status = case
        when v_semantic_changed
          and composition_verification_status in ('official_pdf', 'client_confirmed')
        then 'pending_reconfirmation'
        else composition_verification_status
      end,
      updated_at = now()
  where id = p_combo_id and updated_at = p_expected_updated_at
  returning * into v_combo_after;

  if v_combo_after.id is null then
    raise exception 'combo was modified by another session' using errcode = 'P2011';
  end if;

  select coalesce(jsonb_agg(to_jsonb(ci) order by ci.combo_product_variant_id, ci.sort_order), '[]'::jsonb)
    into v_before
  from public.combo_items ci where ci.combo_id = p_combo_id;

  delete from public.combo_items where combo_id = p_combo_id;

  insert into public.combo_items (
    combo_id, combo_product_variant_id, product_variant_id, quantity, sort_order
  )
  select p_combo_id,
    (elem->>'combo_product_variant_id')::uuid,
    (elem->>'product_variant_id')::uuid,
    (elem->>'quantity')::integer,
    (elem->>'sort_order')::integer
  from jsonb_array_elements(p_items) elem;

  select coalesce(jsonb_agg(to_jsonb(ci) order by ci.combo_product_variant_id, ci.sort_order), '[]'::jsonb)
    into v_after
  from public.combo_items ci where ci.combo_id = p_combo_id;

  perform app.write_audit_log(v_business_unit_id, 'composition_update', 'combo', p_combo_id, v_before, v_after);

  if v_combo_after.composition_verification_status is distinct from v_combo_before.composition_verification_status then
    perform app.write_audit_log(
      v_business_unit_id, 'verification_update', 'combo', p_combo_id,
      to_jsonb(v_combo_before), to_jsonb(v_combo_after)
    );
  end if;

  return query
  select * from public.combo_items
  where combo_id = p_combo_id
  order by combo_product_variant_id, sort_order;
end;
$$;

revoke all on function public.admin_create_combo(uuid, text) from public;
grant execute on function public.admin_create_combo(uuid, text) to authenticated;
revoke all on function public.admin_update_combo_verification(uuid, timestamptz, text) from public;
grant execute on function public.admin_update_combo_verification(uuid, timestamptz, text) to authenticated;
revoke all on function public.admin_set_combo_composition(uuid, timestamptz, jsonb) from public;
grant execute on function public.admin_set_combo_composition(uuid, timestamptz, jsonb) to authenticated;
