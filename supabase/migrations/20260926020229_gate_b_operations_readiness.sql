-- One factual readiness calculation shared by dashboard, health and cutover checks.
create function app.unit_launch_readiness(p_unit uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
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
revoke all on function app.unit_launch_readiness(uuid) from public,anon,authenticated;
create function public.admin_operations_summary(p_unit_code text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_unit uuid; v_result jsonb;
begin
 select id into v_unit from public.business_units where code=p_unit_code;
 if v_unit is null or not app.can_read_unit(v_unit) then raise exception 'unit access denied' using errcode='42501'; end if;
 select jsonb_build_object(
  'pending_orders',(select count(*) from public.orders where business_unit_id=v_unit and archived_at is null and status='pending_whatsapp_confirmation'),
  'stale_orders',(select count(*) from public.orders where business_unit_id=v_unit and archived_at is null and status='pending_whatsapp_confirmation' and created_at<now()-interval '24 hours'),
  'exhausted_tracked_stock',(select count(*) from public.inventory i join public.product_variants v on v.id=i.product_variant_id join public.products p on p.id=v.product_id where p.business_unit_id=v_unit and i.inventory_mode='tracked_quantity' and i.quantity_on_hand-i.reserved_quantity=0),
  'active_reservations',(select count(*) from public.inventory_reservations where business_unit_id=v_unit and status='reserved'),
  'notification_exceptions',(select count(*) from public.notification_outbox where business_unit_id=v_unit and (status in ('blocked','failed','uncertain') or delivery_status='failed')),
  'notification_pending',(select count(*) from public.notification_outbox where business_unit_id=v_unit and status in ('queued','retry','claimed','sending')),
  'unresolved_complaints',(select count(*) from public.complaint_book_entries where business_unit_id=v_unit and status<>'resolved'),
  'approaching_complaints',(select count(*) from public.complaint_book_entries where business_unit_id=v_unit and status<>'resolved' and approaching_at<=now() and due_at>=now()),
  'overdue_complaints',(select count(*) from public.complaint_book_entries where business_unit_id=v_unit and status<>'resolved' and due_at<now()),
  'worker',(select jsonb_build_object('last_started_at',last_started_at,'last_finished_at',last_finished_at,'status',last_status) from public.automation_worker_health where worker='notifications'),
  'launch',app.unit_launch_readiness(v_unit)) into v_result;
 return v_result;
end $$;
revoke all on function public.admin_operations_summary(text) from public,anon;
grant execute on function public.admin_operations_summary(text) to authenticated;
create function public.worker_automation_health() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('schema_compatible',to_regclass('public.inventory_reservations') is not null
  and to_regprocedure('public.admin_bulk_publish_import(uuid,timestamp with time zone,jsonb)') is not null
  and to_regprocedure('public.worker_enqueue_complaint_milestones()') is not null,
  'worker',(select jsonb_build_object('last_started_at',last_started_at,'last_finished_at',last_finished_at,'status',last_status)
   from public.automation_worker_health where worker='notifications'));
$$;
revoke all on function public.worker_automation_health() from public,anon,authenticated;
grant execute on function public.worker_automation_health() to service_role;
-- Only an aggregate boolean is public, so metadata can fail closed without leaking business details.
create function public.public_launch_ready() returns boolean
language sql stable security definer set search_path='' as $$
 select count(*)=2 and coalesce(bool_and((app.unit_launch_readiness(id)->>'factual_ready')::boolean),false)
 from public.business_units where code in ('parfums','import');
$$;
revoke all on function public.public_launch_ready() from public;
grant execute on function public.public_launch_ready() to anon,authenticated,service_role;
create function public.admin_customer_order_summary(p_customer_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_unit uuid;
begin
 select business_unit_id into v_unit from public.customers where id=p_customer_id;
 if v_unit is null or not app.can_read_unit(v_unit) then raise exception 'customer access denied' using errcode='42501'; end if;
 return jsonb_build_object('pending',(select count(*) from public.orders where business_unit_id=v_unit and customer_id=p_customer_id and status='pending_whatsapp_confirmation'),
  'fulfilled_value_by_currency',(select coalesce(jsonb_agg(jsonb_build_object('currency',currency,'amount',amount::text)),'[]'::jsonb)
   from (select currency,sum(subtotal_amount) amount from public.orders where business_unit_id=v_unit and customer_id=p_customer_id and status='fulfilled' group by currency) values_by_currency));
end $$;
revoke all on function public.admin_customer_order_summary(uuid) from public,anon;
grant execute on function public.admin_customer_order_summary(uuid) to authenticated;

-- Prioritize actionable exceptions even when they are older than recent successful messages.
create or replace function public.admin_list_notifications(p_business_unit_code text,p_entity_id uuid default null)
returns table(id uuid,event_type text,entity_type text,entity_id uuid,status text,attempts integer,
 last_error_safe text,created_at timestamptz,updated_at timestamptz,sent_at timestamptz,delivery_status text)
language plpgsql security definer set search_path='' as $$
declare v_unit uuid;
begin
 select u.id into v_unit from public.business_units u where u.code=p_business_unit_code;
 if not app.can_read_unit(v_unit) then raise exception 'unit access denied' using errcode='42501'; end if;
 return query select n.id,n.event_type,n.entity_type,n.entity_id,n.status,n.attempts,n.last_error_safe,
 n.created_at,n.updated_at,n.sent_at,n.delivery_status from public.notification_outbox n
 where n.business_unit_id=v_unit and (p_entity_id is null or n.entity_id=p_entity_id)
 order by (n.status in ('blocked','failed','uncertain') or n.delivery_status='failed') desc,n.created_at desc,n.id limit 100;
end $$;
revoke all on function public.admin_list_notifications(text,uuid) from public,anon;
grant execute on function public.admin_list_notifications(text,uuid) to authenticated;
