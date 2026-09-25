-- VERIFICATION: Gate A correction — legacy shared-limiter events must not
-- become order_request or complaint quota
--
-- Proves that after migration
-- 20260925180000_rate_limit_legacy_purpose_transition.sql:
--   - legacy_shared rows never count toward order_request quota
--   - legacy_shared rows never count toward complaint quota
--   - new order_request rows consume only order_request quota
--   - new complaint rows consume only complaint quota
--   - a public caller cannot pass purpose = 'legacy_shared'
--   - a retry of the same request_id through the deprecated 4-arg
--     signature is admitted as a duplicate, not a second event
--   - the retention sweep removes legacy_shared rows after 48h exactly
--     like any other purpose

begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

set local role service_role;

-- =========================================================================
-- A. Five legacy_shared rows for one phone do not consume order_request or
--    complaint quota (phone_1h threshold is 5 -- if legacy counted, the
--    very next real call for the SAME phone would be the "6th" and denied)
-- =========================================================================
insert into private.order_request_rate_events (business_unit_code, purpose, request_id, ip_hash, phone_hash, created_at)
select 'parfums', 'legacy_shared', gen_random_uuid(), null, repeat('f1', 32), now() - interval '10 minutes'
from generate_series(1, 5) as n;

select results_eq(
  $$SELECT allowed, reason FROM public.check_abuse_rate_limit(
      'order_request', 'parfums', '43000000-0000-4000-8000-000000000001'::uuid, null, repeat('f1', 32))$$,
  $$VALUES (true, null::text)$$,
  '5 legacy_shared events for a phone do not consume that phone''s order_request quota'
);

select results_eq(
  $$SELECT allowed, reason FROM public.check_abuse_rate_limit(
      'complaint', 'parfums', '43000000-0000-4000-8000-000000000002'::uuid, null, repeat('f1', 32))$$,
  $$VALUES (true, null::text)$$,
  '5 legacy_shared events for the SAME phone do not consume its complaint quota either'
);

-- =========================================================================
-- B. New order_request rows consume only order_request quota
-- =========================================================================
insert into private.order_request_rate_events (business_unit_code, purpose, request_id, ip_hash, phone_hash, created_at)
select 'parfums', 'order_request', gen_random_uuid(), null, repeat('f2', 32), now() - interval '10 minutes'
from generate_series(1, 5) as n;

select results_eq(
  $$SELECT allowed, reason FROM public.check_abuse_rate_limit(
      'order_request', 'parfums', '43000000-0000-4000-8000-000000000003'::uuid, null, repeat('f2', 32))$$,
  $$VALUES (false, 'phone_1h_limit'::text)$$,
  'order_request quota for f2 is genuinely exhausted by 5 real order_request events'
);

select results_eq(
  $$SELECT allowed, reason FROM public.check_abuse_rate_limit(
      'complaint', 'parfums', '43000000-0000-4000-8000-000000000004'::uuid, null, repeat('f2', 32))$$,
  $$VALUES (true, null::text)$$,
  'those 5 order_request events do not consume complaint quota for the SAME phone f2'
);

-- =========================================================================
-- C. New complaint rows consume only complaint quota
-- =========================================================================
insert into private.order_request_rate_events (business_unit_code, purpose, request_id, ip_hash, phone_hash, created_at)
select 'parfums', 'complaint', gen_random_uuid(), null, repeat('f3', 32), now() - interval '10 minutes'
from generate_series(1, 5) as n;

select results_eq(
  $$SELECT allowed, reason FROM public.check_abuse_rate_limit(
      'complaint', 'parfums', '43000000-0000-4000-8000-000000000005'::uuid, null, repeat('f3', 32))$$,
  $$VALUES (false, 'phone_1h_limit'::text)$$,
  'complaint quota for f3 is genuinely exhausted by 5 real complaint events'
);

select results_eq(
  $$SELECT allowed, reason FROM public.check_abuse_rate_limit(
      'order_request', 'parfums', '43000000-0000-4000-8000-000000000006'::uuid, null, repeat('f3', 32))$$,
  $$VALUES (true, null::text)$$,
  'those 5 complaint events do not consume order_request quota for the SAME phone f3'
);

-- =========================================================================
-- D. A public caller cannot pass purpose = 'legacy_shared'
-- =========================================================================
select throws_ok(
  $$SELECT * FROM public.check_abuse_rate_limit('legacy_shared', 'parfums', gen_random_uuid(), null, repeat('f4', 32))$$,
  22023, null,
  'a public caller cannot request purpose = legacy_shared'
);

-- =========================================================================
-- E. Legacy request-id replay through the deprecated signature is
--    idempotent, not a duplicate business event
-- =========================================================================
select public.check_order_request_rate_limit(
  'parfums', '43000000-0000-4000-8000-000000000099'::uuid, null, repeat('f5', 32));

select results_eq(
  $$SELECT allowed, duplicate_request FROM public.check_order_request_rate_limit(
      'parfums', '43000000-0000-4000-8000-000000000099'::uuid, null, repeat('f5', 32))$$,
  $$VALUES (true, true)$$,
  'retrying the same request_id through the deprecated signature is admitted as a duplicate'
);

select is(
  (select count(*)::integer from private.order_request_rate_events
    where request_id = '43000000-0000-4000-8000-000000000099'::uuid),
  1,
  'the retry did not insert a second event (no duplicate business side effect)'
);

-- =========================================================================
-- F. Retention sweep removes legacy_shared rows after 48h like any purpose
-- =========================================================================
insert into private.order_request_rate_events (business_unit_code, purpose, request_id, ip_hash, phone_hash, created_at)
values ('parfums', 'legacy_shared', gen_random_uuid(), null, repeat('f6', 32), now() - interval '50 hours');

select public.check_abuse_rate_limit(
  'order_request', 'parfums', '43000000-0000-4000-8000-0000000000ee'::uuid, null, repeat('f7', 32));

select is(
  (select count(*)::integer from private.order_request_rate_events where phone_hash = repeat('f6', 32)),
  0,
  'a 50h-old legacy_shared row is removed by the purpose-agnostic retention sweep'
);

reset role;

select * from finish();
rollback;
