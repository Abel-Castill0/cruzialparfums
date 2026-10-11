-- Rollback for 20261010120000_launch_readiness_status_archived.sql. NEVER edit the applied
-- migration; apply this as a NEW forward migration if a rollback is ever required.
-- Restores the previous body (from 20261001010000) verbatim. No data is touched.

begin;
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
   and (v.publication_status<>'published' or v.price_amount<=0 or v.price_verification_status not in ('official_pdf','client_confirmed','owner_selected_provisional'));
  v_commercial:=v_commercial+(select count(*) from public.products p where p.business_unit_id=p_unit and p.archived_at is null and not exists(select 1 from public.product_variants v where v.product_id=p.id and v.archived_at is null));
  v_commercial:=v_commercial+(select count(*) from public.combos c join public.products p on p.id=c.product_id where p.business_unit_id=p_unit and p.archived_at is null and c.composition_verification_status not in ('official_pdf','client_confirmed'));
 end if;
 -- Owner delegation (2026-10-01): a missing optional Parfums photo renders the site's honest
 -- "Foto próximamente" fallback and must not block launch. Import keeps it as a blocker
 -- (campaign offers need real photos). The count stays reported in 'missing_primary_media'.
 if v_media>0 and v_code='import' then v_missing:=array_append(v_missing,'catalog.missing_primary_media'); end if;
 if v_commercial>0 then v_missing:=array_append(v_missing,'catalog.commercial_blockers'); end if;
 if v_unpublished>0 then v_missing:=array_append(v_missing,'catalog.unpublished_products'); end if;
 return jsonb_build_object('factual_ready',cardinality(v_missing)=0,'blockers',to_jsonb(v_missing),
  'missing_primary_media',v_media,'commercial_blockers',v_commercial,'unpublished_products',v_unpublished,
  'campaign_id',v_campaign.id,'campaign_number',v_campaign.number,'campaign_status',v_campaign.status);
end $$;
commit;
