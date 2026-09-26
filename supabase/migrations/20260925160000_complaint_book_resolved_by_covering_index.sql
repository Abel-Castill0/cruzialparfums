-- Cruzial Platform V2 -- Gate A7: low-risk database hygiene
--
-- Supabase performance advisory (post-release): complaint_book_entries_
-- resolved_by_fkey has no covering index. resolved_by references
-- auth.users(id) ON DELETE SET NULL; without an index, that SET NULL
-- maintenance action requires a full table scan of complaint_book_entries
-- whenever an admin user row is deleted. The column is not currently
-- filtered/joined on by application code, so this is purely FK-maintenance
-- hygiene -- a small, standard, low-risk index, not a query-driven addition.

create index if not exists complaint_book_entries_resolved_by_idx
  on public.complaint_book_entries (resolved_by)
  where resolved_by is not null;

comment on index public.complaint_book_entries_resolved_by_idx is
  'Gate A7: covers complaint_book_entries_resolved_by_fkey (ON DELETE SET NULL maintenance), per Supabase performance advisory.';
