-- VERIFICATION: Gate 2B — public order request anti-abuse / rate limiting
--
-- Proves that after migration 20260919201406_order_request_rate_limiting.sql:
--   - only service_role can execute public.check_order_request_rate_limit
--     (anon/authenticated cannot; private.order_request_rate_events is not
--     reachable by anon at all)
--   - a genuinely new request_id is admitted and consumes quota; the SAME
--     request_id retried is admitted again as a duplicate WITHOUT consuming
--     quota
--   - the IP sliding windows (12/10min, 40/1h) and phone sliding windows
--     (5/1h, 12/24h) admit up to their cap and deny the next new request
--   - different IPs, different phones, and different business units never
--     share quota
--   - a denied (rate-limited) request never creates an accepted event row
--   - the retention sweep never removes a row still inside an active window
--   - the table stores only the pseudonymized/contract columns (no raw
--     IP/phone column exists)

begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- =========================================================================
-- A. Privilege matrix: only service_role can execute the RPC; anon cannot
--    reach the table at all
-- =========================================================================
set local role anon;

select throws_ok(
  $$SELECT * FROM public.check_order_request_rate_limit('parfums', gen_random_uuid(), null, repeat('b1', 32))$$,
  42501, null,
  'anon cannot execute check_order_request_rate_limit'
);

select throws_ok(
  $$SELECT 1 FROM private.order_request_rate_events LIMIT 1$$,
  42501, null,
  'anon cannot read private.order_request_rate_events (no schema usage)'
);

reset role;

set local role authenticated;

select throws_ok(
  $$SELECT * FROM public.check_order_request_rate_limit('parfums', gen_random_uuid(), null, repeat('b1', 32))$$,
  42501, null,
  'authenticated cannot execute check_order_request_rate_limit'
);

reset role;

-- =========================================================================
-- B. Contract shape: only the pseudonymized columns exist
-- =========================================================================
-- Gate A2 (20260925140000) added the `purpose` scope column.
select columns_are(
  'private', 'order_request_rate_events',
  ARRAY['id', 'business_unit_code', 'request_id', 'ip_hash', 'phone_hash', 'created_at', 'purpose'],
  'order_request_rate_events has only the pseudonymized/contract columns'
);

-- All RPC exercise below runs as service_role, exactly like the admin
-- Supabase client the Server Actions already use.
set local role service_role;

-- =========================================================================
-- C. Invalid business unit is rejected
-- =========================================================================
select throws_ok(
  $$SELECT * FROM public.check_order_request_rate_limit('wholesale', gen_random_uuid(), null, repeat('b1', 32))$$,
  22023, null,
  'an unknown business unit code is rejected'
);

-- =========================================================================
-- D. A new request_id is admitted; the SAME request_id retried is admitted
--    again as a duplicate and does not consume quota
-- =========================================================================
select results_eq(
  $$SELECT allowed, duplicate_request FROM public.check_order_request_rate_limit(
      'parfums', '10000000-0000-4000-8000-000000000001'::uuid, null, repeat('b1', 32))$$,
  $$VALUES (true, false)$$,
  'a genuinely new request_id is admitted (not a duplicate)'
);

select results_eq(
  $$SELECT allowed, duplicate_request FROM public.check_order_request_rate_limit(
      'parfums', '10000000-0000-4000-8000-000000000001'::uuid, null, repeat('b1', 32))$$,
  $$VALUES (true, true)$$,
  'the same request_id retried is allowed as a duplicate'
);

select is(
  (select count(*)::integer from private.order_request_rate_events
   where business_unit_code = 'parfums' and request_id = '10000000-0000-4000-8000-000000000001'::uuid),
  1,
  'the duplicate retry did not insert a second event (no quota increment)'
);

-- =========================================================================
-- E. IP sliding windows: 12/10min then deny; 40/1h then deny
-- =========================================================================
insert into private.order_request_rate_events (business_unit_code, request_id, ip_hash, phone_hash, created_at)
select 'parfums', gen_random_uuid(), repeat('a1', 32), lpad(to_hex(n), 64, '0'), now() - interval '2 minutes'
from generate_series(1, 11) as n;

select results_eq(
  $$SELECT allowed, reason FROM public.check_order_request_rate_limit(
      'parfums', '10000000-0000-4000-8000-000000000002'::uuid, repeat('a1', 32), repeat('b2', 32))$$,
  $$VALUES (true, null::text)$$,
  'the 12th new request from the same IP within 10 minutes is admitted'
);

select results_eq(
  $$SELECT allowed, reason FROM public.check_order_request_rate_limit(
      'parfums', '10000000-0000-4000-8000-000000000003'::uuid, repeat('a1', 32), repeat('b3', 32))$$,
  $$VALUES (false, 'ip_10m_limit'::text)$$,
  'the 13th new request from the same IP within 10 minutes is denied'
);

insert into private.order_request_rate_events (business_unit_code, request_id, ip_hash, phone_hash, created_at)
select 'parfums', gen_random_uuid(), repeat('a2', 32), lpad(to_hex(100 + n), 64, '0'), now() - interval '40 minutes'
from generate_series(1, 39) as n;

