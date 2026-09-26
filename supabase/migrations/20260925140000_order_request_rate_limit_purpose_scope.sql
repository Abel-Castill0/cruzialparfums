-- Cruzial Platform V2 — Gate A2: separate public abuse-limit scopes
--
-- Append-only, expand-contract. Confirmed defect: public.check_order_
-- request_rate_limit (20260919201406) has no purpose/scope dimension, so
-- Parfums/Import order requests and Libro de Reclamaciones complaint
-- submissions (20260921010000_business_legal_and_complaints.sql,
-- public_submit_complaint_entry) consume the SAME business_unit + ip_hash +
-- phone_hash sliding-window counters. A flood of complaint submissions from
-- one IP/phone can exhaust the quota an order request from the same IP/
-- phone would need, and vice versa — two independent workflows sharing one
-- abuse budget.
--
-- Fix: add a `purpose` dimension ('order_request' | 'complaint') to the
-- private event table and to every counting/locking key, and introduce a
-- new versioned RPC, public.check_abuse_rate_limit(p_purpose, ...), that all
-- new callers use. The original public.check_order_request_rate_limit(text,
-- uuid, text, text) is kept as a thin compatibility wrapper —
-- purpose := 'order_request' — so any caller still on the old signature
-- gets exactly its pre-existing behavior; nothing is changed in place.
--
-- Same threshold values are retained per purpose (ip 10m=12, ip 1h=40,
-- phone 1h=5, phone 24h=12) — this migration separates scopes, it does not
-- retune limits. Existing admitted events backfill as 'order_request' (the
-- only purpose that existed before this migration), so no historical event
-- is reinterpreted as a complaint and no quota is reset.

-- =============================================================================
-- A. Schema: add the purpose dimension
-- =============================================================================

alter table private.order_request_rate_events
  add column if not exists purpose text not null default 'order_request';

alter table private.order_request_rate_events
  add constraint order_request_rate_events_purpose_check
    check (purpose in ('order_request', 'complaint'));

comment on column private.order_request_rate_events.purpose is
  'Gate A2: independent abuse-limit scope. order_request = Parfums/Import checkout; complaint = Libro de Reclamaciones. Pre-Gate-A2 rows backfilled as order_request.';

-- Idempotency (business_unit_code, request_id) becomes per-purpose: order
-- and complaint flows mint request_id independently, and a request_id must
-- never be treated as a duplicate submission of the OTHER workflow.
alter table private.order_request_rate_events
  drop constraint order_request_rate_events_unit_request_key,
  add constraint order_request_rate_events_unit_purpose_request_key
    unique (business_unit_code, purpose, request_id);

drop index if exists private.order_request_rate_events_ip_idx;
create index order_request_rate_events_ip_idx
  on private.order_request_rate_events (business_unit_code, purpose, ip_hash, created_at)
  where ip_hash is not null;

drop index if exists private.order_request_rate_events_phone_idx;
create index order_request_rate_events_phone_idx
  on private.order_request_rate_events (business_unit_code, purpose, phone_hash, created_at);

-- =============================================================================
-- B. New versioned RPC: public.check_abuse_rate_limit
-- =============================================================================

