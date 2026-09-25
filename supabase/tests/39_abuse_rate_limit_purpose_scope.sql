-- VERIFICATION: Gate A2 — separate public abuse-limit scopes (purpose dimension)
--
-- Proves that after migration
-- 20260925140000_order_request_rate_limit_purpose_scope.sql:
--   - only service_role can execute public.check_abuse_rate_limit (same
--     privilege matrix as the pre-existing RPC)
--   - an invalid purpose is rejected
--   - an order_request event and a complaint event for the SAME business
--     unit + IP + phone never share quota in either direction: exhausting
--     one purpose's phone_1h window leaves the other purpose's window
--     fully available
--   - the SAME request_id used once per purpose is NOT treated as a
--     cross-purpose duplicate (idempotency is (business_unit, purpose,
--     request_id), not (business_unit, request_id))
--   - the pre-existing public.check_order_request_rate_limit signature is
--     now a compatibility wrapper that always writes purpose = 'order_request'

begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- =========================================================================
-- A. Privilege matrix on the new RPC
-- =========================================================================
set local role anon;

select throws_ok(
  $$SELECT * FROM public.check_abuse_rate_limit('order_request', 'parfums', gen_random_uuid(), null, repeat('b1', 32))$$,
  42501, null,
  'anon cannot execute check_abuse_rate_limit'
);

reset role;

set local role authenticated;

select throws_ok(
  $$SELECT * FROM public.check_abuse_rate_limit('order_request', 'parfums', gen_random_uuid(), null, repeat('b1', 32))$$,
  42501, null,
  'authenticated cannot execute check_abuse_rate_limit'
);

reset role;

set local role service_role;

-- =========================================================================
-- B. An unknown purpose is rejected
-- =========================================================================
select throws_ok(
  $$SELECT * FROM public.check_abuse_rate_limit('wholesale_review', 'parfums', gen_random_uuid(), null, repeat('b1', 32))$$,
  22023, null,
  'an unknown purpose is rejected'
);

-- =========================================================================
-- C. Cross-purpose independence: exhausting order_request's phone_1h
--    quota for a phone must not affect complaint's quota for that SAME
--    phone, and vice versa
-- =========================================================================
insert into private.order_request_rate_events (business_unit_code, purpose, request_id, ip_hash, phone_hash, created_at)
select 'parfums', 'order_request', gen_random_uuid(), null, repeat('e1', 32), now() - interval '10 minutes'
from generate_series(1, 5) as n;

select results_eq(
  $$SELECT allowed, reason FROM public.check_abuse_rate_limit(
      'order_request', 'parfums', '20000000-0000-4000-8000-000000000001'::uuid, null, repeat('e1', 32))$$,
  $$VALUES (false, 'phone_1h_limit'::text)$$,
  'order_request phone quota for e1 is exhausted (6th request denied)'
);

select results_eq(
  $$SELECT allowed, reason FROM public.check_abuse_rate_limit(
      'complaint', 'parfums', '20000000-0000-4000-8000-000000000002'::uuid, null, repeat('e1', 32))$$,
  $$VALUES (true, null::text)$$,
  'an order event never consumes complaint quota: complaint is still fully available for the SAME phone e1'
);

insert into private.order_request_rate_events (business_unit_code, purpose, request_id, ip_hash, phone_hash, created_at)
select 'parfums', 'complaint', gen_random_uuid(), null, repeat('e2', 32), now() - interval '10 minutes'
from generate_series(1, 5) as n;

select results_eq(
  $$SELECT allowed, reason FROM public.check_abuse_rate_limit(
      'complaint', 'parfums', '20000000-0000-4000-8000-000000000003'::uuid, null, repeat('e2', 32))$$,
  $$VALUES (false, 'phone_1h_limit'::text)$$,
  'complaint phone quota for e2 is exhausted (6th request denied)'
);

select results_eq(
  $$SELECT allowed, reason FROM public.check_abuse_rate_limit(
      'order_request', 'parfums', '20000000-0000-4000-8000-000000000004'::uuid, null, repeat('e2', 32))$$,
  $$VALUES (true, null::text)$$,
  'a complaint event never consumes order_request quota: order_request is still fully available for the SAME phone e2'
);

-- =========================================================================
-- D. request_id idempotency is per-purpose, not merely per-business-unit
-- =========================================================================
select results_eq(
  $$SELECT allowed, duplicate_request FROM public.check_abuse_rate_limit(
      'order_request', 'parfums', '20000000-0000-4000-8000-0000000000ff'::uuid, null, repeat('e3', 32))$$,
  $$VALUES (true, false)$$,
  'a request_id used for order_request the first time is genuinely new'
);

select results_eq(
  $$SELECT allowed, duplicate_request FROM public.check_abuse_rate_limit(
      'complaint', 'parfums', '20000000-0000-4000-8000-0000000000ff'::uuid, null, repeat('e4', 32))$$,
  $$VALUES (true, false)$$,
  'the SAME request_id used for complaint is NOT a cross-purpose duplicate — genuinely new, own quota consumed'
);

select is(
  (select count(*)::integer from private.order_request_rate_events
   where request_id = '20000000-0000-4000-8000-0000000000ff'::uuid),
  2,
  'the shared request_id produced two independent events, one per purpose'
);

-- =========================================================================
-- E. Compatibility wrapper: public.check_order_request_rate_limit always
--    writes purpose = 'order_request'
-- =========================================================================
select public.check_order_request_rate_limit(
  'parfums', '20000000-0000-4000-8000-000000000099'::uuid, null, repeat('e5', 32));

select is(
  (select purpose from private.order_request_rate_events
   where request_id = '20000000-0000-4000-8000-000000000099'::uuid),
  'order_request',
  'the pre-Gate-A2 RPC signature still writes purpose = order_request'
);

select results_eq(
  $$SELECT allowed FROM public.check_abuse_rate_limit(
      'complaint', 'parfums', '20000000-0000-4000-8000-0000000000aa'::uuid, null, repeat('e5', 32))$$,
  $$VALUES (true)$$,
  'an event written via the old wrapper does not consume the complaint quota for the same phone'
);

reset role;

select * from finish();
rollback;
