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

## Manual backup

```bash
npx supabase login                      # once, if not already authenticated
node scripts/backup-production-db.mjs   # dumps the production project
```

- Optional: set `SUPABASE_DB_PASSWORD` in your own shell environment first
  (never pass it as a command-line argument — arguments are visible to
  other processes on the machine) to avoid an interactive password prompt.
- Output: `backups/cruzial-<project-ref>-<UTC timestamp>.sql` plus a
  `.sha256` checksum file alongside it. `backups/` is gitignored — nothing
  here is ever committed.
- The script prints only status lines (file path, size, checksum). It never
  prints a secret value, a database password, or any row of data.

## Handling the resulting file

- It is an **unencrypted logical dump** containing real customer PII
  (names, phone numbers, addresses, order history, Libro de Reclamaciones
  complaint text). Treat it exactly like the production database itself.
- **Never** upload it as a GitHub Actions artifact, attach it to an issue
  or PR (this is a public repository), or store it anywhere that isn't the
  approved private destination from Option B above.
- If it needs to leave the machine it was created on, encrypt it first
  (e.g. `age`, `gpg`, or your cloud provider's server-side encryption for
  the specific approved bucket) and send the encrypted file, never the
  plaintext `.sql`.
- Delete the local plaintext copy once it is safely stored (encrypted)
  elsewhere, if your data-retention policy requires that.

## Restore validation

A backup that has never been restored is unverified. Validate against a
disposable local stack, never against the hosted project:

```bash
npx supabase stop --no-backup   # if a local stack is already running
npx supabase start
psql "$(npx supabase status -o env | grep DB_URL | cut -d'"' -f4)" \
  -f backups/cruzial-<project-ref>-<timestamp>.sql
```

Then, against that local restore, sanity-check (never against production):

- `select count(*) from public.products;` and a couple of other core
  tables return plausible, non-zero counts.
- Spot-check one recent `public.orders` row and its `public.order_lines`
  join resolve correctly.
- `npx supabase test db` still passes against the restored data (it may
  not, depending on what fixtures already exist in the dump vs. what pgTAP
  expects — treat a pgTAP failure here as informational, not a sign the
  backup itself is bad, and re-run pgTAP against a fresh empty stack to
  confirm).

When done, tear the local stack back down (`npx supabase stop`) so the
restored PII doesn't linger on a laptop disk longer than needed.
