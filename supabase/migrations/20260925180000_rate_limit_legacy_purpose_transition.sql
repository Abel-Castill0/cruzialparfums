-- Cruzial Platform V2 -- Gate A correction: legacy shared-limiter events
-- must never become order_request quota
--
-- 20260925140000 backfilled every pre-existing row (and the deprecated
-- 4-arg check_order_request_rate_limit signature's new inserts) as
-- purpose = 'order_request'. That is semantically false: before this Gate,
-- the complaint flow (public_submit_complaint_entry) called that SAME
-- shared limiter, so a row that predates purpose disambiguation could just
-- as easily have originated from a complaint submission as an order
-- request. Silently classifying it as order_request would let a historical
-- complaint-origin event consume real order-checkout quota.
--
-- Both this migration and 20260925140000 are unshipped as of this writing
-- (hosted still has neither; private.order_request_rate_events has 0 rows
-- in Production at review time) -- so the reclassification below runs
-- before any real traffic exists under the new schema. This is a
-- documented assumption, not an engineered guarantee: there is no column
-- that distinguishes "created before purpose disambiguation shipped" from
-- "created after" other than purpose itself, since it was 20260925140000
-- that assigned order_request in the first place. If this correction were
-- ever deployed separately from and strictly after 20260925140000, with
-- real order_request traffic already accumulated in the gap, the blanket
-- UPDATE below would misclassify that real traffic too. Given both ship
-- together in the same PR, that scenario does not apply here.
--
-- Fix: add a third, INTERNAL-ONLY purpose value, 'legacy_shared':
--   - every row this migration finds already marked order_request (i.e.
--     everything 20260925140000's DEFAULT clause backfilled) becomes
--     legacy_shared instead
--   - the deprecated 4-arg check_order_request_rate_limit wrapper now
--     writes NEW events as legacy_shared too -- a caller still on that old
--     signature is, by definition, not disambiguating purpose, so its
--     events are exactly as ambiguous as the historical ones
--   - legacy_shared is never reachable through the public p_purpose
--     parameter: public.check_abuse_rate_limit still validates its input
--     against exactly ('order_request', 'complaint') and rejects anything
--     else with 22023, unchanged from 20260925140000
--   - legacy_shared rows therefore never match `purpose = p_purpose` for
--     any real order_request or complaint call, so they structurally
--     cannot consume either purpose's sliding-window quota -- this falls
--     out of the existing purpose-scoped counting queries with no new
--     logic needed
--   - the retention sweep is already purpose-agnostic (age-only), so
--     legacy_shared rows are swept out after 48h exactly like any other
--     event -- no change needed there either
--   - idempotency stays per (business_unit_code, purpose, request_id): a
--     retry of the SAME request_id through the deprecated signature still
--     matches the existing legacy_shared row and is admitted as a
--     duplicate without a second insert or a second business-side effect
--
-- The shared counting/locking/insert logic is extracted into a private
-- helper (private.check_abuse_rate_limit_core) that accepts all three
-- purpose values, so it can serve both the public, purpose-restricted
-- entry point and the compatibility wrapper's internal-only legacy_shared
-- path without duplicating the sliding-window logic.

-- =============================================================================
-- A. Widen the purpose dimension; reclassify the prior backfill
-- =============================================================================

alter table private.order_request_rate_events
  drop constraint order_request_rate_events_purpose_check,
  add constraint order_request_rate_events_purpose_check
    check (purpose in ('order_request', 'complaint', 'legacy_shared'));

update private.order_request_rate_events
  set purpose = 'legacy_shared'
  where purpose = 'order_request';

comment on column private.order_request_rate_events.purpose is
  'Gate A2 + correction: order_request = Parfums/Import checkout; complaint = Libro de Reclamaciones; legacy_shared = internal-only marker for events from the pre-purpose-split shared limiter or the deprecated 4-arg compatibility signature. Never counts toward either public purpose''s quota (purpose-scoped counting queries simply never match it) and is never caller-selectable via public.check_abuse_rate_limit.';

-- =============================================================================
-- B. Shared engine: accepts all three purposes, used internally only
-- =============================================================================

create or replace function private.check_abuse_rate_limit_core(
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
  if p_purpose is null or p_purpose not in ('order_request', 'complaint', 'legacy_shared') then
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

revoke all on function private.check_abuse_rate_limit_core(text, text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function private.check_abuse_rate_limit_core(text, text, uuid, text, text)
  to service_role;

comment on function private.check_abuse_rate_limit_core is
  'Gate A correction: shared sliding-window engine behind both public.check_abuse_rate_limit and the deprecated compatibility wrapper. Accepts legacy_shared in addition to the two public purposes -- never call this directly from application code; use public.check_abuse_rate_limit with an explicit order_request/complaint purpose instead.';

-- =============================================================================
-- C. Public entry point: unchanged contract, now a thin validating wrapper
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
begin
  if p_purpose is null or p_purpose not in ('order_request', 'complaint') then
    raise exception 'invalid purpose' using errcode = '22023';
  end if;

  return query
  select * from private.check_abuse_rate_limit_core(p_purpose, p_business_unit_code, p_request_id, p_ip_hash, p_phone_hash);
end;
$$;

revoke all on function public.check_abuse_rate_limit(text, text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.check_abuse_rate_limit(text, text, uuid, text, text)
  to service_role;

comment on function public.check_abuse_rate_limit is
  'Gate A2 + correction: service-only, concurrency-safe, purpose-scoped sliding-window rate limiter. p_purpose must be exactly ''order_request'' or ''complaint'' -- any other value, including the internal-only ''legacy_shared'', is rejected with 22023. Never call with raw IP/phone.';

-- =============================================================================
-- D. Compatibility wrapper: now writes the honestly-ambiguous legacy_shared
--    purpose instead of assuming order_request
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
  select * from private.check_abuse_rate_limit_core(
    'legacy_shared', p_business_unit_code, p_request_id, p_ip_hash, p_phone_hash
  );
$$;

revoke all on function public.check_order_request_rate_limit(text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.check_order_request_rate_limit(text, uuid, text, text)
  to service_role;

comment on function public.check_order_request_rate_limit(text, uuid, text, text) is
  'Deprecated Gate A2 compatibility wrapper. A caller on this old, purpose-less signature cannot disambiguate order_request from complaint by construction, so its events are tagged legacy_shared -- never counted toward either purpose''s quota. New callers must use public.check_abuse_rate_limit directly with an explicit purpose.';
