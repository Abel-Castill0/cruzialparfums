# Closure audit — 2026-10-10

Branch `claude/closure-audit-2026-10-10`, based on `origin/master` = `6d2ebc4`.
Every fact below was checked in this pass (Git, GitHub, Vercel API/CLI, Supabase
MCP read-only, local runs). Nothing was written to Production. No secret value,
PII or customer row was printed.

## 1. Verified state

| Item | Evidence | Result |
| --- | --- | --- |
| Local vs remote | `git fetch`; `master...origin/master` = 0/0; tree clean | `6d2ebc4` |
| Production SHA | Vercel API `/v13/deployments/dpl_JANkMSEeLBERFeoxZwYapNW5rLHs`: `githubCommitSha` | `6d2ebc4` = origin/master, READY, aliases `cruzial.pe`, `www.cruzial.pe` |
| Vercel project | API `/v9/projects/…` | root `apps/web`, prod branch `master`, Node 24.x, cron `0 13 * * *` enabled, Preview protection on |
| Vercel env (names only) | API `/v10/projects/…/env` | Production: Supabase URL/publishable/secret, Cloudinary ×3, `CRON_SECRET`, `ORDER_ABUSE_HMAC_SECRET`, `SITE_URL`, cutover flag. Preview: Supabase (QA), own HMAC, `SITE_URL`, cutover flag; no Cloudinary, no WhatsApp. All `sensitive`. |
| Migrations | md5 of ordered version list | repo = Production = QA: 80, `44ba716a…`, max `20261002045724`. This branch adds 1 (not applied hosted). |
| Production data (aggregates) | read-only SQL | 97 published products, 0 orders, 0 outbox, `public_launch_ready() = false`, no `qa_env` schema |
| QA | read-only SQL | marker present (1 row), 80 migrations |
| Worker | `automation_worker_health` | `ok`, last finished 2026-10-10T18:42:52Z, 0 processed |
| CI on master | `gh run list` | CI, CodeQL, Secret scan green on `6d2ebc4` |
| Open PRs | `gh pr list` | only #10 (TypeScript 7): blocked, typescript-eslint 8.71.1 peer `typescript <6.1.0` |

## 2. Area matrix

Legend: **V** verified · **F** fixed in this branch · **B** blocked by a business/legal fact · **A** needs owner authorization/action.

| Area | State | Notes |
| --- | --- | --- |
| SECURITY DEFINER functions | V | 125 (app 43, public 82): all `search_path=''`, owner `postgres`, 0 executable by PUBLIC. 20 anon-executable are stable public-read helpers; every authenticated-executable writer delegates to `assert_admin_for`/`can_read_unit` (active membership **and** `aal2`). `app` schema not exposed by PostgREST (`schemas = public, graphql_public`). |
| RLS / grants | V | anon has no INSERT/UPDATE/DELETE on any public table; authenticated writes limited to 3 tables, each gated by `app.is_admin_for` (AAL2). Only view without RLS is `security_invoker`. |
| Server Actions | V | 27 files: every admin action calls `requireUnitAdmin(unit)` then a session client (DB re-checks); the 3 public writers (Parfums checkout, Import checkout, Libro) use the service client behind rate limit + server-derived idempotency. |
| Client bundle | V | 0 hits for privileged variable names, `sb_secret_`, JWT prefixes, and 0 hits for 7 local secret values across 95 static files. `.env*` ignored. |
| HTTP hardening (Prod) | V | CSP nonce + `strict-dynamic`, HSTS 1y, DENY, nosniff, Referrer/Permissions policies; http→https 308. |
| Logs (Prod) | V | Vercel 7 d: 0 error/warning/fatal; only 5xx = this pass's probe of the WhatsApp webhook (503 `not_configured`, expected). Supabase Postgres 24 h: only errors are this pass's own malformed probe queries. |
| Advisors (Prod) | V | Security: 4 INFO rls_no_policy (service-only tables), 10 + 78 definer WARNs (inventory above), leaked-password (Free plan). Performance: 25 unused indexes (0 orders), 16 multiple-permissive SELECT (admin+public read). No new finding; not changed. |
| Launch readiness | F + B | See defect D1. After it, remaining blockers are legal facts and catalog facts only. |
| SEO / indexing | F + V | Indexing closed on purpose (robots `Disallow: /`, empty sitemap, `noindex`). Titles fixed (D2). `www` → apex is 307 (A). |
| Import campaign timing | F | D3. |
| Parfums/Import flows | V | Local E2E 249/0/0 covers catalog, cart, checkout, idempotency, Libro, admin MFA/AAL2, isolation, Import preview. Production read-only E2E 170 passed; write journeys skip by design there. |
| CI/CD and repository | F + V | D4, D7, D11. Secret scanning, push protection, Dependabot alerts/updates and `master` protection are enabled and read back (section 7); CI moves to Node 24 in PR #60. |
| Dependencies | V | `npm audit --omit=dev` 0; `audit:dev` PASS with 1 documented exception (`braces`, no patched release, re-checked). Next 16.4.0 = latest. |
| Backup / restore | V (2026-10-09) | Proven restore on 2026-10-09; unchanged since (0 orders). Managed backups need a paid plan (A). |
| WhatsApp Cloud API | B | No Meta credentials; fails closed. |
| Cloudinary | V (2026-10-09) | Unchanged since the 10-09 real-upload proof on QA. |

