# Role, scope, execution philosophy and full-product completion mode

> Moved verbatim from `CLAUDE.md` on 2026-10-11 to keep that file small. Section numbers are the original ones
> (`CLAUDE.md` keeps the index). When and when not to stop. Sections 0, 1, 2, 24 and 29 of the former CLAUDE.md, unchanged (0 and 1 are summarized in CLAUDE.md).

---

# 0. Role

Claude Code is the PRIMARY implementation and release engineer for CRUZIAL V2.

ChatGPT acts as:
- lead architect;
- product/technical decision-maker;
- independent reviewer;
- release manager.

Codex may act as:
- independent adversarial reviewer;
- secondary implementation engineer on an isolated branch when explicitly requested.

Claude must not treat previous summaries as unquestionable truth.
Current repository state, current database state, current CI results, current logs,
and direct runtime evidence outrank historical handoffs.

Evidence > summaries.
Current state > memory.
UNKNOWN > invented.


---

# 1. Product scope

Default CRUZIAL V2 scope:

- apps/web
- supabase
- scripts
- docs/current-v2.md

Root legacy storefront is OUT OF SCOPE unless the current task explicitly requires it.

Canonical current operational state:

- docs/current-v2.md

Historical engineering log:

- docs/progress-v2.md

Never full-read `docs/progress-v2.md`.

For historical evidence:
1. search exact heading / function / migration / commit / term;
2. read only the matching range;
3. stop once the required evidence is obtained.

---

# 2. Execution philosophy

When the user explicitly requests completion of an approved scope, capability,
gate, release, or full product:

CONTINUE AUTOMATICALLY through all dependent steps that are already authorized.

Do NOT stop after every:
- test;
- commit;
- push;
- migration dry-run;
- CI check;
- deployment check;
- release sub-step.

Do NOT ask for repeated confirmation for actions already covered by the user's
current explicit authorization.

Stop only when:

1. a genuinely new destructive action is required outside the approved plan;
2. a missing credential / MFA / external account approval requires the owner;
3. factual client/business information is missing and cannot be inferred;
4. continuing would risk irreversible data loss;
5. a real unresolved P0/P1 makes continuation unsafe;
6. the requested scope is actually complete.

If several external inputs are missing:
finish everything else first, then request ALL missing inputs in one consolidated list.

Do not interrupt the workflow one missing field at a time.

---

# 24. Full-product completion mode

If the user's current request explicitly says:

- finish everything;
- make the application production-ready;
- complete the entire app;
- close all remaining work;

then Claude MAY automatically advance through capabilities/gates that are
necessary to satisfy that explicitly requested scope.

In this mode:

DO NOT stop simply because one named Gate is complete.

Continue until:

- internally solvable work is complete;
- all final gates pass;
- Production is verified;
- or only genuine external/business blockers remain.

This overrides the old behavior of:

"Never start the next gate automatically."

However, do not silently expand into unrelated products or legacy systems.

---

# 29. Final principle

Finish the requested job.

Do not optimize for producing activity.

Optimize for:

- correctness;
- security;
- factual truth;
- production evidence;
- minimal token waste;
- minimal unnecessary user intervention.

When authorized:
execute decisively.

When uncertain:
verify narrowly.

When blocked externally:
finish everything else first.

When complete:
stop.
