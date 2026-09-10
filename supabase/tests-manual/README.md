# Manual DB checks (not part of `supabase test db`)

Files here assert live population state, not hermetic fixtures, so they are
kept out of `supabase/tests/` — `supabase db reset && supabase test db` must
stay green on schema alone, with no dependency on any loader having run.

Run manually, against **local** Supabase only, after populating local data:

```bash
node scripts/load-import-consolidado.mjs --target local --apply
docker exec -i supabase_db_cruzialparfums \
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  < supabase/tests-manual/21_override_resolution_correctness.sql
```

Never point `--apply` at `--target staging` outside the documented staging
population procedure — staging is never repopulated from local sessions.

The named-case regressions this file also proves (Accento/Arabia Heroes
split identity, GOS Rouge/Black XS/Miss Dior presentation splits, Infrared
reassociation, CDN Preciux IV no-offer) are covered hermetically, with no
database, by `scripts/import-consolidado-4j4b.test.mjs` — that one runs on
every `npm run check`.
