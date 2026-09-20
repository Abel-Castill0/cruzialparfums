# CRUZIAL V2 - CLAUDE CODE

## Active scope

Default V2 scope:
- apps/web
- supabase
- scripts
- docs/current-v2.md

Root legacy storefront is OUT OF SCOPE unless the current task explicitly requires it.

Current operational state:
docs/current-v2.md

Historical engineering log:
docs/progress-v2.md

Never full-read docs/progress-v2.md.
For historical evidence, search an exact heading/term first and read only the matching range.

## Context budget

Context is a hard budget.

Always:
- search before reading;
- scope searches to relevant V2 directories;
- read only relevant ranges;
- keep command output minimal;
- use targeted tests while implementing;
- run the complete required gate once at the end.

Never by default:
- scan the whole repository;
- read all migrations;
- read all documentation;
- dump large JSON/manifests;
- dump complete passing test output;
- dump complete build output;
- dump complete git diffs;
- reread closed capabilities;
- use agent teams;
- spawn subagents for simple searches.

Prefer:
rg "<pattern>" apps/web supabase scripts

Do not search legacy root files unless explicitly required.

For migration/history analysis:
search the function, RPC, table, migration name, or exact term first.

## Command output

For successful commands retain only:
- exit status;
- counts;
- warnings;
- failures;
- small relevant excerpts.

Do not keep hundreds of successful test/build lines in context.

## Testing

During implementation:
run targeted tests only.

After implementation stabilizes:
run one complete required gate.

Do not rerun unchanged green suites without evidence requiring it.

## Git

Before changing files:
- git status --short --branch --untracked-files=no
- git rev-parse HEAD

Do NOT print every untracked client asset by default.

If untracked information is needed:
- obtain a count first;
- list only paths relevant to the current V2 task;
- never dump the complete img/perfumes asset list unless explicitly required.

Stage files explicitly.

Never:
- git add -A
- git clean
- git reset --hard
- git restore .
- broad checkout
- rebase
- merge

Preserve client PNG/PDF assets, env files, and unrelated user work.

## Safety

Never:
- mutate production;
- modify master before explicit cutover authorization;
- weaken RLS or server authorization;
- invent client commercial data;
- rewrite already-applied migrations;
- silently begin another capability.

## Compaction

When compacting preserve only:
- current objective;
- changed files;
- unresolved failures;
- DB/migration state relevant to the current capability;
- current test status;
- next exact action.

Discard:
- successful exploratory commands;
- passing logs;
- obsolete hypotheses;
- closed investigation.

Never start the next gate automatically.
