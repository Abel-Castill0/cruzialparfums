/**
 * Basic Production monitor: counts error events in the logs of the latest Vercel deployments and raises an alert when the
 * total exceeds a threshold (a GitHub issue by default; Discord is opt-in with MONITOR_CHANNEL=discord). READ-ONLY on Vercel: it only calls `deployments.getDeployments` and
 * `deployments.getDeploymentEvents`; it never changes project settings, environment variables or deployments.
 *
 * Usage (from the repository root; the SDK is installed with `npm ci` in apps/web):
 *   VERCEL_TOKEN=... VERCEL_PROJECT_ID=... VERCEL_TEAM_ID=... [GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/name] node scripts/monitor-vercel.mjs [--dry-run]
 *
 * Configuration (environment only; nothing is read from argv so secrets never reach process lists or shell history):
 *   VERCEL_TOKEN         required. Use a token that can read the team's deployments; never commit it.
 *   VERCEL_PROJECT_ID    required (e.g. prj_...). The ID is not a secret.
 *   VERCEL_TEAM_ID       optional but needed for team projects (team_...).
 *   MONITOR_CHANNEL      "github" (default) or "discord". See scripts/lib/alert-channels.mjs.
 *   GITHUB_TOKEN, GITHUB_REPOSITORY   channel github: creates the issue "[Monitor] vercel-production: ...", or comments on the
 *                        open issue with the same title (no duplicates). In Actions: `${{ github.token }}` + `issues: write`.
 *   DISCORD_WEBHOOK_URL  channel discord only: https://discord.com/api/webhooks/... (and discordapp.com / ptb. / canary.).
 *   MONITOR_DEPLOYMENTS  how many latest deployments to inspect (default 5, max 20).
 *   MONITOR_THRESHOLD    alert when the TOTAL number of error events is strictly greater than this (default 10).
 *   MONITOR_TARGET       "production" (default) or "all" (also previews).
 *
 * What counts as an error: events whose `type` is "error" or "fatal" (Vercel's terminal failure event). `stderr` is
 * deliberately NOT counted: a healthy Next.js build writes dozens of npm/Next warnings to stderr.
 *
 * Limits (read this before relying on it):
 *   - These are DEPLOYMENT/BUILD events. Runtime request errors (HTTP 5xx from functions) are not deployment events,
 *     so this does not replace Vercel's runtime logs or Supabase logs.
 *   - It is stateless: while the same failing deployments stay inside the latest N, every run above the threshold
 *     alerts again (hourly from the workflow). Roll forward with a healthy deployment, or raise MONITOR_THRESHOLD.
 *   - The alert contains only counts, deployment IDs, states and URLs. It never includes log text, which can hold
 *     paths, variable names or other sensitive details. The issue title is fixed (numbers live in the body) so repeated
 *     runs comment on one open issue instead of opening a new one each hour; close the issue when the problem is solved.
 *
 * Dry run: `--dry-run` or DRY_RUN=true. Vercel is still read, but nothing is written anywhere (no issue, comment or webhook).
 *
 * When Vercel rejects the token or fails, the monitor is blind: it raises "[Monitor] vercel-production: monitor cannot run"
 * (at most one comment per 24 h on the open issue) and still exits 1.
 *
 * Exit codes: 0 = below threshold, or alert delivered (or --dry-run); 1 = configuration or API failure;
 *             2 = threshold exceeded but the alert could not be delivered (missing token/webhook, GitHub or Discord error).
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { assertDiscordWebhook, buildFailureAlert, deliverAlert, isDryRun, issueTitle, postDiscord, readChannel, runUrlFrom } from "./lib/alert-channels.mjs";

// Kept as re-exports: the Discord helpers moved to ./lib/alert-channels.mjs.
export { assertDiscordWebhook, postDiscord };

export const DEFAULT_DEPLOYMENTS = 5;
export const MAX_DEPLOYMENTS = 20;
export const DEFAULT_THRESHOLD = 10;
export const ERROR_EVENT_TYPES = Object.freeze(["error", "fatal"]);

/** Events may be an array (possibly with nulls) or a single event object. */
export function normalizeEvents(response) {
  if (Array.isArray(response)) return response.filter((e) => e && typeof e === "object");
  if (response && typeof response === "object") return [response];
  return [];
}

export function countErrorEvents(events) {
  return normalizeEvents(events).filter((e) => ERROR_EVENT_TYPES.includes(e.type)).length;
}

export function shouldAlert(total, threshold) {
  return Number.isFinite(total) && Number.isFinite(threshold) && total > threshold;
}

function positiveInt(raw, fallback, max) {
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new Error(`Invalid number "${raw}" (expected a positive integer).`);
  return Math.min(n, max);
}

export function readConfig(env) {
  const token = env.VERCEL_TOKEN;
  const projectId = env.VERCEL_PROJECT_ID;
  if (!token) throw new Error("VERCEL_TOKEN is required.");
  if (!projectId) throw new Error("VERCEL_PROJECT_ID is required.");
  const target = (env.MONITOR_TARGET || "production").toLowerCase();
  if (target !== "production" && target !== "all") throw new Error('MONITOR_TARGET must be "production" or "all".');
  const threshold = env.MONITOR_THRESHOLD === undefined || env.MONITOR_THRESHOLD === "" ? DEFAULT_THRESHOLD : Number(env.MONITOR_THRESHOLD);
  if (!Number.isInteger(threshold) || threshold < 0) throw new Error("MONITOR_THRESHOLD must be a non-negative integer.");
  return {
    token,
    projectId,
    teamId: env.VERCEL_TEAM_ID || undefined,
    deployments: positiveInt(env.MONITOR_DEPLOYMENTS, DEFAULT_DEPLOYMENTS, MAX_DEPLOYMENTS),
    threshold,
    target,
    channel: readChannel(env),
  };
}

