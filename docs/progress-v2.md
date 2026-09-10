# CRUZIAL PLATFORM V2 — CURRENT STATE

Last updated: 2026-09-09

## Git

Branch:

`codex/feature/cruzial-platform-v2`

`master` remains the legacy GitHub Pages production branch and must not be
modified before explicit production cutover.

Git is authoritative for the exact current HEAD and historical implementation
details.

## Architecture

V2:

- Next.js 16 App Router
- strict TypeScript
- Supabase/PostgreSQL
- RLS + pgTAP
- Cloudinary
- Vercel Preview operational

Runtime split until explicit cutover:

PUBLIC PARFUMS
→ LegacyCatalogRepository
→ assets/data.js

ADMIN / COMMERCIAL STAGING DATA
→ Supabase

Do not implicitly cut over the public storefront.

## Business units

One platform:

- CRUZIAL PARFUMS
- CRUZIAL IMPORT

Shared infrastructure/auth.

Isolated:

- carts
- catalog/business rules
- orders
- settings
- campaigns

## Closed capabilities

- Foundation / Supabase / Auth foundation ✅
- Parfums visual parity / quality gate ✅
- Admin Products ✅
- Admin Categories ✅
- Admin Combos ✅
- Admin Wholesale ✅
- Public Order Request → WhatsApp ✅
- Admin Orders ✅
- Media Foundation / Admin Media ✅
- Client Media Reconciliation ✅
- Commercial Reconciliation ✅
- Controlled Local Commercial Population ✅
- Controlled Hosted Staging Commercial Population ✅
- Controlled Client Media Migration ✅
- Admin Settings — Public Contact (4G1) ✅
- Admin Audit Log — integrity fix + UI (4G2) ✅
- Public Supabase Catalog Repository Foundation + Parity Readiness (4H2A) ✅
- Vercel Preview + Hosted Supabase Auth (4I1) ✅
- Parfums Preview QA (4I2) ✅
- Admin Import — Consolidado lifecycle + security foundation (4J1) ✅
- Admin Import — Campaign Products / Prices / Availability (4J2) ✅ — see "4J2
  correction" below for the full defect list and what was added in the
  second pass (readiness model, open-campaign summary, bounded picker).
- Admin Import — Import Presentation + Availability Foundation (4J4A) ✅ —
  import_presentations table (price-free structural identities),
  campaign_products.import_presentation_id, unconfirmed availability,
  public RLS fail-closed, quantity_limit preserved by full identity.
  MAX_CAMPAIGN_OFFERS 1500 (schema + DB RPC hard cap), archived presentation
  fail-closed (archived_at OR publication_status='archived'), correction
  migration `20260909060000_campaign_products_correction.sql`.
- Admin Import — Sexto Consolidado Population (4J4B) ⛔ BLOCKED —
  Loader implemented (`scripts/load-import-consolidado.mjs`), population plan
  validated: 842 products, 906 presentations, 886 priced offers, 13 skipped
  (no price), Vanilla Freak unresolved. 7 conflicting duplicate offer groups
  detected (same product + same presentation + different prices). Per spec:
  STOP, report, do not choose silently. Awaiting conflict resolution before
  local apply.

Do not re-audit closed capabilities without evidence of regression.

### 4H2A boundary

Provider-neutral catalog types plus a public/RLS-bound Supabase repository,
typed `public_contact` reader and deterministic parity oracle now exist. The
repository performs one composed query (no N+1), maps exact decimal price text,
published categories/variants and active Cloudinary media, including preserved
`set`/`bottle` roles, and exposes missing media honestly. The parity oracle
fails on unexpected public Supabase-only identities. Anonymous hosted staging
verification remains 0 public Parfums products, as expected. No schema
migration or staging publication was needed.

The runtime source remains `LegacyCatalogRepository → assets/data.js`, including
checkout authority, combos and mayorista. 4H2B is blocked by publication,
legacy price confirmation, three unconfirmed combos, wholesale tier parity,
unresolved media and the required atomic storefront/checkout authority switch.
Full matrix: `docs/4h2a-public-catalog-readiness.md`.

### 4I1 checkpoint

Vercel project `cruzial-platform-v2` deploys `apps/web` as a Next.js Preview:

`https://cruzial-platform-v2-r9vn40e6o-cruzial.vercel.app`

Preview-only environment variables point to hosted staging
`iyxidhglyqkzoziyewlc`. Hosted Auth uses the exact Preview origin and callback,
while both localhost callbacks remain allowed. Password login authenticates
directly through hosted Supabase and redirects to `/admin`; `/auth/callback`
remains the configured confirmation/recovery callback. A temporary staging-only
Parfums Admin verified the complete Admin read surface and Cloudinary signing
boundary, then its membership and Auth identity were removed with no audit or
commercial references left behind.

