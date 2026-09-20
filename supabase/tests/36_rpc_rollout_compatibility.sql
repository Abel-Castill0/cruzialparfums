-- Cruzial Platform V2 — Operations Foundation V1 (Codex P1 #1 correction)
--
-- Proves the TEMPORARY ROLLOUT COMPATIBILITY overloads added to
-- 20260920050000_import_publication_campaign_scoped.sql let the OLD
-- (pre-Operations-Foundation, commit 40c25af) and NEW application
-- generations both call these three admin RPCs against the SAME migrated
-- schema, unambiguously, with no auth weakening:
--
-- A. admin_get_import_publication_readiness — old 0-arg AND new
--    p_campaign_id overload both resolve; old keeps its #6 semantics; new
--    is independent per explicit campaign id.
-- B. admin_list_import_publication_blockers — same proof, old 4-arg vs
--    new 5-arg (uuid first).
-- C. admin_list_import_products — same proof, old 9-arg vs new 10-arg
--    (uuid first); a 9-positional-arg call cannot accidentally match the
--    new overload (its 8th slot is p_media_state text, incompatible with
--    an integer literal at that position), so resolution is unambiguous
--    even via raw positional SQL, not just PostgREST's named dispatch.
-- D. Authorization is unchanged on every legacy overload: an Import-unrelated
--    caller still gets 42501 on all three.
--
-- This does NOT remove or duplicate the Task-1 coverage in
-- 34_import_publication_campaign_scoped.sql (explicit-id independence,
-- null/cross-unit rejection) — this file only proves coexistence of the
-- two generations' signatures.

begin;
select plan(11);

-- =========================================================================
-- Fixtures
-- =========================================================================

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) values
 ('6c6c0000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rollout-import-admin@test','',now(),now()),
 ('6c6c0000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rollout-parfums-only@test','',now(),now());

insert into public.admin_memberships(user_id,business_unit_id,role) values
 ('6c6c0000-0000-4000-8000-000000000001',(select id from public.business_units where code='import'),'admin'),
 ('6c6c0000-0000-4000-8000-000000000002',(select id from public.business_units where code='parfums'),'admin');

-- Campaign #6 (the number the legacy overloads hardcode) and #7 (proves the
-- new overload is independent of that hardcode).
insert into public.campaigns(id,business_unit_id,number,name,status) values
 ('6c6c2000-0000-4000-8000-000000000006',(select id from public.business_units where code='import'),6,'Campaign 6 Rollout','draft'),
 ('6c6c2000-0000-4000-8000-000000000007',(select id from public.business_units where code='import'),7,'Campaign 7 Rollout','draft');

select set_config('request.jwt.claims', '{"aal":"aal2","sub":"6c6c0000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set role authenticated;

-- =========================================================================
-- A. admin_get_import_publication_readiness — old 0-arg vs new 1-arg
-- =========================================================================

select lives_ok(
  $$select public.admin_get_import_publication_readiness()$$,
  'A1: OLD zero-arg overload (40c25af contract) resolves and runs'
);

select is(
  (select (public.admin_get_import_publication_readiness() ->> 'campaign_number')::bigint),
  6::bigint,
  'A2: OLD overload preserves its #6-hardcode semantics unchanged'
);

select lives_ok(
  $$select public.admin_get_import_publication_readiness('6c6c2000-0000-4000-8000-000000000007')$$,
  'A3: NEW p_campaign_id overload resolves and runs'
);

select is(
  (select (public.admin_get_import_publication_readiness('6c6c2000-0000-4000-8000-000000000007') ->> 'campaign_number')::bigint),
  7::bigint,
  'A4: NEW overload is independent of the #6 hardcode — explicit #7 reports #7'
);

-- =========================================================================
-- B. admin_list_import_publication_blockers — old 4-arg vs new 5-arg
-- =========================================================================

select lives_ok(
  $$select * from public.admin_list_import_publication_blockers(null, null, 1, 20)$$,
  'B1: OLD 4-arg overload (no campaign id) resolves and runs'
);

select lives_ok(
  $$select * from public.admin_list_import_publication_blockers('6c6c2000-0000-4000-8000-000000000007', null, null, 1, 20)$$,
  'B2: NEW 5-arg overload (p_campaign_id first) resolves and runs'
);

-- =========================================================================
-- C. admin_list_import_products — old 9-arg vs new 10-arg
-- =========================================================================

select lives_ok(
  $$select * from public.admin_list_import_products(null, null, null, 'active', null, null, null, 1, 50)$$,
  'C1: OLD 9-arg overload (no campaign id) resolves and runs'
);

select lives_ok(
  $$select * from public.admin_list_import_products('6c6c2000-0000-4000-8000-000000000007', null, null, null, 'active', null, null, null, 1, 50)$$,
  'C2: NEW 10-arg overload (p_campaign_id first) resolves and runs'
);

reset role;

-- =========================================================================
-- D. Authorization is unchanged on the legacy overloads
-- =========================================================================

select set_config('request.jwt.claims', '{"aal":"aal2","sub":"6c6c0000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set role authenticated;

select throws_ok(
  $$select public.admin_get_import_publication_readiness()$$,
  '42501',
  null,
  'D1: a Parfums-only caller is rejected by the OLD readiness overload — auth not weakened'
);

select throws_ok(
  $$select * from public.admin_list_import_publication_blockers(null, null, 1, 20)$$,
  '42501',
  null,
  'D2: a Parfums-only caller is rejected by the OLD blockers overload — auth not weakened'
);

select throws_ok(
  $$select * from public.admin_list_import_products(null, null, null, 'active', null, null, null, 1, 50)$$,
  '42501',
  null,
  'D3: a Parfums-only caller is rejected by the OLD products overload — auth not weakened'
);

reset role;

select * from finish();
rollback;
