# CLAUDE.md — CRUZIAL V2

@AGENTS.md

## Scope

Active development is Cruzial Platform V2 under `apps/web`, `supabase`, and
`scripts`. Do not audit or modify the root legacy storefront unless the current
capability explicitly requires it. Git and `docs/progress-v2.md` hold current
implementation state; use Git history for historical detail.

## Context budget

- One capability per fresh session; clear unrelated history at boundaries.
- Search before read and inspect only relevant ranges.
- Never full-read large manifests, `supabase/staging/*.json`, logs, or historical
  progress. Query counts, hashes, fields, or small excerpts programmatically.
- Do not reread closed phases without evidence of regression.
- Do not run a whole-repository or global audit unless explicitly requested.

## Output and tests

Keep large test, build, migration, Cloudinary, and diff output out of the main
context. Report exit status, failures, warnings, computed counts, and only the
small excerpt needed to debug.

Use targeted tests while developing and one relevant final gate at the
capability checkpoint. Do not rerun unchanged green suites without a reason.

## Documentation

`docs/progress-v2.md` is a current checkpoint, not complete project history.

Read only the relevant heading. Do not turn operational context files into
session diaries.

## Git

Checkpoint stable work before context/quota limits. Stage explicitly.

Never:

- git add -A
- git clean
- git reset --hard
- git restore .

Preserve client PNG/PDF and ignored env files.

## Capability workflow

1. `git status --short --branch`
2. `git rev-parse HEAD`
3. `git log -5 --oneline`
4. search the relevant progress heading
5. inspect only files directly required by the capability
6. finish with the relevant gate, `git diff --check`, and scope review
7. commit/push when authorized, update current progress compactly, and stop

Never begin the next capability automatically. Global OWASP, UI, performance,
and architecture audits belong only to the explicitly invoked final QA phase
after Preview exists.
