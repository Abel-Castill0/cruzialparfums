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
| CI/CD | F + A | D4. Repo is public with secret scanning/push protection off and `master` unprotected (A). |
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
- GitHub: enable secret scanning + push protection (free for public repos), Dependabot security updates, and branch protection on `master` requiring CI.
- Vercel: set `www.cruzial.pe` → apex redirect to 308.
- Supabase Pro (managed backups, leaked-password protection) or an encrypted off-site backup schedule; Vercel log drain if longer log retention is needed.

## 6. Gate closure criteria

- **Technical gate** closes when: this PR's CI is green, the migration is applied to Production with history = repo (81), Production serves the merge SHA, the read-only Production E2E is fully green (title test included), and logs/advisors show no new finding. Known P0/P1/P2 after merge+apply: 0.
- **Business cutover** closes when `public_launch_ready()` returns `true` from real facts (never forced), the owner session checks pass, and indexing is opened by explicit decision.

Status today: TECHNICAL PLATFORM COMPLETE pending merge + migration apply; BUSINESS CUTOVER BLOCKED BY EXTERNAL INPUTS.
