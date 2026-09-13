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

4J5F - Hosted Staging QA

Completed:
- 4J5E global SQLSTATE audit
- all live app-authored optimistic conflicts migrated from 40001 to P2011
- staging migrations synchronized 37/37
- Preview environment inspected
- 4J5F-A fixtures corrected and applied twice on staging; 9 QA products
- Parfums structural mapper verified; misleading publication-blocker labels removed
- Import synthetic ready / missing media / missing offer cases structurally verified
- exactly two synthetic offers in #6; its row and 898 non-QA offers unchanged
- exact cleanup prepared; not executed

Remaining blockers:
1. Exact Preview -> staging binding evidence (iyxidhglyqkzoziyewlc).
2. Operator-created staging Auth identity and legitimate unit memberships.
3. Hosted authenticated Admin QA.
4. Hosted stale-write P2011 evidence.
5. Hosted publication blocker evidence, including existing Import RPC assertions:
   staging has zero active memberships; RPC verification returned 42501.
   Run supabase/provisioning/staging-qa-fixtures-readiness.sql with a legitimate
   Import member session. Structural fixture checks are not authenticated RPC proof.
6. Final automated 4J5F gate (not run during 4J5F-A).

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
