# Monitoring — Vercel Production deployment errors

`scripts/monitor-vercel.mjs` + `.github/workflows/monitor-vercel.yml` (hourly, minute 17). Added 2026-10-11.

## What it does

1. With `@vercel/sdk` it lists the latest 5 **production** deployments of `cruzial-platform-v2`
   (`deployments.getDeployments`).
2. For each one it reads the deployment events (`deployments.getDeploymentEvents`, build events included) and counts the
   events whose `type` is `error` or `fatal`.
3. If the **total is strictly greater than 10** it posts one message to a Discord webhook.

It is read-only: it never changes Vercel project settings, variables or deployments.

## What it does NOT cover (read before relying on it)

- **Deployment/build events only.** HTTP 5xx from functions at runtime are not deployment events. Check them with
  `vercel --scope cruzial logs --project cruzial-platform-v2 --environment production --status-code 5xx` and the
  Supabase logs (`docs/owner-verification-runbook.md`, "Registros para investigar incidentes").
- `stderr` is deliberately not counted: a healthy Next.js build writes ~65 npm/Next warning lines to stderr (measured on
  `dpl_7ooYcGW5dC5cgSppmWcMKrp4ZKQq`: 121 `stdout`, 65 `stderr`, 0 `error`).
- **Stateless.** While the same failing deployments remain among the latest 5, every hourly run above the threshold
  alerts again. Deploying a healthy build pushes them out; or raise `MONITOR_THRESHOLD`.
- The alert has counts, deployment IDs, states and URLs — never log text (logs can contain paths or variable names).
- Scheduled workflows are paused by GitHub after 60 days without repository activity; re-enable them in the Actions tab.
- Until `VERCEL_TOKEN` exists the workflow succeeds but prints a **warning** ("Vercel monitor NOT running"). Nothing is
  being monitored until the secrets below are set.

## One-time setup (owner; never paste the values in chat, PRs or commits)

1. Vercel → Account Settings → Tokens: create a token named `cruzial-monitor`, scope = team `cruzial`, short expiry.
   Vercel tokens cannot be limited to read-only, so treat it as sensitive and rotate it on a schedule.
2. Discord: Channel → Edit → Integrations → Webhooks → New Webhook → copy the URL.
3. Store both as repository secrets from your own terminal (the CLI prompts for the value, nothing is echoed):

```bash
gh secret set VERCEL_TOKEN --repo Abel-Castill0/cruzialparfums
gh secret set DISCORD_WEBHOOK_URL --repo Abel-Castill0/cruzialparfums
```

4. Test without sending anything: Actions → "Monitor Vercel Production" → Run workflow (the `dry_run` box is checked by
   default). The log lists the 5 deployments and their error counts. Untick `dry_run` for a real run: it sends to Discord only if the
   total exceeds the threshold, which is the normal behaviour.

## Configuration

Environment variables (see the header of `scripts/monitor-vercel.mjs`): `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`,
`VERCEL_TEAM_ID`, `DISCORD_WEBHOOK_URL`, `MONITOR_DEPLOYMENTS` (default 5, max 20), `MONITOR_THRESHOLD` (default 10),
`MONITOR_TARGET` (`production` default, or `all`). Local dry run:

```bash
VERCEL_TOKEN=... VERCEL_PROJECT_ID=prj_u2ZX24IO9akHdN0qlzveQNwte59l VERCEL_TEAM_ID=team_OPJLunXDFXq0o9kKQK6VOt8Z \
  node scripts/monitor-vercel.mjs --dry-run
```

Exit codes: `0` below threshold / alert delivered / dry run; `1` configuration or Vercel API failure; `2` threshold
exceeded but the alert could not be delivered (no webhook, invalid webhook, Discord error).

## Security notes

- Only `https://discord.com/api/webhooks/...` (and `discordapp.com`, `ptb.`, `canary.`) is accepted, so a wrong or
  poisoned secret cannot turn the job into a way to send data elsewhere. Mentions are disabled in the message.
- The workflow has `contents: read`, SHA-pinned actions, installs with `npm ci --ignore-scripts` and exposes the secrets
  only to the two steps that need them. Pull requests from forks never receive repository secrets.
- `@vercel/sdk` is pinned to an exact version (1.28.37, published 2026-09-25, at least two weeks old when added) as a
  devDependency of `apps/web`; it adds one package to the lockfile. Review Dependabot bumps of it like any other.

## Tests

`npm run test:monitor-vercel` (15 tests, no network: SDK and `fetch` are injected) runs inside `npm run check` and CI.
The collection logic was also exercised once against the real Production data through the authenticated Vercel CLI in
`--dry-run`: 5 deployments, all READY, 0 error events. Not yet exercised: the SDK with a real token and a real Discord
delivery (they need the secrets above) — use the dry-run dispatch for the first.
