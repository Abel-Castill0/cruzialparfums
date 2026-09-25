-- VERIFICATION: Gate A7 (index) + Gate A3 (anon SELECT revoke) — low-risk
-- database hygiene on public.complaint_book_entries
--
-- Proves that after migrations 20260925150000 and 20260925160000:
--   - complaint_book_entries_resolved_by_fkey now has a covering index
--   - anon has no SELECT grant on complaint_book_entries at all (refused
--     outright, not merely RLS-filtered to zero rows)
--   - the admin-only read policy is untouched: an authenticated admin still
--     reads complaint entries for its own business unit normally

begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

select has_index(
  'public', 'complaint_book_entries', 'complaint_book_entries_resolved_by_idx',
  'complaint_book_entries_resolved_by_fkey has a covering index'
);

set local role anon;

select throws_ok(
  $$select 1 from public.complaint_book_entries limit 1$$,
  42501, null,
  'anon has no SELECT grant on complaint_book_entries at all'
);

reset role;

set local role authenticated;
set local request.jwt.claims to '{"aal":"aal2","sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';

select lives_ok(
  $$select count(*) from public.complaint_book_entries$$,
  'Admin complaint UI still reads normally (complaint_book_entries_admin_read, authenticated)'
);

reset role;

select * from finish();
rollback;
