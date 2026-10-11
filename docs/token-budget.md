# Token and context budget

> Moved verbatim from `CLAUDE.md` on 2026-10-11 to keep that file small. Section numbers are the original ones
> (`CLAUDE.md` keeps the index). Context is a HARD budget. Sections 3-6, 27 and 28 of the former CLAUDE.md, unchanged.

---

# 3. Context and token budget

Context is a HARD budget.

The goal is maximum engineering rigor with minimum unnecessary context.

## Always

- search before reading;
- inspect exact files before broad directories;
- read narrow line ranges;
- use `rg` / targeted search before opening files;
- inspect diffs instead of rereading whole files after changes;
- use commit ranges when reviewing incremental work;
- cache verified facts mentally and do not repeatedly rediscover them;
- keep command output minimal;
- retain failures, warnings, counts and concise evidence only;
- use targeted tests while implementing;
- run the complete required gate once after implementation stabilizes;
- compare current state against the last verified checkpoint;
- prefer one strong evidence-producing command over several redundant ones.

Preferred search:

```bash
rg "<exact-pattern>" apps/web supabase scripts docs/current-v2.md
```

For migration/history analysis:

search first for:

- exact migration version;
- function name;
- RPC;
- table;
- policy;
- constraint;
- trigger;
- route;
- component;
- test name.

Read only the relevant result.

## Never by default

Do NOT:

- scan the entire repository;
- full-read every migration;
- full-read every documentation file;
- dump full manifests;
- dump huge JSON payloads;
- print complete successful test logs;
- print complete build output;
- print complete passing pgTAP output;
- print complete git diffs;
- reread already-verified unchanged capabilities;
- rerun unchanged green suites without evidence requiring it;
- regenerate reports whose inputs did not change;
- re-audit closed gates from zero;
- use agent teams for simple work;
- spawn subagents for trivial searches;
- inspect node_modules;
- enumerate every client asset unless directly relevant;
- repeatedly query remote services for facts already verified moments ago.

---

# 4. Evidence ledger

Maintain a compact internal evidence ledger during a task.

Track only:

- current branch;
- current HEAD;
- base HEAD;
- changed files;
- migrations added;
- migrations applied remotely;
- unresolved defects;
- tests relevant to current changes;
- final full-gate results;
- deployment SHA;
- Production migration count;
- rollback reference;
- external blockers.

Do not continuously restate this ledger in every response.

Update only facts that changed.

When a fact is already independently verified and unchanged,
reuse it instead of re-querying it unnecessarily.

---

# 5. Reading strategy

Before opening a large file:

1. search for the exact symbol or string;
2. inspect the smallest useful section;
3. expand only if needed.

For code review after an implementation:

prefer:

```bash
git diff <verified-base>...HEAD -- <relevant-files>
```

or exact file patches.

Do not reread the entire implementation if only one new commit was added.

For PR follow-ups:

review:

```text
previous_verified_head..current_head
```

not the entire PR again unless the delta indicates architectural impact.

---

# 6. Command output policy

Successful commands should retain only:

- exit status;
- test counts;
- warnings;
- failures;
- short relevant excerpts;
- exact SHAs;
- deployment IDs when relevant.

Do NOT keep hundreds of successful lines in context.

Examples:

GOOD:

```text
Vitest: 939/939 PASS
pgTAP: 1259/1259 PASS
lint: PASS
typecheck: PASS
build: PASS
```

BAD:

hundreds of individual passing tests.

For failing commands:
retain the smallest output necessary to diagnose the root cause.

---

# 27. Compaction

When context becomes expensive, compact aggressively.

Preserve ONLY:

- current objective;
- current branch;
- current HEAD;
- Production SHA;
- changed files since last verified checkpoint;
- unresolved defects;
- relevant migration state;
- latest test status;
- release authorization state;
- external blockers;
- next exact action.

Discard:

- successful exploratory commands;
- verbose passing output;
- obsolete hypotheses;
- superseded SHAs;
- closed defect investigations;
- repeated explanations;
- old test logs;
- already-completed gate details that are not needed for rollback.

After compaction:
do not rediscover facts unless they may have changed.

---

# 28. Token-efficiency decision rule

Before every expensive action ask internally:

> Will this new read/test/query materially change a decision?

If NO:
skip it.

Before rereading a file ask:

> Did this file change since I last verified it?

If NO:
do not reread it.

Before rerunning a suite ask:

> Did any code relevant to this suite change?

If NO:
do not rerun it.

Before broad auditing ask:

> Is there evidence the already-closed area may have regressed?

If NO:
review only the delta.

The objective is:

MAXIMUM CONFIDENCE PER TOKEN.

Not maximum commands.
Not maximum logs.
Not maximum rereading.
