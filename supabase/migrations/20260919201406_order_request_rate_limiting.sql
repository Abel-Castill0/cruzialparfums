-- Cruzial Platform V2 — Gate 2B: public order request anti-abuse / rate limiting
--
-- Append-only. Does not modify any previously-applied migration, the Gate 2A
-- migration (20260919010000_security_boundary_hardening.sql, still NOT
-- applied hosted), or the WIP 4K2-B0 Parfums order-request migration
-- (20260916020000_parfums_order_request_v2.sql). NOT applied to Supabase
-- hosted staging as part of this Gate.
--
-- Threat closed: `request_id` only protects idempotency when a caller reuses
-- the SAME uuid. A bot can mint unlimited new uuids and call the Parfums/
-- Import Server Actions unlimited times; the service-only persistence RPCs
-- have no volume control of their own. This migration adds an authoritative,
-- concurrency-safe, PostgreSQL-side counter that the Next.js Server Actions
-- consult before calling the persistence RPC — never a Node-memory limiter,
-- which would not be a shared counter across serverless instances.
--
-- Design:
--   - `private` schema: not exposed through PostgREST's Data API, not usable
--     by anon/authenticated. Only service_role (used by the admin Supabase
--     client that Server Actions already hold) can reach it.
--   - `private.order_request_rate_events` stores only ADMITTED requests —
--     never rate-limited ones, so a flood of rejected uuids cannot itself
--     fill the table. Identity is pseudonymized (HMAC-SHA256 digest computed
--     in the Next.js server module, using a dedicated server-only secret);
--     raw IP and raw phone are never sent to or stored by this database.
--   - `public.check_order_request_rate_limit(...)` is the single, service-only
--     entry point. It takes an advisory transaction lock keyed on
--     business_unit + request_id first (so concurrent duplicate submits of
--     the same request_id are serialized), then — only for genuinely new
--     requests — locks scopes in a fixed order (ip, then phone) before
--     counting recent admitted events in sliding windows. Fixed lock
--     ordering across all callers avoids lock-order deadlocks.
--   - Retention: a bounded, cheap opportunistic delete of rows older than the
--     policy's longest window (24h) plus slack runs on every call instead of
--     a scheduled job, per this Gate's scope.

-- =============================================================================
-- Schema: private (internal, not exposed via Data API)
-- =============================================================================

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to service_role;

-- =============================================================================
-- Table: private.order_request_rate_events
-- =============================================================================

create table if not exists private.order_request_rate_events (
  id bigint generated always as identity primary key,
  business_unit_code text not null,
  request_id uuid not null,
  ip_hash text,
  phone_hash text not null,
  created_at timestamptz not null default now(),
  constraint order_request_rate_events_business_unit_code_check
    check (business_unit_code in ('parfums', 'import')),
  constraint order_request_rate_events_ip_hash_check
    check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$'),
  constraint order_request_rate_events_phone_hash_check
    check (phone_hash ~ '^[0-9a-f]{64}$'),
  constraint order_request_rate_events_unit_request_key
    unique (business_unit_code, request_id)
);

comment on table private.order_request_rate_events is
  'Gate 2B: admitted (never rejected) public order-request events, keyed by pseudonymized IP/phone HMAC digests. Not exposed via Data API. Retention ~48h, swept opportunistically by the rate-limit RPC.';

create index if not exists order_request_rate_events_ip_idx
  on private.order_request_rate_events (business_unit_code, ip_hash, created_at)
  where ip_hash is not null;

create index if not exists order_request_rate_events_phone_idx
  on private.order_request_rate_events (business_unit_code, phone_hash, created_at);

create index if not exists order_request_rate_events_created_at_idx
  on private.order_request_rate_events (created_at);

alter table private.order_request_rate_events enable row level security;
-- No policies: RLS defaults to deny-all. service_role bypasses RLS entirely
-- (Supabase's role model), which is the only role granted table privileges
-- below. This is defense-in-depth on top of the schema/grant boundary.

revoke all on private.order_request_rate_events from public, anon, authenticated;
grant select, insert, delete on private.order_request_rate_events to service_role;

-- =============================================================================
-- RPC: public.check_order_request_rate_limit
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

  -- Bounded, cheap opportunistic retention sweep. Not a substitute for a
  -- scheduled job at larger volume, but sufficient for this Gate's scope.
  delete from private.order_request_rate_events
  where id in (
    select id from private.order_request_rate_events
    where created_at < v_now - interval '48 hours'
    limit 500
  );

  -- Serialize concurrent submits of the SAME request_id before deciding
  -- anything else, so a double-submit race cannot both see "not found".
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'cruzial:order-abuse:v1:request:' || p_business_unit_code || ':' || p_request_id::text,
      0
    )
  );

  select * into v_existing
  from private.order_request_rate_events
  where business_unit_code = p_business_unit_code and request_id = p_request_id;

  if found then
    return query select true, 0, null::text, true;
    return;
  end if;

  -- Fixed lock order across all callers: ip scope first (if present), then
  -- phone scope. Prevents lock-order deadlocks between concurrent requests
  -- that share only one of the two scopes.
  if p_ip_hash is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('cruzial:order-abuse:v1:ip:' || p_business_unit_code || ':' || p_ip_hash, 0)
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cruzial:order-abuse:v1:phone:' || p_business_unit_code || ':' || p_phone_hash, 0)
  );

  if p_ip_hash is not null then
    select count(*) into v_ip_10m
    from private.order_request_rate_events
    where business_unit_code = p_business_unit_code
      and ip_hash = p_ip_hash
      and created_at >= v_now - interval '10 minutes';

    if v_ip_10m >= 12 then
      return query select false, 600, 'ip_10m_limit', false;
      return;
    end if;

    select count(*) into v_ip_1h
    from private.order_request_rate_events
    where business_unit_code = p_business_unit_code
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
    and phone_hash = p_phone_hash
    and created_at >= v_now - interval '1 hour';

  if v_phone_1h >= 5 then
    return query select false, 3600, 'phone_1h_limit', false;
    return;
  end if;

  select count(*) into v_phone_24h
  from private.order_request_rate_events
  where business_unit_code = p_business_unit_code
    and phone_hash = p_phone_hash
    and created_at >= v_now - interval '24 hours';

  if v_phone_24h >= 12 then
    return query select false, 86400, 'phone_24h_limit', false;
    return;
  end if;

  insert into private.order_request_rate_events (
    business_unit_code, request_id, ip_hash, phone_hash, created_at
  ) values (
    p_business_unit_code, p_request_id, p_ip_hash, p_phone_hash, v_now
  );

  return query select true, 0, null::text, false;
end;
$$;

revoke all on function public.check_order_request_rate_limit(text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.check_order_request_rate_limit(text, uuid, text, text)
  to service_role;

comment on function public.check_order_request_rate_limit(text, uuid, text, text) is
  'Gate 2B: service-only, concurrency-safe sliding-window rate limiter for new public order requests. Admits a retried (same request_id) submission without consuming quota; denies a genuinely new request once its IP or phone scope is exhausted. Never call with raw IP/phone — callers must pass pre-computed HMAC-SHA256 hex digests.';
