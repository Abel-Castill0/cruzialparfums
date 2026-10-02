begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

set local role anon;
select is((select count(*)::integer from public.public_get_import_upcoming_campaign()), 0,
  'anonymous visitors see no future campaign when none is scheduled');
select is((select count(*)::integer from public.public_list_import_preview_categories()), 0,
  'anonymous visitors see no categories without a scheduled campaign');
select is((select count(*)::integer from public.public_list_import_campaign_preview()), 0,
  'anonymous visitors cannot preview products outside a scheduled campaign');
select is((select count(*)::integer from public.public_get_import_wholesale_rules()), 0,
  'wholesale preview remains empty until Import-owned rules are provisioned');

select * from finish();
rollback;