select results_eq(
  $$SELECT allowed, reason FROM public.check_order_request_rate_limit(
      'parfums', '10000000-0000-4000-8000-000000000004'::uuid, repeat('a2', 32), repeat('b4', 32))$$,
  $$VALUES (true, null::text)$$,
  'the 40th new request from the same IP within 1 hour is admitted'
);

select results_eq(
  $$SELECT allowed, reason FROM public.check_order_request_rate_limit(
      'parfums', '10000000-0000-4000-8000-000000000005'::uuid, repeat('a2', 32), repeat('b5', 32))$$,
  $$VALUES (false, 'ip_1h_limit'::text)$$,
  'the 41st new request from the same IP within 1 hour is denied'
);

-- =========================================================================
-- F. Phone sliding windows: 5/1h then deny; 12/24h then deny
-- =========================================================================
insert into private.order_request_rate_events (business_unit_code, request_id, ip_hash, phone_hash, created_at)
select 'parfums', gen_random_uuid(), null, repeat('c1', 32), now() - interval '10 minutes'
from generate_series(1, 4) as n;

select results_eq(
  $$SELECT allowed, reason FROM public.check_order_request_rate_limit(
      'parfums', '10000000-0000-4000-8000-000000000006'::uuid, null, repeat('c1', 32))$$,
  $$VALUES (true, null::text)$$,
  'the 5th new request from the same phone within 1 hour is admitted'
);

select results_eq(
  $$SELECT allowed, reason FROM public.check_order_request_rate_limit(
      'parfums', '10000000-0000-4000-8000-000000000007'::uuid, null, repeat('c1', 32))$$,
  $$VALUES (false, 'phone_1h_limit'::text)$$,
  'the 6th new request from the same phone within 1 hour is denied'
);

insert into private.order_request_rate_events (business_unit_code, request_id, ip_hash, phone_hash, created_at)
select 'parfums', gen_random_uuid(), null, repeat('c2', 32), now() - interval '2 hours'
from generate_series(1, 11) as n;

select results_eq(
  $$SELECT allowed, reason FROM public.check_order_request_rate_limit(
      'parfums', '10000000-0000-4000-8000-000000000008'::uuid, null, repeat('c2', 32))$$,
  $$VALUES (true, null::text)$$,
  'the 12th new request from the same phone within 24 hours is admitted'
);

select results_eq(
  $$SELECT allowed, reason FROM public.check_order_request_rate_limit(
      'parfums', '10000000-0000-4000-8000-000000000009'::uuid, null, repeat('c2', 32))$$,
  $$VALUES (false, 'phone_24h_limit'::text)$$,
  'the 13th new request from the same phone within 24 hours is denied'
);

-- =========================================================================
-- G. Isolation: different IP, different phone, different business unit
--    never share quota with an already-exhausted scope
-- =========================================================================
select ok(
  (select allowed from public.check_order_request_rate_limit(
    'parfums', '1000000a-0000-4000-8000-000000000001'::uuid, repeat('a9', 32), repeat('c9', 32))),
  'a different IP is not affected by another IP''s exhausted quota'
);

select ok(
  (select allowed from public.check_order_request_rate_limit(
    'parfums', '1000000a-0000-4000-8000-000000000002'::uuid, null, repeat('c8', 32))),
  'a different phone is not affected by another phone''s exhausted quota'
);

select ok(
  (select allowed from public.check_order_request_rate_limit(
    'import', '1000000a-0000-4000-8000-000000000003'::uuid, repeat('a1', 32), repeat('c7', 32))),
  'Import does not share Parfums'' exhausted IP quota (business-unit isolation)'
);

-- =========================================================================
-- H. A denied request never creates an accepted event
-- =========================================================================
select is(
  (select count(*)::integer from private.order_request_rate_events
   where business_unit_code = 'parfums' and request_id = '10000000-0000-4000-8000-000000000003'::uuid),
  0,
  'the rate-limited request_id from case E has no accepted event row'
);

-- =========================================================================
-- I. Retention sweep never removes a row still inside an active window
-- =========================================================================
insert into private.order_request_rate_events (business_unit_code, request_id, ip_hash, phone_hash, created_at)
values ('parfums', gen_random_uuid(), null, repeat('d1', 32), now() - interval '23 hours');

insert into private.order_request_rate_events (business_unit_code, request_id, ip_hash, phone_hash, created_at)
values ('parfums', gen_random_uuid(), null, repeat('d2', 32), now() - interval '50 hours');

-- Any RPC call runs the opportunistic sweep (rows older than 48h).
select public.check_order_request_rate_limit(
  'parfums', '1000000a-0000-4000-8000-00000000000f'::uuid, null, repeat('d3', 32));

select is(
  (select count(*)::integer from private.order_request_rate_events where phone_hash = repeat('d1', 32)),
  1,
  'a 23h-old row (still inside the 24h phone window) survives the retention sweep'
);

select is(
  (select count(*)::integer from private.order_request_rate_events where phone_hash = repeat('d2', 32)),
  0,
  'a 50h-old row (past the 48h retention target) is removed by the retention sweep'
);

reset role;

select * from finish();
rollback;
