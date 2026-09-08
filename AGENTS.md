# AGENTS.md — CRUZIAL PLATFORM V2

## PROJECT

Cruzial V2 lives in `apps/web`.

Stack:
- Next.js 16 App Router
- strict TypeScript
- Supabase/PostgreSQL
- RLS
- pgTAP
- Vitest
- Cloudinary
- Vercel planned

Feature branch:

`codex/feature/cruzial-platform-v2`

Never modify `master` without explicit production-cutover authorization.

Verified Phase 4F2B baseline (staging applied, 186 product_media / 92
products, idempotent):

`190f486` (see docs/progress-v2.md for the full checkpoint record)

Git is authoritative.

---

## BUSINESS UNITS

One platform, two isolated business units:

### Cruzial Parfums

- decants
- full bottles
- combos
- wholesale
- Shalom shipping
- black / white / restrained gold

### Cruzial Import

- periodic Consolidados/campaigns
- deep navy / white / silver

Never mix carts, orders, settings or business data between units.

---

## CLOSED — DO NOT REAUDIT WITHOUT A REAL REGRESSION

- Foundation
- Public Parfums UI/parity
- 4A Products Admin
- 4B Categories Admin
- 4C Combos Admin
- 4D Wholesale Admin
- 4E1 Public Order Request → WhatsApp
- 4E2 Admin Orders
- 4F1 Media Foundation + Admin Media
- 4F2A Client Media Reconciliation Manifest
- 4F2B Controlled Client Media Migration (Cloudinary + staging product_media,
  186 assets / 92 products, applied and verified)

Phase 4F1 includes:

- secure signed Cloudinary upload
- `product_media`
- primary integrity
- optional variant relation
- alt
- ordering
- archive/restore
- audit
- RLS
- Admin Media UI

Staging contains all migrations through 4F1.

---

## CURRENT PUBLIC SOURCE OF TRUTH

Until explicit cutover:

PUBLIC:
`LegacyCatalogRepository`
→ `assets/data.js`

ADMIN:
Supabase

The existing ETL produces staging/reconciliation data.
It does NOT automatically make legacy data commercial truth in PostgreSQL.

Never cut over public storefront implicitly.

---

## ZERO INVENTED COMMERCE

Never invent:

- prices
- stock
- availability
- discounts
- testimonials
- bestseller/demand claims
- authenticity claims
- guarantees
- campaign dates
- customer history

Provenance:

`OFFICIAL_PDF`
`CLIENT_CONFIRMED`
`DERIVED_VALIDATED`
`MARKETING_COPY`
`UNKNOWN`

UNKNOWN is never silently published as fact.

Business decisions:
`docs/client-decisions.md`

---

## WHOLESALE — CONFIRMED

Eligibility aggregates by:

`categories.kind = commercial_type`

Types:

- arabic
- designer
- niche

Threshold:
40 full-bottle units inside the SAME commercial type.

Products within same type combine.
Different commercial types do not.

Discount:

- arabic: S/5
- designer: S/7
- niche: S/10

Decants do not count.

Do not modify Phase 4D unless a regression proves it necessary.

---

## PAYMENTS / ORDERS

Cruzial V1 has NO online payment gateway.

Never implement without new explicit instruction:

- Culqi
- Mercado Pago
- Stripe
- Yape API
- Plin API
- cards
- payment webhooks
- paid/payment-confirmed state

Flow:

cart
→ checkout
→ server validation
→ persistent request
→ `pending_whatsapp_confirmation`
→ WhatsApp

WhatsApp is coordination, not payment confirmation.

---

## CLIENT PHOTOS — CRITICAL

`img/perfumes/*.png`

are original client photographs.

Never:

- delete
- move
- rename
- crop
- background-remove
- AI-edit
- destructively optimize
- `git add` them in bulk

White backgrounds are intentional.

`sceptre-malachite` has no confirmed replacement photo:

`CLIENT_ASSET_MISSING`

Never substitute an internet image.

---

## CLOUDINARY

Required env names:

- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

Never print secret values.

Never expose API secret through `NEXT_PUBLIC_*`.

Signed operations server-side.

Preserve source/original assets.

No automatic background removal.

---

## SECURITY

Server authorization + RLS.

Parfums Admin:
read/write where capability permits.

Parfums Viewer:
read only.

Import-only:
cannot access Parfums Admin data.

Anonymous:
Admin denied.

Never trust browser-provided:

- business_unit_id
- actor UID
- role
- authoritative price
- authoritative discount
- Cloudinary metadata

---

## SUPABASE

Migrations append-only.

Never rewrite migrations already applied to staging.

Local first.

Never:

`supabase db reset --linked`

No remote reset.

No production changes.

Staging:

`cruzial-v2-staging`
ref: `iyxidhglyqkzoziyewlc`

---

## GIT SAFETY

Always inspect Git first.

Explicit staging only.

Never:

- `git add -A`
- `git clean`
- `git reset --hard`
- `git restore .`
- broad checkout
- rebase
- merge

Preserve:

- client PNG/PDF
- `.env`
- `.env.local`

Push only feature branch after green gate.

---

## TOKEN / CONTEXT POLICY

Context is a budget.

Always:

- search before read
- inspect only directly relevant files
- targeted tests while developing
- commit stable checkpoints early
- full relevant gate once at end

Avoid:

- rereading closed phases
- giant logs
- repeated full suites
- global responsive audits
- unnecessary subagents
- repeatedly reading all docs

`docs/progress-v2.md` contains current state.

Use Git history for historical details.

---

## CURRENT ROADMAP

Closed:

4A Products
4B Categories
4C Combos
4D Wholesale
4E1 Public Orders
4E2 Admin Orders
4F1 Media Foundation
4F2B Controlled Client Media Migration

Next — not started without explicit instruction:

4G — Settings + Audit UI
4H2 — Public Parfums Supabase Cutover
4I — Vercel Preview + remote Auth
Import / Consolidados
Global QA
Production / Punto.pe domain

Do not jump ahead automatically.

---

## DOMAIN

Client owns final domain through Punto.pe.

Do not modify DNS yet.

No Production deploy or indexing until Preview + QA are complete.
