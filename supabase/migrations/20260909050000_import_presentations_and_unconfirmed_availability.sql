-- Cruzial Platform V2 — 4J4A Import presentation + availability foundation
--
-- Import presentations are structural, price-free identities. Campaign price,
-- currency, availability and quantity_limit remain exclusively on
-- campaign_products. Parfums product_variants remain unchanged.

create table public.import_presentations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete restrict,
  stable_key text not null,
  label text not null,
  presentation_class text not null,
  capacity_ml numeric(8, 2),
  composition jsonb,
  source_metadata jsonb not null default '{}'::jsonb,
  publication_status text not null default 'draft',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint import_presentations_stable_key_not_blank check (btrim(stable_key) <> ''),
  constraint import_presentations_label_not_blank check (btrim(label) <> ''),
  constraint import_presentations_class_check check (
    presentation_class in ('single_fixed', 'multi_presentation', 'pack_set', 'ambiguous')
  ),
  constraint import_presentations_capacity_check check (capacity_ml is null or capacity_ml > 0),
  constraint import_presentations_composition_check check (
    composition is null or jsonb_typeof(composition) in ('object', 'array')
  ),
  constraint import_presentations_source_metadata_check check (jsonb_typeof(source_metadata) = 'object'),
  constraint import_presentations_publication_status_check check (
    publication_status in ('draft', 'published', 'archived')
  ),
  constraint import_presentations_product_stable_key_unique unique (product_id, stable_key)
);

create index import_presentations_product_id_idx on public.import_presentations (product_id);
create index import_presentations_public_idx on public.import_presentations (product_id, publication_status)
  where archived_at is null;

create trigger import_presentations_set_updated_at
  before update on public.import_presentations
  for each row execute function app.set_updated_at();

create or replace function app.enforce_import_presentation_product()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit_code text;
begin
  select unit.code into v_unit_code
  from public.products product
  join public.business_units unit on unit.id = product.business_unit_id
  where product.id = new.product_id;

  if v_unit_code is null then
    raise exception 'import presentation product not found' using errcode = 'check_violation';
  end if;
  if v_unit_code <> 'import' then
    raise exception 'import presentation must belong to a Cruzial Import product' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger import_presentations_enforce_product
  before insert or update of product_id on public.import_presentations
  for each row execute function app.enforce_import_presentation_product();

