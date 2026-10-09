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

Playwright projects: `chromium` (desktop), `mobile` (Pixel 7), `tablet` (820x1180 touch, Chromium engine),
`responsive` (overflow at 320/360/390/430/768/1024/1280/1440), `admin` (MFA-authenticated, local identities).

Last full run on a **fresh** local stack (2026-10-08, after `supabase db reset`): **238 passed, 0 failed,
17 skipped**. Some specs advance synthetic state (e.g. Gate B reservation -> consumed), so re-running on a
used database fails by design; CI always starts from a fresh stack.

## The 17 skips, one by one

| # | Project(s) | Spec / scenario | Exact skip condition | Covered elsewhere / how to run |
|---|---|---|---|---|
| 4 | admin | `admin-authenticated.spec.ts` (shell with both units, Parfums QA product, Import readiness, session survives reload) | `!existsSync(STAGING_STATE)`: needs a Playwright `storageState` captured by a human on a **hosted** environment | Local equivalents run in the `admin` project (`admin-critical`, `admin-catalog-customers`, `admin-owner-editability`, `gate-b-operations`). Runs only when a staging exists: `npx playwright codegen --save-storage=e2e/.auth/staging-admin.json <url>/admin/login` (operator logs in + MFA, never Claude), then `E2E_BASE_URL=<url> npm run test:e2e -- --project=admin`. Blocked today: there is no hosted staging. |
| 5 chromium | chromium | `ux-regressions` 12, 52, 133, 153, 178 | `project !== "mobile"`: phone-only layout / touch rules | Run in `mobile` (all pass). |
| 1 mobile | mobile | `ux-regressions` 88 (carousel pause) | `project !== "chromium"`: timing probe runs once, on desktop | Runs and passes in `chromium`. |
| 6 tablet | tablet | `ux-regressions` 12, 52, 88, 133, 153, 178 | same project filters as above (phone-only / desktop-only) | Run in `mobile` / `chromium`. |
| 1 mobile | mobile | `ux-regressions` 178 (Import fallback contact status wraps inside the mobile hero) | `status.count() === 0`: the fallback only renders when the Import public contact is **not** configured, and the stack configures it | Reproduce: locally set `is_public=false` on the Import `public_contact` setting, rebuild cache (`rm -rf apps/web/.next/cache/fetch-cache`) and run `--project=mobile -g "fallback contact"`; revert after. Not enabled in CI because it needs a deliberately misconfigured stack. |

Skips removed in this pass (they were silently hiding coverage, not environment limits):
`admin-product-photos` multi-upload (2 tests; the runner now injects non-credential placeholder
`CLOUDINARY_*` for its loopback-only server and the specs intercept every Cloudinary call),
`attempt-lifecycle` Import order (2; the spec looked for the add-to-cart button on `/import`, which
only exists on product pages), `ux-regressions` gallery (2; it hard-coded a production slug, now a
synthetic two-photo fixture on the local stack) and rail rotation (2 + the carousel probe, whose
`[class*=marquee]` selector could never match hashed CSS-module classes in a production build).
Fixtures added to `scripts/local-browser-fixtures.sql` (synthetic, local only): six featured fragrances
(the rail needs >= 5 items to loop) and one product with two distinct photos.

## What E2E does not replace

- Admin auth/MFA (AAL2), viewer-denied and cross-unit denial are asserted directly against the RPCs
  in pgTAP (`supabase/tests/26`, `32`, `33`, …); that is the stronger signal.
- There is **no hosted staging**: the only hosted Supabase project is Production, so write flows
  (orders, uploads, admin mutations) are verified locally only. See `docs/owner-verification-runbook.md`
  for the owner-session checks that cannot be automated.