Deployed `/`, `/parfums`, `/parfums/catalogo` and `/admin/login` are
`noindex,nofollow`; Admin responses are private/no-store, external callback
redirects are rejected, and no server secret appeared in representative HTML
or first-party JS. The public storefront remains
`LegacyCatalogRepository → assets/data.js`; anonymous hosted staging still
returns 0 public products. 4H2B remains blocked and no Production/custom-domain
deployment is active. Vercel classified the initial failed build as Production
despite no `--prod` flag; it never became live and its exact failed deployment
record was removed. The sole remaining deployment is the verified Preview.

### 4I2 checkpoint

Verified via local Vercel CLI (`dominiocruzial-5459` / team `cruzial` —
the Vercel MCP connector in this environment is a different, unrelated
account and cannot see this project): current Preview build target is
`preview`, no Production deployment exists for `cruzial-platform-v2`
(`Latest Production URL: --`), no custom domain attached, build/runtime
logs show zero errors/warnings/exceptions.

Cache root cause reconfirmed against actual build output (not inferred):
only `/parfums/catalogo`, `/parfums/productos/[slug]` and
`/parfums/[...catchall]` are `ƒ Dynamic` — both read Next's `searchParams`
(filters / `?variant=`) or are an unenumerated catch-all, both required for
current shareable-URL semantics. Every other route is `○ Static`. No
unnecessary dynamic boundary found. Left as-is.

Critical flow (catálogo → filter → product → decant size → qty → cart →
merge/remove → checkout, stopped before submission) and secondary flows
(Finder wizard, Combo Builder with per-line sizes, Combos page, Mayorista
pricing/WhatsApp CTAs, mobile nav drawer, WhatsApp link encoding across 96
products) all verified working, zero console/runtime errors. Responsive
checked at 320/375/390/768/1440 across Home/Catalog/Product/Checkout/
Combos/Mayorista/Admin login — no horizontal overflow anywhere. A
previously suspected WhatsApp-button/price overlap on mobile Checkout was
re-tested with real bounding-box geometry (not screenshots) across the
full scroll range at 320/375/390 and did not reproduce — false positive,
no fix needed. Keyboard focus (visible ring, correct tab order, Escape +
focus-return on cart drawer) and label/alt-text/H1 structure spot-checked
clean across Home/Catalog/Product/Checkout/Admin login.

Fixed: no `X-Content-Type-Options`/`X-Frame-Options` existed on any route
(confirmed missing, not assumed). Added minimal `headers()` in
`apps/web/next.config.ts` (nosniff + DENY only, no CSP). Verified via
`npm run check` (green) and a redeployed, re-verified Preview
(`cruzial-platform-v2-3yyt7kxvk-cruzial.vercel.app`, `target: preview`,
headers present, admin/login and Supabase-backed auth unaffected). This is
now the current Preview; the prior one
(`cruzial-platform-v2-r9vn40e6o-cruzial.vercel.app`) was left in place and
still serves.

Not completed this pass: a literal anonymous-REST re-count of hosted
public Parfums products. `vercel env pull` (both `--environment=preview`
and with `--git-branch`) returned an empty value for
`NEXT_PUBLIC_SUPABASE_URL`/`_PUBLISHABLE_KEY` despite `vercel env ls`
listing them as set — consistent with these being synced by a Vercel
integration rather than stored as directly pullable project env vars, a
CLI/API limitation rather than a missing/misconfigured var. App-level
proof stands in instead: `/admin/login` renders the normal (Supabase-
configured) form rather than the app's own "backend not configured"
fallback (`isSupabaseConfigured()` in `apps/web/src/lib/supabase/env.ts`
returns non-null only when both vars are set), confirming Supabase
connectivity is intact and unchanged since 4I1's direct anonymous
verification (0 public products). A real, formal Lighthouse run was also
not available in this environment; Navigation Timing was captured instead
(TTFB ~82ms, DOMContentLoaded ~125ms, load ~390ms, consistent across
samples) as a partial, non-authoritative proxy — LCP/CLS/paint APIs did
not populate because this harness backgrounds the browser tab between
tool calls, which pauses paint-timing observers per spec.

## Hosted staging

Supabase project:

`cruzial-v2-staging`

Ref:

`iyxidhglyqkzoziyewlc`

Commercial Parfums staging:

- 11 categories
- 96 products
- 312 variants
- 192 product/category relationships
- 312 inventory rows

Commercial state:

- 95 products draft
- `bir-intense` hidden
- 0 published
- all product verification conservative/legacy
- 312 variant prices legacy
- inventory `status_only`
- quantity_on_hand null

Anonymous visibility of draft commercial data:

0

Public storefront still uses legacy catalog.

