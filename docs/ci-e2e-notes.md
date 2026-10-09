# Browser E2E in CI and locally

Updated 2026-10-09. An earlier version of this note said the Playwright suite was deliberately
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

Playwright projects: `chromium` (desktop; plus `ux-regressions-desktop`), `mobile` (Pixel 7; plus
`ux-regressions-phone`), `tablet` (820x1180 touch, Chromium engine), `responsive` (overflow at
320/360/390/430/768/1024/1280/1440), `admin` (MFA-authenticated, synthetic identities) and `isolated`
(depends on every other project, so it runs last; its specs change shared synthetic state on purpose and
restore it in `finally`).

Some specs advance synthetic state (e.g. Gate B reservation -> consumed), so re-running on a used database
fails by design; CI always starts from a fresh stack (hosted QA: `--reset` first).

## Hosted QA run (real hosted Auth/PostgREST, synthetic data)

Since 2026-10-09 a separate Supabase project `cruzial-v2-qa` (`aqbhtmylqnpahynarnhm`) exists. The same suite
runs against it with a local production build of the app:

```bash
node scripts/qa-hosted-browser.mjs --check     # static ref checks + qa_env.marker in the database
node scripts/qa-hosted-browser.mjs --reset     # db reset of QA only (marker proven first, restored after)
node scripts/qa-hosted-browser.mjs --build
node scripts/qa-hosted-browser.mjs --seed      # synthetic fixtures + identities, then the whole suite
```

Configuration lives only in the git-ignored `.env.qa` (QA ref, URL, publishable/secret keys, and the
QA-only `qa_runner` pooler login: table grants + BYPASSRLS in QA, no `auth` or owner rights). `apps/web/e2e/qa-target.mjs` refuses Production refs, URLs/keys of
another project and masked keys; every SQL statement (fixtures and `e2e/local-db.ts`) is preceded by the
`qa_env.marker` guard, which aborts on any database without the marker (verified against the local stack).

## Skips (2026-10-09): 0

The 17 skips of 2026-10-08 are gone; none was counted as a pass:
- `admin-authenticated` (4): now runs with the runners' synthetic dual-unit admin (real password + TOTP)
  on fixtures from `scripts/local-browser-fixtures.sql` (`local-qa-import-ready/-no-media/-no-offer` under
  a draft consolidado #9800 that is never the default selection). An operator-captured storageState is
  still honoured when no runner identity exists.
- Viewport-only checks (12): moved to `ux-regressions-phone.spec.ts` / `ux-regressions-desktop.spec.ts`,
  matched only by their project, so they run exactly once where they apply instead of being skipped elsewhere.
- Import fallback contact (1): `isolated-contact-unconfigured.spec.ts` un-publishes the synthetic Import
  contact, asserts the mobile layout and restores it; runs in the last-running `isolated` project.

Data-conditional guards that remain in specs (`no published sets`, `no long product rail`, `fewer than two
photos`, `needs the disposable fixture database`) do not fire on the local stack or on QA; they only protect
a run against an arbitrary hosted URL (`E2E_BASE_URL`).

## What E2E does not replace

- Admin auth/MFA (AAL2), viewer-denied and cross-unit denial are asserted directly against the RPCs
  in pgTAP (`supabase/tests/26`, `32`, `33`, …); that is the stronger signal.
- Write flows (orders, admin mutations, MFA) are verified locally and on hosted QA with synthetic data.
  Real Cloudinary uploads are not part of the suite (the only account is Production's; the specs intercept
  it); the signed-upload contract was probed directly on 2026-10-09 (see `docs/current-v2.md`). Owner-only
  checks: `docs/owner-verification-runbook.md`.
