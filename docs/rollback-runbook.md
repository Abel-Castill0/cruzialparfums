# Rollback and recovery runbook — Cruzial V2

Written 2026-10-11 from the real scripts, files and provider settings of this repository. Nothing here has been
executed against Production as a test; every command below is either already used in this project or comes from the
provider CLI's own `--help`. Production Supabase = `iyxidhglyqkzoziyewlc` (its name says "staging"; it IS
Production). QA = `aqbhtmylqnpahynarnhm`. Vercel project `cruzial-platform-v2` (`prj_u2ZX24IO9akHdN0qlzveQNwte59l`,
team `team_OPJLunXDFXq0o9kKQK6VOt8Z`), root `apps/web`.

## 0. Stop criteria (when to halt a release and roll back)

Stop the release (do not merge further, do not apply more migrations) and choose a rollback below when any of these
happens after a deploy or migration:

- Vercel deployment not `READY`, or the Production alias does not serve the expected commit
  (`vercel api /v13/deployments/cruzial.pe` → `meta.githubCommitSha`).
- Any public route (`/`, `/parfums`, `/import`, `/parfums/catalogo`, `/import/catalogo`, `/libro-de-reclamaciones`)
  not `200`, or `/admin` not redirecting to `/admin/login` when logged out.
- `db push --dry-run` lists anything other than the exact expected versions (never "push and see").
- Post-migration checks fail: migration count / max version, function ACLs, `search_path=""`, new advisor findings,
  `public_launch_ready()` changing unexpectedly, or business counts (orders, complaints, outbox) changing.
- The read-only Production Playwright run (`E2E_BASE_URL=https://cruzial.pe`, projects chromium/mobile/tablet/
  responsive) reports a failure that does not reproduce as pre-existing.
- A GitHub issue `[Monitor] …` opens for a new error rate or advisor regression right after the release.

Order rule: **application first, database second** when the new app needs the new schema (e.g. the `*_v2` RPCs of
`20261011120000/120100`); **database first, application second** when rolling forward. Old app + new DB was verified
compatible for every migration applied on 2026-10-11.

## 1. Application (Vercel) rollback

Instant, no rebuild, reversible:

```bash
cd apps/web
npx vercel rollback <previous-deployment-url-or-id> --yes
npx vercel rollback status
```

`vercel promote <deployment>` re-promotes any later deployment (to undo the rollback). Find candidate deployment IDs
with `npx vercel ls cruzial-platform-v2` or the Vercel dashboard (Deployments → filter Production). Per Vercel's
Instant Rollback docs: after a rollback Vercel turns off auto-assignment of production domains, so new pushes do not
go live until a deployment is promoted again (`vercel promote` or "Undo Rollback") — remember it once the fix is
merged; environment variables are not changed by a rollback; cron jobs revert to the rolled-back deployment's
`vercel.json`; on the Hobby plan only the immediately previous production deployment is eligible. Code-level revert: a normal PR that reverts the squash commit (HEAD-guarded merge as usual); never
force-push `master`.

## 2. Database migration rollback (append-only)

Applied migrations are never edited, renamed or deleted, and `supabase migration repair` is not used to hide history.
A rollback is a **new forward migration** whose body is the reviewed rollback script:

| Applied migration(s) | Rollback script | Notes |
| --- | --- | --- |
| `20261011120000`, `20261011120100`, `20261011120200` | `supabase/rollback/20261011_codex_certification_integration_rollback.sql` | Roll the app back first (it calls `*_v2`). Restores previous bodies verbatim, drops the two `*_v2` functions. |
| `20261011130000` (indexing switch) | none needed | Default OFF; use section 3. Dropping it would only remove the owner's control. |
| `20261010120000` | `supabase/rollback/20261010_launch_readiness_status_archived_rollback.sql` | Function body only. |
| `20261001010000` | `supabase/rollback/20261001_owner_selected_provisional_rollback.sql` | See the file header. |
| final cutover (2026-09-27) | `supabase/rollback/20260927_final_cutover_rollback.sql` | See the file header. |

Procedure (same discipline as every forward migration, see `docs/migration-apply-20261010120000.md`):

1. Fresh backup (section 4) and its checksums.
2. Copy the rollback script to `supabase/migrations/<new timestamp>_rollback_<name>.sql` in a PR; pgTAP must pass on a
   fresh stack (CI "Database" job); apply to QA first (`node scripts/qa-hosted-browser.mjs --reset` from that branch,
   marker-guarded) and run the hosted QA suite.
3. Production: `supabase db push --dry-run` must list exactly that one version; then `db push`; verify count/max
   version, ACLs, advisors, business counts.

## 3. Search indexing switch

Normal path: Admin → Operaciones → "Preparación para lanzamiento" → "Desactivar indexación en buscadores" (AAL2 admin
of Parfums **and** Import; audited per unit). The change is immediate for `robots.txt`, `sitemap.xml` and page
metadata (all dynamic).

Emergency path without an admin session: set `CRUZIAL_INDEXING_FORCE_OFF=true` for the Production target in Vercel
(Settings → Environment Variables, or `npx vercel env add CRUZIAL_INDEXING_FORCE_OFF production`) and redeploy; every
page is then `noindex` and `robots.txt` is `Disallow: /` regardless of the database value. Remove it to return
control to the switch. Do NOT remove variables that are shared across targets without checking which targets the
entry covers (one entry can hold several targets).

### 3b. Before switching indexing ON: metadata in `<head>`