## Media

Media Foundation:

- signed Cloudinary upload
- server-side validation
- product_media
- primary integrity
- ordering
- alt
- archive/restore
- Admin UI
- RLS/audit

Client reconciliation source:

`supabase/staging/client-media-reconciliation.json`

Confirmed unresolved assets remain:

- Liquid Brun ambiguity
- Versace Eros EDP ambiguity
- lovely-cherry: no reconciled PNG
- royal-blend-sequoia: no reconciled PNG
- sceptre-malachite: CLIENT_ASSET_MISSING
- Cuarteto Oriental Vainilla Freak: orphan files

Never replace these by fuzzy or web-image guesses.

### 4F2B

Portable Cloudinary namespace:

`cruzial/parfums/catalog/<legacy_id>/...`

Never use environment product UUID as permanent media identity.

Initial controlled migration and correctness hardening are APPLIED / VERIFIED
on staging `iyxidhglyqkzoziyewlc`: 190 Phase-4F2B `product_media` rows across
92 products. The original 186 public IDs have zero churn; four distinct
duplicate-slot photos are retained as content-addressed supplemental assets.
Cloudinary is idempotent (190 verified, 0 upload/missing/blocked/conflict). DB
is idempotent (190 unchanged, 0 insert/conflict); all checksums/provenance match,
`product_variant_id = null`, there are 92 primary rows and 0 primary violations.
Migration `20260908160000_client_media_checksum_integrity.sql` is synced.

## Settings (4G1)

Typed `public_contact` key on `public.settings` (whatsappNumber, whatsappDisplay,
contactEmail), independent rows per unit (`parfums`, `import`), both
`is_public = true`, values match the confirmed contact
(`51926390591` / `926 390 591` / `dominiocruzial@gmail.com`).

Sole write path: `public.admin_update_public_contact_setting` (security
definer, `app.assert_admin_for`, optimistic concurrency on `updated_at`,
atomic `settings_change` audit_log entry). `authenticated` has no
table-level INSERT/UPDATE/DELETE grant on `settings` any more — the prior
`settings_admin_write` RLS policy allowed a direct, unaudited write; that
grant revoke is what closes it, with the policy kept as a second layer.
A `before insert or update` trigger (`app.validate_settings_value`)
re-validates the same three-field shape at the database layer regardless of
caller. Migration: `20260908170000_admin_settings_public_contact.sql`.
pgTAP: `supabase/tests/14_admin_settings_public_contact.sql` (18 checks).

Admin UI: `/admin/parfums/configuracion` (Parfums only this phase) — admin
edits, viewer read-only, stale-write and validation feedback, no raw JSON.
Import gets its own DB row already; its Admin UI is not in scope for 4G1.

`apps/web/src/domains/platform/settings.ts` (static PARFUMS_SETTINGS /
IMPORT_SETTINGS) is unchanged and still what public V2 consumers read —
the DB row is the staged canonical value for the future storefront cutover,
not wired to any public runtime path in this phase.

## Audit Log (4G2)

Confirmed integrity gap closed: `audit_log_admin_insert` let any
authenticated admin INSERT an `audit_log` row directly (actor-spoof-proof
via `actor_user_id = auth.uid()`, but not fabrication-proof — a row
disconnected from any real mutation was still possible). Fix: dropped that
policy and revoked `authenticated`'s table-level INSERT grant on
`audit_log`, so `app.write_audit_log()` is now the only path any mutation
RPC can reach. It moved from `SECURITY INVOKER` to `SECURITY DEFINER` (the
grant it relied on is gone) and now calls `app.assert_admin_for()` itself,
since DEFINER bypasses RLS — authorization moved from a policy to an
explicit statement, not weakened. `actor_user_id` still always comes from
`auth.uid()`, never a parameter. UPDATE/DELETE remain blocked by the
existing unconditional trigger regardless. Migration:
`20260908190000_admin_audit_log_integrity_and_read_model.sql`.

