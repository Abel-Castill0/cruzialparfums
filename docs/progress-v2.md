# CRUZIAL PLATFORM V2 — CURRENT STATE

Last updated: 2026-09-08

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
- Vercel planned

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

Do not re-audit closed capabilities without evidence of regression.

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
- Remote Auth site/redirect URLs wait for Vercel Preview.
- Import operational/catalog/campaign work remains incomplete.
- Production admin bootstrap/MFA/recovery still needs final operational decision.
- Real Lighthouse/Web Vitals wait for Preview.

## Next roadmap

1. 4G — Settings + Audit UI
2. 4H2 — Public Parfums Supabase cutover
3. 4I — Vercel Preview + hosted Auth configuration
4. Parfums Preview QA
5. Import Admin / Consolidados
6. Import public order flow
7. Global production-readiness audit
8. Production Supabase / Vercel
9. Punto.pe DNS / SEO cutover

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