## 3. Defects found and fixed

| ID | Sev | Evidence | Root cause | Fix | Regression |
| --- | --- | --- | --- | --- | --- |
| D1 | P2 | Prod `app.unit_launch_readiness(parfums)`: `unpublished_products=2`, `commercial_blockers=8`; `invictus-elixir` has `publication_status='archived'`, `archived_at` NULL | The commercial loader archives by status only (its reconciliation contract requires `archived_at=null`); readiness excluded only `archived_at` rows, so Parfums could never be ready even with every legal fact | Migration `20261010120000_launch_readiness_status_archived.sql` (8 product predicates; no data written; rollback in `supabase/rollback/`) | pgTAP `56_…`: fails 3/6 before, 6/6 after, with a draft-product positive control |
| D2 | P3 | Prod titles: `Cruzial Parfums — Cruzial Parfums`; `Consolidados y catálogo — Cruzial`; `Cruzial Import — Cruzial` on cart and checkout | Same-segment page used a template meant for children; client pages had no metadata | `title.absolute` on unit homes; metadata-only layouts for Import cart/checkout | E2E `public-hub.spec.ts` fails on current Prod (3 projects), passes locally |
| D3 | P2 | Prod campaign #8 `scheduled`, `opens_at` 2026-10-15 05:00Z; `public_import_upcoming_campaign_id()` has no `opens_at > now()` filter | After that instant the hero/preview would show a past date as "Apertura estimada" | `estimatedOpeningLabel()` shows "por confirmar" for a passed/invalid estimate | Vitest with fixed clocks |
| D4 | P3 | `ci.yml` had no `permissions:`; CI never ran `test:qa-target` | Relied on repo default; guard tests only in local `npm run check` | `permissions: contents: read`; added `npm run test:qa-target` | CI on this PR |
| D5 | P3 | `docs/known-issues.md` said the storefront uses the legacy catalog, listed resolved items | Not updated after the Supabase cutover | Rewritten from today's evidence | — |
| D6 | P2 | `scripts/migrate-client-media.mjs db-apply --target=staging` ran `supabase db query --linked`; the repo default link (`supabase/.temp/project-ref`) is Production | The flag name, not the real project, decided the environment (same class as the 10-09 Import loader fix) | `assertHostedDbTarget` refuses the Production ref and any unreadable link before any query | `migrate-client-media.test.mjs` (11/11; 2 new) now wired into `npm run check` and CI (it was in neither) |
| D7 | P2 | GitHub (public repo): secret scanning, push protection, Dependabot alerts and security updates were disabled; `master` unprotected; no SHA-pinning policy | Never configured | Enabled and re-read from the API (section 7); `master` requires a PR + the 5 real check names; `sha_pinning_required`; fork workflows need approval for all external contributors | Final state read back from GitHub (section 7) |
| D8 | P3 | WCAG 2.5.3 (label in name): footer brand link and the photo links of the 3 products without a photo (axe `label-content-name-mismatch`, live Production) | `aria-label` omitted the visible text; the rule is experimental so the tag-based axe runs never evaluated it | PR #61: name from content; `productMediaLinkLabel()` | New E2E fails on Production (`/parfums`, `/parfums/catalogo`), passes locally 60/60; unit test |
| D9 | P3 | Parfums home LCP image lacks `fetchpriority=high` (Lighthouse `lcp-discovery-insight`, mobile LCP 2.5-3.1 s) | `preload` only adds the `<link>`; Next 16 docs recommend `fetchPriority` | PR #61 | Verify the attribute on the deployed preview |
| D10 | P2 (test infra) | Hosted QA: 7 Import-journey failures on 2026-10-10 ("Producto no disponible") | Fixture campaign `LOCAL QA activo` has a `now()`-relative window with `on conflict do nothing`; QA persists between days so it expired 2 days after the first seed | PR #63: upsert renews `status/opens_at/closes_at` | `qa-target.test.mjs` contract (fails 7/1 without the fix, 8/8 with); hosted QA after `--reset`: 246 passed / 0 failed |
| D11 | P3 | CI ran Node 22 while Vercel Production uses Node 24.x; TypeScript 7 (Dependabot #10) is not installable | Drift; `typescript-eslint` peer `<6.1.0` | PR #60 (CI on Node 24, gates unchanged); PR #59 (`typescript ~6.0.3`, Dependabot ignores `>=6.1.0`) | Both PRs 8/8 green; `npm run check` PASS locally on TS 6.0.3 |

Other scripts reviewed for a silent Production target: `qa-hosted-browser.mjs` (throwaway linked workdir, Production-ref refusal, marker before reset), `load-import-consolidado.mjs` (fixed 10-09), `load-commercial-catalog.mjs`, `prepare-commercial-reconciliation-test.mjs`, `concurrency-customer-conflict-repro.mjs` (Docker-local only), `restore-validate-backup.mjs` (loopback only), `verify-staging-qa-fixtures.mjs` (historical, read-only, fixed ref), `backup-production-db.mjs` (intentional read-only Production dump). Phase `cloudinary-apply` uploads to the single (Production) Cloudinary account by design.

Rejected as non-defects: definer WARNs (documented inventory, each authorized); multiple permissive policies (performance only, low traffic); `ADMIN_BOOTSTRAP_EMAIL` in Preview (read by no runtime path); the 33 Production E2E skips (write journeys + Import two-photo gallery need the disposable database / a published Import product).

## 4. Test evidence (this branch)

| Suite | Result |
| --- | --- |
| `git diff --check` | clean |
| `npm run check` (baseline `6d2ebc4`) | PASS — Vitest 104 files / 1190, node 6 + 4 + 7, lint, typecheck, build |
| `npm run db:gate` (baseline) | PASS — 57 files / 1328 |
| pgTAP 56 alone | before migration 3/6 fail → after 6/6 |
| Local Playwright, fresh stack (`local-admin-browser.mjs --build/--seed`) | **249 passed / 0 failed / 0 skipped** |
| Production read-only Playwright (chromium, mobile, tablet, responsive) | 170 passed / 3 failed (only the new title test, expected until deploy) / 33 skipped (write journeys + Import gallery) |
| `npm audit --omit=dev --audit-level=high` | 0 |
| `npm run audit:dev` | PASS (1 documented exception) |
| PR #58 CI on `0c9a932` (all required checks) | success — Web (Vitest 104/1193, `test:qa-target` 7/7), Database (pgTAP 58/1334), Browser E2E 249 passed, CodeQL, gitleaks, Vercel |
| Preview `dpl_81YwF5bW7wfcNdDHfRS7iWhR7YB7` | READY, `githubCommitSha` = `0c9a932`; titles read through `vercel curl`: `/parfums` "Cruzial Parfums — Decants, frascos y combos", `/import` "Consolidados y catálogo | Cruzial Import", `/import/carrito` "Carrito | Cruzial Import", `/import/checkout` "Solicitud de pedido | Cruzial Import" |
| Final `npm run check` on the branch | PASS — Vitest 104 files / 1193, node 6 + 4 + 7, lint, typecheck, build |
| Final `npm run db:gate` on the branch (fresh local stack, 81 migrations) | PASS — 58 files / 1334 |

## 5. Human actions required (consolidated)

**Authorization**
1. Merge this PR and apply migration `20261010120000` to Production (normal `supabase db push` with exact version, dry-run first). Old-app/new-DB compatible: same signature and jsonb shape; nothing reads the changed counts except readiness.
2. Upgrade Next.js on/after 2026-10-14 when the announced out-of-band security release (2 Critical + 1 High, upstream dependencies) publishes patched versions.
3. Cutover window and opening of indexing (only after the factual items below).

**Legal / business facts (both units)** — legal name, RUC, address, claims email and phone, exchange policy, payment-methods note (`business_legal` is empty).

**Parfums catalog facts** — for each, confirm or archive in Admin: prices of `1-million-lucky`, `by-the-fireplace`, `le-beau-le-parfum`; identity/size of `victory-elixir`, `cedrat-boise-int`; brand/gender of `le-male-le-parfum`. Optional photos: `lovely-cherry`, `royal-blend-sequoia`, `sceptre-malachite`.

**Import** — campaign #8: confirm prices/availability of the 898 offers, photos (844 missing), returns/lead-time/cancellation policies, then open it in Admin. If 2026-10-15 passes first, the site now says "por confirmar".

**Credentials** — WhatsApp Cloud API: access token, app secret, phone number IDs, webhook verify token, approved templates (set in Vercel Production as sensitive; never in chat).

**Owner session checks** (`docs/owner-verification-runbook.md`) — admin MFA, password recovery email, Cloudinary upload in Production.

**Owner settings / cost decisions**
- Vercel: `www.cruzial.pe` -> apex is 307; decide whether it should be 308 (a Production domain change, not made here).
- Supabase Pro (managed backups, leaked-password protection) **or** run the encrypted off-site copy of PR #62 on a schedule the owner controls; pick the destination and retention (proposal in `docs/backup-runbook.md`); a Vercel log drain if longer log retention is needed.
- The GitHub items from the previous pass are DONE (section 7); `master` protection lets the owner bypass (`enforce_admins=false`) for emergencies.

Procedure to apply the migration in Production (prepared, not executed): `docs/migration-apply-20261010120000.md`.

## 6. Follow-up pass (2026-10-10/11) — PR board

| PR | Content | Checks | State |
| --- | --- | --- | --- |
| #58 | Closure audit: readiness migration, opening label, titles, CI hardening, media-script guard, docs | 8/8 | VERIFICADO — merge REQUIERE AUTORIZACIÓN; applying the migration REQUIERE AUTORIZACIÓN |
| #59 | TypeScript ~6.0.3 (supersedes Dependabot #10) | 8/8 | VERIFICADO — close #10 after merge |
| #60 | CI on Node 24 | 8/8 (the jobs run on Node 24) | VERIFICADO |
| #61 | Label-in-name + LCP priority | 8/8 | VERIFICADO locally; PENDIENTE DE VERIFICACIÓN on the deployed preview/Production |
| #62 | Encrypted, verifiable backup file (AES-256-GCM) | 8/8 | VERIFICADO (real dump, throwaway passphrase) |
| #63 | QA fixture windows renew on seed | in progress when written | CORREGIDO; hosted QA 246/0 after reset |

Merge order has no hard dependency. #58, #60 and #62 touch `ci.yml` / `package.json` close to each other (adjacent insertions); resolve by keeping every added step and script. Merging to `master` deploys Production automatically, so each merge is a release decision.

## 7. GitHub, performance, QA — evidence

**GitHub (read back from the API).** Secret scanning `enabled`, push protection `enabled`, Dependabot alerts `enabled`, Dependabot security updates `enabled`; open secret-scanning alerts 0; open Dependabot alerts 0. Branch protection on `master`: PR required (0 approvals, single owner); required checks `Web (lint · typecheck · build · unit)`, `Database (migrations · pgTAP)`, `Browser E2E (public · responsive · MFA admin)`, `Analyze (javascript-typescript)`, `gitleaks` (names read from the CI check runs); force-push and deletion blocked; `enforce_admins=false`. Actions: `sha_pinning_required=true` (all 3 workflows were already pinned by SHA), default token `read`, 0 Actions secrets, fork-PR approval `all_external_contributors`.

Code scanning, 4 open: 2x SHA-1 required by Cloudinary's upload-signature protocol (ACCEPTED P3, owner: engineering, no alternative inside the provider protocol) and 2 in the legacy storefront `assets/app.js` (`innerHTML` built from the first-party static catalog; a `javascript:` filter over own links) — ACCEPTED P3, out of scope, owner: engineering, revisit if the legacy storefront is touched.

**Lighthouse 13.5 against `cruzial.pe` (read-only, mobile emulation / desktop preset, 2026-10-11)**

| Page | Perf m / d | A11y | Best practices | SEO | LCP m / d | TBT m / d | CLS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| /parfums | 91 / 98 | 100 | 100 | 66 | 3.1 s / 0.9 s | 100 / 0 ms | 0 |
| /parfums/catalogo | 90 / 98 | 100 | 100 | 66 | 2.9 s / 0.8 s | 180 / 0 ms | 0 |
| /parfums/productos/212-edt | 93 / 98 | 100 | 100 | 69 | 2.8 s / 0.8 s | 130 / 10 ms | 0 |
| /import | 94 / 97 | 100 | 100 | 66 | 2.5 s / 0.7 s | 120 / 10 ms | 0 |

SEO below 100 is the intentional `noindex` (`is-crawlable`). INP is not measurable in a lab run. Page weight 330-590 KB. bfcache is blocked by `Cache-Control: no-store` on dynamic CSP-nonce pages (not actionable). Remaining mobile opportunities (render-blocking CSS ~150 ms; ~124 KiB of image delivery on the home) are low impact and were not changed.

**Hosted QA (`aqbhtmylqnpahynarnhm`, marker verified, synthetic data only).** The 2026-10-10 run on the #58 code gave 236 passed / 7 failed, all explained by D10 (expired fixture) plus a second pass without `--reset` (now documented). After the fixture fix and `--reset`: **246 passed / 0 failed**. Production was not written to.

**Backups.** The 2026-10-09 dump was re-verified (3/3 SHA-256 OK) and the encrypt + verify tool was validated on it. There is no newer dump: Production has had no business writes since (0 orders, 0 outbox). A fresh dump is required immediately before applying the migration.

**Next.js.** `latest` is 16.4.0 (installed). The announced out-of-band release of 2026-10-14 (2 Critical + 1 High in upstream dependencies) is not published yet. Dependabot security updates are now enabled, so the advisory should open a PR by itself; the upgrade still goes through an isolated branch, Preview and the full gate. PENDIENTE DE VERIFICACIÓN until published; check on or after 2026-10-14.

**Admin screens.** Covered by automated Playwright + axe (MFA/AAL2, unit isolation, mobile overflow). A manual visual review of every admin screen was NOT done in this pass: PENDIENTE DE VERIFICACIÓN.

## 8. Gate closure criteria

- **Technical gate** closes when: this PR's CI is green, the migration is applied to Production with history = repo (81), Production serves the merge SHA, the read-only Production E2E is fully green (title test included), and logs/advisors show no new finding. Known P0/P1/P2 after merge+apply: 0.
- **Business cutover** closes when `public_launch_ready()` returns `true` from real facts (never forced), the owner session checks pass, and indexing is opened by explicit decision.

Status: TECHNICAL PLATFORM COMPLETE pending the PR merges, the migration apply and the post-deploy checks (section 6 board); BUSINESS CUTOVER BLOCKED BY EXTERNAL INPUTS. Not claimed as 100%: the Next.js 2026-10-14 release is unpublished, the deployed version is not yet the approved one, and the owner-session checks have not been run.
