-- Rollback for 20261001010000_owner_selected_provisional_price.sql + the owner launch
-- merchandising data (parfums-owner-launch-merchandising.sql). NEVER edit the applied
-- migration; apply this as a NEW forward migration if a rollback is ever required.
--
-- 1. launch-price variants go back to provisional_market and to draft (hidden again);
-- 2. the four products published without an optional photo go back to draft;
-- 3. both functions are restored to their previous bodies;
-- 4. the check constraint is restored WITHOUT owner_selected_provisional (any remaining
--    row with that value is moved first, so the constraint can be re-added).
-- Cloudinary assets and audit_log rows are intentionally kept (history).

begin;
update public.product_variants set price_verification_status = 'provisional_market', publication_status = 'draft'
where price_verification_status = 'owner_selected_provisional';
update public.products set publication_status = 'draft'
where slug in ('lovely-cherry', 'royal-blend-sequoia', 'sceptre-malachite', 'liquid-brun')
  and business_unit_id = '11111111-1111-4111-8111-111111111111';
update public.product_variants v set publication_status = 'draft'
from public.products p
where v.product_id = p.id and p.slug = 'sceptre-malachite' and v.variant_kind = 'decant'
  and p.business_unit_id = '11111111-1111-4111-8111-111111111111';

alter table public.product_variants drop constraint product_variants_price_verification_check;
alter table public.product_variants add constraint product_variants_price_verification_check check (
  price_verification_status in ('legacy', 'client_confirmed', 'official_pdf', 'provisional_market', 'unknown')
);

CREATE OR REPLACE FUNCTION public.create_parfums_order_request_v2(p_request_id uuid, p_customer_snapshot jsonb, p_delivery_snapshot jsonb, p_shipping_method_code text, p_lines jsonb)
 RETURNS TABLE(order_id uuid, order_number text, created boolean)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  parfums_unit_id constant uuid := '11111111-1111-4111-8111-111111111111';
  existing_order public.orders%rowtype;
  new_order_id uuid;
  new_order_number text;
  shipping_id uuid;
  line jsonb;
  line_quantity integer;
  canonical_price numeric(12, 2);
  line_index integer := 0;
  computed_subtotal numeric(12, 2);
  v_variant record;