/** Inspect the latest deployments; returns one row per deployment. */
export async function collectDeployments({ sdk, projectId, teamId, limit, target }) {
  const list = await sdk.deployments.getDeployments({
    projectId,
    teamId,
    limit,
    ...(target === "production" ? { target: "production" } : {}),
  });
  const deployments = (list?.deployments ?? []).slice(0, limit);
  const rows = [];
  for (const d of deployments) {
    const events = await sdk.deployments.getDeploymentEvents({ idOrUrl: d.uid, teamId, limit: -1, builds: 1, direction: "forward" });
    rows.push({
      id: d.uid,
      url: d.url ? `https://${d.url}` : null,
      inspectorUrl: d.inspectorUrl ?? null,
      state: d.readyState ?? d.state ?? "UNKNOWN",
      createdAt: typeof d.created === "number" ? new Date(d.created).toISOString() : null,
      errors: countErrorEvents(events),
    });
  }
  return rows;
}

export function summarize(rows) {
  return { total: rows.reduce((sum, r) => sum + r.errors, 0), deployments: rows.length };
}

/** Discord message body. Counts, IDs, states and URLs only — never log text. Mentions are disabled. */
export function buildDiscordPayload({ total, threshold, rows, runUrl }) {
  const lines = rows.map((r) => `• \`${r.id}\` ${r.state} — ${r.errors} error(s)${r.inspectorUrl ? ` — <${r.inspectorUrl}>` : ""}`);
  const content = [
    `🚨 **Vercel Production**: ${total} error event(s) in the last ${rows.length} deployment(s) (threshold: more than ${threshold}).`,
    ...lines,
    ...(runUrl ? [`Monitor run: <${runUrl}>`] : []),
  ].join("\n");
  return { content: content.slice(0, 1900), allowed_mentions: { parse: [] } };
}

/** GitHub issue for the same alert. The title is stable (no numbers) so repeated runs de-duplicate; counts go in the body. */
export function buildIssue({ total, threshold, rows, runUrl }) {
  const lines = rows.map((r) => `| \`${r.id}\` | ${r.state} | ${r.errors} | ${r.inspectorUrl ?? r.url ?? "-"} |`);
  const body = [
    `**${total}** error event(s) (\`error\`/\`fatal\`) in the last ${rows.length} Production deployment(s); threshold: more than ${threshold}.`,
    "",
    "| Deployment | State | Errors | URL |",
    "| --- | --- | --- | --- |",
    ...lines,
    "",
    ...(runUrl ? [`Monitor run: ${runUrl}`] : []),
    "These are build/deployment events, not runtime 5xx. Counts, IDs and URLs only; no log text. Close this issue when the problem is solved.",
  ].join("\n");
  return { title: issueTitle("vercel-production", "deployment error events above threshold"), body };
}

export async function createSdk(token) {
  // Loaded lazily so the pure functions above can be imported (and unit-tested) without the SDK installed.
  const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
  const { Vercel } = await import(pathToFileURL(require.resolve("@vercel/sdk")).href);
  return new Vercel({ bearerToken: token });
}

export async function run({ env = process.env, argv = process.argv.slice(2), sdkFactory = createSdk, fetchImpl = fetch, log = console.log } = {}) {
  const dryRun = isDryRun(argv, env);
  let config;
  try {
    config = readConfig(env);
  } catch (error) {
    log(`[monitor] configuration error: ${error.message}`);
    return 1;
  }
  let rows;
  try {
    const sdk = await sdkFactory(config.token);
    rows = await collectDeployments({ sdk, projectId: config.projectId, teamId: config.teamId, limit: config.deployments, target: config.target });
  } catch (error) {
    const reason = `Vercel API failure: ${String(error?.message ?? error).split("\n")[0].slice(0, 300)}`;
    log(`[monitor] ${reason}`);
    const alert = buildFailureAlert({ type: "vercel-production", service: "Vercel Production", reason, runUrl: runUrlFrom(env), fix: "check the VERCEL_TOKEN repository secret (see docs/monitoring.md)" });
    await deliverAlert({ channel: config.channel, env, alert, fetchImpl, log, dryRun, prefix: "[monitor]" });
    return 1;
  }
  const { total, deployments } = summarize(rows);
  log(`[monitor] ${deployments} deployment(s) inspected, ${total} error event(s), threshold ${config.threshold}.`);
  for (const r of rows) log(`[monitor]   ${r.id} ${r.state} errors=${r.errors}`);
  if (!shouldAlert(total, config.threshold)) return 0;

  const runUrl = runUrlFrom(env);
  const args = { total, threshold: config.threshold, rows, runUrl };
  const alert = { discord: buildDiscordPayload(args), issues: [buildIssue(args)] };
  const { ok } = await deliverAlert({ channel: config.channel, env, alert, fetchImpl, log, dryRun, prefix: "[monitor]" });
  return ok ? 0 : 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().then((code) => process.exit(code));
}
