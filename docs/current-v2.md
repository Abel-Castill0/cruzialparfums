# CRUZIAL V2 - CURRENT CHECKPOINT

Updated: 2026-09-12

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

4J5F - Hosted Staging QA

Completed:
- 4J5E global SQLSTATE audit
- all live app-authored optimistic conflicts migrated from 40001 to P2011
- staging migrations synchronized 37/37
- Preview environment inspected
- representative staging QA fixtures created
- fixtures verified idempotent

Current blocker:
- staging Supabase Auth admin user must be manually created by operator
- after creation, grant existing parfums/import memberships
- then continue authenticated hosted QA

Do NOT start 4J5G until 4J5F closes.

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

- authenticated hosted Admin QA
- hosted stale-write P2011 regression
- hosted publication blocker evidence

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