begin
  if p_request_id is null then
    raise exception 'request_id is required' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(parfums_unit_id::text || ':' || p_request_id::text, 0)
  );

  select * into existing_order
  from public.orders
  where business_unit_id = parfums_unit_id and request_id = p_request_id;

  if found then
    return query select existing_order.id, existing_order.order_number, false;
    return;
  end if;

  if jsonb_typeof(p_customer_snapshot) <> 'object'
     or p_customer_snapshot ?& array['name', 'phone'] is false
     or exists (
       select 1 from jsonb_object_keys(p_customer_snapshot) key
       where key not in ('name', 'phone')
     ) then
    raise exception 'invalid customer snapshot' using errcode = '22023';
  end if;

  if jsonb_typeof(p_delivery_snapshot) <> 'object'
     or p_delivery_snapshot ?& array['district', 'delivery', 'note'] is false
     or exists (
       select 1 from jsonb_object_keys(p_delivery_snapshot) key
       where key not in ('district', 'delivery', 'note')
     ) then
    raise exception 'invalid delivery snapshot' using errcode = '22023';
  end if;

  if jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) < 1
     or jsonb_array_length(p_lines) > 40 then
    raise exception 'lines must contain between 1 and 40 items' using errcode = '22023';
  end if;

  if p_shipping_method_code is not null then
    select id into shipping_id
    from public.shipping_methods
    where business_unit_id = parfums_unit_id
      and code = p_shipping_method_code
      and is_active;
    if not found then
      raise exception 'shipping method is not available' using errcode = '22023';
    end if;
  end if;

  -- Pre-flight: every line must carry both product_id and product_variant_id.
  -- Mixed legacy/supabase authority within a single request is rejected.
  for line in select value from jsonb_array_elements(p_lines)
  loop
    if coalesce(line ->> 'product_id', '') = ''
       or coalesce(line ->> 'product_variant_id', '') = '' then
      raise exception 'v2 requires product_id and product_variant_id on every line'
        using errcode = '22023';
    end if;
  end loop;

  -- Gate B lock order: take every inventory row this order can touch up
  -- front, in the same global order app.apply_order_inventory_transition uses
  -- (inventory.id), so two concurrent orders sharing variants can never lock
  -- them in opposite (client-supplied line) order and deadlock. The per-line
  -- reservation trigger then re-acquires locks this transaction already holds.
  perform 1 from public.inventory i
   where i.product_variant_id in (
     select (l.value ->> 'product_variant_id')::uuid
       from jsonb_array_elements(p_lines) l
      where l.value ->> 'product_variant_id'
            ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
   order by i.id
   for update of i;

  new_order_number := 'CRP-' || pg_catalog.to_char(current_date, 'YYYYMMDD') || '-'
    || upper(substr(replace(p_request_id::text, '-', ''), 1, 12));

  insert into public.orders (
    request_id,
    order_number,
    business_unit_id,
    shipping_method_id,
    channel,
    status,
    customer_id,
    customer_snapshot,
    delivery_snapshot,
    subtotal_amount,
    currency
  ) values (
    p_request_id,
    new_order_number,
    parfums_unit_id,
    shipping_id,
    'whatsapp',
    'draft',
    null,
    p_customer_snapshot,
    p_delivery_snapshot,
    0,
    'PEN'
  ) returning id into new_order_id;

  for line in select value from jsonb_array_elements(p_lines)
  loop
    if jsonb_typeof(line) <> 'object'
       or line ?& array[
         'product_id', 'product_variant_id', 'product_name',
         'variant_label', 'quantity',
         'variant_snapshot'
       ] is false
       or exists (
         select 1 from jsonb_object_keys(line) key
         where key not in (
           'product_id', 'product_variant_id', 'product_name',
           'variant_label', 'quantity',
           'variant_snapshot', 'legacy_product_id', 'legacy_variant_id', 'source'
         )
       ) then
      raise exception 'invalid order line snapshot' using errcode = '22023';
    end if;

    if coalesce(line ->> 'product_name', '') = ''
       or coalesce(line ->> 'variant_label', '') = ''
       or jsonb_typeof(line -> 'variant_snapshot') <> 'object'
       or exists (
         select 1 from jsonb_object_keys(line -> 'variant_snapshot') key
         where key not in ('group', 'size_ml', 'brand', 'combo_contents')
       )
       or line -> 'variant_snapshot' ->> 'group' not in ('decant', 'bottle')
       or jsonb_typeof(line -> 'variant_snapshot' -> 'size_ml') <> 'number'
       or coalesce(line -> 'variant_snapshot' ->> 'brand', '') = ''
       or (
         line -> 'variant_snapshot' ? 'combo_contents'
         and jsonb_typeof(line -> 'variant_snapshot' -> 'combo_contents') <> 'array'
       )
       or (line ->> 'quantity') !~ '^[1-9][0-9]?$' then
      raise exception 'invalid order line values' using errcode = '22023';
    end if;

    line_quantity := (line ->> 'quantity')::integer;

    -- Single atomic lookup: resolve product + variant, enforce ownership,
    -- enforce storefront eligibility (published, available, archived_at null),
    -- enforce price authority (client_confirmed or official_pdf),
    -- obtain canonical price from database truth. Never trust client price.
    -- Discontinued products remain eligible (no business rule blocks them).
    select
      v.id,
      v.price_amount,
      v.currency
    into v_variant
    from public.product_variants v
    join public.products p on p.id = v.product_id
    where v.id = (line ->> 'product_variant_id')::uuid
      and p.id = (line ->> 'product_id')::uuid
      and p.business_unit_id = parfums_unit_id
      and p.archived_at is null
      and v.archived_at is null
      and p.publication_status = 'published'
      and p.availability_status = 'available'
      and v.publication_status = 'published'
      and v.price_verification_status in ('client_confirmed', 'official_pdf');

    if v_variant.id is null then
      raise exception 'product/variant pair not found or not orderable'
        using errcode = '22023';
    end if;

    canonical_price := v_variant.price_amount;
    if v_variant.currency <> 'PEN' then
      raise exception 'variant currency is not PEN' using errcode = '22023';
    end if;

    insert into public.order_lines (
      order_id,
      product_id,
      product_variant_id,
      product_name_snapshot,
      variant_label_snapshot,
      variant_snapshot,
      unit_price_amount,
      currency,
      quantity,
      line_total_amount,
      sort_order
    ) values (
      new_order_id,
      (line ->> 'product_id')::uuid,
      (line ->> 'product_variant_id')::uuid,
      line ->> 'product_name',
      line ->> 'variant_label',
      jsonb_build_object(
        'group', line -> 'variant_snapshot' ->> 'group',
        'size_ml', line -> 'variant_snapshot' ->> 'size_ml',
        'brand', line -> 'variant_snapshot' ->> 'brand'
      )
      || case when line ->> 'legacy_product_id' is not null
           then jsonb_build_object('legacy_product_id', line ->> 'legacy_product_id')
           else '{}'::jsonb end
      || case when line ->> 'legacy_variant_id' is not null
           then jsonb_build_object('legacy_variant_id', line ->> 'legacy_variant_id')
           else '{}'::jsonb end
      || case when line ->> 'source' is not null
           then jsonb_build_object('source', line ->> 'source')
           else '{}'::jsonb end
      || case
        when line -> 'variant_snapshot' ? 'combo_contents'
          then jsonb_build_object('combo_contents', line -> 'variant_snapshot' -> 'combo_contents')
        else '{}'::jsonb
      end,
      canonical_price,
      'PEN',
      line_quantity,
      canonical_price * line_quantity,
      line_index
    );
    line_index := line_index + 1;
  end loop;

  select sum(ol.line_total_amount) into computed_subtotal
  from public.order_lines ol
  where ol.order_id = new_order_id;

  update public.orders
  set subtotal_amount = computed_subtotal,
      status = 'pending_whatsapp_confirmation'
  where id = new_order_id;

  return query select new_order_id, new_order_number, true;
end;
$function$;

create or replace function app.unit_launch_readiness(p_unit uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_code text; v_legal jsonb; v_contact jsonb; v_missing text[]:='{}'; v_field text;
 v_media integer; v_commercial integer:=0; v_unpublished integer; v_campaign public.campaigns; v_import jsonb;
begin
 select code into v_code from public.business_units where id=p_unit;
 select value into v_legal from public.settings where business_unit_id=p_unit and key='business_legal';
 select value into v_contact from public.settings where business_unit_id=p_unit and key='public_contact';
 foreach v_field in array array['legalName','ruc','address','claimsEmail','claimsPhone','exchangePolicy','paymentMethodsNote'] loop
  if btrim(coalesce(v_legal->>v_field,''))='' then v_missing:=array_append(v_missing,'legal.'||v_field); end if;
 end loop;
 foreach v_field in array array['whatsappNumber','whatsappDisplay','contactEmail'] loop
  if btrim(coalesce(v_contact->>v_field,''))='' then v_missing:=array_append(v_missing,'contact.'||v_field); end if;
 end loop;
 select count(*) into v_media from public.products p where p.business_unit_id=p_unit and p.archived_at is null
  and not exists(select 1 from public.product_media m where m.product_id=p.id and m.is_primary and m.archived_at is null);
 select count(*) into v_unpublished from public.products where business_unit_id=p_unit and archived_at is null and publication_status<>'published';
 if not exists(select 1 from public.products where business_unit_id=p_unit and archived_at is null and publication_status='published')
  then v_missing:=array_append(v_missing,'catalog.no_published_products'); end if;
 if v_code='import' then
  select * into v_campaign from public.campaigns where business_unit_id=p_unit and archived_at is null order by number desc limit 1;
  if v_campaign.id is null then v_missing:=array_append(v_missing,'campaign.missing');
  else
   -- Internal calculation is independent of the caller; admin wrapper performs authorization.
   select count(*) into v_commercial from public.campaign_products cp where cp.campaign_id=v_campaign.id
    and (cp.availability_status='unconfirmed' or cp.price_amount<=0);
   v_commercial:=v_commercial+(select count(*) from public.import_presentations ip join public.products p on p.id=ip.product_id
    where p.business_unit_id=p_unit and p.archived_at is null and ip.archived_at is null and
    (ip.publication_status<>'published' or ip.presentation_class='ambiguous' or not exists(
     select 1 from public.campaign_products cp where cp.campaign_id=v_campaign.id and cp.import_presentation_id=ip.id)));
   v_commercial:=v_commercial+(select count(*) from public.products p where p.business_unit_id=p_unit and p.archived_at is null and not exists(select 1 from public.import_presentations ip where ip.product_id=p.id and ip.archived_at is null));
   if v_campaign.status<>'open' or (v_campaign.opens_at is not null and v_campaign.opens_at>now())
    or (v_campaign.closes_at is not null and v_campaign.closes_at<=now()) then v_missing:=array_append(v_missing,'campaign.not_open_now'); end if;
  end if;
 else
  select count(*) into v_commercial from public.product_variants v join public.products p on p.id=v.product_id
   where p.business_unit_id=p_unit and p.archived_at is null and v.archived_at is null
   and (v.publication_status<>'published' or v.price_amount<=0 or v.price_verification_status not in ('official_pdf','client_confirmed'));
  v_commercial:=v_commercial+(select count(*) from public.products p where p.business_unit_id=p_unit and p.archived_at is null and not exists(select 1 from public.product_variants v where v.product_id=p.id and v.archived_at is null));
  v_commercial:=v_commercial+(select count(*) from public.combos c join public.products p on p.id=c.product_id where p.business_unit_id=p_unit and p.archived_at is null and c.composition_verification_status not in ('official_pdf','client_confirmed'));
 end if;
 if v_media>0 then v_missing:=array_append(v_missing,'catalog.missing_primary_media'); end if;
 if v_commercial>0 then v_missing:=array_append(v_missing,'catalog.commercial_blockers'); end if;
 if v_unpublished>0 then v_missing:=array_append(v_missing,'catalog.unpublished_products'); end if;
 return jsonb_build_object('factual_ready',cardinality(v_missing)=0,'blockers',to_jsonb(v_missing),
  'missing_primary_media',v_media,'commercial_blockers',v_commercial,'unpublished_products',v_unpublished,
  'campaign_id',v_campaign.id,'campaign_number',v_campaign.number,'campaign_status',v_campaign.status);
end $$;


commit;
