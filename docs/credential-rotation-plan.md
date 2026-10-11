# Credential inventory and coordinated rotation plan — 2026-10-11

**Status: PREPARED, NOTHING ROTATED.** No credential was changed by this document. It records where Production
credentials were found in OneDrive-synced files, who consumes each one, and a rollback-safe order. Values are never
written here; classification was done by type, JWT claims and equality checks only.

Context: until 2026-10-11 the working copy lived in `C:\Users\ABEL\OneDrive\Desktop\cruzialparfums` (Desktop is
redirected into OneDrive). Git-ignored files are still synced by OneDrive (cloud copy + version history + online recycle
bin). The working copy was migrated to `C:\dev\cruzialparfums` (outside OneDrive); see §6. Treat every value that was in
the synced copy as exposed to that cloud account until it is rotated.

## 1. Inventory of Production credentials found in synced files

| # | Where (file / variable name) | What it is | Impact if leaked | Live consumers (verified) |
| --- | --- | --- | --- | --- |
| 1 | root `.env` / `legacyJWT` | **Supabase legacy JWT secret (HS256)** — verified it signs Production's `anon` key | Can mint `service_role` / any-user JWTs → bypass RLS and MFA (project still has legacy API keys **enabled** and the HS256 signing key `previously_used`) | **None** in the last 24 h: every app request used `sb_publishable`/`sb_secret`; the only legacy-JWT requests were Supabase's own `supabase_admin` infrastructure |
| 2 | root `.env` / `service_role_secret`, `anon_public` | Legacy `service_role` and `anon` JWT API keys, exp 2036 | `service_role` = full data access | None (same log evidence; no code references these names) |
| 3 | root `.env` / `DATABASE_PASSWOARD`, `CRUZIAL_STAGING_DATABASE_URL` | Production Postgres password (pooler URL embeds it; same password) | Direct owner-level DB access incl. PII | Backup script (`SUPABASE_DB_PASSWORD`, env only), `supabase db push --db-url`; **not** the app or CI |
| 4 | root `.env` / `supabase_secret_key` | Production `sb_secret_*` key | Full data access via PostgREST | Vercel **Production** `SUPABASE_SECRET_KEY` (cron worker `worker_*` RPCs, server actions) |
| 5 | root `.env` + `apps/web/.env.local` / Cloudinary key + **API secret** (identical in both files) | Production Cloudinary account | Upload/overwrite/delete media | Vercel Production (`CLOUDINARY_*`), local app, `scripts/migrate-client-media.mjs` |
| 6 | root `.env` / `SUPABASE_ACCESS_TOKEN` | Scoped personal access token, **wider than needed**: read access to project, Auth config, advisors, DB types, organizations and project list (write attempt on Auth config → 403) | Account/project reconnaissance, config reads | Only local ad-hoc runs; the GitHub secret of the same name is a separate token (`scripts/supabase-health.mjs`, workflow) |
| 7 | root `.env` / `TOKEN_VERCEL` | Manual Vercel token "CRUZIAL", team scope, **no expiry**, created 2026-09-07 | Deploy / env / project control of the team | **No code or workflow reads it.** Monitor uses the new `cruzial-monitor` token (exp 2027-01-09) in the GitHub secret `VERCEL_TOKEN` |
| 8 | root `.env` / `supabase_apikey`, `Current_key`, `Previous_key` | Publishable key (public by design); two 36-char values that look like signing-key ids | none / low | none |
| 9 | `apps/web/.env.local` / `ORDER_ABUSE_HMAC_SECRET`, `ADMIN_BOOTSTRAP_EMAIL` | Local HMAC secret (unknown whether equal to Production's, which Vercel hides), admin e-mail | Predictable abuse-identity hashes; PII | Local app only |
| 10 | `.env.qa` | QA `sb_secret` + QA DB URL (`aqbhtmylqnpahynarnhm`), different from Production (verified) | QA only (synthetic data) | `scripts/qa-hosted-browser.mjs`, `apps/web/e2e/qa-target.mjs` |
| 11 | `apps/web/e2e/.auth/*.json` | Playwright sessions of test admins (hosts `localhost`, QA ref) | QA/local sessions only | Playwright runs |

Not in files, only at the providers (cannot be read back): Vercel Production `CRON_SECRET`, `ORDER_ABUSE_HMAC_SECRET`,
`ADMIN_BOOTSTRAP_EMAIL`; GitHub secrets `VERCEL_TOKEN` (`cruzial-monitor`), `SUPABASE_ACCESS_TOKEN`.

Other projects in the same OneDrive (barberia, gym-platform, ProyectoMOVA, DPP, paginass, …) also contain `.env*` files;
they are outside Cruzial and untouched, but carry the same exposure.

## 2. Evidence used for the dependency analysis (reproducible, read-only)

- Supabase Management API, Production: `GET /v1/projects/<ref>/api-keys/legacy` → `{"enabled":true}`; API keys = 2 legacy
  (anon, service_role) + 1 publishable + 1 secret; signing keys = ES256 `in_use`, HS256 `previously_used`.
- Gateway logs (`query_logs`, source `edge_logs`, window 2026-10-10 17:00 → 2026-10-11 17:00 UTC), grouped by
  `request.sb.apikey.apikey.prefix` class: `sb_publishable` (public site), `sb_secret` (cron worker, Supabase CLI /
  dashboard), **0 requests with a legacy JWT apikey from the app**; the 2 JWT requests have role `supabase_admin`. Free
  plan keeps 24 h of logs, so repeat the query on consecutive days before irreversible steps.
- Repository: `grep` finds no reference to `legacyJWT`, `service_role_secret`, `anon_public`, `DATABASE_PASSWOARD`,
  `TOKEN_VERCEL` (root `.env` is a scratch file of pasted dashboard values, not read by any script).
- Vercel: `vercel tokens list` (metadata): "CRUZIAL" last active 2026-10-11T16:49Z = the validation made by the
  engineer; no other consumer is known.

## 3. Rotation order (least dependency first; each step independently reversible unless stated)

**Step 0 — contain (done/ready).** Working copy outside OneDrive (§6). Then delete the synced copy (only after the
owner confirms) and keep secrets in a password manager, not in files.

**Step 1 — Supabase legacy keys (CRITICAL, no live consumer).**
1. Re-run the gateway log query on 2 more days; require 0 legacy-JWT requests from the app.
2. Dashboard → Settings → API Keys → Legacy → *Disable legacy API keys* (reversible: re-enable).
3. After ≥7 quiet days: Authentication → JWT Keys → revoke the `previously_used` HS256 key (**irreversible**). This kills
   item 1 and 2 permanently. Sessions issued by the in-use ES256 key are unaffected.
4. Verify: `/`, `/parfums`, `/import`, `/admin/login` 200; admin login with MFA; `[health]` run green; gateway log shows
   only `sb_*` keys.

**Step 2 — Production DB password (no consumer in Vercel/GitHub).**
Dashboard → Database → Reset password; store in the password manager; update only the operator environment
(`SUPABASE_DB_PASSWORD` for `scripts/backup-production-db.mjs`, `supabase db push --db-url`). Verify with
`supabase db push --dry-run` (must say up to date) and a backup run. Rollback: reset again.

**Step 3 — Vercel token "CRUZIAL" (no consumer).** Wait 48 h without using it; if `vercel tokens list` shows no new
activity, `vercel tokens remove <id>`. Rollback: create a new token. (Do not use it for ad-hoc calls meanwhile.)

**Step 4 — Supabase PAT in `.env`.** In Dashboard → Account → Access Tokens, compare last-used before revoking. If the
GitHub secret `SUPABASE_ACCESS_TOKEN` is the same token, first create a minimal scoped token (project
`iyxidhglyqkzoziyewlc`, **Advisors: Read + Logs: Read**), `gh secret set SUPABASE_ACCESS_TOKEN`, run
"Supabase health" and check it is green; then revoke the old one.

**Step 5 — `sb_secret` (Production consumer: Vercel Production `SUPABASE_SECRET_KEY`).**
1. Supabase → API Keys → *New secret key* (second key; both valid at once).
2. Vercel → Production entry only (Edit, do not `env rm`: removing a shared entry removes it from every target) → new
   value → redeploy Production.
3. Verify in the gateway log that `sb_secret` requests from the worker now carry the new key hash and the cron
   (`/api/automation/process`, 13:00 UTC) or a manual `worker_record_health` succeeds; `automation_worker_health` updates.
4. Delete the old secret key. Rollback before step 4: put the old value back and redeploy.

**Step 6 — Cloudinary (Production consumer: Vercel Production).**
1. Cloudinary Console → Settings → API Keys → generate a second key pair.
2. Vercel Production: `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` → redeploy.
3. Verify: signed non-mutating probe (signed `destroy` of a random non-existent id → "not found") and an admin upload +
   delete on a **draft** product (owner session). In-flight uploads signed with the old pair fail for a few minutes.
4. Disable the old key pair. Remove the real Cloudinary values from `apps/web/.env.local` (the local runners already
   inject non-credential placeholders).

**Step 7 — HMAC and cron secrets.** Replace the local `ORDER_ABUSE_HMAC_SECRET` with a fresh random value (disposable).
Production's value was never in a file; rotate it only if exposure is suspected: it invalidates in-flight attempt
capabilities (24 h TTL) and rate-limit identities, so do it in a quiet hour. `CRON_SECRET`: change in Vercel and redeploy
(Vercel sends it to the cron itself).

**Step 8 — QA.** Optional: reset the QA DB password and create a new QA secret key; synthetic data only.

## 4. Residual risks

- OneDrive version history / online recycle bin keep old file versions for a limited time; only rotation neutralises
  them. Other devices signed into the same OneDrive may still hold copies.
- Free plan: 24 h of Supabase logs, no point-in-time recovery; a bad rotation is fixed by re-setting the previous value
  only while the old credential still exists — hence "create new, switch, verify, then delete old".
- GitHub scheduled workflows are best-effort (delays, dropped slots).

## 5. Monitoring hooks

`[Monitor] supabase-health: monitor cannot run` / `vercel-production: monitor cannot run` issues fire if a rotated token
breaks a monitor. After steps 4 and 5 run both workflows manually (`dry_run=false`).

## 6. Working-copy migration (2026-10-11)

- New location: `C:\dev\cruzialparfums` (not synced). Copied with `robocopy /E /COPY:DAT /DCOPY:DAT` excluding only
  `node_modules` and `.next`. Verified: 2098/2098 files (incl. `.git`, `.env*`, e2e sessions, client assets)
  byte-identical (SHA-256) to the original; 140 refs and the stash identical; `git fsck` clean; `npm ci` + the full
  `npm run check` pass from the new path.
- Not copied/untouched: `C:\Users\ABEL\cruzial-preservation\2026-10-11` (bundle, stash extraction, manifests) and
  `C:\cruzial-private-backups` (already outside OneDrive).
- Linked Codex worktrees (`C:\Users\ABEL\.codex\worktrees\...`) still point at the old `.git`. At cut-over run, from the
  new repo: `git worktree repair "C:/Users/ABEL/.codex/worktrees/final-certification/cruzialparfums" "C:/Users/ABEL/.codex/worktrees/gate-b-operations/cruzialparfums"`.
- The original under OneDrive is **kept** until the owner accepts the new location. Then delete it (OneDrive keeps the
  deletion in its online recycle bin for a limited time).
- Claude Code keys its project memory by path: the memory folder was copied to the new key (`C--dev-cruzialparfums`).
