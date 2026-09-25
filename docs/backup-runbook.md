# Production database backup runbook (Gate A6)

## Current state

- Supabase organization plan: **Free**.
- Managed automatic backups: **not available** on this plan (Supabase's
  daily managed backups require Pro or above).
- No backup automation exists in this repo's CI — and none should be added
  here casually: a scheduled GitHub Actions job would need the production
  database password as a repo secret, and its run logs/artifacts are an
  easy way to leak a full PII dump from what the brief that drove this Gate
  calls a PUBLIC repository.

This is an infrastructure/business decision, not something solved by
adding code. Pick one before treating backups as "handled":

- **Option A:** Upgrade the Supabase organization to **Pro** and enable its
  daily managed backups (with point-in-time recovery if the plan/add-on
  supports it). Simplest, no new tooling to maintain, has a monthly cost.
- **Option B:** Stay on Free and use an approved **private** off-site
  storage destination (e.g. a private cloud bucket the operator already
  trusts) plus the script below, run manually or on a schedule the operator
  controls **outside** this repo's CI (a personal cron job, a scheduled
  task on a machine the operator controls, etc.), with the dump encrypted
  before it ever leaves that machine.

Until one of these is chosen and set up, the only backup that exists is
whatever an operator runs manually with the script below.

## Why three files, not one

A plain `supabase db dump` is **schema only** — confirmed directly against
the CLI with `--dry-run`, which shows it running `pg_dump --schema-only`
under the hood. It does not include table data, and it does not include
cluster roles either (`supabase db dump --role-only` runs a separate
`pg_dumpall --roles-only`). A backup that only calls the plain command
silently omits every order, customer, and complaint row — the exact data
that matters. `scripts/backup-production-db.mjs` therefore runs all three
dumps and writes them as separate files, matching Supabase's own
documented restore order:

1. `roles.sql` — `supabase db dump --role-only`
2. `schema.sql` — `supabase db dump` (schema only, the default)
3. `data.sql` — `supabase db dump --data-only --use-copy`

## Manual backup

```bash
npx supabase login                      # once, if not already authenticated
node scripts/backup-production-db.mjs   # dumps the production project
```

- Optional: set `SUPABASE_DB_PASSWORD` in your own shell environment first.
  The script never constructs a `--password`/`-p` command-line argument —
  confirmed via `--dry-run` that the Supabase CLI reads
  `SUPABASE_DB_PASSWORD` from its own environment and forwards it to the
  underlying `pg_dump`/`pg_dumpall` subprocess as `PGPASSWORD`, never as an
  argument visible in the process list. If the variable is unset, the CLI
  prompts interactively instead (this script does not invent a
  non-interactive fallback of its own).
- Output: `backups/cruzial-<project-ref>-<UTC timestamp>/` containing
  `roles.sql`, `schema.sql`, `data.sql`, and `checksums.sha256` (a SHA-256
  manifest covering all three files). `backups/` is gitignored — nothing
  here is ever committed.
- The script prints only status lines (file names, sizes, checksums). It
  never prints a secret value, a database password, or any row of data.

## What this backup does NOT cover

- **Cloudinary-hosted media**: product/combo images live in Cloudinary, not
  in the Supabase database. This backup does not capture them; a separate
  Cloudinary export is needed for a full disaster-recovery copy.
- **Vercel/platform configuration**: environment variables, domains, and
  deployment settings are not part of this dump. `docs/production-hygiene.md`
  documents the current env/domain state as of when it was written, but
  that document can drift — it is not a substitute for an actual export.

## Handling the resulting files

- They are **unencrypted logical dumps** containing real customer PII
  (names, phone numbers, addresses, order history, Libro de Reclamaciones
  complaint text). Treat them exactly like the production database itself.
- **Never** upload them as a GitHub Actions artifact, attach them to an
  issue or PR (this is a public repository), or store them anywhere that
  isn't the approved private destination from Option B above.
- If they need to leave the machine they were created on, encrypt them
  first (e.g. `age`, `gpg`, or your cloud provider's server-side encryption
  for the specific approved bucket) and send the encrypted archive, never
  the plaintext `.sql` files.
- Delete the local plaintext copy once it is safely stored (encrypted)
  elsewhere, if your data-retention policy requires that.

## Restore validation

A backup that has never been restored is unverified. Validate against a
disposable local stack, never against the hosted project, and restore in
the same order the files were produced — roles, then schema, then data:

```bash
npx supabase stop --no-backup   # if a local stack is already running
npx supabase start
DB_URL=$(npx supabase status -o env | grep DB_URL | cut -d'"' -f4)

psql "$DB_URL" -f backups/cruzial-<project-ref>-<timestamp>/roles.sql
psql "$DB_URL" -f backups/cruzial-<project-ref>-<timestamp>/schema.sql
psql "$DB_URL" -f backups/cruzial-<project-ref>-<timestamp>/data.sql
```

Then, against that local restore, sanity-check (never against production):

- `select count(*) from public.products;` and a couple of other core
  tables return plausible, non-zero counts.
- Spot-check one recent `public.orders` row and its `public.order_lines`
  join resolve correctly.
- `npx supabase test db` may not pass cleanly against restored production
  data (pgTAP's fixtures assume a specific seeded state, not whatever real
  data happens to be in the dump) — treat a pgTAP failure here as
  informational about fixture mismatch, not a sign the backup itself is
  bad. Re-run pgTAP against a fresh empty stack (`supabase db reset`) to
  confirm the test suite itself is still green.

When done, tear the local stack back down (`npx supabase stop`) so the
restored PII doesn't linger on a laptop disk longer than needed.
