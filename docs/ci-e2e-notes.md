# Why the Playwright suite is not in CI (release review)

CI already runs, per `.github/workflows/ci.yml`: catalog check, commercial
check, lint, typecheck, unit tests, build, and (in a separate job) a fresh
`supabase db reset` + full pgTAP suite. This note explains why a Playwright
smoke job was evaluated for this release and deliberately not added, rather
than adding one that would be flaky or misleading.

## What would be needed

`apps/web/playwright.config.ts` already supports a fully local target
(`E2E_BASE_URL` unset → `http://localhost:3000` against `next start`), and
`e2e/auth.setup.ts` derives real TOTP codes from an env-supplied secret
locally (no external TOTP service, no committed password) — so credentials
are not the blocker.

The actual blocker is **seeded data**, and it is missing by deliberate
design, not oversight:

- `supabase/seed.sql` intentionally seeds **no products, variants, prices,
  or combos** — every legacy price is
  `CLIENT_PROVIDED_PENDING_RECONFIRMATION` and the seed file explicitly
  refuses to promote that into stated commercial fact (see its own header
  comment). The public journey specs (catalog → cart → checkout) need real
  published products to click through; a fresh `supabase db reset` in CI
  has zero.
- `supabase/seed.sql` also intentionally seeds **no `auth.users` rows** —
  the first administrator's credentials are operator-provisioned
  (`supabase/provisioning/grant-admin-membership.sql`), by design, because a
  password does not belong in git. Running the `admin` Playwright project
  needs a signed-up user with a verified TOTP factor and an
  `admin_memberships` row; none of that exists after a bare reset.

Building CI-only fixtures for both (a synthetic published catalog + a
synthetic admin user enrolled in TOTP entirely through SQL, bypassing
GoTrue's real signup/enroll flow) is real new infrastructure, not a small
addition — and doing it hastily risks producing a green check that doesn't
actually exercise the real signup/enroll code paths, which is worse than no
E2E gate at all.

## What already covers the same ground

- **Admin auth/MFA gate, cross-unit denial:** covered by pgTAP, not E2E —
  `supabase/tests/32_admin_mfa_aal2_enforcement.sql`,
  `supabase/tests/33_admin_parfums_order_status.sql`, and
  `supabase/tests/26_import_admin_operations.sql` all assert AAL1-denied,
  viewer-denied and cross-unit-denied directly against the RPCs, which is a
  stronger and faster signal than driving a browser through a login form.
- **Public journey, responsive smoke:** manually via
  `E2E_BASE_URL=<preview-or-staging-url> npm run test:e2e`, which is how
  this suite has been run to date (see `docs/current-v2.md`), against a
  deployment that actually has real catalog data.

## Recommendation, not implemented here

If/when a seeded local catalog fixture and a CI-only test-admin
provisioning script are built (tracked separately — out of scope for this
release), add a CI job scoped to `--project=chromium --project=responsive
--project=mobile` first (no MFA needed), and only add `--project=admin`
once the CI-only admin+TOTP fixture exists and has been reviewed on its own
merits.
