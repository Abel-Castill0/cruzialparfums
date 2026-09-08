# AGENTS.md — CRUZIAL PLATFORM V2

Persistent project instructions for OpenCode and any coding agent working on
Cruzial Platform V2.

This file governs V2 work under `apps/web`, Supabase, Admin, Import and the
future production platform.

`CLAUDE.md` at repo root primarily documents the legacy static storefront.
Shared business-data and client-asset safety rules from it remain applicable,
but legacy instructions such as "No build step" do NOT describe V2.

---

# 1. PROJECT GOAL

CRUZIAL is one platform with two isolated business units:

1. CRUZIAL PARFUMS
2. CRUZIAL IMPORT

One Next.js application.
One Supabase infrastructure/project per environment.
Shared authentication/infrastructure.
Business data, carts, orders, settings and Admin access remain isolated by
business unit.

Current technology:

- Next.js 16
- App Router
- strict TypeScript
- Supabase / PostgreSQL
- RLS
- pgTAP
- Vitest
- Cloudinary media integration in progress
- Vercel planned for Preview/Production

V2 lives in:

`apps/web`

Feature branch:

`codex/feature/cruzial-platform-v2`

`master` is the current legacy GitHub Pages production branch and MUST remain
untouched until an explicit production cutover.

---

# 2. CURRENT VERIFIED BASELINE

Remote GitHub baseline before the current local Media work:

`438edd2d3e261f48687526f363a6bd87fc729167`

That commit closes:

- Phase 4A — Admin Parfums Products
- Phase 4B — Admin Parfums Categories
- Phase 4C — Admin Parfums Combos
- Phase 4D — Admin Parfums Wholesale
- Phase 4E1 — Public Order Request → WhatsApp
- Phase 4E2 — Admin Parfums Orders Inbox / Detail

Phase 4F1 (Media Foundation + Admin Media) is closed locally (commits
`d265d4a` and `754663a`) but may not be pushed to remote yet.

Do NOT re-audit or rewrite those phases unless a concrete regression proves
that they are involved.

GitHub remote may legitimately remain at the baseline while the current
Phase 4F1 has local checkpoint commits not yet pushed.

Always inspect local Git before assuming remote == local.

---

# 3. CURRENT PHASE — 4F1 CLOSED, NEXT: 4F2

CAPABILITY CLOSED:

Phase 4F1 — Media Foundation + Admin Parfums Media. CLOSED.

Claude Code started this phase and then ran out of usage quota.

There may already be legitimate LOCAL commits after remote baseline
`438edd2`.

DO NOT discard, reset, reimplement or overwrite them.

Known progress from the previous agent:

## Checkpoint A

Implemented DB/domain Media foundation.

A new additive Media migration exists.

pgTAP was run after fixing:
- a constraint/vocabulary compatibility issue;
- Media fixtures/RLS visibility.

Result at that checkpoint:

272 pgTAP assertions PASS,
including 30 new Media assertions.

Supabase database types were regenerated.

Checkpoint A was committed locally.

## Checkpoint B

Implemented substantial Media/Admin application code including:
- Media repository/domain layer;
- Product editor Media integration;
- Media manager UI;
- Cloudinary server integration;
- env contract names;
- related styling/tests.

TypeScript, lint and Vitest were green at that checkpoint.

Checkpoint B was committed locally.

An earlier generated-types command briefly introduced CLI output/noise into
the generated type file. The previous agent detected this and corrected it in
Checkpoint B.

Before Phase 4F1 is closed, verify that NO CLI/log output remains embedded in
versioned source or generated type files.

## Current live-smoke progress

Local Cloudinary environment wiring was completed without printing secret
values.

The root ignored `.env` contained a non-standard `Cloud_name` key. The previous
agent mapped the required values into:

`apps/web/.env.local`

with the correct application variable names.

All required Cloudinary variables were reported as present and non-empty.

A temporary local Admin test user/product was created.

The real Admin Product editor loaded and its Media section rendered.

A synthetic TEST image was uploaded through the real Cloudinary integration
into an isolated path under approximately:

`cruzial/parfums/products/<test-product-id>/`

The upload was registered through the Media DB mutation/RPC.

The agent stopped while reloading the product page to continue exercising the
Media card.

Therefore:

THERE MAY CURRENTLY BE:
- a synthetic Cloudinary TEST asset;
- a local synthetic product;
- a product_media test row;
- a local synthetic Admin user.

Inspect before creating new equivalents.

