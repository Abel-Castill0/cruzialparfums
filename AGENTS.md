# AGENTS.md - CRUZIAL PLATFORM V2

## Scope

Active implementation:
- apps/web
- supabase
- scripts

Current operational state:
docs/current-v2.md

Historical engineering log:
docs/progress-v2.md

Never full-read the historical log by default.
Search the exact term first and inspect only the required range.

## Platform

- Next.js 16
- strict TypeScript
- Supabase/PostgreSQL
- RLS
- pgTAP
- Vitest
- Cloudinary
- Vercel

Business units:
- Cruzial Parfums
- Cruzial Import

Infrastructure/auth may be shared.
Business data, catalogs, carts, orders, settings, and rules remain isolated.

## Critical rules

- Never modify production without explicit authorization.
- Never modify master before explicit cutover.
- Never weaken RLS or server authorization.
- Applied migrations are append-only.
- Never invent price, stock, discount, availability, or client decisions.
- Preserve client PNG/PDF assets.
- Never expose secrets.
- Never expose Cloudinary API secrets through NEXT_PUBLIC_*.
- Stage Git files explicitly.
- Never use git add -A.
- Preserve unrelated user files.

## Context policy

- Search before read.
- Use targeted file/range reads.
- Use targeted tests while developing.
- Run one complete required gate at the end.
- Never reread closed capabilities without regression evidence.
- Never perform a global audit unless explicitly requested.
- Avoid dumping full logs, diffs, migrations, or untracked asset lists.

Exact current checkpoint:
docs/current-v2.md

Git is authoritative for exact HEAD and implementation history.
