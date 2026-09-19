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

### 4K-B2B.2A.1 — Admin explicit price confirmation (CLOSED)

- Closed the Admin gap 4K-B2B.2A found: `admin_update_variant` now takes an
  explicit `p_confirm_client_price boolean default false`
  (supabase/migrations/20260913020000_admin_variant_price_confirmation.sql).
  The old 10-arg signature was dropped first (not just `create or replace`)
  so exactly one callable `admin_update_variant` contract exists — no
  PostgREST overload ambiguity.
- Numeric price edit alone never implies confirmation: unless the operator
  explicitly passes `p_confirm_client_price => true`, the existing
  `price_verification_status` (including `provisional_market`) is preserved
  exactly. When confirmed, the same variant row transitions to
  `client_confirmed` — no duplication.
- `official_pdf` cannot be produced or downgraded through this RPC: it
  raises `22023` if a confirmation is attempted on a variant already
  `official_pdf`. Viewers get `42501`; a stale `p_expected_updated_at` still
  gets `P2011`, confirmation flag or not. The transition is audited under
  the existing `verification_update` action (same action
  `admin_update_combo_verification` already uses), before/after captured
  via `app.write_audit_log` — no second audit subsystem.
- Admin UI (variant-row.tsx): a `provisional_market` variant shows a
  "Precio referencial" badge and an explicit "Precio confirmado por el
  cliente" checkbox, not a generic status dropdown. The DB stays
  authoritative regardless of UI state.
- Reconciliation-vs-operational-truth (Part H): `app.apply_parfums_commercial_import`
  (supabase/migrations/20260908140000_controlled_commercial_import.sql)
  is insert-only per variant (`if not exists ... insert`) — it never UPDATEs
  an existing variant row, so a later Admin `client_confirmed` edit in
  Supabase can never be overwritten by re-running the reconciliation
  loader. No blocker for 4K-C/4K2 found here.
- 14 new pgTAP tests added to supabase/tests/05_admin_product_mutations.sql
  (plan 28 -> 42) plus 2 new Vitest tests in
  apps/web/src/domains/admin-parfums/product-schema.test.ts (573 -> 575).
  All local pgTAP suites re-run clean against the local Supabase DB (only
  pre-existing, unrelated 28_4j5d_correction_gate.sql errors — missing
  `create extension pgtap`, not touched here). npm run commercial:check:
  byte-stable. npm run check: PASS. Migration applied locally only, not to
  hosted staging (4K-C will handle controlled staging application).
- Next: 4K-B2B.2B (remaining Batch B bottle variants) — NOT STARTED.

### 4K-B2B.2B — Peru Market Research Batch B (8 bottle variants) — CLOSED

- Canonical `npm run db:test` re-run clean before research began (773 tests,
  27 files, PASS) — no DB regression, proceeded per Section 1 of the gate.
- Researched exactly 8 Batch B bottles (Peru, 2026-09-13; evidence appended
  to supabase/staging/bottle-market-research.json, `batch: "B"`): erba-pura
  (50 ml and 100 ml — two distinct bottle-price variants of the same
  legacy_id), hawas-ice, khamrah-clasico, le-male-elixir, liquid-brun,
  sauvage-edt, spicebomb-extreme. All reverified against
  bottle-identity-audit.json (IDENTITY/SIZE/CONCENTRATION_CONFIRMED) before
  pricing; rejected wrong-flanker listings (Khamrah Qahwa/Dukhan, Le Male
  Elixir mislabel resolved via product-URL match) and out-of-stock ghost
  prices.
- HIGH: 1 (erba-pura 100 ml — 4 credible sources, S/919). MEDIUM: 4
  (erba-pura 50 ml S/667, hawas-ice S/200, le-male-elixir 75 ml S/464,
  sauvage-edt S/414). LOW/unresolved: 3 (khamrah-clasico — Ripley/Falabella
  price snippets ambiguous/unconfirmable; liquid-brun — no usable point
  price found; spicebomb-extreme — only 1 credible primary source, Oechsle
  out of stock, MercadoLibre Tier4-only). All 3 LOW items stay legacy,
  untouched.
- provisional_market bottle overrides applied: 5 new (via the existing
  generic `VARIANT_PRICE_OVERRIDES` mechanism — no code path change beyond
  an evidence-text fix crediting the correct batch/gate per entry).
  Batch A's 6 provisional_market values are unchanged. Total
  provisional_market bottles after A+B: 11 (was 6). Remaining legacy bottle
  variants: 13 (was 18, of 24 total). 288 official_pdf decant variants
  untouched. Erba Pura's 50 ml and 100 ml confirmed to key/apply
  independently (distinct size_ml, distinct prices, never merged).
