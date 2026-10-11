/**
 * Basic Production monitor: counts error events in the logs of the latest Vercel deployments and alerts a Discord
 * webhook when the total exceeds a threshold. READ-ONLY on Vercel: it only calls `deployments.getDeployments` and
 * `deployments.getDeploymentEvents`; it never changes project settings, environment variables or deployments.
 *
 * Usage (from the repository root; the SDK is installed with `npm ci` in apps/web):
 *   VERCEL_TOKEN=... VERCEL_PROJECT_ID=... VERCEL_TEAM_ID=... [DISCORD_WEBHOOK_URL=...] node scripts/monitor-vercel.mjs [--dry-run]
 *
 * Configuration (environment only; nothing is read from argv so secrets never reach process lists or shell history):
 *   VERCEL_TOKEN         required. Use a token that can read the team's deployments; never commit it.
 *   VERCEL_PROJECT_ID    required (e.g. prj_...). The ID is not a secret.
 *   VERCEL_TEAM_ID       optional but needed for team projects (team_...).
 *   DISCORD_WEBHOOK_URL  optional for --dry-run; required to deliver an alert. Only https://discord.com/api/webhooks/...
 *                        (and discordapp.com / ptb. / canary. hosts) is accepted.
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
 *     paths, variable names or other sensitive details.
 *
 * Exit codes: 0 = below threshold, or alert delivered (or --dry-run); 1 = configuration or API failure;
 *             2 = threshold exceeded but the alert could not be delivered (missing/invalid webhook, Discord error).
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

export const DEFAULT_DEPLOYMENTS = 5;
export const MAX_DEPLOYMENTS = 20;
export const DEFAULT_THRESHOLD = 10;
export const ERROR_EVENT_TYPES = Object.freeze(["error", "fatal"]);
const DISCORD_HOSTS = new Set(["discord.com", "discordapp.com", "ptb.discord.com", "canary.discord.com"]);

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
    webhookUrl: env.DISCORD_WEBHOOK_URL || undefined,
  };
}

/** Only real Discord webhook endpoints: a poisoned secret must not turn this job into an exfiltration channel. */
export function assertDiscordWebhook(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("DISCORD_WEBHOOK_URL is not a valid URL.");
  }
  if (url.protocol !== "https:" || !DISCORD_HOSTS.has(url.hostname) || !url.pathname.startsWith("/api/webhooks/")) {
    throw new Error("DISCORD_WEBHOOK_URL must be an https://discord.com/api/webhooks/... URL.");
  }
  return url;
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

export async function postDiscord(webhookUrl, payload, fetchImpl = fetch) {
  const url = assertDiscordWebhook(webhookUrl);
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Discord rejected the alert (HTTP ${response.status}).`);
}

export async function createSdk(token) {
  // Loaded lazily so the pure functions above can be imported (and unit-tested) without the SDK installed.
  const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
  const { Vercel } = await import(pathToFileURL(require.resolve("@vercel/sdk")).href);
  return new Vercel({ bearerToken: token });
}

export async function run({ env = process.env, argv = process.argv.slice(2), sdkFactory = createSdk, fetchImpl = fetch, log = console.log } = {}) {
  const dryRun = argv.includes("--dry-run");
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
    log(`[monitor] Vercel API failure: ${String(error?.message ?? error).split("\n")[0]}`);
    return 1;
  }
  const { total, deployments } = summarize(rows);
  log(`[monitor] ${deployments} deployment(s) inspected, ${total} error event(s), threshold ${config.threshold}.`);
  for (const r of rows) log(`[monitor]   ${r.id} ${r.state} errors=${r.errors}`);
  if (!shouldAlert(total, config.threshold)) return 0;

  const runUrl = env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}` : undefined;
  const payload = buildDiscordPayload({ total, threshold: config.threshold, rows, runUrl });
  if (dryRun) {
    log("[monitor] --dry-run: alert NOT sent. Payload:");
    log(JSON.stringify(payload, null, 2));
    return 0;
  }
  if (!config.webhookUrl) {
    log("[monitor] threshold exceeded but DISCORD_WEBHOOK_URL is not set; alert not delivered.");
    return 2;
  }
  try {
    await postDiscord(config.webhookUrl, payload, fetchImpl);
    log("[monitor] alert delivered to Discord.");
    return 0;
  } catch (error) {
    log(`[monitor] alert NOT delivered: ${error.message}`);
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().then((code) => process.exit(code));
}
