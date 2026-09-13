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

4J5G-B - CLOSED (authenticated Admin critical E2E)

Auth bootstrap: local, gitignored Playwright storageState
(apps/web/e2e/.auth/staging-admin.json, reuses the existing gitignored
e2e/.auth/ convention) captured via one manual operator login
(`npx playwright codegen --save-storage=... /admin/login`, staging QA
identity configuser@gmail.com, memberships parfums/admin + import/admin).
Claude never saw, requested, or stored the password; the local file was
deleted after this gate and was never staged/committed.

Added apps/web/e2e/admin-authenticated.spec.ts (4 tests, storageState reused,
no membership mutation, no writes):
- Admin shell: /admin loads authenticated (no /admin/login redirect), both
  Cruzial Parfums and Cruzial Import units visible for the dual-admin member.
- Parfums admin: /admin/parfums/productos?q=staging-qa-publishable opens the
  existing [STAGING QA] product detail page authenticated.
- Import admin: /admin/import/publicacion readiness reflects deterministic
  QA fixtures — staging-qa-import-ready has 0 blockers,
  staging-qa-import-no-media shows exactly "Sin imagen principal"
  (missing_primary_media), staging-qa-import-no-offer shows exactly
  "Sin oferta en consolidado" (missing_offer).
- Session continuity: /admin -> Parfums -> Import -> reload stays
  authenticated, no unexpected /admin/login redirect.

Cross-business boundary (zero membership / Parfums-viewer / no Import
membership) was proven manually in 4J5F and is not reproduced here by
mutating DB state; this suite covers dual-admin runtime regression only.

