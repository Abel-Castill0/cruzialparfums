# Git discipline, merge policy and release sequencing

> Moved verbatim from `CLAUDE.md` on 2026-10-11 to keep that file small. Section numbers are the original ones
> (`CLAUDE.md` keeps the index). Sections 8, 9 and 11 of the former CLAUDE.md, unchanged.

---

# 8. Git discipline

Before modifying files:

```bash
git status --short --branch --untracked-files=no
git rev-parse HEAD
```

When remote state matters:

```bash
git fetch origin
```

and inspect only required refs.

Stage files explicitly.

Use atomic commits.

Preserve:
- client PNG/PDF assets;
- local env files;
- unrelated user work;
- protected WIP;
- unrelated migration files.

## Never

Do NOT:
- `git add -A`
- `git clean`
- `git reset --hard`
- `git restore .`
- broad checkout
- force push
- rebase unless explicitly required by repository policy
- overwrite unrelated work

Do not modify `master` casually.

---

# 9. Merge and master policy

Default:

DO NOT merge or modify `master` without explicit release/cutover authorization.

However:

WHEN the current user instruction explicitly authorizes a release/cutover,
Claude MAY:

- mark the approved PR ready;
- merge the approved PR;
- allow/trigger the normal Production deployment;
- verify the resulting master SHA;

without asking again for confirmation at every sub-step.

Before merge always verify:

- expected PR HEAD;
- expected base;
- required checks green;
- no unexpected new commits;
- migration plan matches approved scope;
- rollback/backup evidence exists when required.

Use expected-head protection whenever possible.

Never merge a different HEAD than the one approved without re-evaluating its delta.

---

# 11. Production release sequencing

For DB + application releases:

prefer the safest compatible sequence based on the actual migration design.

Before DB-first deployment:
verify old-app/new-DB compatibility.

Before code-first deployment:
verify new-app/old-DB compatibility.

Do not assume either sequence.

For Gate-style migrations:

1. snapshot current state;
2. verify backup / rollback capability;
3. inspect exact pending migrations;
4. dry-run where supported;
5. apply only approved versions;
6. verify migration history;
7. verify invariants / counts;
8. verify compatibility;
9. merge;
10. wait for master CI;
11. verify Production deployment;
12. smoke;
13. inspect logs/advisors;
14. close gate.

No fake Production transactional data for smoke testing.
