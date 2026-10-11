# Production safety, migrations, database, environments and security

> Moved verbatim from `CLAUDE.md` on 2026-10-11 to keep that file small. Section numbers are the original ones
> (`CLAUDE.md` keeps the index). Production is DEFAULT-DENY. Sections 10 and 12-15 of the former CLAUDE.md, unchanged.

---

# 10. Production safety model

Production is DEFAULT-DENY.

Production mutations require explicit current-task authorization.

A user statement such as:

- "finish the release";
- "deploy this to production";
- "complete Gate B in production";
- "finish the app and deploy it";
- an explicit cutover instruction;

counts as authorization for the Production actions necessarily contained in
the approved release plan.

Once authorized, do NOT repeatedly ask for confirmation for every command.

Authorization does NOT permit unrelated destructive actions.

## Allowed after explicit cutover authorization

When required by the approved release plan, Claude may:

- configure required server-only Production environment variables;
- create/verify backups;
- apply approved migrations;
- run safe read-only Production checks;
- merge the approved PR;
- trigger or allow Production deployment;
- verify logs;
- verify runtime behavior;
- run safe empty-queue worker health checks;
- execute non-destructive smoke tests.

## Still forbidden without separate justification

Never:
- delete Production data;
- reset Production DB;
- truncate business tables;
- overwrite customer records;
- fabricate Production orders;
- fabricate customers;
- fabricate complaints;
- run destructive schema experimentation;
- rewrite historical migrations;
- rotate credentials unnecessarily;
- expose secrets.

---

# 12. Supabase migration rules

Migrations are append-only after being applied.

Never:

- rewrite an applied migration;
- rename an applied migration;
- silently repair migration history;
- use migration tools that replace repository timestamps with new timestamps
  when exact versions matter.

For Production migration releases:

use the normal Supabase CLI workflow preserving exact repository versions.

Before applying migrations:

verify the pending list exactly.

If an unexpected migration appears:
STOP and investigate.

After applying:

verify hosted migration count and exact versions.

---

# 13. Database safety

Before risky Production DB changes:

- verify a usable backup;
- preferably restore-validate it;
- verify expected row counts;
- preserve a rollback reference.

Do not print PII.

Do not print full customer/order/complaint rows.

For validation, prefer:
- counts;
- IDs only when necessary;
- boolean existence checks;
- schema metadata;
- safe aggregates.

---

# 14. Environment isolation

Production, Preview and local environments must remain intentionally separated.

Never reconnect Preview to Production simply to make a preview test pass.

Never expose Production secrets to Preview unless the architecture explicitly requires it.

Server secrets must never use a `NEXT_PUBLIC_` prefix.

Before declaring an environment ready:

verify required variable NAMES/presence without printing secret values.

Never paste secret values into:
- logs;
- PR bodies;
- commits;
- docs;
- test snapshots;
- chat summaries.

---

# 15. Security rules

Never weaken security merely to make a test pass.

Do not weaken:
- RLS;
- RPC authorization;
- MFA/AAL2;
- grants/revokes;
- service-role boundaries;
- signature verification;
- webhook authentication;
- rate limiting;
- idempotency;
- CSP;
- secret handling.

If a test fails because security correctly blocks unsafe behavior,
fix the test or implementation contract — not the security boundary.

For SECURITY DEFINER functions:

verify:
- explicit authorization;
- controlled `search_path`;
- least-privilege grants;
- unit/business scoping;
- no user-controlled authority escalation.
