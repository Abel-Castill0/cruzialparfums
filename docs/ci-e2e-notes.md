# Browser E2E in CI and locally

Updated 2026-10-08. An earlier version of this note said the Playwright suite was deliberately
not in CI because it lacked seeded data. That is no longer true: CI job **Browser E2E (public ·
responsive · MFA admin)** (`.github/workflows/ci.yml`, job `e2e`) runs it on every PR.

## How it runs

1. `supabase start` brings up a fresh, disposable **local** stack on the runner.
2. `node scripts/local-admin-browser.mjs --build` builds the production bundle against that stack.
3. `node scripts/local-admin-browser.mjs --seed` loads the synthetic fixtures
   (`scripts/local-browser-fixtures.sql`), mints random local identities, a random TOTP-capable
   admin and a random HMAC secret for the run, then executes the whole Playwright suite itself.

`scripts/local-admin-browser.mjs` refuses any Supabase URL that is not loopback, so this can never
touch a hosted project. No Supabase key, password, TOTP secret or HMAC secret is stored anywhere.

## Run it locally

```bash
npx supabase start -x studio,imgproxy,edge-runtime,logflare,vector
node scripts/local-admin-browser.mjs --build
node scripts/local-admin-browser.mjs --seed
```

Last full local run (2026-10-08, master `868e493` + closure branch): **167 passed, 0 failed, 20
skipped**. Skips are conditional by design: staging-storageState-only specs
(`admin-authenticated.spec.ts`), mobile-only or desktop-only viewport checks, and specs that need
identities that exist only in another environment.

## What E2E does not replace

- Admin auth/MFA (AAL2), viewer-denied and cross-unit denial are asserted directly against the RPCs
  in pgTAP (`supabase/tests/26`, `32`, `33`, …); that is the stronger signal.
- There is **no hosted staging**: the only hosted Supabase project is Production, so write flows
  (orders, uploads, admin mutations) are verified locally only. See `docs/owner-verification-runbook.md`
  for the owner-session checks that cannot be automated.