Full 4J5G Playwright suite ran once against hosted Preview
(https://cruzial-platform-v2-8pi4yyvrm-cruzial.vercel.app): 9 total, 9
passed, 0 failed (public hub, Parfums public journey, Import public
journey, logged-out admin protection x2, + the 4 authenticated tests
above).

P0/P1 defects: none.
Deferred P2/P3 (unchanged, not addressed in this gate): Import
ingestion/categoryId contract mismatch (P2, 0/844 non-QA products
affected); stale /admin footer copy.

Next gate:
4K - Parfums commercial-data closure (4K-A3 done, 4K-B1 done, 4K-B2A done, 4K-B2B NOT STARTED)

## 4K-A3 — official 2026 PDF reconciliation (read-only)

Client instruction 2026-09-13: "Guíate del PDF, ese está actualizado." The
2026 catalog PDF (docs/client-source/CATALOGO DE DECANTS.pdf, untracked) is
current commercial authority for Parfums decant prices, combo
composition/prices and discontinued labeling. It has NO full-bottle prices.

Independently parsed (not copied from an earlier session's claims) and
reconciled against supabase/staging/legacy-catalog-staging.json. Full
evidence: supabase/staging/pdf-2026-commercial-reconciliation.json.

- 96 PDF products / 288 decant rows vs 96 V2 staged products: 95 matched,
  0 ambiguous.
- PDF-only: Le Male Le Parfum (24/32/51). V2-only: Invictus Elixir.
- Only 2 of 288 rows actually differ: Sauvage EDT and Dylan Blue have their
  price-template constants swapped in assets/data.js:474-475 (copy/paste
  bug, not a real 2026 price change). Official: Sauvage EDT 30/38/69,
  Dylan Blue 22/30/48.
- DESCONTINUADO (Lovely Cherry, Bright Peach, Ultra Male) clarified:
  manufacturer no longer makes it; Cruzial's remaining stock stays
  sellable. discontinued != archived != out_of_stock != hidden. Already
  modeled correctly (production_status='discontinued',
  availability_status='available'); no mutation needed for this fact
  alone.
- BIR Intense is active/current/priced (26/34/56) in the PDF. The 2026-09-06
  CLIENT_CONFIRMED_HIDDEN decision (out-of-stock basis) is superseded by
  the newer PDF instruction — recorded, not yet flipped in code/data.
- Combos confirmed by rendering PDF page 5 and reading bottle labels
  (no member list exists as text): Cuarteto Oriental = Khamrah Qahwa /
  Clásico / Waha / Dukhan (40/55/89, high confidence); Vainilla Freak =
  Yara Pink / Yara Candy / Eclaire (27/39/65, medium-high — Yara variants
  not individually legible); Set Tulum = Odyssey Aqua / Hawas Tropical /
  Supremacy Collection (31/42/71, high confidence).
- No DB writes, no publication, no code/data mutation performed by this
  gate.

Remaining before 4K-B can apply any of this: extend
scripts/commercial-reconciliation.mjs (no mechanism today to promote a
variant's price_verification_status, or to emit publication_status
'archived' for a legacy product); fix the assets/data.js price swap; add
Le Male Le Parfum; unhide bir-intense; unblock the 3 combo staging
entries. See the artifact's `remaining_unresolved_before_4k_b`.

## 4K-B1 — commercial authority reconciliation infrastructure (no data applied)

Infrastructure only. No PDF prices/products applied, no product unhidden,
no product archived, no combo populated. That is 4K-B2.

Semantic distinction now modeled explicitly (previously undistinguished for
prices, and value-vs-evidence conflated for lifecycle):

- **legacy** — parity-only, unverified, never promoted (unchanged).
- **provisional_market** — new. An operator-approved, temporary researched
  price. Cannot equal and does not satisfy `official_pdf` or
  `client_confirmed`; always blocked from publish
  (`PROVISIONAL_MARKET_PRICE_REQUIRES_COMMERCIAL_APPROVAL`); excluded from
  `summary.confirmed_price_variants`.
- **official_pdf** — a documented current official-source value (unchanged
  meaning, now actually assignable to a variant).
- **client_confirmed** — explicit client confirmation (unchanged meaning,
  now actually assignable to a variant); highest authority.

New generic mechanisms in scripts/commercial-reconciliation.mjs (all empty
by default; see supabase/migrations/20260913010000_commercial_authority_extensions.sql
for the matching `provisional_market` DB check-constraint value):

- `VARIANT_PRICE_OVERRIDES` — product identity (legacy_id, or slug for a
  supplemental product) + variant kind/size -> authoritative price +
  verification status + evidence. Deterministic, keyed lookup; a duplicate
  or conflicting entry throws at build time instead of one silently
  winning; an override cannot assert `legacy` authority.
- `PRODUCT_LIFECYCLE_OVERRIDES` — product identity -> an actual
  `publication_status` value (draft/published/hidden/archived) with
  evidence, superseding the value FIELD_OVERRIDES could only annotate,
  not change. This is the "no longer belongs to the current official
  catalog" (archived) and "supersede a prior hidden decision" mechanism —
  generic and source-driven, with no per-product name check anywhere in
  the code. Preserves the row (no delete).
- `SUPPLEMENTAL_PRODUCTS` — a product the current official source carries
  that legacy never did. Maps through the same `reconcileProduct`
  pipeline with `legacy_id: null` (identity is the slug); unresolved
  fields stay null with `UNKNOWN` field_provenance rather than being
  invented; `verification_status` starts `unknown`, not `legacy`.

Verified backward-compatible: with all three collections empty, reconciliation
output is byte-identical to pre-B1 (`--check` passes unchanged: 96 products,
312 variants, 0 conflicts; also asserted in
apps/web/src/lib/catalog/commercial-reconciliation.test.ts).

Combo model (Part G): inspected only, unchanged. `public.combos` /
`public.combo_items` already support member composition (via
`combo_items.product_variant_id`), per-member size (via the referenced
variant's `size_ml`), combo price (via the combo's own product/variant row),
and official-source provenance (`combos.composition_verification_status`
already allows `client_confirmed`; a combo's own price would use the same
`VARIANT_PRICE_OVERRIDES` mechanism once a combo has a real product row).
No combo-specific change needed.

Field-level overrides (Part F): confirmed sufficient for what B2 needs.
`FIELD_OVERRIDES` documents evidence for values already correct in
assets/data.js; `PRODUCT_LIFECYCLE_OVERRIDES` (new) is what actually flips
BIR Intense's `publication_status` away from `hidden` in B2; discontinued
vs. available is already modeled as independent axes (no change needed).

Tests: 10 new (apps/web/src/lib/catalog/commercial-reconciliation.test.ts),
22 total in that file, all passing. Targeted vitest run only; full
`db:test`/`check` gate not run (schema change is a single narrow, additive
check-constraint value; no functional migration risk).

Next:
4K-B2 — apply verified PDF commercial truth (populate the overrides above,
fix the Sauvage/Dylan price swap, add Le Male Le Parfum, unhide BIR Intense,
archive Invictus Elixir, populate the 3 combos).

## 4K-B2A — apply official PDF Parfums truth (CLOSED)

Populated the 4K-B1 mechanisms from the persisted 4K-A3/4K-A3.1 artifact
(supabase/staging/pdf-2026-commercial-reconciliation.json). Full-bottle
prices (24 variants) are explicitly untouched — 4K-B2B, not started.

- `VARIANT_PRICE_OVERRIDES` is now built by one small deterministic
  function (`officialPdfDecantVariantPriceOverrides`) over
  `product_reconciliation`'s 95 matched products x 3 sizes = 285 decant
  rows, not hand-written. Every one gets `price_verification_status:
  "official_pdf"` at the PDF's own value: 279 rows keep their existing
  number, 6 rows (Sauvage EDT + Dylan Blue) get the corrected number.
  `summary.confirmed_price_variants` = 288 (285 + Le Male's 3).
- assets/data.js:474-475 — the actual copy/paste bug fixed at the source:
  Sauvage EDT now uses the 30/38/69 template, Dylan Blue the 22/30/48
  template (both were swapped). Both legacy-catalog-staging.json and the
  commercial reconciliation artifact were regenerated and are `--check`
  clean.
- Le Male Le Parfum added via `SUPPLEMENTAL_PRODUCTS` (slug
  `le-male-le-parfum`, `legacy_id: null`): 3 decant rows at
  S/24 · S/32 · S/51, `official_pdf`. Brand/gender/concentration/notes/
  bestseller/bottle price/media all stay null/UNKNOWN — none of it is
  evidenced by the persisted PDF reconciliation, so none of it is invented
  (`publish_eligibility: NOT_READY`, as expected for a supplemental with
  missing metadata/media).
- Invictus Elixir — `PRODUCT_LIFECYCLE_OVERRIDES` sets
  `publication_status: "archived"` (row/history preserved, not deleted).
  Its existing decant prices are deliberately excluded from
  `VARIANT_PRICE_OVERRIDES` and stay `legacy` — never reinterpreted as
  official_pdf, since the PDF is silent on this product.
- BIR Intense — `PRODUCT_LIFECYCLE_OVERRIDES` sets `publication_status:
  "draft"` (not `hidden`, not `published`). The 2026-09-06
  CLIENT_CONFIRMED no-stock hidden decision is superseded, not deleted:
  assets/data.js:472's `hidden: true` and its inline comment are left
  untouched as history; only what commercial authority computes changed.
  Its decant prices (26/34/56) now carry `official_pdf` via the same
  generic mapping as every other matched product.
- Discontinued products (Lovely Cherry, Bright Peach, Ultra Male): no
  mutation needed for the discontinued-but-available semantic (already
  correct); their decant prices now carry `official_pdf` like everything
  else in the matched set. Still `DISCONTINUED_AVAILABLE_PRESERVED_INDEPENDENTLY`,
  never archived/hidden/out_of_stock from this alone.
- Combos — composition is data the client already had right in
  assets/data.js (`CRUZIAL_COMBO_CONTENTS` member lists and the 3 combo
  products' own decant prices already matched the PDF exactly). Added
  `officialPdfMembers` on each combo product in assets/data.js (data, not
  logic) so etl-legacy-catalog.mjs's existing combo-blocking branch reports
  `composition_verification_status: "official_pdf"` /
  `source_state: "OFFICIAL_PDF_CONFIRMED"` plus the member legacy_ids and
  decant price array, instead of the generic
  `CLIENT_PROVIDED_PENDING_RECONFIRMATION` a combo without that field still
  gets. Combos stay `migration_status: "BLOCKED"` (no combo product row
  exists yet — readiness is not weakened just to force a publish state).
- Bottle prices: untouched, still `legacy`, `confirmed_bottle_price_variants`
  stays 0 (verified in a dedicated test) — explicitly 4K-B2B.

Regenerated artifacts: supabase/staging/legacy-catalog-staging.json (2
products updated: sauvage-edt, dylan-blue), supabase/staging/commercial-reconciliation.json
(97 products, 315 variants, 3 blocked, 0 conflicts),
apps/web/src/fixtures/generated/legacy-catalog.json. All three `--check`
clean.

Tests: apps/web/src/lib/catalog/commercial-reconciliation.test.ts — 33
total (was 22), all passing. New "4K-B2A official PDF commercial authority
applied" describe block asserts each of: an unchanged official-PDF price
gets `official_pdf` status; Sauvage/Dylan corrections; Le Male's 3 prices
and un-fabricated fields; Invictus archived-not-deleted with its price
never reinterpreted; BIR Intense no longer hidden; discontinued products
stay available; combo composition/price representation; bottle prices
never promoted; and no duplicate `VARIANT_PRICE_OVERRIDES` keys. The
generic-mechanism tests above that block were updated so a synthetic
fixture is isolated from the real (now populated) default overrides.

No DB writes. No Supabase migration applied in this gate (4K-B1's migration
was already introduced and is unrelated to this gate's data-only changes).
No publication. `docs/client-decisions.md`'s `bir-intense` row updated to
reflect the supersession.

Next gate:
4K-B2B — full-bottle price commercial approval (24 bottle variants;
explicitly out of scope for 4K-B2A). NOT STARTED.

## Last known automated gate

pgTAP:
27 files / 759 assertions PASS

Vitest:
55 files / 549 tests PASS

Lint:
0 errors / warnings

TypeScript:
strict PASS

Production build:
PASS

## 4K-B2A.1 — Playwright/Vitest isolation (CLOSED)

Playwright E2E specs (`apps/web/e2e/**`) and Vitest unit tests are now
isolated: added `apps/web/vitest.config.mts` (default excludes + `e2e/**`).
`npm run test` runs Vitest only (55 files / 549 tests PASS); `npm run
test:e2e -- --list` collects the existing 9-test/5-file Playwright suite
unaffected. Fixed `apps/web/playwright.config.ts` `exactOptionalPropertyTypes`
typecheck failure by omitting `webServer` via object spread instead of
assigning it `undefined`.

`npm run check` still aborts at `commercial:check` (stale reconciliation
artifact) — confirmed pre-existing at HEAD c010631, unrelated to this gate,
out of scope for 4K-B2A.1. All other gate steps (catalog:check, test:4j4b,
lint, typecheck, test, build) verified PASS individually.

## 4K-B2A.2 — commercial artifact refresh (CLOSED)

4K-B2A final validation restored: commercial artifact regenerated from final
authoritative inputs (staleness was only the `docs/client-decisions.md`
fingerprint recorded before its later update) and global `npm run check`
PASS.

## 4K-B2B.1 — bottle identity/size audit + readiness contract (CLOSED)

Verified identity + bottle size for all 24 legacy bottle price variants
(supabase/staging/commercial-reconciliation.json, legacy_bottle_price_variants
= 24) against client photos (img/perfumes/) and official brand sources. No
Peru price research, no provisional_market writes, no price mutation.

- Identity: 22 IDENTITY_CONFIRMED, 2 IDENTITY_CONFLICT (bir-intense,
  victory-elixir), 0 unverified.
- Size: 19 SIZE_CONFIRMED, 5 SIZE_CONFLICT (adg-profondo-edp, bir-intense,
  cedrat-boise-int, le-beau-le-parfum, m-red-tobacco), 0 unverified.
- bir-intense: brand/line confirmed as Burberry Brit Intense via client
  photography (PDF label "BIR Intense" alone is an abbreviation, decoded from
  an overlapping text layer, not a full-name confirmation); exact ml/EDT-vs-
  EDP not independently confirmable — product is discontinued, no live
  official page. Left unresolved.
- Gate-flagged size candidates confirmed conflicting as instructed: Cedrat
  Boise Intense (repo 100 ml vs. official 60/120 ml), Red Tobacco (repo 100 ml
  vs. official 60/120 ml), Le Beau Le Parfum (repo 100 ml vs. official
  75/125 ml). All left unresolved — no price mutation this gate.
- victory-elixir: official commercial name is "Invictus Victory Elixir"
  (repo omits "Invictus"); official concentration is Parfum, repo says EDP.
  Cross-referenced against the separately-archived "invictus-elixir" legacy
  row (decants only, no bottle) — confirmed as a distinct superseded
  duplicate, not to be merged with victory-elixir.
- Also noted (not identity/size, no mutation): concentration-field mismatches
  on by-the-fireplace, cdn-intense-man, dylan-blue, le-male-elixir (repo says
  EDP, official concentration differs) — flagged for a future data-quality
  pass.
- Readiness contract locked: variant-level publish_eligibility/blockers are
  authoritative for that variant's commercial readiness; product-level
  `blockers` stays an audit rollup only, never a storefront visibility gate.
  No schema change — documented + covered by 6 new focused tests in
  apps/web/src/lib/catalog/commercial-reconciliation.test.ts ("4K-B2B.1
  variant-aware readiness contract"). 4K2 storefront/read-model code must use
  variant-level readiness when gating variant visibility.
- Audit artifact: supabase/staging/bottle-identity-audit.json (all 24
  entries, no market prices).
- npm run commercial:check: byte-stable. npm run check: PASS (555 tests, 0
  TS errors, build OK).
- Next: 4K-B2B.2A (Peru market price research) — NOT STARTED.

## 4K-B2B.1A — bottle identity audit correction (CLOSED)

Corrected factual errors/incompleteness in the 4K-B2B.1 audit before any
market-price research. Audit factual correction only — no Peru research, no
provisional_market writes.

- adg-profondo-edp: 100 ml is SIZE_CONFIRMED (was wrongly SIZE_CONFLICT).
  Current official Armani Beauty sells Acqua di Giò Profondo EDP in 30/50/100
  ml refillable flacon sizes. No mutation needed — repo was already correct.
- Proven concentration corrections applied to assets/data.js (source), then
  regenerated legacy-catalog-staging.json / commercial-reconciliation.json /
  apps/web/src/fixtures/generated/legacy-catalog.json — concentration text
  only, zero price changes: dylan-blue EDP→EDT, by-the-fireplace EDP→EDT,
  le-male-elixir EDP→Parfum. le-beau-le-parfum's "Eau de Parfum Intense"
  label kept as EDP (closest truthful existing term; no enum widened).
- cdn-intense-man: bottle photo (rectangular black glass + medallion pendant)
  uniquely identifies the flagship EDT release; 105 ml is only sold as EDT
  officially (EDP variant is 200 ml). High-confidence finding recorded in the
  audit; source NOT mutated (outside this gate's explicit correction list).
- Real size conflicts preserved, not guessed: cedrat-boise-int and
  m-red-tobacco client photos are legible ("120 ML" printed on the label) —
  target size RESOLVED at 120 ml via client photo (not "pick the larger
  size"), but the assets/data.js size key is left unmutated because it's
  coupled to an un-researched legacy price; deferred to B2B.2A/B.
  le-beau-le-parfum and bir-intense stay TARGET_SIZE_UNRESOLVED — no legible
  volume text on any client photo, no size invented.
- victory-elixir: identity/concentration conflict preserved (client photo
  confirms bottle art only, no legible label text) — not corrected.
- bir-intense: identity stays client_photo_confirmed (medium confidence),
  explicitly NOT labeled official-brand authority (product discontinued).
  Size/concentration unresolved.
- Corrected counts: identity 23 confirmed / 1 conflict (was miscounted as
  22/2 in 4K-B2B.1 — bir-intense was always IDENTITY_CONFIRMED, only
  victory-elixir is IDENTITY_CONFLICT); size 20 confirmed / 4 conflict
  (adg-profondo-edp, bir-intense, cedrat-boise-int, le-beau-le-parfum,
  m-red-tobacco minus adg-profondo-edp's reclassification); new
  concentration dimension added: 21 confirmed / 2 conflict
  (cedrat-boise-int, victory-elixir) / 1 unverified (bir-intense).
- Zero price mutation anywhere; 288 confirmed_price_variants, 24
  legacy_bottle_price_variants, 0 conflicts, 97/315/3 all unchanged from B2A.
- npm run commercial:check: byte-stable. npm run check: PASS (563 tests, 0
  TS errors, build OK). git diff --check: clean (local core.whitespace
  cr-at-eol set; no file normalized).
- Next: 4K-B2B.2A (Peru market price research) only after exact research
  targets (resolved sizes) are safe to use — NOT STARTED.

### 4K-B2B.2A — Peru Market Research Batch A (8 bottle variants) — CLOSED

- Researched exactly 8 Batch A bottles (Peru, 2026-09-13; evidence in
  supabase/staging/bottle-market-research.json): 1-million-lucky, 9pm,
  adg-profondo-edp, asad-elixir, b-man-in-black, by-the-fireplace,
  dylan-blue, eros-edt. All 8 reverified against bottle-identity-audit.json
  (IDENTITY/SIZE/CONCENTRATION_CONFIRMED, 100 ml) before pricing; no
  mismatched-flanker/concentration/size listing accepted.
- HIGH: 2 (dylan-blue, eros-edt — 2 Tier2 department-store-direct sources in
  exact agreement, S/375). MEDIUM: 4 (9pm S/206, adg-profondo-edp S/329,
  asad-elixir S/168, b-man-in-black S/535). LOW/unresolved: 2
  (1-million-lucky — only 1 credible source; by-the-fireplace — no valid
  Peru listing at the exact EDT 100 ml target after rejecting an EDP
  mismatch and an out-of-stock ghost price). Both LOW items stay legacy,
  untouched.
- provisional_market bottle overrides applied: 6 (via VARIANT_PRICE_OVERRIDES
  in scripts/commercial-reconciliation.mjs, bottle-only, size_ml=100).
  Remaining legacy bottle variants: 18 (was 24). 288 official_pdf decant
  variants untouched. Added `provisional_market_bottle_price_variants` to
  the reconciliation summary; added `MARKET_RESEARCH` to PROVENANCE_VALUES.
- No research anomalies beyond the two LOW/unresolved items above and one
  borderline price spread (9pm, 38.2%, documented and kept at MEDIUM rather
  than excluded — marketplace-vs-specialist-store gap, not a stale listing).
- Admin editability (Part J): `admin_update_variant`
  (supabase/migrations/20260908000435_admin_parfums_product_mutations.sql)
  does NOT accept/update `price_verification_status` — only price_amount,
  label, kind, size, currency, sku, publication_status, sort_order. An
  operator cannot transition a bottle price provisional_market ->
  client_confirmed through the existing admin RPC/UI without a schema/RPC
  change; missing capability is a `p_price_verification_status` parameter
  on `admin_update_variant` (no variant duplication needed once added).
- 10 new focused Vitest tests added (describe "4K-B2B.2A Batch A Peru
  market price research", apps/web/src/lib/catalog/commercial-reconciliation.test.ts)
  plus 5 pre-existing tests updated for the new 18/6 legacy/provisional
  split. npm run commercial:check: byte-stable. npm run check: PASS.
- docs/client-decisions.md note: operator authorized temporary
  market-reference bottle prices pending client review.
- Next: 4K-B2B.2B (remaining Batch B bottle variants) — NOT STARTED.

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