The root layout's `generateMetadata` is async (it reads the switch), so on fast routes (`/`, `/parfums`) Next 16
streams `<title>`, `description` and `robots` into `<body>` for non-bot user agents (documented "streaming
metadata"; listed HTML-limited bots such as Googlebot/Bingbot already get them in `<head>`). Fix compatible with the
installed Next 16.4 (node_modules/next/dist/docs/.../htmlLimitedBots.md): add `htmlLimitedBots: /.*/` to
`apps/web/next.config.ts`. Verify after deploy: `curl -s https://cruzial.pe/parfums` must show
`<meta name="description"` before `</head>`; Lighthouse SEO `meta-description` passes; compare TTFB before/after.
Rollback: remove the option.

## 3c. Supabase Auth redirect allow-list (changed 2026-10-11)

Production `uri_allow_list` is `https://cruzial.pe/auth/callback,https://www.cruzial.pe/auth/callback`. Removed on
2026-10-11 (owner-authorized, dashboard Authentication → URL Configuration): `http://localhost:3000/auth/callback` and
`http://127.0.0.1:3000/auth/callback` — no Production flow used them (local development uses the local Supabase stack
with its own `supabase/config.toml` redirects; Preview uses QA; only the email provider is enabled, no OAuth).
Revert: add them back in the same screen ("Add URL").

## 4. Database restore (disaster recovery)

Latest verified backups (private disk, outside the repository and OneDrive; contain PII):

| Folder under `C:\cruzial-private-backups\` | Checksums (re-checked 2026-10-11) | Restore-validated |
| --- | --- | --- |
| `cruzial-iyxidhglyqkzoziyewlc-2026-10-11T07-13-47-671Z` (before migrations 82-85) | 3/3 OK | **yes, 2026-10-11**: 944 products, 2 campaigns, 0 orders, RLS + key functions present |
| `cruzial-iyxidhglyqkzoziyewlc-2026-10-11T03-42-42-919Z` | 3/3 OK | no |
| `cruzial-iyxidhglyqkzoziyewlc-2026-10-09T04-01-15-088Z` | 3/3 OK | yes, 2026-10-09 |

Create: `node scripts/backup-production-db.mjs --output-dir C:\cruzial-private-backups` with `SUPABASE_DB_PASSWORD`
in the environment (never on the command line). Validate: `docs/backup-runbook.md` → "Restore validation"
(`scripts/restore-validate-backup.mjs` into a disposable empty local stack; loopback only). Encrypted off-site copy:
`scripts/backup-crypt.mjs encrypt|verify|decrypt` with `CRUZIAL_BACKUP_PASSPHRASE` (losing it makes the copy
unrecoverable).

Restoring **into Production** is a last resort that overwrites live data and needs the owner's explicit decision:
the dump is roles/schema/data SQL (`docs/backup-runbook.md` §2 order), so a Production restore means restoring into a
new/empty project and re-pointing the app's `NEXT_PUBLIC_SUPABASE_URL`/keys, or restoring selected tables after an
incident analysis. Supabase Free has no managed backups or PITR (`docs/backup-runbook.md` → Option A/B).

## 5. What the database dump does NOT contain

**Cloudinary media.** Images live in the Production Cloudinary account; the database keeps only references
(`product_media.public_id`, `secure_url`, `checksum` = SHA-256 of the original). Recovery sources:
- The client originals preserved on 2026-10-11 at `C:\Users\ABEL\cruzial-preservation\2026-10-11\stash-untracked\img\`
  with `stash-img-manifest.sha256`: 164 of those 168 files match a Production `product_media.checksum` exactly, so
  they are byte-identical originals of what Cloudinary serves; re-upload with `scripts/migrate-client-media.mjs`
  (matches by checksum, preserves originals).
- Any asset uploaded later from the admin exists only in Cloudinary: export it from the Cloudinary console (Media
  Library → select → Download) or enable Cloudinary's own backup option if the plan offers it (not verified here).

**Vercel configuration.** Recreate from: `apps/web/vercel.json` (cron `/api/automation/process`, `0 13 * * *`);
project settings (root `apps/web`, Node `24.x`, framework Next.js); domains `cruzial.pe` (primary) and
`www.cruzial.pe` → `cruzial.pe` with **308**; environment variable NAMES and targets (values live only in Vercel and in
the owner's password manager):

| Name | Targets |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` | Production and Preview, separate values (Preview → QA) |
| `ORDER_ABUSE_HMAC_SECRET`, `SITE_URL` | Production and Preview, separate values |
| `ADMIN_BOOTSTRAP_EMAIL` | one entry for Production+Preview |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CRON_SECRET` | Production only |
| `CRUZIAL_PRODUCTION_CUTOVER_APPROVED` | retired (no longer read); optional `CRUZIAL_INDEXING_FORCE_OFF` |

**GitHub.** Repository secrets `VERCEL_TOKEN` (needs: team or project scope, read deployments + events) and
`SUPABASE_ACCESS_TOKEN` (scoped PAT: Advisors Read + Logs Read — it correctly cannot change Auth config); branch protection and security
settings are listed in `docs/closure-report-2026-10-10.md` §7. GitHub Pages serves branch `pages-redirect`
(redirect-only); to restore the old publication: Settings → Pages → Source `master` `/`.

## 6. Official support channels

- Vercel: https://vercel.com/help (dashboard → Help); status https://www.vercel-status.com
- Supabase: https://supabase.com/dashboard/support/new; status https://status.supabase.com
- Cloudinary: https://support.cloudinary.com; status https://status.cloudinary.com
- GitHub: https://support.github.com; status https://www.githubstatus.com
- Domain `.pe` registrar: Punto.pe (account e-mail on the business Gmail).
