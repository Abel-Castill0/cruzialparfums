# Monitoring — Vercel Production deployment errors

`scripts/monitor-vercel.mjs` + `.github/workflows/monitor-vercel.yml` (hourly, minute 17). Added 2026-10-11.

## What it does

1. With `@vercel/sdk` it lists the latest 5 **production** deployments of `cruzial-platform-v2`
   (`deployments.getDeployments`).
2. For each one it reads the deployment events (`deployments.getDeploymentEvents`, build events included) and counts the
   events whose `type` is `error` or `fatal`.
3. If the **total is strictly greater than 10** it raises an alert. Default destination: a **GitHub issue** titled
   `[Monitor] vercel-production: deployment error events above threshold` (counts, deployment IDs, states and URLs in the
   body). If an **open** issue with exactly that title already exists, the script adds a **comment** instead of creating a
   new one, so a sustained problem does not spam. Discord is opt-in with `MONITOR_CHANNEL=discord`.

It is read-only: it never changes Vercel project settings, variables or deployments.

## What it does NOT cover (read before relying on it)

- **Deployment/build events only.** HTTP 5xx from functions at runtime are not deployment events. Check them with
  `vercel --scope cruzial logs --project cruzial-platform-v2 --environment production --status-code 5xx` and the
  Supabase logs (`docs/owner-verification-runbook.md`, "Registros para investigar incidentes").
- `stderr` is deliberately not counted: a healthy Next.js build writes ~65 npm/Next warning lines to stderr (measured on
  `dpl_7ooYcGW5dC5cgSppmWcMKrp4ZKQq`: 121 `stdout`, 65 `stderr`, 0 `error`).
- **Stateless, but not noisy.** While the same failing deployments remain among the latest 5, every hourly run above the
  threshold adds a comment to the same open issue (Discord would post again). Close the issue when the problem is solved; the
  next alert opens a new one. Deploying a healthy build pushes the failures out; or raise `MONITOR_THRESHOLD`.
- The alert has counts, deployment IDs, states and URLs — never log text (logs can contain paths or variable names).
- Scheduled workflows are paused by GitHub after 60 days without repository activity; re-enable them in the Actions tab.
- Until `VERCEL_TOKEN` exists the workflow succeeds but prints a **warning** ("Vercel monitor NOT running"). Nothing is
  being monitored until the secrets below are set.

## One-time setup (owner; never paste the values in chat, PRs or commits)

1. Vercel → Account Settings → Tokens: create a token named `cruzial-monitor`, scope = team `cruzial`, short expiry.
   Vercel tokens cannot be limited to read-only, so treat it as sensitive and rotate it on a schedule.
2. Store it as a repository secret from your own terminal (the CLI prompts for the value, nothing is echoed):

```bash
gh secret set VERCEL_TOKEN --repo Abel-Castill0/cruzialparfums
```

   The default channel (GitHub Issues) needs no other secret: the Actions `GITHUB_TOKEN` is used. Only if you choose
   `MONITOR_CHANNEL=discord`: create the webhook (Channel → Edit → Integrations → Webhooks) and run
   `gh secret set DISCORD_WEBHOOK_URL --repo Abel-Castill0/cruzialparfums`.

> **Workflow change still pending (deliberately not made together with this code change).** The default channel needs
> `permissions: issues: write` and `GITHUB_TOKEN: ${{ github.token }}` (`GITHUB_REPOSITORY` is set by Actions) on the monitor step
> of the workflow. Until that is added, a threshold breach cannot be delivered on the default channel and the run ends with exit
> code 2; set `MONITOR_CHANNEL=discord` and `DISCORD_WEBHOOK_URL` in the step environment to keep using Discord meanwhile.


4. Test without sending anything: Actions → "Monitor Vercel Production" → Run workflow (the `dry_run` box is checked by
   default). The log lists the 5 deployments and their error counts. Untick `dry_run` for a real run: it creates or comments on the issue (or posts to Discord) only if the
   total exceeds the threshold, which is the normal behaviour.

## Configuration

Environment variables (see the header of `scripts/monitor-vercel.mjs`): `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`,
`VERCEL_TEAM_ID`, `MONITOR_CHANNEL` (`github` default, or `discord`), `GITHUB_TOKEN` + `GITHUB_REPOSITORY` (channel github),
`DISCORD_WEBHOOK_URL` (channel discord), `MONITOR_DEPLOYMENTS` (default 5, max 20), `MONITOR_THRESHOLD` (default 10),
`MONITOR_TARGET` (`production` default, or `all`). The delivery code is shared with the Supabase health agent in
`scripts/lib/alert-channels.mjs`. Local dry run:

```bash
VERCEL_TOKEN=... VERCEL_PROJECT_ID=prj_u2ZX24IO9akHdN0qlzveQNwte59l VERCEL_TEAM_ID=team_OPJLunXDFXq0o9kKQK6VOt8Z \
  node scripts/monitor-vercel.mjs --dry-run
```

Exit codes: `0` below threshold / alert delivered / dry run; `1` configuration or Vercel API failure; `2` threshold
exceeded but the alert could not be delivered (missing `GITHUB_TOKEN`/`GITHUB_REPOSITORY` or webhook, invalid webhook, GitHub or
Discord error).

## Security notes

- The GitHub token is only ever sent to `api.github.com` (the host is fixed in code), `GITHUB_REPOSITORY` must look like
  `owner/name`, and API errors are reported by status and missing permission only — never the response body or the token.
  The issue body holds counts, IDs, states and URLs, never log text, and nobody is @-mentioned.
- Discord (opt-in): only `https://discord.com/api/webhooks/...` (and `discordapp.com`, `ptb.`, `canary.`) is accepted, so a wrong or
  poisoned secret cannot turn the job into a way to send data elsewhere. Mentions are disabled in the message.
- The workflow has `contents: read`, SHA-pinned actions, installs with `npm ci --ignore-scripts` and exposes the secrets
  only to the two steps that need them. Pull requests from forks never receive repository secrets.
- `@vercel/sdk` is pinned to an exact version (1.28.37, published 2026-09-25, at least two weeks old when added) as a
  devDependency of `apps/web`; it adds one package to the lockfile. Review Dependabot bumps of it like any other.

## Tests

`npm run test:monitor-vercel` (36 tests: 20 for the monitor and 16 for the shared alert channels; no network, the SDK and
`fetch` are injected and GitHub/Discord are faked) runs inside `npm run check` and CI. They cover both destinations: issue
created, comment on the open issue with the same title, pull requests and look-alike titles ignored, token only sent to
`api.github.com`, no secrets in logs, exit codes and `--dry-run`.
The collection logic was also exercised once against the real Production data through the authenticated Vercel CLI in
`--dry-run`: 5 deployments, all READY, 0 error events. Not yet exercised: the SDK with a real token and a real alert
delivery (a GitHub issue needs the pending workflow permission, Discord needs its webhook) — use the dry-run dispatch for the first.
