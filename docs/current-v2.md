# CRUZIAL V2 - CURRENT CHECKPOINT

Updated: 2026-09-13

## Scope

Active V2:
- apps/web
- supabase
- scripts

Legacy root storefront is out of scope unless explicitly requested.

Branch:
codex/feature/cruzial-platform-v2

Always derive exact HEAD from:
git rev-parse HEAD

## Architecture

Next.js 16 + strict TypeScript
Supabase/PostgreSQL + RLS
pgTAP
Vitest
Cloudinary
Vercel Preview

Business units:
- Cruzial Parfums
- Cruzial Import

Shared auth/infrastructure.
Separate catalog/business rules/carts/orders/settings.

## Current gate

4J5F - CLOSED

Hosted evidence completed:
- Preview -> Supabase staging (iyxidhglyqkzoziyewlc) runtime binding
- Supabase Auth Site URL/callback
- authenticated hard refresh / logout / re-login
- logged-out protected route redirect (/admin/import -> /admin/login)
- zero-membership boundary ("Sin unidades asignadas")
- Parfums/viewer read-only boundary
- cross-business denial without Import membership (direct /admin/import redirected)
- dual-admin hosted access (Parfums ADMINISTRADOR + Import ADMINISTRADOR)
- Import readiness: staging-qa-import-ready (0 blockers), staging-qa-import-no-media
  (missing_primary_media only), staging-qa-import-no-offer (missing_offer only)
- hosted stale-write P2011 (see below) and fixture restored after P2011
- final automated gate green (counts below)

Hosted P2011 fixture note: the three [STAGING QA] Import fixtures
(Import Ready / Sin Media / Sin Oferta) have no categoryId, and the Import
product editor requires categoryId client- and server-side to save at all
(see Deferred defects). P2011 was therefore proven against a Parfums
synthetic fixture instead — staging-qa-publishable
([STAGING QA] Parfums Mapper Ready) — which uses the same
expected_updated_at / 40001-conflict contract
(apps/web/src/domains/admin-parfums/products-repository.ts:91-97).
Scenario: TAB B renamed to "[STAGING QA] P2011 T2" -> saved OK; TAB A (stale,
unrefreshed) renamed to "[STAGING QA] P2011 T1-STALE" -> saved and rejected
with "Esto fue modificado por otra sesión. Recarga la página antes de
continuar." (POST returned 200, no 5xx/504/hang/retry/partial mutation).
Refreshed TAB A showed authoritative "[STAGING QA] P2011 T2". Fixture Name
restored to exactly "[STAGING QA] Parfums Mapper Ready"; mapper-ready
condition (1 variant, 1 principal media, categories) unchanged.

Deferred defects (not fixed this gate):
1. Import QA products without categoryId satisfy readiness semantics but
   cannot be re-saved through the standard Import product editor (client
   `required` at apps/web/src/app/admin/import/productos/import-product-editor.tsx:16
   plus server validation at apps/web/src/domains/admin-import/catalog-schema.ts:99).
   Affects staging-qa-import-ready, -no-media, -no-offer.
2. (P2, known) old /admin footer copy says modules are pending.

4J5G-A - CLOSED

E2E harness: Playwright (none existed; introduced minimal, Chromium-only,
apps/web/playwright.config.ts + apps/web/e2e/, baseURL via E2E_BASE_URL env,
trace/screenshot retained on failure only).

Ran once against hosted staging Preview
(https://cruzial-platform-v2-8pi4yyvrm-cruzial.vercel.app):
- Public hub/navigation: PASS
- Parfums public critical journey: PASS (catalog -> add product -> checkout
  reached with populated cart/total; form left unsubmitted to avoid
  persisting an order request)
- Logged-out Admin protection (/admin/parfums, /admin/import ->
  /admin/login, no loop, no protected content): PASS

Test count: 5 (4 journeys; admin-protection parametrized over 2 routes) —
5 passed, 0 failed.

4J5G-A3 - CLOSED (follow-up on Import public journey)

4J5G-A2 diagnosed the empty-catalog state above as a staging fixture gap
(campaign 9002, "[STAGING QA] Open", had zero campaign_products rows), not
an application defect. Fixed by extending provisioning with one
deterministic public QA offer:
supabase/provisioning/staging-qa-fixtures-campaign-9002-link.sql links the
existing staging-qa-import-ready product/presentation to campaign 9002
(idempotent upsert, exact id md5('4J5G-A3/offer/staging-qa-import-ready-9002')).
Cleanup added to staging-qa-fixtures-cleanup.sql by exact id (no wildcard).
Verified read-only in scripts/verify-staging-qa-fixtures.mjs: campaign 9002
has exactly one QA offer, its product is staging-qa-import-ready, and
campaign #6's own QA offer for the same product is unchanged (900 rows,
same id/price/availability).

Import public critical journey (apps/web/e2e/import-public-journey.spec.ts)
re-run against the same hosted Preview now exercises the full branch:
campaign -> public QA product catalog -> add to cart -> cart populated with
price -> checkout reached with the same total -> stopped before submit (no
order persisted, no WhatsApp trigger). Test count: 1, 1 passed, 0 failed
(no early-return annotation, confirming the deep branch ran, not the
closed/empty-catalog fallback).

Next gate:
4J5G-B - authenticated Admin E2E (NOT STARTED)

## Last known automated gate

pgTAP:
27 files / 759 assertions PASS

Vitest:
55 files / 528 tests PASS

Lint:
0 errors / warnings

TypeScript:
strict PASS

Production build:
PASS

## Current evidence gaps

None outstanding for 4J5F. See Deferred defects above for the categoryId
Import-editor gap carried into 4J5G.

## Important rules

- Never touch production.
- Never modify master before explicit cutover.
- Never weaken RLS/auth.
- Migrations already applied to staging are append-only.
- Never invent client prices, stock or commercial decisions.
- Never touch client PNG/PDF assets in bulk.
- Explicit git staging only.
- Never use git add -A.
- Preserve unrelated user changes.

## Historical information

Do NOT read docs/progress-v2.md by default.

For historical evidence:
1. search exact heading/term with rg;
2. read only matching range;
3. use Git history when possible.
