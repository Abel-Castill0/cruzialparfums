-- CRUZIAL final cutover rollback (70 -> behavior of 70). Generated 2026-09-27T20:47:47Z from a local DB
-- at exactly the 70 hosted migrations, whose touched objects were md5-verified identical to Production
-- (create_parfums_order_request_v2 differs from Production only by 5 in-body comment lines).
-- Restores the prior bodies of every function the 8 migrations replaced and removes the new public
-- function. Additive, data-neutral objects (3 FK indexes, notification_outbox.dispatch_authorized_at,
-- the widened last_error_safe CHECK) are intentionally KEPT: dropping them could discard data and the
-- old app ignores them. Does NOT touch schema_migrations; record any rollback as a new forward migration.
begin;
drop function if exists public.variant_effective_availability(public.product_variants);
CREATE OR REPLACE FUNCTION app.reserve_tracked_order_line()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order public.orders;
  v_inventory public.inventory;
  v_variant_unit uuid;
begin
  if new.product_variant_id is null then return new; end if;
  select * into v_order from public.orders where id = new.order_id;
  select p.business_unit_id into v_variant_unit
  from public.product_variants v join public.products p on p.id = v.product_id
  where v.id = new.product_variant_id and p.id = new.product_id;
  if v_variant_unit is null or v_variant_unit <> v_order.business_unit_id then
    raise exception 'order line belongs to a different business unit or product' using errcode = 'P2004';
  end if;
  if v_order.status not in ('draft', 'pending_whatsapp_confirmation') then
    raise exception 'cannot add a line to an accepted order' using errcode = 'P2023';
  end if;
  select * into v_inventory from public.inventory
  where product_variant_id = new.product_variant_id for update;
  if v_inventory.id is null or v_inventory.inventory_mode = 'status_only' then return new; end if;
  if v_inventory.availability_status <> 'available'
     or v_inventory.quantity_on_hand - v_inventory.reserved_quantity < new.quantity then
    raise exception 'tracked quantity is unavailable' using errcode = 'P2034';
  end if;
  update public.inventory set reserved_quantity = reserved_quantity + new.quantity
  where id = v_inventory.id;
  insert into public.inventory_reservations
    (business_unit_id, order_id, order_line_id, inventory_id, quantity)
  values (v_order.business_unit_id, new.order_id, new.id, v_inventory.id, new.quantity);
  insert into public.audit_log
    (business_unit_id, actor_user_id, action, entity_type, entity_id, before, after)
  values (v_order.business_unit_id, auth.uid(), 'inventory_change', 'inventory_reservation', v_inventory.id,
    jsonb_build_object('reserved_quantity', v_inventory.reserved_quantity),
    jsonb_build_object('reserved_quantity', v_inventory.reserved_quantity + new.quantity, 'order_id', new.order_id));
  return new;
end $function$
;
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
$function$
;
CREATE OR REPLACE FUNCTION public.worker_begin_notification(p_id uuid, p_lease_token uuid)
 RETURNS notification_outbox
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_row public.notification_outbox;
begin
 update public.notification_outbox set status='sending',attempts=attempts+1
 where id=p_id and lease_token=p_lease_token and status='claimed'
   and lease_expires_at > now() and attempts < 5 returning * into v_row;
 if v_row.id is null then raise exception 'notification lease is invalid' using errcode='P2036'; end if;
 return v_row;
end $function$
;
CREATE OR REPLACE FUNCTION public.worker_claim_notifications(p_batch integer DEFAULT 5)
 RETURNS SETOF notification_outbox
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  update public.notification_outbox set status='uncertain',last_error_safe='delivery_uncertain',
    lease_token=null,lease_expires_at=null
  where status='sending' and lease_expires_at < now();
  update public.notification_outbox set status='retry',last_error_safe='worker_lease_expired',
    lease_token=null,lease_expires_at=null,next_attempt_at=now()
  where status='claimed' and lease_expires_at < now();
  return query with candidates as (
    select id from public.notification_outbox
    where status in ('queued','retry') and attempts < 5 and next_attempt_at <= now()
    order by next_attempt_at,created_at,id for update skip locked
    limit greatest(1,least(coalesce(p_batch,5),10))
  ) update public.notification_outbox n
    set status='claimed',lease_token=gen_random_uuid(),lease_expires_at=now()+interval '2 minutes'
    from candidates c where n.id=c.id returning n.*;
end $function$
;
CREATE OR REPLACE FUNCTION public.worker_enqueue_complaint_milestones()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_entry record;
begin
 for v_entry in
  select c.id,c.business_unit_id,c.due_at,s.value->>'operationsPhone' as operations_phone
  from public.complaint_book_entries c left join public.settings s
   on s.business_unit_id=c.business_unit_id and s.key='operations_automation'
  where c.status<>'resolved' and c.approaching_at<=now() and not exists (
   select 1 from public.notification_outbox n where n.business_unit_id=c.business_unit_id
    and n.entity_type='complaint' and n.entity_id=c.id
    and n.event_type=case when c.due_at<now() then 'complaint_overdue' else 'complaint_approaching' end
  )
  order by c.due_at,c.id limit 200
 loop
  perform app.enqueue_notification(v_entry.business_unit_id,
   case when v_entry.due_at<now() then 'complaint_overdue' else 'complaint_approaching' end,
   'complaint',v_entry.id,v_entry.operations_phone,v_entry.id::text);
 end loop;
end $function$
;
commit;