create or replace function app.import_presentation_unit(target_presentation uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select product.business_unit_id
  from public.import_presentations presentation
  join public.products product on product.id = presentation.product_id
  where presentation.id = target_presentation
$$;

create or replace function app.import_presentation_is_public(target_presentation uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.import_presentations presentation
    join public.products product on product.id = presentation.product_id
    join public.business_units unit on unit.id = product.business_unit_id
    where presentation.id = target_presentation
      and presentation.publication_status = 'published'
      and presentation.archived_at is null
      and unit.code = 'import'
      and app.product_is_public(product.id)
  )
$$;

revoke all on function app.enforce_import_presentation_product() from public;
revoke all on function app.import_presentation_unit(uuid) from public;
revoke all on function app.import_presentation_is_public(uuid) from public;
grant execute on function app.import_presentation_unit(uuid) to authenticated;
grant execute on function app.import_presentation_is_public(uuid) to anon, authenticated;

alter table public.import_presentations enable row level security;
revoke all on public.import_presentations from anon, authenticated;
grant select on public.import_presentations to anon, authenticated;

create policy import_presentations_public_read on public.import_presentations
  for select to anon, authenticated
  using (app.import_presentation_is_public(id));

create policy import_presentations_admin_read on public.import_presentations
  for select to authenticated
  using (app.can_read_unit(app.import_presentation_unit(id)));

-- No authenticated mutation grant or mutation policy is created. 4J4A has no
-- presentation CRUD; later writes must use an audited Import-only RPC.

alter table public.campaign_products
  add column import_presentation_id uuid references public.import_presentations (id) on delete restrict;

alter table public.campaign_products
  add constraint campaign_products_single_structure_check check (
    not (product_variant_id is not null and import_presentation_id is not null)
  );

drop index public.campaign_products_campaign_variant_unique;
create unique index campaign_products_campaign_structure_unique
  on public.campaign_products (campaign_id, product_id, product_variant_id, import_presentation_id)
  nulls not distinct;

alter table public.campaign_products alter column availability_status set default 'unconfirmed';
alter table public.campaign_products drop constraint campaign_products_availability_check;
alter table public.campaign_products add constraint campaign_products_availability_check check (
  availability_status in ('unconfirmed', 'available', 'out_of_stock')
);

create or replace function app.enforce_campaign_product_unit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  campaign_business_unit uuid;
  product_business_unit uuid;
  presentation_product_id uuid;
  presentation_business_unit uuid;
  import_business_unit uuid;
begin
  select business_unit_id into campaign_business_unit
  from public.campaigns where id = new.campaign_id;
  select business_unit_id into product_business_unit
  from public.products where id = new.product_id;

  if campaign_business_unit is null
     or product_business_unit is null
     or campaign_business_unit is distinct from product_business_unit then
    raise exception 'campaign product must belong to the campaign business unit'
      using errcode = 'check_violation';
  end if;

  if new.product_variant_id is not null and new.import_presentation_id is not null then
    raise exception 'campaign offer cannot reference both a product variant and an import presentation'
      using errcode = 'check_violation';
  end if;

  if new.product_variant_id is not null and not exists (
    select 1 from public.product_variants variant
    where variant.id = new.product_variant_id
      and variant.product_id = new.product_id
  ) then
    raise exception 'campaign variant must belong to its product'
      using errcode = 'check_violation';
  end if;

  if new.import_presentation_id is not null then
    select presentation.product_id, product.business_unit_id
      into presentation_product_id, presentation_business_unit
    from public.import_presentations presentation
    join public.products product on product.id = presentation.product_id
    where presentation.id = new.import_presentation_id;

    select id into import_business_unit from public.business_units where code = 'import';
    if presentation_product_id is null
       or presentation_product_id is distinct from new.product_id
       or presentation_business_unit is distinct from import_business_unit
       or campaign_business_unit is distinct from import_business_unit then
      raise exception 'campaign import presentation must belong to its Import product and campaign'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger campaign_products_enforce_unit on public.campaign_products;
create trigger campaign_products_enforce_unit
  before insert or update of campaign_id, product_id, product_variant_id, import_presentation_id
  on public.campaign_products
  for each row execute function app.enforce_campaign_product_unit();

drop policy campaign_products_public_read on public.campaign_products;
create policy campaign_products_public_read on public.campaign_products
  for select to anon, authenticated
  using (
    availability_status in ('available', 'out_of_stock')
    and app.campaign_is_public(campaign_id)
    and app.product_is_public(product_id)
    and (product_variant_id is null or app.variant_is_public(product_variant_id))
    and (import_presentation_id is null or app.import_presentation_is_public(import_presentation_id))
  );

create or replace function public.admin_set_campaign_products(
  p_campaign_id uuid,
  p_expected_updated_at timestamptz,
  p_items jsonb
)
returns setof public.campaign_products
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import_unit_id uuid;
  v_campaign public.campaigns;
  v_before jsonb;
  v_after jsonb;
  v_existing_limits jsonb;
  item jsonb;
  v_product_id uuid;
  v_variant_id uuid;
  v_presentation_id uuid;
  v_product_archived boolean;
  v_product_unit_id uuid;
  v_variant_product_id uuid;
  v_variant_archived boolean;
  v_presentation_product_id uuid;
  v_presentation_archived boolean;
  v_availability text;
  v_price_text text;
begin
  select id into v_import_unit_id from public.business_units where code = 'import';
  if v_import_unit_id is null then
    raise exception 'import business unit is not provisioned' using errcode = 'P0002';
  end if;

  select * into v_campaign from public.campaigns where id = p_campaign_id;
  if v_campaign.id is null or v_campaign.business_unit_id <> v_import_unit_id then
    raise exception 'campaign not found' using errcode = 'P0002';
  end if;
  perform app.assert_admin_for(v_import_unit_id);
  if v_campaign.archived_at is not null then
    raise exception 'archived campaigns cannot have their products edited' using errcode = 'P2007';
  end if;

  for item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (item->>'product_id')::uuid;
    select product.archived_at is not null, product.business_unit_id
      into v_product_archived, v_product_unit_id
    from public.products product where product.id = v_product_id;
    if v_product_unit_id is null then raise exception 'product not found' using errcode = 'P0002'; end if;
    if v_product_unit_id <> v_import_unit_id then raise exception 'product does not belong to Cruzial Import' using errcode = 'P2004'; end if;
    if v_product_archived then raise exception 'cannot add an archived product to a campaign' using errcode = '22023'; end if;

    v_variant_id := nullif(item->>'product_variant_id', '')::uuid;
    v_presentation_id := nullif(item->>'import_presentation_id', '')::uuid;
    if v_variant_id is not null and v_presentation_id is not null then
      raise exception 'an offer cannot reference both variant and import presentation' using errcode = 'P2004';
    end if;

    if v_variant_id is not null then
      select variant.product_id, variant.archived_at is not null
        into v_variant_product_id, v_variant_archived
      from public.product_variants variant where variant.id = v_variant_id;
      if v_variant_product_id is null then raise exception 'variant not found' using errcode = 'P0002'; end if;
      if v_variant_product_id <> v_product_id then raise exception 'variant does not belong to the given product' using errcode = 'P2004'; end if;
      if v_variant_archived then raise exception 'cannot add an archived variant to a campaign' using errcode = '22023'; end if;
    end if;

    if v_presentation_id is not null then
      select presentation.product_id, presentation.archived_at is not null
        into v_presentation_product_id, v_presentation_archived
      from public.import_presentations presentation where presentation.id = v_presentation_id;
      if v_presentation_product_id is null then raise exception 'import presentation not found' using errcode = 'P0002'; end if;
      if v_presentation_product_id <> v_product_id then raise exception 'import presentation does not belong to the given product' using errcode = 'P2004'; end if;
      if v_presentation_archived then raise exception 'cannot add an archived import presentation to a campaign' using errcode = '22023'; end if;
    end if;

    v_price_text := item->>'price_amount';
    if v_price_text is null or v_price_text !~ '^[0-9]{1,10}(\.[0-9]{1,2})?$' then
      raise exception 'price_amount must be a plain decimal string with at most 2 decimals' using errcode = 'P2009';
    end if;
    v_availability := item->>'availability_status';
    if v_availability is null or v_availability not in ('unconfirmed', 'available', 'out_of_stock') then
      raise exception 'availability_status must be unconfirmed, available or out_of_stock' using errcode = 'P2008';
    end if;
  end loop;

  update public.campaigns set updated_at = now()
  where id = p_campaign_id and updated_at = p_expected_updated_at
  returning * into v_campaign;
  if v_campaign.id is null then raise exception 'campaign was modified by another session' using errcode = '40001'; end if;

  select coalesce(jsonb_agg(to_jsonb(offer)), '[]'::jsonb) into v_before
  from public.campaign_products offer where offer.campaign_id = p_campaign_id;

  select coalesce(jsonb_object_agg(
    coalesce(product_id::text, '') || '::' || coalesce(product_variant_id::text, '') || '::' || coalesce(import_presentation_id::text, ''),
    quantity_limit
  ), '{}'::jsonb)
  into v_existing_limits
  from public.campaign_products where campaign_id = p_campaign_id;

  delete from public.campaign_products where campaign_id = p_campaign_id;
  insert into public.campaign_products (
    campaign_id, product_id, product_variant_id, import_presentation_id,
    price_amount, currency, availability_status, quantity_limit, sort_order
  )
  select
    p_campaign_id,
    (element->>'product_id')::uuid,
    nullif(element->>'product_variant_id', '')::uuid,
    nullif(element->>'import_presentation_id', '')::uuid,
    (element->>'price_amount')::numeric,
    'PEN',
    element->>'availability_status',
    (v_existing_limits ->> (
      coalesce(element->>'product_id', '') || '::' || coalesce(element->>'product_variant_id', '') || '::' || coalesce(element->>'import_presentation_id', '')
    ))::integer,
    (element->>'sort_order')::integer
  from jsonb_array_elements(p_items) element;

  select coalesce(jsonb_agg(to_jsonb(offer)), '[]'::jsonb) into v_after
  from public.campaign_products offer where offer.campaign_id = p_campaign_id;
  perform app.write_audit_log(v_import_unit_id, 'composition_update', 'campaign', p_campaign_id, v_before, v_after);
  return query select * from public.campaign_products where campaign_id = p_campaign_id order by sort_order;
end;
$$;

comment on function public.admin_set_campaign_products(uuid, timestamptz, jsonb) is
  '4J4A audited full-replace for Import campaign offers. Supports price-free structural import_presentations; rejects simultaneous variant/presentation references; preserves quantity_limit by the complete structural identity; validates exact decimal text and fail-closed availability including unconfirmed.';

create or replace function public.admin_duplicate_campaign(
  p_source_campaign_id uuid,
  p_new_number integer,
  p_new_name text
)
returns public.campaigns
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import_unit_id uuid;
  v_source public.campaigns;
  v_new public.campaigns;
  v_new_name text;
  v_copied_count integer;
begin
  select id into v_import_unit_id from public.business_units where code = 'import';
  if v_import_unit_id is null then raise exception 'import business unit is not provisioned' using errcode = 'P0002'; end if;
  select * into v_source from public.campaigns where id = p_source_campaign_id;
  if v_source.id is null or v_source.business_unit_id <> v_import_unit_id then raise exception 'source campaign not found' using errcode = 'P0002'; end if;
  perform app.assert_admin_for(v_import_unit_id);
  if p_new_number is null or p_new_number <= 0 then raise exception 'new_number must be greater than 0' using errcode = 'P2010'; end if;
  v_new_name := btrim(coalesce(p_new_name, ''));
  if v_new_name = '' then raise exception 'new_name must not be blank' using errcode = 'P2010'; end if;

  insert into public.campaigns (business_unit_id, number, name, status, opens_at, closes_at, public_message)
  values (v_import_unit_id, p_new_number, v_new_name, 'draft', null, null, null)
  returning * into v_new;

  insert into public.campaign_products (
    campaign_id, product_id, product_variant_id, import_presentation_id,
    price_amount, currency, availability_status, quantity_limit, sort_order
  )
  select v_new.id, offer.product_id, offer.product_variant_id, offer.import_presentation_id,
    offer.price_amount, offer.currency, offer.availability_status, offer.quantity_limit, offer.sort_order
  from public.campaign_products offer where offer.campaign_id = p_source_campaign_id;
  get diagnostics v_copied_count = row_count;
  perform app.write_audit_log(v_import_unit_id, 'create', 'campaign', v_new.id,
    jsonb_build_object('source_campaign_id', v_source.id, 'source_number', v_source.number),
    jsonb_build_object('destination_campaign_id', v_new.id, 'destination_number', v_new.number, 'copied_offer_count', v_copied_count));
  return v_new;
end;
$$;

drop function public.admin_get_import_campaign_products(uuid);
create function public.admin_get_import_campaign_products(p_campaign_id uuid)
returns table (
  id uuid,
  product_id uuid,
  product_variant_id uuid,
  import_presentation_id uuid,
  price_amount text,
  currency text,
  availability_status text,
  sort_order integer,
  product_name text,
  product_slug text,
  product_brand text,
  product_archived_at timestamptz,
  product_publication_status text,
  variant_label text,
  variant_archived_at timestamptz,
  variant_publication_status text,
  presentation_label text,
  presentation_class text,
  presentation_capacity_ml numeric,
  presentation_archived_at timestamptz,
  presentation_publication_status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    offer.id, offer.product_id, offer.product_variant_id, offer.import_presentation_id,
    offer.price_amount::text, offer.currency, offer.availability_status, offer.sort_order,
    product.name, product.slug, product.brand, product.archived_at, product.publication_status,
    variant.label, variant.archived_at, variant.publication_status,
    presentation.label, presentation.presentation_class, presentation.capacity_ml,
    presentation.archived_at, presentation.publication_status
  from public.campaign_products offer
  join public.campaigns campaign on campaign.id = offer.campaign_id
  join public.business_units unit on unit.id = campaign.business_unit_id
  join public.products product on product.id = offer.product_id
  left join public.product_variants variant on variant.id = offer.product_variant_id
  left join public.import_presentations presentation on presentation.id = offer.import_presentation_id
  where offer.campaign_id = p_campaign_id
    and unit.code = 'import'
    and app.can_read_unit(campaign.business_unit_id)
  order by offer.sort_order, offer.id
$$;

revoke all on function public.admin_get_import_campaign_products(uuid) from public;
revoke all on function public.admin_get_import_campaign_products(uuid) from anon;
grant execute on function public.admin_get_import_campaign_products(uuid) to authenticated;

comment on function public.admin_get_import_campaign_products(uuid) is
  'Bounded Import admin/viewer read with exact decimal-text campaign price and structural presentation readiness fields; source metadata is intentionally excluded.';
