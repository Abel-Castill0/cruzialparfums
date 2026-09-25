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
npx supabase login   # once, if not already authenticated

node scripts/backup-production-db.mjs --output-dir C:\cruzial-private-backups
```

- **`--output-dir` is required and has no default.** This repository lives
  under `C:\Users\...\OneDrive\Desktop\cruzialparfums` on the operator's
  machine — a default of "the repo" or "the current directory" would put
  real customer PII inside a OneDrive-synchronized tree before anyone
  chose to encrypt it. The script refuses to run without an explicit
  `--output-dir`, and rejects (fails closed, before anything is dumped) a
  path that is:
  - not absolute,
  - inside the current working directory (the repository), or
  - inside an obvious cloud-sync folder — OneDrive, Dropbox, Google Drive,
    or iCloud, checked case-insensitively against each path segment.

  Choose your own private destination outside all of the above —
  `C:\cruzial-private-backups` is only an example, not a default the code
  assumes.
- Optional: set `SUPABASE_DB_PASSWORD` in your own shell environment first.
  The script never constructs a `--password`/`-p` command-line argument —
  confirmed via `--dry-run` that the Supabase CLI reads
  `SUPABASE_DB_PASSWORD` from its own environment and forwards it to the
  underlying `pg_dump`/`pg_dumpall` subprocess as `PGPASSWORD`, never as an
  argument visible in the process list. If the variable is unset, the CLI
  prompts interactively instead (this script does not invent a
  non-interactive fallback of its own).
- Output: `<output-dir>/cruzial-<project-ref>-<UTC timestamp>/` containing
  `roles.sql`, `schema.sql`, `data.sql`, and `checksums.sha256` (a SHA-256
  manifest covering all three files).
- The script prints only status lines (file names, sizes, checksums). It
  never prints a secret value, a database password, or any row of data.
- On Windows, the Supabase CLI is invoked through `npx.cmd` with
  `shell: true` (Windows cannot execute a `.cmd` file directly via
  `spawnSync` even with an absolute path — confirmed empirically, not
  assumed); every other platform runs plain `npx` with no shell involved.

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

A backup that has never been restored is unverified. The restore target
must be a genuinely **empty** Supabase project — not Cruzial's normal local
dev stack. `supabase/config.toml` has `[db.migrations] enabled = true` and
`[db.seed] enabled = true`, so `supabase start`/`supabase db reset` in this
repo always applies the full Cruzial migration chain and seed data first —
restoring on top of that is not a clean test and can produce object/data
conflicts. Never validate against hosted Production either.

### 1. Stand up a disposable, empty Supabase project

In a directory **outside this repo** (so `supabase start` cannot find
Cruzial's migrations via ancestor-directory search), and with any locally
running Cruzial stack stopped first (`npx supabase stop`, from this repo,
to free the default ports):

```bash
mkdir -p /tmp/cruzial-restore-check && cd /tmp/cruzial-restore-check
npx supabase init --force      # scaffolds an EMPTY project: no migrations/, no seed.sql
npx supabase start -x studio,imgproxy,edge-runtime,logflare,vector
DB_URL=$(npx supabase status -o env | grep DB_URL | cut -d'"' -f4)
```

This boots the base Supabase platform (Postgres, GoTrue, PostgREST,
Realtime, Storage) with none of Cruzial's schema or data — exactly the
target a restore should land on.

### 2. Restore in order, atomically, with clear failure signaling

```bash
psql "$DB_URL" -v ON_ERROR_STOP=1 --single-transaction -f roles.sql
psql "$DB_URL" -v ON_ERROR_STOP=1 --single-transaction -f schema.sql
psql "$DB_URL" -v ON_ERROR_STOP=1 --single-transaction -f data.sql
```

`--single-transaction` makes each file atomic (a failure partway through
one file rolls back that file's changes, not just stops mid-statement);
`ON_ERROR_STOP=1` makes the command itself fail loudly and exit non-zero
instead of continuing past an error. Three separate invocations (not one
chained `-f roles.sql -f schema.sql -f data.sql`) because `psql` only
honors its last `-f` when given more than one — official Supabase restore
guidance runs them as separate commands for this reason.

**Two narrow, confirmed caveats** (found by actually running this restore
against a real local dump, not assumed):

- `roles.sql` restoring against a non-hosted target can fail on
  `GRANT SET ON PARAMETER "log_min_messages" TO "supabase_realtime_admin";`
  — Supabase's local/managed `postgres` role is not a true PostgreSQL
  superuser and cannot itself grant a parameter-level privilege. This one
  statement only tunes Realtime's own log verbosity; dropping it (`grep -v
  "GRANT SET ON PARAMETER"`) does not affect restored schema or data.
- `data.sql` can fail with `permission denied` on `storage.*` tables
  (`buckets_vectors`, `vector_indexes`, etc.) — these are RLS-protected,
  owned by `supabase_storage_admin`, and `postgres` has no `BYPASSRLS`
  locally. Cruzial stores media in Cloudinary, not Supabase Storage, so
  these tables are always empty for this project and safe to skip.

`scripts/restore-validate-backup.mjs` applies both filters automatically —
prefer it over the raw three-command sequence above:

```bash
node scripts/restore-validate-backup.mjs \
  --backup-dir backups/cruzial-<project-ref>-<timestamp> \
  --db-url "$DB_URL"
```

### 3. Post-restore checks (counts and schema objects only — never PII)

The script prints row counts for `products`, `campaigns`, `orders`,
`customers`, `complaint_book_entries`, and `admin_memberships`, plus
presence checks for: RLS enabled on `inventory` / `complaint_book_entries`
/ `audit_log`; the `admin_update_inventory`, `admin_create_variant`, and
`check_abuse_rate_limit` functions; and the
`inventory_tracked_zero_not_available_check` constraint. A restore of real
production data should show non-zero counts for at least `products` and
`admin_memberships`; a restore of local dev data may legitimately show
zeros (the local seed doesn't populate these tables) — that's still a
valid mechanism test, just not evidence about production data.

A successful run of this proves the SQL backup restores cleanly and the
schema/RPC/constraint surface came back intact. It does **not** by itself
restore or validate:

- **Cloudinary-hosted media** (see "What this backup does NOT cover" above).
- **Vercel/platform configuration** (env vars, domains, deployment settings).
- **Any other external provider configuration** (Cloudinary account
  settings, DNS, etc.).

### 4. Tear down

```bash
cd /tmp/cruzial-restore-check && npx supabase stop --no-backup
cd - && npx supabase start   # bring your normal Cruzial local stack back, if you use it
rm -rf /tmp/cruzial-restore-check
```

Don't let the restored PII linger on a laptop disk longer than the check
takes.