Read model: `public.admin_list_audit_log` (paginated, capped at 30/page,
`action`/`entity_type` filters) and `public.admin_get_audit_log_entry`
(single row with before/after, scoped to the caller's resolved unit) — both
`SECURITY DEFINER` solely to resolve actor email from `auth.users` at read
time; nothing is persisted. `app.can_read_unit` gates both, so admin and
viewer read, Import-only and anon do not.

Admin UI: `/admin/parfums/auditoria` (list) and `/admin/parfums/auditoria/[id]`
(detail) — read-only, no mutation of any kind. Detail renders a bounded
field-level diff (`computeFieldChanges`, capped at 40 fields, sensitive key
names redacted outright); unknown future action/entity/field values degrade
to a humanized fallback label instead of crashing. Auditoría card promoted
from placeholder to implemented on `/admin/parfums`.

pgTAP: `supabase/tests/15_admin_audit_log.sql` (19 checks — fabrication
denied, real mutation still audits, actor spoof impossible, cross-unit
denied, UPDATE/DELETE denied, admin/viewer read, Import-only/anon denied,
pagination, filters, detail scoping, security-definer read model).
`supabase/tests/02_rls_business_unit_isolation.sql` updated: its old
lives_ok on a direct audit_log INSERT is now throws_ok, matching the fix.

## Admin Import — Consolidado lifecycle (4J1)

Two confirmed gaps closed before any campaign mutation surface was built:

- **Public visibility.** `campaigns_public_read`/`app.campaign_is_public`
  previously treated `scheduled`/`open`/`paused` as public. Narrowed to the
  confirmed contract: only `status = 'open' AND archived_at IS NULL AND`
  business unit = `import`. draft/scheduled/paused/closed/fulfilled/archived
  are all private. `campaign_products` inherits this unchanged (it already
  delegated to `app.campaign_is_public`).
- **Direct-write/audit bypass.** `authenticated` had table-level
  INSERT/UPDATE/DELETE on `campaigns`/`campaign_products` through PostgREST,
  bypassing any audited RPC. Revoked (same posture as 4G1 Settings); the RLS
  write policies stay as a dormant second layer. `campaign_products` has no
  mutation RPC yet — closing its direct-write path now means 4J2 cannot
  inherit an unaudited bypass.

Migration: `20260909000000_admin_import_consolidados.sql`. Also adds additive
guards (`number > 0`, non-blank `name`, `public_message` ≤ 2000 chars).

Lifecycle RPCs (all `SECURITY DEFINER`, `app.assert_admin_for`, atomic
`app.write_audit_log`, optimistic concurrency via `updated_at`):
`admin_create_campaign` (always creates `draft`, business unit resolved
server-side to `import`, never a parameter), `admin_update_campaign`
(metadata only — name/opens_at/closes_at/public_message, never touches
status), `admin_set_campaign_status` (explicit lifecycle action, audited as
`campaign_state_change`; status is never inferred from opens_at/closes_at —
no scheduler exists), `admin_archive_campaign` (soft archive, no cascade, no
restore workflow — not confirmed, so not invented).

pgTAP: `supabase/tests/16_admin_import_consolidados.sql` (31 checks — create/
edit/status/archive audited, direct-write denied, duplicate number/invalid
window rejected, stale update rejected, viewer/Parfums-only-admin/anon all
denied, actor spoof impossible, full public-visibility matrix per status).

Admin UI: `/admin/import/consolidados` (list, Spanish status labels:
Borrador/Programado/Abierto/Pausado/Cerrado/Completado),
`/admin/import/consolidados/nuevo` (create), `/admin/import/consolidados/[id]`
(metadata edit + explicit status control + archive). Viewer read-only. No
generic JSON editor, no campaign-product table (that is 4J2). Opening a
campaign with zero campaign_products only warns in the UI — 4J2 has not
shipped, so nothing blocks it at the database layer. `/admin/import` landing
promotes "Consolidado / Campañas" from placeholder to implemented; every
other Import section stays a placeholder. datetime-local inputs are
explicitly Lima-time (`America/Lima`, fixed UTC-5) and converted to/from
timestamptz server-side (`campaign-schema.ts`) — never left to the browser's
own timezone.

Deferred to 4J2 on purpose: "duplicate previous campaign" was not built — a
correct duplicate should clone `campaign_products` atomically too, which
does not exist until 4J2; shipping a metadata-only duplicate now would be
misleading.

Verified: local `supabase db reset` + full pgTAP suite (16 files, 407 checks,
0 regressions), `next build`/`tsc`/`eslint --max-warnings=0` all green,
targeted Vitest (39 files, 259 tests). `supabase db push --dry-run` against
staging (`iyxidhglyqkzoziyewlc`) showed only this one migration; pushed with
explicit user confirmation. No Sexto Consolidado data was seeded (PDF not
parsed this phase, per 4J1 scope).

### 4J1 correctness micro-patch

External review found two real gaps, both closed additively:

- **Cross-unit RPC scope.** `admin_update_campaign`/`admin_set_campaign_status`/
  `admin_archive_campaign` authorized with
  `app.assert_admin_for(v_before.business_unit_id)` — whatever unit the loaded
  row actually belonged to — instead of being intrinsically Import-scoped
  like `admin_create_campaign` already was. An admin of another unit could in
  principle call these Import-only RPCs on a campaign row, if a cross-unit
  one existed. Fixed: each function now resolves the canonical Import
  `business_unit_id` itself and requires the loaded campaign to belong to it
  before authorizing — a wrong-unit campaign id is rejected identically to a
  nonexistent one (`P0002`), so the error never reveals whether a cross-unit
  row exists. Migration:
  `20260909010000_admin_import_consolidados_unit_scope_fix.sql`
  (`create or replace function`, no data changes).
- **`campaign_products` RLS test gap.** The original pgTAP suite only checked
  the `app.campaign_is_public()` helper, not the real
  `campaign_products_public_read` policy — which (from
  `20260907154401_integrity_hardening.sql`, already in place before 4J1) also
  requires the referenced product itself to be `app.product_is_public()`.
  Added real `campaign_products` rows across all seven campaign states and
  queried the table directly as anon.

pgTAP: `supabase/tests/16_admin_import_consolidados.sql` extended to 46
checks — cross-unit denial on all three RPCs (row proven unchanged after),
Import admin still works normally on its own campaign right after, and the
full `campaign_products` public-visibility matrix against the real table
policy. 16 files / 422 checks total, 0 regressions.

Browser smoke (local, temporary Supabase Auth users, not hosted) caught a
real bug the RPC-level tests couldn't see: the campaign number field on the
edit form used `disabled` for "not editable", which excludes it from
`FormData` entirely — every metadata edit failed the required-field check.
Fixed to `readOnly` (`apps/web/src/components/admin/campaign-form-fields.tsx`).
Re-verified end to end: Import admin create → edit → status → archive, Import
viewer read-only (list, detail, no mutation controls, no create link), no
horizontal overflow at 320/390/768/1440.

`supabase db push --dry-run` showed only the one correction migration;
pushed to `iyxidhglyqkzoziyewlc` after explicit confirmation. The migration
contains no data statements (functions only), and `migration list` confirms
local/remote stay in sync — existing Parfums/Import data untouched.

## Admin Import — Campaign Products / Prices / Availability (4J2)

Adds `admin_set_campaign_products` — the sole write path for
`campaign_products` (price, currency, availability, quantity_limit,
sort_order per consolidado), full-replace in one transaction, exactly the
same shape as `admin_set_combo_composition` for `combo_items` (the admin UI
holds the whole desired line-item set client-side and submits it as one
array on save). `SECURITY DEFINER` because `authenticated` has no
table-level write grant on `campaign_products` (revoked in 4J1, specifically
so 4J2 could not inherit an unaudited bypass). Intrinsically Import-scoped
identically to the 4J1 correction: resolves the Import `business_unit_id`
itself and rejects a `campaign_id` belonging to another unit exactly like a
nonexistent one (`P0002`). `currency` is never a parameter — always `'PEN'`,
since Import currency/price-display policy is UNKNOWN. Referential guards:
a product/variant must belong to Import and not be archived, and an
archived campaign cannot have its products edited. Audited as
`composition_update` (existing vocabulary — no constraint extension
needed). Migration: `20260909020000_admin_import_campaign_products.sql`.

pgTAP: `supabase/tests/17_admin_import_campaign_products.sql` (26 checks —
full replace correctness, cross-unit/archived-product/archived-variant/
negative-price rejection with no partial writes, stale-write rejection,
archived-campaign block, cross-unit RPC scope both directions, viewer/anon
denial, direct-table-write still closed, empty-replace clears the set). 17
files / 448 checks total, 0 regressions.

Admin UI: `CampaignProductsManager`
(`apps/web/src/app/admin/import/consolidados/[id]/campaign-products-manager.tsx`),
mirroring `CompositionManager`'s add/remove/reorder-then-save local-state
design, embedded in the existing `CampaignEditor` (no separate workspace
wrapper needed — `CampaignEditor` already owned the campaign row as the
shared `updated_at` concurrency token across metadata/status/archive; the
products manager threads through the same pattern). Price/availability/
quantity_limit are entered fresh per line, never copied from a reference
price — they belong to the campaign, not the base product
(client-decisions.md: "products/prices/availability may differ by
campaign"). Product/variant picker reads Import's non-archived products via
`AdminImportCampaignProductsRepository.listEligibleProducts` — empty until
4J3 populates the Import base catalog; the UI states that dependency
explicitly rather than treating an empty catalog as an error. The "opening
with zero products" warning on the Estado section (added in 4J1 as a
placeholder note) now reads the real, live product count.

Verified: local `supabase db reset` + full pgTAP suite, `next build`/`tsc`/
`eslint --max-warnings=0`/Vitest all green (40 files / 270 tests). Local
browser smoke (temporary Supabase Auth users): admin adds a product+variant
line, saves, reloads and confirms persistence + the `composition_update`
audit row; viewer sees the same table read-only with no add/save controls;
320/390/768/1440 all clean, no horizontal overflow. `db push --dry-run`
showed only this migration; pushed to `iyxidhglyqkzoziyewlc` after
confirmation.

### 4J2 correction (external review — P1 defects + missing scope)

External review found confirmed 4J2 defects. This pass fixes:

- **Exact decimal money**: `CampaignProductItemInput.priceAmount` was a JS
  `number`, parsed with `Number()`/`Math.round(price*100)/100`. Replaced
  with a canonical decimal-TEXT contract end to end (`"16.00"`), validated
  by regex (`^\d{1,10}(\.\d{1,2})?$`, no sign, no scientific notation),
  normalized only by string padding, never JS arithmetic
  (`campaign-products-schema.ts`). The RPC already cast jsonb TEXT straight
  to `numeric` (no float involved server-side); it now also re-validates the
  same syntax itself (`P2009`) since it is independently callable through
  supabase-js, not only through the validated server action.
- **Availability fail-closed**: `coalesce(elem->>'availability_status',
  'available')` and the TS schema's `?? "available"` both silently
  defaulted a missing/unsupported value to `available`. Both now reject
  (TS field error; RPC `P2008`) — only exactly `available`/`out_of_stock`
  is valid.
- **quantity_limit removed from browser-authoritative input**: not a
  confirmed Import feature (`docs/client-decisions.md`: UNKNOWN). Removed
  from `CampaignProductItemInput`, the manager UI's table and add-row form
  entirely. `admin_set_campaign_products` no longer reads `quantity_limit`
  from `p_items` at all — it snapshots each existing association's value by
  `(product_id, product_variant_id)` before the delete and re-applies it on
  insert; a brand-new association always gets `NULL`. The browser has no
  path to set or overwrite it.
- **`admin_duplicate_campaign`** (deferred 4J1 scope, implemented now): one
  atomic `SECURITY DEFINER` RPC — Import-scoped intrinsically, wrong-unit
  source looks not-found, destination always `draft` with `opens_at`/
  `closes_at`/`public_message` reset (no confirmed rule for carrying stale
  marketing text forward), every `campaign_products` row copied exactly
  (`price_amount`/`currency`/`availability_status`/`quantity_limit`/
  `sort_order`), whole operation one transaction (any failure leaves no
  partial destination campaign), audit metadata bounded to
  source/destination id+number+copied-offer-count — never the product
  array. UI: `DuplicateCampaignControl`
  (`consolidados/[id]/duplicate-campaign-control.tsx`), admin-only, asks
  only nuevo número + nuevo nombre, redirects to the new campaign on
  success.

Migration: `20260909030000_admin_import_campaign_products_correction.sql`
(additive — `20260909020000_admin_import_campaign_products.sql` was already
applied to staging and was not edited). pgTAP: `supabase/tests/
18_admin_import_campaign_products_correction.sql` (35 checks — fail-closed
availability, decimal syntax guard, quantity_limit preservation and
new-association-null, duplicate RPC correctness/atomicity/authorization/
unit-scope). `supabase/tests/17_admin_import_campaign_products.sql` updated
in place (not a migration — a few assertions encoded the old, now-incorrect
behavior: a negative price used to fail the table's `23514` check constraint
and now fails the RPC's own `P2009` syntax guard first; a client-sent
`quantity_limit` used to be written through and is now proven ignored).
Vitest: `campaign-products-schema.test.ts` rewritten for the decimal-text
contract and fail-closed availability (34 tests); `campaign-schema.test.ts`
gained `validateDuplicateCampaignForm` coverage (20 tests). Full suite: 40
files / 293 tests, `tsc --noEmit` and `eslint --max-warnings=0` both clean.

### 4J2 correction, part 2 (readiness model + summary + bounded picker)

- **`classifyOfferReadiness`** (`campaign-readiness.ts`) — a pure function
  mirroring the real RLS conjunction exactly (`app.campaign_is_public` AND
  `app.product_is_public` AND, when a variant is set, `app.variant_is_public`
  — untouched, no defect found so no RLS edit): campaign gates first
  (archived_at, then status = open), then product gates (archived_at,
  draft, or publication_status = 'archived' while archived_at is still
  null → "hidden"), then variant gates when the offer has one. Returns
  `{ isPubliclyVisible, visibilityReason, availability }` — visibility and
  availability are deliberately independent fields, never collapsed into
  one label; an `out_of_stock` offer can be `isPubliclyVisible: true`.
  14 focused pure-function tests (`campaign-readiness.test.ts`).
- **Admin read model**: `CampaignProductItem` gained
  `productPublicationStatus`/`productArchivedAt`/`variantPublicationStatus`/
  `variantArchivedAt` (only what the classifier needs — no unrelated catalog
  fields) and **dropped** `quantityLimit` entirely, since nothing in the UI
  needs to display it (kept server-internal per the review's own
  preference). `setCampaignProducts` now returns `itemCount: number`
  instead of the full RPC row set, for the same reason — the raw
  `campaign_products` rows (which carry `quantity_limit`) never round-trip
  into the server action's response payload.
- **Per-line indicators + open-campaign summary**: each configured offer in
  `CampaignProductsManager` shows two independent badges (e.g. "Visible
  públicamente" + "Agotado"), and a `Productos configurados / Visibles
  públicamente / Bloqueados por publicación / Agotados` summary sits above
  the table, computed live from local state (so an unsaved edit previews
  its effect before "Guardar productos"). A non-open/archived campaign gets
  an explicit note that 0 public-visible is expected, not a bug. Nothing
  here auto-publishes, auto-opens, or auto-changes availability.
- **Bounded picker**: `listEligibleProducts` (loaded the entire non-archived
  Import catalog) replaced with
  `AdminImportCampaignProductsRepository.searchEligibleProducts({query,
  limit})` — Import-only, non-archived, name/brand `ilike` search, capped at
  50 (the picker action itself requests 20), embedded non-archived variants
  with their own `publication_status`. New server action
  `searchEligibleImportProductsAction` (admin-gated, same posture as every
  other campaign_products mutation even though it's a read). UI: a search
  box replaces the old `<select>` of the whole catalog, 300ms debounced,
  results show Publicado/Borrador/Oculto badges, archived products are
  never returned so never selectable. The `[id]/page.tsx` SSR call now
  requests a bounded first page (`limit: 20`), never the whole catalog.

**DB gate — actually executed, not statically inspected**: `npx supabase
start` + `npx supabase db reset` (local Docker stack; `npx supabase
--version` works fine even without a global `supabase` binary — the
correction above about "Supabase CLI unavailable" was wrong) applied all 21
migrations including the correction cleanly. `npx supabase test db`: 18
files / 483 checks, `Result: PASS` — including file 18 (new, 35 checks) and
the corrected assertions in file 17. `npm run check` (catalog:check,
commercial:check, lint, typecheck, 41 files/312 Vitest tests, `next build`)
green end to end. Local browser smoke with temporary Supabase Auth users
(`import-admin-smoke@…`, `import-viewer-smoke@…`, granted via
`supabase/provisioning/grant-admin-membership.sql`) and three seeded
smoke-test Import products (published/draft/hidden publication states):
admin searched the picker, added a published variant at "129.90", saved,
reloaded and confirmed persistence; opened the campaign and watched
"Visibles públicamente" flip live; set availability to Agotado and
confirmed the offer stayed "Visible públicamente" + "Agotado" simultaneously
(proves independence in the running app, not just in tests); duplicated the
campaign (#502, draft, dates/message empty, price/availability copied
exactly); confirmed the viewer sees a fully read-only page with no Cambiar
estado / Guardar / Duplicar / Agregar controls at all. 320/390/768/1440 all
`scrollWidth === clientWidth` (no horizontal overflow).

**Staging**: `db push --dry-run` showed only
`20260909030000_admin_import_campaign_products_correction.sql`, pushed to
`iyxidhglyqkzoziyewlc`, `migration list --linked` confirms local/remote are
now fully in sync (21/21). No fake hosted campaign/product data — only the
migration went to staging; the smoke-test users/products above are local
Docker-only and never left this machine.

4J2 is now closed.

## Sexto Consolidado structured staging (4J3)

The deterministic, no-database-write extractor now converts the untracked
client source `SEXTO CONSOLIDADO.pdf` into
`supabase/staging/import/sexto-consolidado-staging.json`, with a compact human
review queue in `docs/reviews/4j3-sexto-consolidado-review.md`. Source identity:
SHA-256 `394874f026f7cdd6600e4ecb6c2456279980a501a700cba6d9182632d76e0493`,
150,568,778 bytes, 76 pages.

Native layout extraction plus targeted visual verification accounts for all
76 pages: 71 parsed, 4 no-catalog divider/cover pages, and 1 page requiring
manual review. The staging artifact retains all 845 commercial source
occurrences without merging them: 741 high-, 103 medium-, and 1 low-confidence
record; 772 have one clear canonical decimal-text price, 60 have multiple
source prices kept as options, 12 are visually confirmed `AGOTADO`, and the
remaining malformed page-7 price is deliberately unparsed. It also records 3
source-backed candidate categories, 32 packs/sets (never Parfums combos), 6
exact-name duplicate groups for reconciliation, generic capacity/presentation
evidence, and per-block media presence. No OCR was required.

Import variant/presentation architecture still needs a reviewed decision:
capacity and pack evidence was not forced into the Parfums `decant`/`bottle`
model. Product-image extraction/upload is deferred to a later Import media
review. Every staged row remains unapproved; human review is required before
4J4. No Supabase data, migration, contact setting, public storefront, or other
business state changed in 4J3.

4J3 is complete as a structured staging/review capability; 4J4 remains gated
on human approval of this dataset.

### 4J3R review resolution and canonical reconciliation

The deterministic review layer now reads the unchanged 845-occurrence 4J3
artifact and emits `sexto-consolidado-reviewed.json`: 842 conservative
canonical products and 913 campaign-offer candidates. Three of the six prior
exact-name groups are proven same-product occurrences (Accento, Arabia Heroes,
CDN Preciux IV) and share canonical identity while every occurrence and price
remains traceable; the other three remain distinct because the PDF proves a
different gendered product, pack configuration, or offer kind.

Brand resolution is complete for all 842 canonical products with per-product
provenance (PDF packaging/repeated family or narrowly recorded external
verification). The combined PDF section is resolved per product into 264
designer and 164 niche canonical products from its page sequence, never price.
Presentation review yields 738 single-fixed, 60 multi-presentation, 32
pack/set, and 12 presentation-ambiguous canonical products. All 60 multi-price
source records map every printed amount to a presentation-specific offer; all
32 packs/sets carry conservative evidence and remain outside `public.combos`.

The sole human commercial decision left is Vanilla Freak on page 7: the 75 ml
presentation is visible but its price digits overlap and remain deliberately
null. The 12 explicit `AGOTADO` occurrences map to out-of-stock candidates;
the other 833 availability values stay source-unknown without blocking source
preservation. No automatic publication is permitted.

Schema inspection rejected forcing Import into the existing mandatory-price,
`decant`/`bottle` variant model. The recommended V1 is canonical products plus
price-free structural Import presentations and campaign-scoped offers, with
campaign price and availability continuing to belong to campaign rows. This is
an architecture recommendation only: no migration or database write occurred.
4J3R is complete; 4J4 remains stopped pending the page-7 decision and an
explicitly authorized implementation of the chosen presentation model.

## Orders / payments

Cruzial V1 does NOT charge through the website.

No:

- Culqi
- Mercado Pago
- Stripe
- Yape API
- Plin API
- cards
- payment webhook

Parfums flow:

cart
→ server validation
→ persistent order request
→ `pending_whatsapp_confirmation`
→ WhatsApp coordination

WhatsApp is not payment confirmation.

## Wholesale confirmed rule

Scope:

`per_commercial_type`

Commercial types:

- arabic
- designer
- niche

Threshold:

40 eligible bottle units inside the same commercial type.

Discount per eligible bottle:

- arabic: S/5
- designer: S/7
- niche: S/10

Different products within the same commercial type combine.
Different commercial types do not.
Decants do not count.

## Client media safety

`img/perfumes/*.png` are client originals.

Never:

- delete
- move
- rename
- crop
- background-remove
- AI-edit
- destructively optimize
- bulk-stage

White backgrounds are intentional.

## Current blockers / unresolved business decisions

- 24 bottle-price variants across 23 products remain legacy/unconfirmed.
- 3 legacy combo compositions remain pending reconfirmation.
- Exact inventory operating model remains unknown.
- `sceptre-malachite` replacement asset missing.
- Import operational/catalog/campaign work remains incomplete.
- Production admin bootstrap/MFA/recovery still needs final operational decision.
- A formal Lighthouse (or PageSpeed Insights) run against the Preview is still
  outstanding — this environment has no Lighthouse tooling; only Navigation
  Timing was captured in 4I2.
- A literal anonymous-REST re-count of hosted public Parfums products was not
  re-run in 4I2 (CLI env-pull limitation on integration-synced Supabase vars,
  see 4I2 checkpoint); app-level proof shows Supabase connectivity intact.

## Next roadmap

1. 4H2B — Public Parfums Supabase cutover after its blockers close
2. 4J4 — After the remaining 4J3R decision and architecture authorization, use 4J2 to populate the reviewed Sexto Consolidado
3. Import public order flow
4. Global production-readiness audit
5. Production Supabase / Vercel
6. Punto.pe DNS / SEO cutover

Do not jump ahead automatically.

## Validation baseline

Current stable project has green:

- lint
- strict TypeScript
- Vitest
- Next production build
- Supabase migrations from clean local DB
- pgTAP
- targeted browser/E2E gates

Exact counts change as capabilities add tests.

Do not rerun historical suites merely to reproduce an old count.

## Environment rules

- staging only until explicit production phase
- no remote DB reset
- no Production
- no DNS changes
- Preview/Admin stay noindex
- secrets never printed or committed
- client source media remains untracked

## Historical details

Use:

- Git commits/diffs
- migrations
- tests

Do NOT expand this file with per-phase implementation diaries.
