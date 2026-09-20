-- Cruzial Parfums — brand identity corrections (operator-run, idempotent).
--
-- Two legacy brand attributions contradict the client's own product
-- photography (file names supplied by the client in img/perfumes/) and the
-- fragrance houses' public catalogues:
--
--   slug          legacy brand   client asset file                 corrected
--   odyssey-aqua  Lattafa        "ARMAF - ODYSSEY AQUA.png"        Armaf
--   mandarin-sky  Afnan          "ARMAF - MANDARIN SKY.png"        Armaf
--
-- Provenance: CLIENT_ASSET + DERIVED_VALIDATED (docs/client-decisions.md,
-- "Product corrections"). Names, prices, presentations and media are not
-- touched. Re-running is a no-op.
--
-- Run:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/provisioning/parfums-brand-corrections.sql

begin;

update public.products p
set brand = c.brand
from (values
  ('odyssey-aqua', 'Lattafa', 'Armaf'),
  ('mandarin-sky', 'Afnan',   'Armaf')
) as c(slug, previous_brand, brand)
join public.business_units b on b.code = 'parfums'
where p.business_unit_id = b.id
  and p.slug = c.slug
  and p.brand = c.previous_brand
  and p.archived_at is null;

select p.slug, p.brand
from public.products p
join public.business_units b on b.id = p.business_unit_id
where b.code = 'parfums' and p.slug in ('odyssey-aqua', 'mandarin-sky')
order by p.slug;

commit;