Do not create unnecessary duplicates.

Phase 4F1 is closed. The synthetic Cloudinary TEST asset has been deleted,
local fixtures cleaned, staging migration pushed, full gate (db:reset + db:test
+ check) passed with 272 pgTAP assertions and 200 vitest tests. All remaining
4F1 work has been committed.

---

# 4. IMMEDIATE RECOVERY RULE

At the start of the first OpenCode session after this handoff:

run only:

```bash
git status --short --branch
git branch --show-current
git rev-parse HEAD
git log --decorate --oneline -10
git log origin/codex/feature/cruzial-platform-v2..HEAD --oneline
git diff --stat
git diff --name-status
git diff --staged --stat

Classify existing work before editing.

NEVER start with:

git pull
git reset --hard
git restore .
git checkout .
git clean
git stash
git rebase
git merge
git add -A

Preserve all legitimate local Media checkpoint commits.

If HEAD is ahead of remote, that is expected if the commits correspond to
Phase 4F1.

5. BUSINESS UNITS
CRUZIAL PARFUMS

Business model:

decants;
full bottles;
combos;
wholesale.

Visual identity:

black;
white;
neutral greys;
gold only as restrained accent.

Shipping:

Shalom.

Current public operational contact:

WhatsApp: +51 926 390 591
E.164: 51926390591
email: dominiocruzial@gmail.com

Do not duplicate these values in random components.
Use centralized settings/contracts.

CRUZIAL IMPORT

Separate business unit.

Visual identity:

deep navy;
white;
silver.

Operational model revolves around periodic "Consolidados".

Import is NOT currently the active implementation phase.

Do NOT begin Import work during Phase 4F1.

6. ZERO INVENTED COMMERCE

Never invent:

prices;
discounts;
stock;
availability;
bestseller claims;
demand claims;
testimonials;
guarantees;
shipping promises;
authenticity claims;
product performance claims;
wholesale rules;
campaign dates;
customer history.

Valid provenance classes:

OFFICIAL_PDF
CLIENT_CONFIRMED
DERIVED_VALIDATED
MARKETING_COPY
UNKNOWN

UNKNOWN is not published as fact.

When uncertain:

omit;
show "Consultar";
or explicitly flag for client review.

Client business decisions live in:

docs/client-decisions.md

Read only the relevant section for the current task.

7. PARFUMS WHOLESALE — CONFIRMED

Wholesale threshold scope is:

per_commercial_type

NOT:

per product;
global per order.

Commercial classifications use stable DB category identity:

categories.kind = 'commercial_type'

Stable commercial types:

arabic
designer
niche

Threshold:

40 eligible full-bottle units inside the SAME commercial type.

Different products of the same commercial type combine.

Different commercial types do NOT combine.

Discounts:

arabic: S/5 per eligible bottle
designer: S/7
niche: S/10

Only full-bottle variants count.

Decants do not count.

Do not implement fuzzy matching on visible category labels.

Phase 4D is closed; do not modify this engine unless a demonstrated regression
requires it.

8. CHECKOUT / PAYMENTS — CONFIRMED

Cruzial V1 does NOT process payments inside the website.

Do NOT implement:

Culqi
Mercado Pago
Stripe
Yape API
Plin API
cards
payment intents
payment webhooks
paid/payment-confirmed state

Current Parfums flow:

cart
→ checkout
→ server-side commercial revalidation
→ persistent order request
→ pending_whatsapp_confirmation
→ WhatsApp coordination.

Opening WhatsApp is NOT payment or order confirmation.

Approved concept:

"Tu solicitud fue registrada. Termina la coordinación por WhatsApp."

Phase 4E1 is closed.

9. ORDERS

Public Parfums currently validates commercial truth against:

LegacyCatalogRepository

The browser is never authoritative for:

price;
subtotal;
product name;
discount;
commercial type;
business unit.

Order snapshots are historical and immutable.

Admin Orders Phase 4E2 is read-only:

Inbox
Detail
search
pagination
customer/delivery snapshots
line snapshots
WhatsApp contact.

Do NOT invent an order lifecycle/status workflow yet.

Do NOT add:

paid;
preparing;
shipped;
delivered;
cancelled;
unless later confirmed as a business contract.
10. CURRENT PUBLIC DATA SOURCE

Until an explicit cutover:

PUBLIC PARFUMS STOREFRONT
→ LegacyCatalogRepository
→ assets/data.js

ADMIN
→ Supabase

This temporary separation is deliberate.

Do NOT migrate public catalog/product pages to Supabase during Phase 4F1.

Do NOT modify assets/data.js merely because Admin data differs.

Future cutover is a separate capability.

11. CLIENT PHOTOGRAPHY — CRITICAL

Repo-root:

img/perfumes/*.png

contains CLIENT ORIGINAL studio photographs.

They are intentionally untracked until controlled migration.

NEVER:

git add them in bulk;
delete;
move;
rename;
background-remove;
flood-fill;
crop content;
regenerate;
AI-edit;
optimize destructively;
overwrite.

White backgrounds are intentional.

Do not treat them as defects.

Legacy deployed optimized copies are under:

img/perfumes/webp/*.webp

One known unresolved product:

sceptre-malachite

does not have a confirmed replacement client photo.

Use:

CLIENT_ASSET_MISSING

Never substitute a random internet image.

Phase 4F1 MUST NOT bulk-upload the client originals.

That belongs to Phase 4F2.

12. CLOUDINARY SECURITY

Cloudinary integration is currently being implemented.

Expected application env variable names:

CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET

The ignored local env files contain actual values.

NEVER print values.

NEVER put the API secret into:

client bundle;
browser;
NEXT_PUBLIC_*;
logs;
docs;
tests;
Git.

Signed upload authorization must be server-side.

Do not use unsigned public upload presets unless a later explicit architecture
decision requires one.

Original Cloudinary assets must be preserved.

Delivery transformations are allowed later, but never overwrite or destructively
process the source asset.

No automatic background removal.

13. MEDIA BUSINESS CONTRACT

Use existing product_media architecture.

Admin Parfums Media should support:

view media;
upload;
associate with product;
optional variant association;
editable alt text;
set primary;
reorder;
archive;
restore.

No hard delete for normal Admin Media records.

Cross-product variant assignment must fail.

Cross-business-unit assignment must fail.

A variant association must belong to the selected product.

The browser must NOT be authoritative for:

product ownership;
business unit;
actor UID;
Cloudinary secure URL;
Cloudinary public ID;
width;
height;
bytes;
format.

Cloudinary response/server validation is authoritative.

Primary-image integrity must be enforced so active media does not accidentally
produce contradictory primary images.

Setting another primary should atomically demote the prior primary for the same
scope.

Archiving a current primary must not leave contradictory state.

Restoring an archived media row must not silently steal primary status.

Audit meaningful mutations using existing audit conventions.

No fake success if Cloudinary succeeds but DB persistence fails.

Explicitly handle/report orphan-upload risk.

14. CURRENT 4F1 COMPLETION TARGET — DONE

Phase 4F1 is now closed. All items in this section have been completed.

inspect local checkpoint commits/worktree;
confirm Cloudinary env contract without printing secrets;
continue the already-started synthetic Media smoke;
verify the Media card appears after DB persistence;
edit alt through real Admin UI;
set primary;
when useful, use a second synthetic TEST media asset to verify ordering;
archive;
restore;
verify DB state after meaningful transitions;
verify Viewer has read-only UI;
verify Import-only is denied;
responsive/accessibility spot-check only on Media surfaces;
cleanup ALL synthetic Cloudinary TEST assets created for this phase;
cleanup local synthetic users/products/media fixtures as appropriate;
verify no CLI noise remains in generated/source files;
final targeted/full gate once;
push only the Phase 4F1 migration to linked Supabase staging after dry-run;
compact docs update;
commit remaining Phase 4F1 work;
push feature branch;
STOP.

Do not begin Phase 4F2.

15. CLOUDINARY TEST-ASSET SAFETY

A real Cloudinary smoke may use only unmistakably synthetic assets.

Use isolated TEST identifiers/folders.

Never touch any pre-existing Cloudinary asset unless it was created by this
Phase 4F1 test and its identity is proven.

At the end:

remove the synthetic TEST Cloudinary asset(s);
remove any temporary local fixture data;
do not remove client media;
do not perform broad folder deletion.

If exact ownership of a Cloudinary asset cannot be proven:
DO NOT DELETE IT.

16. AUTHORIZATION

Roles/memberships are business-unit scoped.

Parfums Admin:

read/write where capability permits.

Parfums Viewer:

read only.

Import-only:

cannot access Parfums Admin data.

Anonymous:

denied Admin.

Use server-side authorization AND RLS.

Do not trust client-side role checks.

Never accept authoritative:

actor UID;
business_unit_id;
role;
from browser input.

Use existing requireUnitAdmin("parfums") / session patterns where appropriate.

Normal authenticated Admin reads should not use service-role shortcuts.

17. DATABASE / SUPABASE

Migrations are append-only.

Never rewrite a migration already applied to staging.

Local first.

For schema changes:

npm --prefix apps/web run db:reset
npm --prefix apps/web run db:test

Regenerate/check Supabase database types after schema/function changes.

Money:

numeric / decimal;
never JS floating point as final commercial authority.

RLS is mandatory.

Functions that require controlled mutation should:

validate tenant;
validate actor;
use explicit search_path;
preserve transactionality;
audit in the same transaction where business integrity requires it.

Never:

supabase db reset --linked

Never remote-reset staging.

Never manually mutate staging schema outside migrations.

18. SUPABASE ENVIRONMENTS

Hosted staging project:

cruzial-v2-staging

Project ref:

iyxidhglyqkzoziyewlc

This project is STAGING, not production.

Do not create production infrastructure during Phase 4F1.

Remote Auth config still needs future Vercel Preview URLs.

Do not push localhost Auth URLs to staging.

19. GIT SAFETY

Feature branch:

codex/feature/cruzial-platform-v2

master remains untouched.

Always:

inspect status first;
stage explicit paths;
inspect staged diff;
atomic commits.

NEVER:

git add -A
git clean
git reset --hard
git restore .
broad checkout
rebase
merge

unless explicitly authorized for a proven need.

Do not stage .env / .env.local.

Do not stage client PNG/PDF originals.

Push only the feature branch after the capability gate is green.

No merge.
No production deployment.

20. TEST STRATEGY / TOKEN EFFICIENCY

Context is a budget.

Search before read.

Prefer:

rg;
targeted file reads;
git diff;
targeted tests.

Do NOT:

recursively read the repo;
reread closed phases;
rerun full suites after every edit;
run global responsive audits for a local capability;
dump huge logs into context;
use subagents for sequential work.

During implementation:
targeted tests.

At one meaningful final checkpoint:
full relevant gate.

If schema changed, run DB gate once near closure.

Then:

npm --prefix apps/web run check
git diff --check

Do not repeat green gates without a new reason.

Commit stable checkpoints early so another agent can continue if quota expires.

21. RESPONSIVE / ACCESSIBILITY

For new Admin UI:

Primary target widths:

320
390
768
1024
1440

Use additional widths only if a concrete issue appears.

Requirements:

no horizontal document overflow;
one <main>;
one <h1>;
native interactive controls when possible;
labels;
keyboard;
focus-visible;
understandable errors;
important touch targets around 44px;
status not communicated only through color.

Do not rerun the historical whole-site matrix for each capability.

22. UI / DESIGN

Cruzial must remain:

professional
premium
elegant
minimal
fast
clear

Do not add visual complexity merely to appear "luxurious".

Admin should prioritize:

clarity;
operational speed;
information hierarchy;
predictable interactions.

Parfums:
black/white/neutral with restrained gold.

Import:
deep navy/white/silver.

Import should feel related to Parfums but not like a recolor.

23. PERFORMANCE

Avoid unnecessary client components.

Prefer Server Components unless interaction genuinely requires client state.

Avoid:

N+1 queries;
repeated DB requests;
loading giant datasets into browser;
unnecessary animation libraries;
oversized image payloads.

No invented Lighthouse/Web Vitals numbers.

Real performance measurement belongs to future Vercel Preview.

24. DOCUMENTATION

Durable project truth:

AGENTS.md — persistent coding-agent contract
docs/progress-v2.md — current project state
docs/client-decisions.md — business decisions
docs/supabase-schema-v2.md — DB contract
docs/architecture-v2.md — architecture
docs/known-issues.md — relevant historical incidents

Do not load all of them automatically.

Read only what the current capability requires.

Keep progress docs concise.
Git is the source of detailed historical changes.

25. PHASE ROADMAP

Closed:

4A — Products
4B — Categories
4C — Combos
4D — Wholesale
4E1 — Public Order Request → WhatsApp
4E2 — Admin Orders Inbox / Detail
4F1 — Media Foundation + Admin Media

Current:

4F1 — Media Foundation + Admin Media

Next:

4F2 — Client Media Reconciliation / Controlled Migration

Then expected:

4G — Settings + Audit UI
4H — Parfums commercial-data reconciliation / Supabase storefront cutover
4I — Vercel Preview + remote Auth configuration
5 — Parfums Preview quality/security/performance gate
6 — Import Admin
7 — Consolidados / campaign ingestion
8 — Import public flow + order request → WhatsApp
9 — Global QA
10 — Production infrastructure + domain cutover

This order may change only if a demonstrated dependency/blocker justifies it.

Do not skip forward automatically.

26. DOMAIN / PRODUCTION

Client already owns the final domain through Punto.pe.

Do NOT modify DNS now.

Do NOT point the domain to an incomplete V2.

No Vercel Production.
No Supabase Production.
No canonical/index activation.
No DNS changes.

Domain cutover belongs near the end after Preview and global QA.

27. IMPORT / CONSOLIDADOS

Do not process the 76-page Consolidado PDF during Parfums Media work.

Future model:

each Consolidado = Import campaign.

Historical campaigns are preserved.

Never overwrite a closed campaign to represent the next one.

Future ingestion:

PDF
→ structured staging
→ page/source provenance
→ confidence/review
→ Admin review
→ campaign publication.

No automatic publishing from PDF extraction.

28. STOP CONDITIONS

Current agent must stop after Phase 4F1 closes.

Do not automatically begin:

bulk client image migration;
Phase 4F2;
Settings;
Audit UI;
Import;
Consolidados;
Vercel;
domain;
Production.
Final Phase 4F1 report should be concise:

ENV: local Supabase linked to staging (iyxidhglyqkzoziyewlc). Docker 29.7.2, Node v22, npm 10.9.8. Cloudinary vars in apps/web/.env.local.
CLOUDINARY: signed upload server-side (sha1 sorted params + secret). No SDK. API secret never leaves server. Folder/format in signature. destroyAsset cleanup for rejected uploads.
UPLOAD SECURITY: signed authorization scoped per product folder. isUploadResultValid re-validates Cloudinary response (folder prefix, format, size) before DB persistence. Invalid result triggers best-effort Cloudinary cleanup. DB persistence failure after valid upload reported explicitly.
MEDIA MODEL: product_media table with provider (cloudinary|legacy_static), public_id, secure_url, dimensions, bytes, format, checksum, alt, sort_order, is_primary, metadata, archived_at.
PRIMARY INTEGRITY: partial unique index `product_media_single_primary_idx` on (product_id) where is_primary and archived_at is null. set_primary/register atomically demote prior primary. Archive clears is_primary without auto-promoting. Restore never re-primaries.
VARIANT INTEGRITY: cross-product variant assignment rejected (P2004). Reorder rejects media id from another product.
ARCHIVE/RESTORE: archived_at set/cleared. is_primary cleared on archive. Restore never sets is_primary. No hard DELETE.
ADMIN UI: MediaManager in product editor: upload, alt, variant select, set primary, reorder ↑/↓, archive/restore. Warns when active media has no primary.
AUTHORIZATION: requireUnitAdmin("parfums") enforces role=admin at app layer. RLS policies: product_media_admin_read (can_read_unit), product_media_admin_write (is_admin_for). Viewer: read-only. Import-only: denied. Anonymous: denied.
AUDIT: all 6 RPCs call app.write_audit_log in same transaction. Actions: create, update, primary_change, archive, restore, reorder.
E2E: prior agent did real Cloudinary upload+register (public_id .../beybv0suo6aqp5awu79r, 1x1 68-byte png). Synthetic asset destroyed (200 ok). Synthetic product/media/admin wiped by db:reset.
RESPONSIVE/A11Y: mediaGrid uses repeat(auto-fill, minmax(220px, 1fr)). Labeled inputs, native controls, keyboard focus-visible.
STOREFRONT: no public storefront cutover. Legacy CatalogRepository untouched.
REMOTE SUPABASE: staging migration pushed (20260908120000_admin_parfums_media_mutations.sql). Dry-run matched real push. No remote reset.
TESTS: 272 pgTAP assertions PASS (11 suites, +30 new Media). 200 vitest tests PASS (32 files, +12 new Cloudinary). Lint clean. Typecheck clean. Build clean.
DOCS: docs/progress-v2.md and docs/supabase-schema-v2.md updated. AGENTS.md updated.
GIT: 2 checkpoint commits preserved (d265d4a, 754663a). AGENTS.md + docs committed. Push feature branch only.
BLOCKERS: (see existing BLOCKERS section — none new from 4F1)
NEXT: Phase 4F2 — Client Media Reconciliation / Controlled Migration (reconcile ~96 client PNGs with Cloudinary). Do NOT start automatically.