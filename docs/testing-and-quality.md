# Testing, bug handling, validation, definition of done and reporting

> Moved verbatim from `CLAUDE.md` on 2026-10-11 to keep that file small. Section numbers are the original ones
> (`CLAUDE.md` keeps the index). Sections 7, 18-20, 22, 23, 25 and 26 of the former CLAUDE.md, unchanged.

---

# 7. Testing strategy

## During implementation

Run targeted tests for changed behavior.

Examples:

- one Vitest file;
- one pgTAP file;
- one Playwright spec;
- one migration contract test;
- one script unit test.

Do NOT repeatedly run the entire suite while still iterating.

## After implementation stabilizes

Run the complete required gate ONCE.

Typical final gate:

- git diff --check
- lint
- typecheck
- unit tests
- build
- migration tests
- pgTAP
- required E2E
- security scan where locally available

If final gate is green and no relevant files change afterward,
do not rerun it.

If a later change affects only:
- documentation;
- metadata;
- comments;

do not rerun unrelated expensive suites.

If a later code change is narrow:
run targeted tests first, then only the broader gate required by release policy.

---

# 18. Bug handling

If a verified defect is internally fixable:

FIX IT.

Do not merely document it.

Classify findings:

- P0 — catastrophic / active compromise / severe data loss
- P1 — release-blocking critical functionality/security
- P2 — meaningful correctness/security/UX issue that should be fixed before closure
- P3 — minor/non-blocking improvement

Before declaring a gate or final release complete:

known P0 = 0
known P1 = 0
known P2 = 0

P3 may remain only if explicitly documented and genuinely non-blocking.

---

# 19. Root-cause discipline

Do not patch symptoms blindly.

When an unexpected failure occurs:

1. reproduce;
2. identify the actual failing layer;
3. distinguish environment/tooling failure from application failure;
4. inspect authoritative docs/source if needed;
5. fix the root cause;
6. add a regression test;
7. verify the real scenario.

Example:

`exit unknown` is not a diagnosis.

Find the actual spawn/DB/runtime error.

---

# 20. UI / UX / browser validation

For externally visible UI changes, verify where applicable:

- desktop;
- mobile;
- tablet;
- keyboard;
- focus;
- accessibility;
- responsive layout;
- empty states;
- loading states;
- errors;
- real browser console;
- network/runtime errors.

Do not claim visual correctness based only on unit tests.

Use browser/E2E evidence when the task changes behavior visible to users.

---

# 22. Monitoring and operations

Before Production closure, inspect:

- Vercel deployment state;
- Vercel build errors;
- Vercel runtime errors;
- Supabase PostgreSQL errors;
- Supabase security advisor;
- Supabase performance advisor;
- worker/cron health where relevant.

Do not mechanically "fix" informational advisor notices during an unrelated release.

Investigate only:

- new;
- actionable;
- relevant;

regressions.

---

# 23. Independent reviewer interaction

Codex findings are not automatically true.

When Codex reports a defect:

Claude must:

1. inspect the exact evidence;
2. reproduce or confirm it;
3. reject false positives explicitly;
4. fix confirmed P0/P1/P2 issues;
5. add regression evidence;
6. avoid duplicating already-fixed work.

Do not re-audit the entire codebase because one Codex finding changed one file.

Review the delta.

---

# 25. Definition of Done

Do NOT claim "100% complete" solely because:

- build passes;
- tests pass;
- PR merged;
- deployment is READY.

A capability/release is complete only when relevant evidence exists.

For final CRUZIAL technical completion require:

- known P0 = 0;
- known P1 = 0;
- known P2 = 0;
- no known unresolved internal implementation gap;
- migrations verified;
- full required test gate green;
- critical business flows evidenced;
- auth/security boundaries verified;
- responsive/mobile verified;
- accessibility verified;
- runtime logs checked;
- Production deployment verified;
- Production DB state verified;
- backup/rollback reference available;
- no known secret exposure;
- SEO/indexing state matches factual readiness.

If only external facts remain:

report:

```text
TECHNICAL PLATFORM COMPLETE
BUSINESS CUTOVER BLOCKED BY EXTERNAL INPUTS
```

Do not falsely call external missing facts software bugs.

Never claim that software is mathematically guaranteed bug-free.

Use:

"No known P0/P1/P2 defects remain after the completed verification gate."

---

# 26. Completion reporting

Final handoffs should be concise and evidence-based.

Include only:

- branch;
- final SHA;
- merge SHA if applicable;
- Production SHA;
- migrations before/after;
- deployment ID;
- tests/counts;
- relevant smoke results;
- log/advisor status;
- known P0/P1/P2;
- exact external blockers;
- rollback reference;
- next action, only if something remains.

Do not repeat the entire implementation history.

Do not paste large passing logs.

Do not claim anything that was not verified.
