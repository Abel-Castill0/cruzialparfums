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
- Lighthouse/Web Vitals remain for 4I2 Preview QA.

## Next roadmap

1. 4I2 — Parfums Preview QA
2. 4H2B — Public Parfums Supabase cutover after its blockers close
4. Import Admin / Consolidados
5. Import public order flow
6. Global production-readiness audit
7. Production Supabase / Vercel
8. Punto.pe DNS / SEO cutover

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
