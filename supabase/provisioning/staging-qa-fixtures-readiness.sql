-- 4J5F-A actual RPC verification: execute as an existing authenticated Import
-- member in staging. No user/membership creation or authorization bypass.
-- Without that session the existing RPC raises 42501: record BLOCKED, never PASS.
begin;
set transaction read only;
do $$
declare q record; actual text[]; summary jsonb;
begin
 summary:=public.admin_get_import_publication_readiness();
 for q in select * from(values
 ('[STAGING QA] Import Ready',array[]::text[]),
 ('[STAGING QA] Import Sin Media',array['missing_primary_media']),
 ('[STAGING QA] Import Sin Oferta',array['missing_offer'])
 ) v(name,expected) loop
 select coalesce(array_agg(b.blocker_code order by b.blocker_code),array[]::text[]) into actual
 from public.admin_list_import_publication_blockers(q.name,null,1,50) b;
 if actual<>q.expected then raise exception 'Unexpected blockers for %: %',q.name,actual; end if;
 end loop;
 if (summary->>'ready_products')::integer<1 then raise exception 'No ready product in aggregate'; end if;
end $$;
select 'existing readiness RPCs: 3 scenarios PASS' as status;
rollback;