create or replace function public.check_abuse_rate_limit(
  p_purpose text,
  p_business_unit_code text,
  p_request_id uuid,
  p_ip_hash text,
  p_phone_hash text
)
returns table (
  allowed boolean,
  retry_after_seconds integer,
  reason text,
  duplicate_request boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_existing record;
  v_ip_10m integer;
  v_ip_1h integer;
  v_phone_1h integer;
  v_phone_24h integer;
begin
  if p_purpose is null or p_purpose not in ('order_request', 'complaint') then
    raise exception 'invalid purpose' using errcode = '22023';
  end if;

  if p_business_unit_code is null or p_business_unit_code not in ('parfums', 'import') then
    raise exception 'invalid business unit code' using errcode = '22023';
  end if;

  if p_request_id is null then
    raise exception 'request_id is required' using errcode = '22023';
  end if;

  if p_phone_hash is null or p_phone_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid phone hash' using errcode = '22023';
  end if;

  if p_ip_hash is not null and p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid ip hash' using errcode = '22023';
  end if;

  -- Bounded, cheap opportunistic retention sweep, purpose-agnostic (age-only).
  delete from private.order_request_rate_events
  where id in (
    select id from private.order_request_rate_events
    where created_at < v_now - interval '48 hours'
    limit 500
  );

  -- Serialize concurrent submits of the SAME (purpose, request_id) before
  -- deciding anything else.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'cruzial:abuse:v1:request:' || p_purpose || ':' || p_business_unit_code || ':' || p_request_id::text,
      0
    )
  );

  select * into v_existing
  from private.order_request_rate_events
  where business_unit_code = p_business_unit_code
    and purpose = p_purpose
    and request_id = p_request_id;

  if found then
    return query select true, 0, null::text, true;
    return;
  end if;

  -- Fixed lock order across all callers, purpose included in the key so an
  -- order_request lock and a complaint lock for the same IP/phone never
  -- contend with each other: ip scope first (if present), then phone scope.
  if p_ip_hash is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('cruzial:abuse:v1:ip:' || p_purpose || ':' || p_business_unit_code || ':' || p_ip_hash, 0)
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cruzial:abuse:v1:phone:' || p_purpose || ':' || p_business_unit_code || ':' || p_phone_hash, 0)
  );

  if p_ip_hash is not null then
    select count(*) into v_ip_10m
    from private.order_request_rate_events
    where business_unit_code = p_business_unit_code
      and purpose = p_purpose
      and ip_hash = p_ip_hash
      and created_at >= v_now - interval '10 minutes';

    if v_ip_10m >= 12 then
      return query select false, 600, 'ip_10m_limit', false;
      return;
    end if;

    select count(*) into v_ip_1h
    from private.order_request_rate_events
    where business_unit_code = p_business_unit_code
      and purpose = p_purpose
      and ip_hash = p_ip_hash
      and created_at >= v_now - interval '1 hour';

    if v_ip_1h >= 40 then
      return query select false, 3600, 'ip_1h_limit', false;
      return;
    end if;
  end if;

  select count(*) into v_phone_1h
  from private.order_request_rate_events
  where business_unit_code = p_business_unit_code
    and purpose = p_purpose
    and phone_hash = p_phone_hash
    and created_at >= v_now - interval '1 hour';

  if v_phone_1h >= 5 then
    return query select false, 3600, 'phone_1h_limit', false;
    return;
  end if;

  select count(*) into v_phone_24h
  from private.order_request_rate_events
  where business_unit_code = p_business_unit_code
    and purpose = p_purpose
    and phone_hash = p_phone_hash
    and created_at >= v_now - interval '24 hours';

  if v_phone_24h >= 12 then
    return query select false, 86400, 'phone_24h_limit', false;
    return;
  end if;

  insert into private.order_request_rate_events (
    business_unit_code, purpose, request_id, ip_hash, phone_hash, created_at
  ) values (
    p_business_unit_code, p_purpose, p_request_id, p_ip_hash, p_phone_hash, v_now
  );

  return query select true, 0, null::text, false;
end;
$$;

revoke all on function public.check_abuse_rate_limit(text, text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.check_abuse_rate_limit(text, text, uuid, text, text)
  to service_role;

comment on function public.check_abuse_rate_limit is
  'Gate A2: service-only, concurrency-safe, purpose-scoped sliding-window rate limiter. p_purpose (''order_request'' | ''complaint'') fully isolates counters, locks and idempotency between workflows sharing the same business_unit/ip/phone — an order event never consumes complaint quota and vice versa. Never call with raw IP/phone.';

-- =============================================================================
-- C. Compatibility wrapper: old signature keeps its exact old behavior
-- =============================================================================

create or replace function public.check_order_request_rate_limit(
  p_business_unit_code text,
  p_request_id uuid,
  p_ip_hash text,
  p_phone_hash text
)
returns table (
  allowed boolean,
  retry_after_seconds integer,
  reason text,
  duplicate_request boolean
)
language sql
security invoker
set search_path = ''
as $$
  select * from public.check_abuse_rate_limit(
    'order_request', p_business_unit_code, p_request_id, p_ip_hash, p_phone_hash
  );
$$;

revoke all on function public.check_order_request_rate_limit(text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.check_order_request_rate_limit(text, uuid, text, text)
  to service_role;

comment on function public.check_order_request_rate_limit(text, uuid, text, text) is
  'Deprecated Gate A2 compatibility wrapper for public.check_abuse_rate_limit(''order_request'', ...). Kept only so a caller still on the pre-Gate-A2 signature is unaffected; new callers must use check_abuse_rate_limit directly with an explicit purpose.';
