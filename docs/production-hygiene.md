# Vercel branch/environment hygiene — findings and recommendations

Findings below come from `vercel project inspect`, `vercel ls` and
`vercel env ls production|preview` against the live `cruzial-platform-v2`
project (read-only inspection, 2026-09-20). No production state was
changed to produce this document.

## 1. Production Branch vs. current deploy history (Task 10)

- The current Production deployment (`cruzial-platform-v2-bti3ztkti`,
  commit `37092af`) was reached via `vercel promote`, run manually from the
  CLI — **not** via a git push.
- Every deployment triggered by a push to
  `codex/feature/cruzial-platform-v2` in `vercel ls` shows
  `Environment: Preview`, never `Production`. That means the Vercel
  **Production Branch** setting (Project → Settings → Git) is *not*
  currently pointed at this feature branch — it is still whatever the
  project defaulted to when created (almost certainly `master`, Vercel's
  default, and unverified further because this setting is dashboard-only
  and not exposed by the CLI or by the Vercel MCP tools, which return
  403/404 for this project's scope).
- `master` is **200 commits behind** `codex/feature/cruzial-platform-v2`
  (verified via `git rev-list --count master..codex/feature/cruzial-platform-v2`)
  and does not contain any V2 code.

**Concrete risk:** if anyone pushes to `master` before the release PR
merges — including an unrelated hotfix, a stray `git push origin master`,
or a rebase mistake — and Production Branch is `master`, Vercel will
auto-build and auto-promote that old, pre-V2 `master` content straight to
`https://cruzial.pe`, silently replacing the current promoted V2 deployment.

**Recommended fix (operator action, dashboard-only):**
1. Open Project → Settings → Git in the Vercel dashboard and confirm what
   Production Branch is actually set to today.
2. If it is `master`: either (a) leave it, but do **not** push to `master`
   until the `codex/feature/cruzial-platform-v2 → master` PR (Task 10's PR)
   is reviewed and merged, or (b) temporarily branch-protect `master` on
   GitHub to block direct pushes until that merge.
3. After the PR merges and `master` contains the V2 code, Production
   Branch can safely stay on `master` going forward — a merge is then the
   intended trigger for the next Production deploy.

## 2. Preview/Production Supabase isolation (Task 11)

`vercel env ls production` and `vercel env ls preview` (names/targets only,
values stay encrypted and were never read) show:

| Variable | Rows | Same value for both environments? |
|---|---|---|
| `SUPABASE_SECRET_KEY` | one row, targets `Production, Preview` | **Yes** — one row = one value |
| `CLOUDINARY_API_SECRET` / `CLOUDINARY_API_KEY` / `CLOUDINARY_CLOUD_NAME` | one row each, targets `Production, Preview` | **Yes** |
| `ADMIN_BOOTSTRAP_EMAIL` | one row, targets `Production, Preview` | **Yes** |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | separate rows per environment (different creation timestamps) | Not verifiable without reading values (never done) — *could* differ |

A single row targeting both `Production` and `Preview` is one encrypted
value shared by both — Vercel has no per-environment override on that row.
Since `SUPABASE_SECRET_KEY` is a Supabase **service_role** key (bypasses
RLS entirely) and is one shared row, **every Preview deployment — including
ones built automatically from any pushed branch or PR — has full
service-role access to the same Supabase project as Production**
(`iyxidhglyqkzoziyewlc`). This project is also this platform's only
Supabase project (per `docs/current-v2.md` and prior session notes) — there
is no separate staging backend today.

**Concrete risk:** a Preview deployment (reachable at a `*.vercel.app` URL
that is not password-protected by default) runs server code with
production service-role credentials. A bug in a Preview build, or anyone
who finds a Preview URL, can read or write real Parfums/Import data.

**Recommended isolation steps, safest first:**
1. **Cheapest, no new infra:** create a *second* Supabase project on the
   free tier dedicated to Preview, and give `SUPABASE_SECRET_KEY` /
   `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   **separate Preview-only rows** pointing at it, migrated with the same
   `supabase/migrations/` history. This is the standard Supabase+Vercel
   staging pattern and costs nothing beyond a second free-tier project.
2. **If a second project is not wanted right now:** at minimum enable
   Vercel's password protection (or Vercel Authentication) on Preview
   deployments for this project, so a leaked Preview URL cannot be hit
   anonymously. This does not fix the shared-database risk but closes the
   easiest exploitation path.
3. **Do not** create a paid Supabase branch/project without the operator's
   explicit cost approval — this document only recommends option 1 (free
   tier) or option 2 (a Vercel dashboard toggle, no new billing).

No code change was made for this section: creating a second Supabase
project is an infrastructure decision for the operator, not something to
apply unilaterally from here.