- 11 new focused Vitest tests added (describe "4K-B2B.2B Batch B Peru
  market price research", apps/web/src/lib/catalog/commercial-reconciliation.test.ts)
  plus 5 pre-existing tests updated for the new 13/11 legacy/provisional
  split (575 -> 586). npm run commercial:check: byte-stable
  (products: 97, variants: 315, blocked: 3, conflicts: 0). npm run check:
  PASS (typecheck, lint, build all green).
- Explicit Admin client-confirmation workflow (4K-B2B.2A.1) verified still
  intact for a Batch B provisional_market row (sauvage-edt 100 ml): exactly
  one override key, no duplication; RPC itself not touched.
- Next: 4K-B2B.2C (further bottle batches, if any remain) — NOT STARTED.

### 4K-B2B.2C — Peru Market Research Batch C / Final Resolvable Bottle Batch — CLOSED

- Canonical `npm run db:test` re-run clean before research began (773 tests,
  27 files, PASS) — no DB regression, proceeded per Section 1 of the gate.
- Pre-research metadata corrections (assets/data.js, recorded in
  bottle-identity-audit.json `source_corrections_applied_in_4K_B2B_2C`):
  cdn-intense-man concentration EDP -> EDT (armaf.com: the 105 ml bottle is
  EDT, EDP variant is 200 ml); cedrat-boise-int and m-red-tobacco bottle-size
  key 100 -> 120 ml (client photo legibly reads 120 ML for both; no
  historical/order dependency found on the 100 ml key in local DB). The
  pre-existing 820/850 PEN legacy numbers stayed attached to the corrected
  keys as inert history only — never reinterpreted as verified 120 ml
  prices.
- Researched exactly 8 Batch C targets (Peru, 2026-09-13; evidence appended
  to supabase/staging/bottle-market-research.json, `batch: "C"`, 5 new
  entries): cdn-intense-man, cedrat-boise-int, m-red-tobacco, tmw-parfum,
  ultra-male, plus 3 prior-LOW upgrade attempts (in place, prior evidence
  preserved): 1-million-lucky, by-the-fireplace, spicebomb-extreme. Rejected
  wrong-flanker listings (plain Cedrat Boise instead of Intense, mismatched
  concentration/out-of-stock/internally-inconsistent Ripley Spicebomb
  Extreme listing) and confirmed "Le Male Ultra" is JPG's current retail
  name for the Ultra Male line, not the base Le Male (not an identity trap).
- HIGH: 1 (tmw-parfum — 3 sources in exact agreement, S/407). MEDIUM: 5
  (cdn-intense-man S/207, cedrat-boise-int S/614, m-red-tobacco S/609,
  ultra-male S/509, spicebomb-extreme S/598). LOW/unresolved: 2
  (1-million-lucky — re-search found no qualifying second Peru source;
  by-the-fireplace — re-search found no Peru retailer carrying the exact
  EDT/100ml REPLICA target). Both stay legacy, untouched.
- Prior LOW upgrade: spicebomb-extreme LOW -> MEDIUM (new Oechsle
  marketplace observation, S/599, in near-exact agreement with the existing
  Falabella observation, S/596.90); prior LOW evidence preserved in the
  artifact (`prior_confidence: "LOW"`). 1-million-lucky and by-the-fireplace
  remain LOW; their prior evidence and this gate's additional search
  attempts are both recorded, no forced override.
- provisional_market bottle overrides applied: 6 new (5 new Batch C targets
  + the spicebomb-extreme upgrade), via the existing generic
  `VARIANT_PRICE_OVERRIDES` mechanism — no code path change. Batch A+B's 11
  provisional_market values are unchanged. Total provisional_market bottles
  after A+B+C: 17 (was 11). Remaining legacy bottle variants: 7 (was 13, of
  24 total). 288 official_pdf decant variants untouched.
- 14 new focused Vitest tests added (describe "4K-B2B.2C Batch C Peru
  market price research", apps/web/src/lib/catalog/commercial-reconciliation.test.ts)
  plus pre-existing tests updated for the new 7/17 legacy/provisional split
  and for cdn-intense-man's now-applied EDT correction. npm run
  commercial:check: byte-stable (products: 97, variants: 315, blocked: 3,
  conflicts: 0). npm run check: PASS (typecheck, lint, build all green).
- Explicit Admin client-confirmation workflow (4K-B2B.2A.1) verified still
  intact for a Batch C provisional_market row (tmw-parfum 100 ml): exactly
  one override key, no duplication; RPC itself not touched.
- Unresolved special cases carried forward unchanged: le-beau-le-parfum
  (TARGET_SIZE_UNRESOLVED), bir-intense and victory-elixir (concentration
  still unresolved) — none were in this gate's Batch-C target list.

### 4K-B2B.2C-R — Reviewer Corrections + Vercel Diagnosis — CLOSED

- Ultra Male reviewer correction: the 2 originally selected observations
  (Ripley "Pronto disponible", SENTUA "No Disponible", S/509 both) were
  BOTH unavailable, violating the realistic-current-purchasing-evidence
  requirement. Replaced with 2 currently-orderable Peru sources (MM Parfum
  S/419, Royal King Perú S/390, both add-to-cart). New reference =
  midpoint of S/390/S/419 rounded to integer PEN = **S/405**, confidence
  stays MEDIUM. Old S/509 Ripley/SENTUA observations preserved as
  excluded/superseded evidence in bottle-market-research.json, not erased.
- bottle-identity-audit.json current-state drift corrected: cdn-intense-man,
  cedrat-boise-int, m-red-tobacco `current_concentration`/`current_size_ml`
  fields (and cdn-intense-man's `current_identity.concentration`) now
  reflect the post-2C assets/data.js state (EDT / 120 / 120 respectively)
  instead of the stale pre-2C values; pre-correction values preserved per
  entry in `pre_4K_B2B_2C_history`. Top-level counts recomputed:
  size_confirmed 20->22, size_conflict 4->2 (pre-2C counts preserved in
  `counts_history.pre_4K_B2B_2C`). bir-intense/le-beau-le-parfum/
  victory-elixir left unguessed. `identity_reverification_source` text
  corrected to mention Batch C (previously named only Batch A/B).
- Regenerated supabase/staging/commercial-reconciliation.json via the
  existing generic reconciliation mechanism: only the ultra-male 125 ml
  bottle price changed (509 -> 405); 97 products, 315 variants, 17
  provisional_market bottles, 7 legacy bottles, 288 official_pdf decants,
  3 blocked combos, 0 conflicts — all unchanged.
- 1 new focused Vitest test added asserting Ultra Male = 125 ml / EDT /
  S/405 / provisional_market and that S/509 is not the selected reference
  anywhere in the catalog (apps/web/src/lib/catalog/commercial-reconciliation.test.ts,
  now 83 tests in that file). npm run commercial:check: byte-stable. npm
  run check: PASS (601 tests, typecheck/lint/build all green). git diff
  --check: clean.
- Vercel deployment dpl_4tjwn8wdjYc87VNhFPtZwFrUQdQk diagnosed via
  `npx vercel inspect --logs` (CLI already authenticated as
  dominiocruzial-5459): build fails with "No Next.js version detected" —
  root cause is **project/root-directory configuration** (the Vercel
  project's Root Directory is not set to `apps/web`; there is no root
  `package.json`/`next` dependency at repo root, so `next build` runs in
  the wrong directory). Not a code/build issue — local `npm run check` and
  `next build` pass cleanly. Predates this gate (a0b07f9 already failed
  the same way). No deployment config was changed (root cause proof only,
  per gate instructions).
- Next: 4K-B2B.3 — NOT STARTED.

### 4K-B2B.3 — Bottle Research Closure / Reviewer Decisions — CLOSED

- Applied 3 reviewer-approved (ChatGPT independent review) price decisions to
  supabase/staging/bottle-market-research.json, upgrading each from
  LOW/legacy (or previously unresearched) to provisional_market:
  - **khamrah-clasico** (Lattafa Khamrah original / "Clásico", EDP, 100 ml):
    Falabella Perú direct S/258.24 + Alamo Parfums Perú S/227 -> midpoint
    **S/243**, MEDIUM confidence.
  - **liquid-brun** (French Avenue Liquid Brun, EDP, 100 ml): Falabella Perú
    marketplace STAL S/159.90 + Ripley exact 100 ml S/199.90 -> midpoint
    **S/180**, MEDIUM confidence.
  - **victory-elixir** (Rabanne Invictus Victory Elixir, exact 100 ml SKU /
    EAN 3349668614523): Ripley direct S/559 + Falabella direct S/569 ->
    midpoint **S/564**, HIGH confidence (new entry — not previously
    researched). Concentration nomenclature conflict (retailers labeling the
    same EAN inconsistently vs. the brand's "Parfum Intense" line)
    documented, not resolved; assets/data.js concentration value untouched.
- Explicitly closed the other 4 unresolved bottles as intentional
  LOW/legacy, not to be re-researched without new client evidence:
  **1-million-lucky** (only one strong Peru direct source; MercadoLibre
  Tier4 conflicts materially), **by-the-fireplace** (Ripley exact EDT 100ml
  orderable but MM Parfum sold out; insufficient two-current-source
  evidence), **le-beau-le-parfum** (EXPLICIT_UNRESOLVED — official sizes
  75/125ml, client target size unknown), **bir-intense**
  (EXPLICIT_UNRESOLVED — target bottle size/concentration unresolved).
- bottle-identity-audit.json: added a narrow `closure_4K_B2B_3` note to the
  victory-elixir entry recording the canonical identity (Rabanne Invictus
  Victory Elixir), EAN 3349668614523, target size 100ml, and the verified
  concentration-terminology conflict — `identity_status`/
  `concentration_status` remain IDENTITY_CONFLICT/CONCENTRATION_CONFLICT as
  originally audited (no lifecycle change); victory-elixir stays a distinct
  record from the archived invictus-elixir.
- Regenerated supabase/staging/commercial-reconciliation.json: 97 products,
  315 variants, **20 provisional_market bottles, 4 legacy bottles**, 288
  official_pdf decants, 3 blocked combos, 0 conflicts.
- 9 new focused Vitest tests added (describe "4K-B2B.3 bottle market
  research closure (reviewer decisions)") plus updated pre-existing count
  assertions across the file (302->305 VARIANT_PRICE_OVERRIDES, 17->20
  provisional_market / 7->4 legacy bottle counts) — 92 tests in
  commercial-reconciliation.test.ts, 610 tests total. npm run
  commercial:check: byte-stable. npm run check: PASS (610 tests,
  lint/typecheck/build all green). git diff --check: clean.
- Bottle price market-research phase is now CLOSED: 20 provisional_market
  bottles, 4 explicit unresolved legacy bottles (1-million-lucky,
  by-the-fireplace, le-beau-le-parfum, bir-intense) — do not keep
  reopening those four without new client evidence or a materially new
  source.
- Next: 4K-C — NOT STARTED.

### 4K-C1A — Variant-Aware Combo Composition Contract — CLOSED

- `combo_items` now targets both the combo's sellable product variant and
  the ingredient variant. Composition is independently grouped and ordered
  per combo presentation; the same ingredient may appear in different
  presentations without becoming a duplicate.
- Historical rows backfill only when the owning combo product has exactly
  one product variant in total. Any ambiguous historical row aborts the
  migration instead of inferring from active state, size, order, price, or
  labels.
- `official_pdf` is persisted source authority and is readable/labeled in
  Admin, but is absent from Admin create/edit choices and rejected by the
  manual verification RPC. Admin may still edit an authorized composition.
- Semantic composition changes (presentation + ingredient + quantity)
  atomically downgrade `official_pdf` or `client_confirmed` to
  `pending_reconfirmation` and record the old/new authority in the existing
  audit log. Identical semantic replacements and sort-only changes preserve
  authority.
- Archived combo presentations keep their historical rows and allow only
  unchanged semantic pass-through (including presentation-local sort-only
  changes); additions, removals, ingredient replacements, and quantity
  changes are rejected.
- Admin read/UI is variant-aware and grouped by combo presentation, with
  composite row identity and presentation-local reorder/add/remove behavior.
- Commercial reconciliation remains 97 products / 315 variants / 288
  official_pdf decants / 20 provisional_market bottles / 4 legacy bottles /
  3 blocked combos / 0 conflicts. Commercial artifacts are unchanged and
  hosted Supabase was not touched.
- Next: 4K-C1B — NOT STARTED.

### 4K-C1B — Controlled Commercial Loader: Supplemental Identity + Variant-Aware Combos — CLOSED

- 4K-C1A remains CLOSED and its constraints/Admin authority guard are unchanged.
- The controlled Parfums loader now has two explicit product identities:
  non-null `legacy_id` is authoritative with no slug fallback; explicit null
  `legacy_id` uses the canonical unit-scoped slug and is persisted as null.
  Slug ownership, legacy/slug cross-identity, duplicate identity, and
  incompatible supplemental collisions fail during planning before mutation.
- Variant identity is `(product identity, variant_kind, size_ml)` (including
  explicit null size), never the display label. Missing or ambiguous canonical
  variants fail closed.
- Optional source `combo_targets` plan/apply/verify combo products, sellable
  presentation variants, ingredient variants, quantity, presentation-local
  order, and explicit composition authority. The loader maps these to
  `combo_product_variant_id` + `product_variant_id`; repeated apply converges
  to no-op. Missing/duplicate/conflicting/cross-scope references are refused.
- `official_pdf` is accepted only when explicitly present in the trusted
  operator source. Missing authority defaults to `pending_reconfirmation`;
  the Admin RPC still cannot assign `official_pdf` manually.
- Safety remains local-only: the CLI derives the Docker container from
  `supabase/config.toml`, has no hosted URL/key path, performs insert-or-verify
  within exact source scope, and neither hosted Supabase nor production/DNS
  was touched. Staging enablement remains outside C1B.
- Validation: commercial artifact byte-stable (97 products / 315 variants /
  288 official_pdf decants / 20 provisional_market bottles / 4 unresolved
  legacy bottles / 3 blocked combos / 0 conflicts); loader dry-run 97/315,
  zero conflicts, zero combo writes; database reset + pgTAP PASS (28 files,
  823 tests); `npm run check` PASS (55 files / 614 Vitest tests, lint,
  typecheck, build). Commercial artifacts are unchanged.
- Next: 4K-C2 — NOT STARTED.

### 4K-C1B-R — Manifest-Driven Commercial Loader Verification — CLOSED

- Reviewer inspection found stale product-specific and fixed-count lifecycle
  verification in the controlled loader. Source-scoped lifecycle smoke counts
  and the Admin-visible legacy draft price count are now derived from and
  compared with the current manifest; exact plan verification remains intact.
- BIR Intense remains in its current authoritative `draft` publication state.
  Commercial truth and the commercial artifact are unchanged.
- Local reset plus the canonical current-manifest dry/apply/verify flow passes:
  97 products, 315 variants, 192 relationships, 315 inventory rows, 0
  materialized combos, and 0 combo items. The 3 reconciliation combo
  definitions remain blocked and were not materialized.
- Hosted Supabase was untouched.
- Next: 4K-C2 — NOT STARTED.

### 4K-C2 — Materialize the Three Official Parfums Combos Locally — CLOSED

- The generic legacy ETL now stages a combo only when it has a non-empty
  `officialPdfMembers` composition and valid positive 3/5/10 prices. Confirmed
  combos retain the normal product, variant, category, media-pointer, and
  fingerprint material plus explicit `official_pdf` composition metadata;
  unconfirmed combos remain blocked. Generated staging is 99 products / 0
  blocked / 0 invalid, with the original 96 non-combo entries semantically
  unchanged.
- Reconciliation cross-checks each staged combo's exact source name, ordered
  members, and 3/5/10 prices against the committed official-PDF evidence before
  promotion. Missing/duplicate members, missing member presentations, invalid
  authority, self-reference, identity ambiguity, or source/PDF drift fail
  closed. Member references use reconciled target slugs, never display labels.
- Materialized definitions: Cuarteto Oriental (40/55/89; 4 members), Vainilla
  Freak (27/39/65; 3 members), and Set Tulum (31/42/71; 3 members). Composition
  and all 9 combo selling variants are `official_pdf`; all combo products and
  variants remain `draft` and are not published. The loader's existing media
  deferral remains unchanged.
- Commercial artifact: 100 products / 324 variants / 297 `official_pdf` prices
  (288 individual decants + 9 combo variants) / 20 `provisional_market`
  bottles / 7 legacy variants, including the unchanged 4 unresolved legacy
  bottles; 11 categories / 195 relationships / 324 inventory intents; 3 combo
  targets / 9 presentations / 30 items; 0 blocked / 0 conflicts. All 97
  pre-existing reconciled products are semantically unchanged.
- Local reset, dry-run, apply, verify, and second-apply idempotency passed. The
  final verify is an exact no-op at 11 categories / 100 products / 324 variants
  / 195 relationships / 324 inventory / 3 combos / 30 combo items, with zero
  conflicts. pgTAP passes 28 files / 823 tests. Fourteen focused Vitest tests
  cover ETL staging, authority/source validation, exact materialization,
  preserved prior truth, deterministic member mapping/order, and fail-closed
  negative cases. `commercial:check` is byte-stable and the complete `npm run
  check` passes (56 Vitest files / 628 tests, lint, strict typecheck, and build).
- Hosted Supabase, Production, and DNS were untouched. Next: 4K-C3 — NOT
  STARTED.

### 4K-C3A-R1 — Staging QA combo C1A compatibility — CLOSED locally

- 4K-C3A correctly stopped before any remote mutation: hosted
  `staging-qa-combo-ready` had one historical `combo_items` row but zero
  variants belonging to its own combo product, so C1A could not map that row
  to exactly one `combo_product_variant_id`.
- Added the staging-only, non-migration bridge
  `supabase/provisioning/staging-qa-combo-c1a-bridge.sql`. It asserts exact
  unit/slug/name/brand/combo ownership, fails on variant/inventory conflicts,
  fingerprints non-QA rows, and idempotently creates exactly one deterministic
  5 ml own presentation plus status-only inventory for each ready/pending QA
  combo. It never modifies `combo_items`; C1A remains responsible for the
  historical backfill.
- Updated `staging-qa-fixtures.sql` for the current schema: both combo fixtures
  have one deterministic own 5 ml presentation; ready is published +
  `client_confirmed` with exactly one variant-aware composition pointing to
  `staging-qa-publishable` / 5 ml; pending is draft +
  `pending_reconfirmation` with zero items. Added focused read-only verification.
- Local pre-C1A reproduction matched hosted evidence (2 combos / 1 item / 0
  own variants). Bridge run twice produced 2 then 0 variant/inventory inserts,
  preserved the historical item, and the unmodified C1A migration backfilled
  that item to the ready combo's own variant. Current-schema provisioning run
  twice was idempotent; unchanged exact cleanup removed all 9 QA products and
  preserved the non-QA local prerequisite. `db:test`: PASS (28 files / 823
  tests).
- R1 made no hosted mutation, applied no remote migration, imported no
  commercial manifest, and touched neither Production nor DNS. 4K-C3A remains
  BLOCKED/not closed until a separately authorized hosted R2 succeeds. 4K-C3B
  NOT STARTED.

### 4K-C3A-R2F1 — Hosted Import QA offer reconciliation — CLOSED locally

- Hosted migrations `20260913010000`, `20260913020000`, C1A
  (`20260914010000`), and C1B (`20260915010000`) are applied; the hosted/local
  ledger agrees with zero pending migrations. The hosted C1A backfill remains
  valid and its focused combo
  verifier passes (ready has one variant-aware item; pending has zero).
- The first permanent-fixture attempt failed transactionally at
  `Unexpected QA offer count: staging-qa-import-ready`. Root cause: the
  base fixture used a stale all-campaign count of one, while the second ready
  offer is legitimate layered 4J5G-A3 state, not drift.
- The corrected base fixture always requires its exact canonical campaign-#6
  offer and optionally accepts and byte-semantically preserves the one exact
  campaign-9002 extension. It neither creates, mutates, nor deletes that
  downstream row; unknown extra offers still fail closed. Local BASE -> BASE
  and BASE -> EXTENSION -> BASE -> BASE matrices pass, preserving both rows.
  Fresh-schema pgTAP passes 28 files / 823 tests, and the local combo verifier
  passes after the layered fixture run.
- No hosted write occurred in R2F1. R2 remains NOT CLOSED; the hosted fixture
  rerun is deferred to separately authorized R2F2. 4K-C3A remains NOT CLOSED,
  and 4K-C3B is NOT STARTED.

### 4K-C3A-R2F2 — CLOSED hosted staging compatibility

- Proven hosted target: `cruzial-v2-staging`
  (`iyxidhglyqkzoziyewlc`). The migration ledger remained synchronized through
  `20260915010000`, with zero pending or remote-only migrations.
- The pre-write focused combo verifier passed. The layered Import QA offer
  state was exactly 2/1/0 for ready/no-media/no-offer.
- The corrected permanent base fixture executed exactly once and committed
  successfully. The legitimate campaign-9002 extension was preserved
  byte-semantically; campaign #6 was preserved by full-row hash; and all 898
  non-QA campaign-#6 offers were preserved by count and aggregate hash.
- The post-write Import QA offer state remained exactly 2/1/0. The post-write
  focused combo verifier and the general staging QA verifier both passed.
- No commercial manifest was imported. Production and DNS were untouched.
  R2 parent: CLOSED. 4K-C3A parent: CLOSED. 4K-C3B: NOT STARTED.

### 4K-C3B.1 — CLOSED LOCALLY / HOSTED NOT APPLIED

- The first hosted C3B planner correctly refused 293 direct conflicts: 6 product
  state predecessors, 285 matched variant state predecessors, and 2 historical
  bottle:100 identities. Relationship/inventory conflict counters were cascading.
  No affected trusted-authority, out-of-manifest, QA, or Import rows were found.
- New append-only migration `20260916010000` binds reconciliation to the exact
  committed C2 JSONB fingerprint. Product reconciliation allows only the four
  proven concentration/description predecessors (by-the-fireplace, cdn-intense-man,
  dylan-blue, le-male-elixir), bir-intense hidden -> draft, and invictus-elixir
  draft -> archived; every other persisted field must already equal target.
- Normal variants allow only legacy -> official_pdf / provisional_market, with
  price/authority as the only differences and all structural fields exact.
  Mismatching client_confirmed, official_pdf, provisional_market, unknown, and
  unsupported future authorities remain conflicts. No inventory/relationship
  updater was added; unresolved-four bottle rows remain exactly legacy.
- Cedrat Boise Intense and Red Tobacco have an explicit in-place bottle:100 ->
  bottle:120 predecessor contract, retaining variant UUID and complete inventory.
  Hosted READ ONLY preflight dynamically enumerated all 7 product_variants FKs:
  each predecessor had exactly one exact status-only inventory row and zero other
  references, one 100ml row, no 120ml sibling, and no ownership/archive anomaly.
  The loader repeats dynamic dependency checks, including future/composite FKs.
- Planner reports INSERT / UNCHANGED / RECONCILE / CONFLICT distinctly. Apply
  preserves catalog locks, locks structural predecessors FOR UPDATE against new
  FK attachments, re-plans, and conditionally updates the exact current snapshot
  under the same predecessor predicates. Each update must affect exactly one row;
  any failure raises and rolls back. Final planning must prove exact convergence.
- Local reset and predecessor -> dry/apply/verify/second-apply passed: 6 product +
  305 variant reconciliations (303 normal / 2 structural), 64 entity inserts,
  zero conflicts; exact target is 100 products / 324 variants / 324 inventory /
  297 official_pdf / 20 provisional_market / 7 legacy / 11 categories /
  195 relationships / 3 combos / 9 presentations / 30 items. Second plan has
  zero inserts/reconciliations/conflicts; pgTAP proves no second-apply mutation.
- Validation: focused reconciliation pgTAP 110 tests; commercial/combo gate
  4 files / 233 tests; full DB suite ONCE 29 files / 933 tests; focused commercial
  Vitest 101 tests; commercial:check and local loader/Admin/anonymous RLS verifier
  PASS. Prepare the exact local pgTAP artifact after reset with
  `node scripts/prepare-commercial-reconciliation-test.mjs` before DB tests.
- Commercial artifact remains byte-identical, SHA-256
  `cefa808e760f8f874b93252bf5e6df7bbe3e82634c11ce3458aed0336861c364`.
  Hosted schema/commercial writes: NO. C3A remains CLOSED; C3B parent and 4K
  commercial closure remain NOT CLOSED. 4K2 NOT STARTED. Production/DNS untouched.

### 4K-C3B.2 — CLOSED HOSTED

- Single hosted commercial apply executed successfully via Node.js byte-safe
  transport on `cruzial-v2-staging` (`iyxidhglyqkzoziyewlc`).
- Apply result: `mode=apply, applied=true, refused=false, conflict_count=0,
  insert_count=64, reconcile_count=311`.
- Post-apply hosted counts: products=100, variants=324, inventory=324,
  relationships=195, commercial categories=11 (13 Parfums total including 2 QA),
  authority: official_pdf=297, provisional_market=20, legacy=7, combos=3,
  combo presentations=9, combo_items=30.
- Structural preservation confirmed: Cedrat Boise Intense variant UUID
  `587eb27f` preserved (120ml/614/provisional_market), Red Tobacco variant UUID
  `3c042a1d` preserved (120ml/609/provisional_market), both inventory UUIDs
  preserved with status_only/NULL qty/available/updated_by=NULL. No 100ml
  siblings remain.
- Unresolved four confirmed unchanged (1-million-lucky=780, by-the-fireplace=750,
  le-beau-le-parfum=680, bir-intense=720, all legacy). Import preserved at 847
  products. C3A QA fixtures intact: 6 QA products, 5 QA variants, 2 QA combos.
- Final read-only planner: exact 0/0/0 convergence (insert=0, reconcile=0,
  conflict=0 across all 7 entity types). No second commercial apply was invoked.
- QA verifiers passed: SQL combo verifier (ready=1 item/confirmed/published,
  pending=0 items/pending_reconfirmation/draft), catalog QA (3 products intact),
  campaign 9002 (1 offer, staging-qa-import-ready, c6_qa_offer_intact=1),
  cleanup SQL (no wildcards, exact md5 selectors, p.name=q.name).
- C3B parent: CLOSED. 4K2: NOT STARTED. Production/DNS untouched.

### 4K2-B0.1 — CORRECTED RUNTIME CONTRACTS — CLOSED locally

- Price authority corrected: v2 RPC obtains canonical price_amount and
  currency from product_variants in DB. Submitted unit_price_amount is
  never trusted as price authority. Subtotal derives from DB canonical prices.
- Product/variant relationship enforced: single atomic lookup resolves
  exact product+variant pair, proves variant.product_id = product_id,
  enforces BU scope, rejects archived products/variants.
- Mixed authority rejected: all lines must carry both product_id and
  product_variant_id (v2) or both be legacy (v1). Mixed in one request
  is impossible / rejected.
- Readiness corrected: discontinued does NOT block storefront visibility.
  "descontinuado" (production stopped) and "agotado" (no stock) are
  independent facts per client-confirmed contract. out_of_stock is the
  only purchase blocker.
- Pre-publication readiness classifier added: operates on raw database
  state for admin/C1 publication planning. Checks publication_status,
  hidden, archived, variant publication and price verification.
- Dead readiness blockers removed: variant_not_published, product_not_published,
  product_archived never fired on mapped CatalogProduct (repository filters
  first). Runtime classifier now only checks price verification.
- Combo read model implemented: combo_items with ingredient products fetched
  via PostgREST nested select. Perfumes array, ml, verificationStatus mapped.
  heroCta/atomizaciones are optional presentation-only legacy fields, not
  filled with fake values.
- Media URL reverted to HTTPS-only: /^https:\/\// filter. No verified
  HTTP legacy_static data requiring insecure transport.
- RPC types added: create_parfums_order_request_v2 added to Database type
  contract. No `as` cast to suppress missing RPC definition.
- Repository: ParfumsOrderRepository uses explicit v1/v2 branching with
  mixed-authority guard. Type guard for checkout discriminated union.
- ProductPurchaseVariant type extended with dbVariantId for order snapshots.
- Validation: 57 Vitest files, 680 tests, 0 failures.
- New pgTAP test file: tests/29_parfums_order_v2_authority.sql (28 tests)
  covering price authority, product/variant ownership, mixed authority,
  idempotency, archived product/variant, failure atomicity.
- Hosted migration 20260916020000: NOT applied hosted. Local only.
- Hosted publication statuses: untouched.
- Runtime cutover: NOT STARTED. All /parfums pages and checkout use
  LegacyCatalogRepository. SupabasePublicCatalogRepository only in tests.
- Production/DNS: untouched.

### 4K-GATE2A — Security boundaries hardening — CLOSED locally / NOT applied hosted

- Cloudinary destructive-action boundary fixed, then corrected again after an
  independent review (ChatGPT) flagged a residual replay risk: the original
  fix in src/lib/media/cloudinary.ts and both admin media-actions.ts files
  stopped trusting a browser-reported `publicId` (`createUploadAuthorization`
  mints the `public_id` server-side and returns a tamper-evident HMAC
  `authorizationToken` binding it to the product/unit with a 15-minute
  expiry), but `registerMediaAction` still called `destroyAsset()` on the
  server-known `expectedPublicId` whenever `isUploadResultValid` failed.
  `authorizationToken` is verified (HMAC, expiry, product/unit binding) but
  is NOT single-use — it stays valid and replayable for its whole TTL. That
  meant a still-valid token could be replayed with a mismatched/invalid
  `uploadResult` *after* its asset was already validly uploaded and
  registered once, and that replay would delete the now-legitimate asset.
  CORRECTIVE (this pass): both media-actions.ts files no longer call
  `destroyAsset()` on any validation-failure path — invalid token and
  invalid/replayed upload result now only return an error; nothing is
  persisted and nothing is destroyed. **Invalid/untrusted upload results are
  preserved as recoverable orphans, not automatically destroyed; orphan
  reconciliation is deferred to a future, explicitly single-use/ledgered
  mechanism (possible P2) — not implemented here.** `destroyAsset()` itself
  is kept in cloudinary.ts as a primitive for that future mechanism but has
  no caller today; do not wire it back to a validation-failure path without
  single-use consumption tracking. A replay regression test
  (media-actions.test.ts, both units) proves: invalid token → no delete;
  valid token + invalid/replayed upload → no delete, no persist; valid
  upload → still registers normally.
- Cloudinary secure_url provenance added: `isUploadResultValid` now requires
  exact public_id match (not prefix) plus a strict secure_url check (https,
  `res.cloudinary.com` host, expected cloud name, `image/upload` resource
  type, path exactly `<public_id>.<format>` with an optional `v<digits>/`
  version segment). Client upload widget switched from folder-scoped to
  public_id-scoped signed uploads (`public_id` form field replaces `folder`).
  24 Vitest cases in src/lib/media/cloudinary.test.ts cover token
  tampering/expiry/cross-product/cross-unit replay and secure_url rejection
  (external host, wrong cloud, wrong folder, http, bad format).
- anon EXECUTE hardening: 35 public.admin_* RPCs anon could execute purely by
  Postgres's CREATE FUNCTION default (never explicitly revoked) now have
  `EXECUTE` revoked from anon in a new append-only migration. The four
  intentionally-public Import storefront RPCs
  (public_get_import_current_campaign, public_get_import_product,
  public_list_import_catalog, public_list_import_categories) and the
  app.*_is_public/app.*_unit RLS helpers keep anon EXECUTE. Verified against
  live pg_proc on cruzial-v2-staging (2026-09-19) that every remaining
  admin_* function already enforces app.assert_admin_for(...) (mutations) or
  app.can_read_unit(...) (reads) internally — this migration removes
  reachability, it does not add a missing authorization check.
- authenticated authorization contract reviewed: all 54 public.admin_*
  functions have either an admin guard or a read guard (verified via
  pg_proc.prosrc introspection); no P0/P1 authorization gap found. No
  functions changed under this objective.
- search_path hardening: the five Advisor-flagged trigger functions
  (app.set_updated_at, app.reject_audit_log_mutation,
  app.freeze_order_line_snapshot, app.freeze_order_snapshot,
  app.reject_order_history_delete) now have `search_path = pg_catalog,
  pg_temp` via the same migration. All five reference only trigger-magic
  variables and pg_catalog builtins, so this changes no behavior.
- anon table-DML defense-in-depth: anon INSERT/UPDATE/DELETE revoked on 16
  admin-only catalog/settings tables (products, product_variants,
  product_media, categories, product_categories, combos, combo_items,
  campaigns, campaign_products, business_units, settings, shipping_methods,
  deposit_policies, variant_price_tiers, wholesale_policies,
  admin_parfums_wholesale_catalog) after confirming via `rg` across
  apps/web/src that no code path ever performs a direct anon `.insert()` /
  `.update()` / `.delete()` / `.upsert()` against them — all writes go
  through admin_* RPCs or, for orders, create_parfums_order_request(_v2) /
  import order RPCs. RLS is unchanged and remains the primary boundary; this
  is additive, matching the existing sensitive-table REVOKE precedent in
  20260907154358_rls_policies.sql. Public SELECT and all four public_* RPCs
  verified still working.
- New migration 20260919010000_security_boundary_hardening.sql: append-only,
  contains only REVOKE/ALTER statements, no DDL on existing tables/functions'
  bodies. Dry-run validated against cruzial-v2-staging inside a
  BEGIN/ROLLBACK transaction with an 18-assertion pgTAP suite (all 18 passed)
  — then rolled back; hosted state is unchanged (verified: anon still has
  the pre-hardening grants). **NOT applied hosted.** Requires review before
  ever being run against iyxidhglyqkzoziyewlc.
- New pgTAP file supabase/tests/30_security_boundary_hardening.sql (18
  tests): anon cannot execute a representative sample of admin_* RPCs, anon
  can still execute the four public_* RPCs, all five search_path fixes
  present, authenticated-without-membership denied, cross-unit admin denied,
  authorized admin still works, anon has no INSERT on products/categories,
  anon SELECT on products still works.
- **PRODUCTION SECURITY BLOCKER / HOSTED AUTH CONFIG** (not fixed by code,
  not touched this Gate): Supabase Security Advisor reports "Leaked Password
  Protection Disabled" on cruzial-v2-staging. This is a hosted Auth
  dashboard/Management-API setting, out of scope for a code migration and out
  of scope for Gate 2A by explicit instruction. It must be enabled before any
  production Auth cutover — required requirement for the Auth/Production
  gate, not resolved here.
- Cloudinary Admin API secret rotation, rate limiting, and CSP/security
  headers are explicitly out of scope for this gate (later gates).

### 4K-GATE2B — Public order request anti-abuse / rate limiting — CLOSED locally / NOT applied hosted

- Threat closed: `requestId` only protects idempotency when a caller reuses
  the SAME uuid; a bot can mint unlimited new uuids and call the Parfums/
  Import Server Actions unlimited times, since the service-only persistence
  RPCs have no volume control of their own. This gate adds an authoritative,
  concurrency-safe PostgreSQL counter — never a Node-memory limiter, which
  would not be a shared counter across Vercel's serverless instances.
- New append-only migration
  `20260919201406_order_request_rate_limiting.sql`: creates a non-exposed
  `private` schema (no Data API, no anon/authenticated grants), table
  `private.order_request_rate_events` (id, business_unit_code, request_id,
  ip_hash, phone_hash, created_at — only admitted requests are stored, never
  rejected ones, so a flood of rejected uuids cannot fill the table), and
  service-only RPC `public.check_order_request_rate_limit(business_unit,
  request_id, ip_hash, phone_hash)`. `security invoker` with explicit
  `service_role`-only grants (matching the 20260916020000 v2 RPC precedent),
  not `security definer`. RLS enabled on the table as defense-in-depth (no
  policies; only service_role, which bypasses RLS, holds table privileges).
  **NOT applied hosted.**
- Algorithm: an advisory transaction lock keyed on
  `business_unit + request_id` serializes concurrent submits of the same
  request first. A previously-admitted `request_id` is allowed again as a
  duplicate WITHOUT consuming quota (the persistence RPC's own idempotency
  then returns the existing order). A genuinely new `request_id` acquires
  advisory locks in a fixed order (IP scope, then phone scope — every caller
  uses the same order, so no lock-order deadlock is possible), counts recent
  admitted events in sliding windows, and is admitted (inserting exactly one
  event) only if none of its scopes are exhausted.
- Thresholds (centralized in the one migration file, not scattered):
  IP — 12 new requestIds / 10 min, 40 / 1 hour. Phone (normalized) — 5 new
  requestIds / 1 hour, 12 / 24 hours. No global cross-customer cap by design
  (a small global cap is itself a denial-of-service lever an attacker could
  use to lock out every legitimate customer). Business units (`parfums`,
  `import`) never share quota.
- Retention: opportunistic bounded sweep
  (`delete ... where created_at < now() - 48h limit 500`) runs inside the RPC
  itself on every call — no pg_cron in this gate, per instruction.
- Network identity: `apps/web/src/lib/security/order-abuse.ts`.
  `readTrustedRequestIp()` trusts `x-vercel-forwarded-for` only when
  `process.env.VERCEL` indicates a Vercel deployment (Vercel itself sets that
  header; it cannot be spoofed by the client there), validated with
  `net.isIP`. Outside Vercel, with no configured trusted proxy, IP signal is
  `null` and phone-based limiting still applies — checkout is never blocked
  for lack of a trusted IP.
- Privacy: raw IP and raw phone never reach the database or a log line.
  `ORDER_ABUSE_HMAC_SECRET` (new server-only env var, read lazily via
  `src/lib/supabase/env.ts::readOrderAbuseHmacSecret`, no
  `NEXT_PUBLIC_` variant, never reused from `SUPABASE_SECRET_KEY` or any
  Cloudinary credential) keys an HMAC-SHA256 digest of
  `cruzial:order-abuse:v1:{ip|phone}:{value}` — domain-separated so the same
  raw value hashes differently as an IP vs. as a phone. Phone canonicalization
  (9-digit Peru numbers ↔ their `51`-prefixed form) is for the anti-abuse key
  only; it never rewrites the order's stored phone. These identifiers are
  **pseudonymized**, not anonymized — no claim beyond that is made in code or
  docs.
- Failure policy: a missing secret or an unexpected RPC error both **fail
  closed** (`{ kind: "unavailable" }`) — the order is never created, cart is
  preserved, and the customer sees a generic unavailability message. A denied
  (rate-limited) request also never reaches the persistence RPC. Neither path
  logs raw IP, raw phone, or the HMAC secret.
- App integration: `apps/web/src/app/parfums/checkout/actions.ts` and
  `apps/web/src/app/import/checkout/actions.ts` both call
  `checkOrderRequestRateLimit(...)` after validation and before their
  repository's `.create(...)`, using the same admin Supabase client the
  action already created. Neither `ParfumsOrderRepository` (protected 4K2-B0
  WIP) nor `ImportOrderRepository` was modified.
  `CreateParfumsOrderResult`/`CreateImportOrderResult` gained an optional
  `code: "rate_limited"` + `retryAfterSeconds` on the existing error variant,
  without revealing which scope (IP/phone) or exact threshold was hit.
- Tests: `src/lib/security/order-abuse.test.ts` (trusted-vs-spoofed IP
  header, invalid IP rejected, Peru phone canonicalization, HMAC
  determinism + IP/phone domain separation, missing-secret fail-closed, raw
  values never sent to the RPC), `actions.test.ts` in both checkout folders
  (denied/unavailable never calls the repository, allowed duplicate retry
  still calls it, correct business unit passed). New pgTAP file
  `supabase/tests/31_order_request_rate_limiting.sql` (22 tests): privilege
  matrix (service_role only; anon has no schema access to the table at all),
  contract column shape, new-vs-duplicate requestId, both IP windows, both
  phone windows, IP/phone/business-unit isolation, a denied request creates
  no event row, and the retention sweep does not remove a row still inside
  an active window.
- Pre-existing, unrelated pgTAP drift found while validating (NOT
  introduced by this gate, NOT fixed here — out of scope): `29_parfums_order_v2_authority.sql`
  references a `products.price_verified_at` column that no longer exists,
  and `14_commercial_existing_row_reconciliation.sql` depends on a
  `c3b1_test_support` fixture schema that isn't created by a bare `db reset`.
  Both predate this gate's baseline (last touched by 9fdf4c7 and 5ce0ee7
  respectively).
- Explicitly not done this gate, by instruction: Redis/Upstash/KV, Turnstile/
  CAPTCHA, Vercel WAF/adaptive-challenge configuration, a global
  cross-customer cap, `pgrst.db_pre_request`, and converting either Server
  Action to a Route Handler.

### 4K-GATE2C1 — Admin MFA hardening: TOTP + recovery + AAL2 enforcement — CLOSED locally / NOT applied hosted

Code/local contract only. Does **not** enable hosted TOTP, hosted password
hardening, hosted Leaked Password Protection, or apply the new migration
hosted. Does not touch Gate 2A or Gate 2B hosted state.

- Decision: every admin/viewer surface — role `admin` or `viewer` — must
  reach `aal2` (TOTP) before it can read or mutate business/admin data.
  Enforced **twice**, independently:
  - **Next.js**: `getAdminSession()` (`src/lib/auth/admin-session.ts`) now
    calls `supabase.auth.mfa.getAuthenticatorAssuranceLevel()` after
    resolving membership. `status: "ok"` is only ever returned at `aal2`.
    New statuses `mfa_enrollment_required` (`nextLevel === "aal1"`, no
    factor yet) and `mfa_challenge_required` (`nextLevel === "aal2"`,
    verified factor exists) sit between `no_membership` and `ok`. Any
    Auth/backend error is `unavailable` — fail closed, never `ok`.
  - **PostgreSQL**: migration `20260919205854_admin_mfa_aal2_enforcement.sql`
    adds `and coalesce((select auth.jwt())->>'aal','aal1') = 'aal2'` to both
    `app.is_admin_for(target_unit)` and `app.can_read_unit(target_unit)`. A
    targeted audit (`rg 'auth\.uid\(\)'` across every migration) found these
    two functions are the only membership-check path every admin-readable/
    admin-writable RLS policy and every `admin_*` RPC uses (`app.assert_admin_for`
    is a thin wrapper over `is_admin_for`); the AAL claim comes from
    Supabase's own JWT (`auth.jwt()->>'aal'`), never a custom table/column,
    so there is nothing for application code to desync from. The one
    intentional exception: `admin_memberships_read_own` still reads
    `auth.uid()` directly and stays reachable at `aal1`, so a freshly
    authenticated admin can discover their own membership and reach
    enrollment/challenge before `aal2` exists — it grants no business data.
    A stolen/replayed `aal1` token therefore cannot reach protected data by
    calling PostgREST directly, bypassing the Next.js session model
    entirely.
- New helper `getAdminPreMfaSession()` alongside `getAdminSession()`:
  requires `getUser()` + an active own membership, but explicitly not
  `aal2`. Powers exactly three pages — `/admin/mfa/enroll`,
  `/admin/mfa/challenge`, `/admin/reset-password` — and grants no
  business-data access on its own. `getAdminSession()` itself was not
  weakened to make these pages work.
- Login flow (`src/app/admin/login/actions.ts`): `signInWithPassword`
  success no longer redirects straight to `/admin`. It resolves
  `getAdminSession()` and routes to `/admin` (`ok`), `/admin/mfa/challenge`,
  or `/admin/mfa/enroll`. `no_membership` signs the new session back out
  (`scope: "local"`) and returns the same generic "Credenciales inválidas."
  used for a wrong password — no email-existence or membership-existence
  oracle.
- MFA enrollment (`/admin/mfa/enroll`): `startTotpEnrollment()`
  (`enroll/enrollment.ts`) calls `mfa.enroll({ factorType: "totp" })` —
  called directly from the Server Component render, not a Server Action,
  because the QR/secret are only ever returned once, at creation. V1
  corrective: it no longer unenrolls stale unverified factors first — an
  abandoned unverified factor is inert (never satisfies AAL2, never listed
  by the challenge UI) and application code never calls `mfa.unenroll()`.
  The client form (`enroll-form.tsx`) renders the returned SVG QR via a
  plain `<img src>` (no `dangerouslySetInnerHTML`) plus the secret as a
  fallback, and posts a 6-digit code. `verifyEnrollment` (`enroll/actions.ts`)
  re-validates the browser-supplied `factorId` against this user's own
  *unverified* TOTP factors before calling `challengeAndVerify`, then
  re-checks `getAdminSession()` is `ok` before redirecting to `/admin`.
  Already `aal2`, or already has a verified factor pending challenge? The
  page redirects instead of re-enrolling.
- MFA challenge (`/admin/mfa/challenge`): lists only this user's *verified*
  TOTP factors; a form lets the user pick when there is more than one.
  `verifyChallenge` re-validates the submitted `factorId` against the
  user's own verified factors — an arbitrary client-supplied id is rejected
  before `challengeAndVerify` is ever called.
- MFA management (`/admin/security`, requires `getAdminSession()` `ok` —
  which already implies `aal2`): lists verified TOTP factors (read-only)
  and can add a second factor (`beginAddFactor` → QR/secret,
  `verifyAddFactor` → `challengeAndVerify`, both re-validating factor
  ownership the same way). Supabase does not offer recovery codes, so a
  second verified TOTP factor on a separate device is this app's backup
  path.
  **V1 corrective (master task): NO self-service factor removal exists
  anywhere** — no delete buttons, no factor-removal Server Action, no
  `auth.mfa.unenroll()` call in application code, no removal locks, no
  self-service-deletion tests. A regression contract test scans all of
  `src/` and fails if any of those reappear. Factor recovery/removal is
  strictly operator-only via Supabase (dashboard / Management API) — see
  the operator recovery runbook below. This also eliminates, by
  construction, the read-then-write "last factor" race that an
  application-level lock could only partially close, and the possibility
  of an account downgrading itself out of aal2 via the UI.
- Password recovery: `/admin/forgot-password` (public) always returns the
  same sentence ("Si existe una cuenta autorizada asociada a ese correo…"),
  regardless of whether the account exists, Supabase is configured, or the
  call errors — preserving `resetPasswordForEmail()`'s own
  non-enumeration property across this app's error paths too. The redirect
  is built from a new server-only `SITE_URL` env var
  (`src/lib/supabase/env.ts::readSiteUrl`, no `NEXT_PUBLIC_` form) run
  through the existing `resolveCanonicalUrl` guard — never from a request's
  `Host`/`Origin` header, closing the host-header-poisoning path into a
  password-reset link. The request is issued on the **cookie-bound**
  client, not the stateless public one: this starts a PKCE exchange whose
  `code_verifier` `/auth/callback` must present later. The stateless client
  defaults to the *implicit* flow, which returns tokens in the URL fragment
  — never sent to a server — so the callback would see no `code` and
  recovery would dead-end at `/admin/login?error=missing_code`.
- Recovery proof (`src/lib/auth/recovery-session.ts`): `/admin/reset-password`
  and its Server Action both require evidence that the session came from a
  recovery link — **not** merely that someone is signed in. "Signed in" is
  exactly what an ordinary password login produces, so gating on
  `getUser()` alone would let anyone holding a stolen password change the
  account password without ever passing MFA. The discriminator is the `amr`
  claim, read via `getClaims()` (signature-verified; never an unverified
  decode, query param, hidden field, or pathname). Verified locally against
  this project's Auth on the PKCE flow the app uses: normal login →
  `amr: [{method:"password"}]`; recovery link → `amr: [{method:"recovery"}]`.
  `getUser()` is still called alongside it, because a signature-valid token
  can belong to an already-revoked session, and the two must agree on the
  subject. Both `AMREntry[]` and the RFC-8176 `string[]` shapes are handled.
  Every other outcome fails closed. The Server Action re-derives this
  independently of the page, because a POST can reach it without the page
  ever rendering.
- Reset completion: enforces a 12+ character password server-side, then
  calls `signOut({ scope: "global" })` before redirecting to
  `/admin/login`. Verified locally: the local auth cookies are cleared and
  another open session's refresh token is rejected afterwards
  (`refresh_token_not_found`). Access tokens already issued stay valid
  until they expire — Supabase does not revoke those synchronously, and
  this is stated rather than glossed over. Not gated on active membership,
  deliberately: a valid recovery link already implies a provisioned
  account, and a password change grants no access on its own — reaching
  `/admin` still requires signing in again and clearing MFA to aal2.
- Local Auth config target (`supabase/config.toml`, code/local only):
  `[auth.mfa.totp] enroll_enabled = true`, `verify_enabled = true`
  (`[auth.mfa.phone]` stays `false` — TOTP only, no SMS/WhatsApp/passkeys
  this gate). `[auth.email] password_requirements =
  "lower_upper_letters_digits_symbols"` — the strongest value the CLI
  supports. Verified locally that this binds only when a password is *set*
  (signup / `updateUser`), not at sign-in: an account whose existing
  password does not satisfy it still logs in, and the rule only applies
  when that password is rotated. There is therefore no reason to ship the
  weaker option on an admin-only surface. `[auth.email]
  secure_password_change = true` — compatible with the one password-change
  path this app has (recovery, which always runs on a session the recovery
  link just created). `enable_signup = false` at both `[auth]` and
  `[auth.email]` unchanged; `minimum_password_length = 12` unchanged.
- Operator recovery (runbook, total MFA loss — also the ONLY factor-removal
  path in V1, since the app UI offers none):
  1. Verify the admin's identity out-of-band (known contact channel).
  2. In the Supabase dashboard (or Management API) for the project, delete
     the lost/stuck TOTP factor(s) for that user
     (Authentication → Users → user → Factors).
  3. The user signs in with their password (aal1) and is routed to
     `/admin/mfa/enroll` automatically (`mfa_enrollment_required`), enrolls
     and verifies a fresh primary TOTP, then adds a backup factor at
     `/admin/security`.
  Membership itself is still never grantable from the browser
  (`admin_memberships` has no INSERT/UPDATE/DELETE policy — unchanged);
  provisioning stays `supabase/provisioning/grant-admin-membership.sql`,
  run out-of-band. There is no secret bypass flag, no in-app factor
  deletion, and no home-grown recovery-code feature anywhere in the code.
- Tests: pgTAP `supabase/tests/32_admin_mfa_aal2_enforcement.sql` (14
  tests) — aal1 admin can read own membership but `is_admin_for`/
  `can_read_unit` are both false and a representative protected read
  (draft category) and admin mutation (`admin_update_public_contact_setting`)
  are both denied; aal2 viewer can read but not mutate; aal2 admin retains
  full capability; aal2 Parfums admin is still denied against Import (no
  membership there — aal2 never substitutes for membership); anon
  storefront read unaffected. Every pre-existing pgTAP fixture that sets
  `request.jwt.claims` for an authenticated admin/viewer session
  (~119 occurrences across ~23 files) had `"aal":"aal2"` added — required
  by this same migration, or every prior "authorized admin/viewer" success
  assertion in the whole suite would start failing, since none of them
  predate AAL existing at all. Denial-path fixtures (no membership, wrong
  unit) are unaffected by the addition, since the failure reason is
  unrelated to `aal` — and the addition actually strengthens them, since
  they now prove denial *even at* aal2. Executed against the local stack:
  `supabase test db` → 33 files / 885 tests, test 32 green, with only the
  two documented pre-existing failures
  (`14_commercial_existing_row_reconciliation.sql`,
  `29_parfums_order_v2_authority.sql`) still red. Neither file is touched
  by this gate; both were last modified before the Gate 2C1 baseline.
- Live schema audit (against the local database, not just the migration
  text): all 54 `public.admin_*` functions route through
  `assert_admin_for`/`is_admin_for`/`can_read_unit` — none check membership
  directly. Exactly one RLS policy reads identity without those helpers,
  `admin_memberships_read_own`, which is the intended aal1 exception.
  `app.current_unit_ids` and `app.has_any_membership` carry no aal check
  but have zero live consumers (no policy, no function), so they grant
  nothing. Fail-closed confirmed for an absent, `null`, and unrecognized
  `aal` claim: `is_admin_for` returns `false`, never `null`.
- Application tests: contract-style additions alongside the existing
  `admin-auth-contract.test.ts` pattern covering the login-flow redirect
  matrix, `getAdminSession`/`getAdminPreMfaSession` status resolution,
  factor-ownership validation (`findOwnFactor`), the last-factor-cannot-be-
  removed rule, and the non-enumerating forgot-password response, plus
  `recovery-session.test.ts` (amr shapes, subject mismatch, fail-closed)
  and `reset-password/actions.test.ts`, whose central case is the negative
  one: a normal aal1 admin session is denied and `updateUser` is never
  called. No real credentials or TOTP secrets in any test.
- Explicitly not done this gate, by instruction: enabling anything hosted
  (TOTP, password hardening, Leaked Password Protection, CAPTCHA, session
  timeout, custom SMTP, security notification emails), CAPTCHA on login/
  reset, recovery codes, passkeys/WebAuthn, SMS/WhatsApp MFA, OAuth,
  rotating the current admin's password, and applying Gate 2A or Gate 2B
  hosted.
- Hosted state (unchanged by this gate):
  `HOSTED MFA ENABLED: NO`
  `HOSTED LEAKED PASSWORD PROTECTION ENABLED: NO`
  `GATE 2A MIGRATION HOSTED: NO`
  `GATE 2B MIGRATION HOSTED: NO`
  `GATE 2C1 AAL2 MIGRATION HOSTED: NO`
  `CUSTOM SMTP: UNKNOWN / REQUIRES VERIFICATION`
  `VERIFIED MFA FACTORS ON CURRENT STAGING BEFORE ACTIVATION: 0`
- Gate 2C2 rollout order (documented, not executed): verify staging Auth
  URL allow-list + recovery redirect → verify production-capable SMTP →
  deploy this reviewed code → enable hosted TOTP enroll+verify → current
  admin logs in at aal1 → enrolls + verifies primary TOTP → enrolls +
  verifies a backup TOTP → verify aal2 normal admin use → verify password
  recovery end-to-end → rotate the current password to a strong unique one
  if needed → enable hosted password requirements/secure password change →
  enable Leaked Password Protection (plan permitting) → enable relevant
  security notification emails → **only then** apply this migration hosted
  → verify aal1 direct RPC denial → verify aal2 admin works → verify backup
  factor recovery. Never reorder this into a lockout-prone sequence.

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
