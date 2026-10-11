/**
 * Alert delivery shared by scripts/monitor-vercel.mjs and scripts/supabase-health.mjs.
 *
 * MONITOR_CHANNEL selects the destination (default "github"):
 *   github  GitHub Issues through the REST API. One issue per alert title; when an OPEN issue with exactly the same title
 *           already exists a comment is added instead of a new issue, so a sustained problem does not create duplicates.
 *           Needs GITHUB_TOKEN (in Actions: `${{ github.token }}` with `permissions: issues: write`) and GITHUB_REPOSITORY
 *           ("owner/name", set automatically in Actions).
 *   discord Discord webhook, opt-in. Needs DISCORD_WEBHOOK_URL (https://discord.com/api/webhooks/... only).
 *
 * Both destinations receive counts, IDs, states and URLs only — never log text. Secrets are only ever sent to
 * api.github.com / discord.com (hosts are fixed here, not configurable), and are never logged.
 *
 * Titles must be STABLE for the same condition (put the changing numbers in the body): the de-duplication is an exact match
 * on the title of an open issue. A maintainer closes the issue when the problem is solved; the next alert opens a new one.
 */

export const CHANNELS = Object.freeze(["github", "discord"]);
export const DEFAULT_CHANNEL = "github";
export const GITHUB_API = "https://api.github.com";
export const ISSUE_LABEL = "monitor";
const DISCORD_HOSTS = new Set(["discord.com", "discordapp.com", "ptb.discord.com", "canary.discord.com"]);
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const MAX_ISSUE_BODY = 60_000;
const MAX_PAGES = 3;

export function readChannel(env) {
  const raw = (env.MONITOR_CHANNEL ?? "").trim().toLowerCase();
  const channel = raw === "" ? DEFAULT_CHANNEL : raw;
  if (!CHANNELS.includes(channel)) throw new Error(`MONITOR_CHANNEL must be one of: ${CHANNELS.join(", ")}.`);
  return channel;
}

/* ------------------------------------------------------------------ Discord */

/** Only real Discord webhook endpoints: a poisoned secret must not turn the job into an exfiltration channel. */
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

/* ------------------------------------------------------------- GitHub Issues */

export function assertRepository(repository) {
  if (typeof repository !== "string" || !REPOSITORY_PATTERN.test(repository)) {
    throw new Error("GITHUB_REPOSITORY must look like owner/name.");
  }
  return repository;
}

function githubHeaders(token) {
  return {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "cruzial-monitor",
    "content-type": "application/json",
  };
}

async function github(fetchImpl, token, method, path, body) {
  const response = await fetchImpl(`${GITHUB_API}${path}`, {
    method,
    headers: githubHeaders(token),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const hint = response.status === 403 || response.status === 404 ? " (does the token have `issues: write` on this repository?)" : "";
    throw new Error(`GitHub API ${method} ${path.split("?")[0].replace(/\/\d+(?=\/|$)/g, "/{n}")} answered HTTP ${response.status}${hint}.`);
  }
  return response.status === 204 ? null : response.json();
}

/** Finds the lowest-numbered OPEN issue (not a pull request) whose title is exactly `title`. */
export async function findOpenIssue({ fetchImpl = fetch, token, repository, title }) {
  assertRepository(repository);
  for (let page = 1; page <= MAX_PAGES; page++) {
    const issues = await github(fetchImpl, token, "GET", `/repos/${repository}/issues?state=open&per_page=100&page=${page}`);
    const match = issues
      .filter((i) => !i.pull_request && typeof i.title === "string" && i.title.trim() === title.trim())
      .sort((a, b) => a.number - b.number)[0];
    if (match) return match;
    if (issues.length < 100) return null;
  }
  return null;
}

/** Creates the issue, or comments on the open one with the same title. Returns { action, number, url }. */
export async function upsertGitHubIssue({ fetchImpl = fetch, token, repository, title, body, labels = [ISSUE_LABEL] }) {
  if (!token) throw new Error("GITHUB_TOKEN is not set.");
  assertRepository(repository);
  const text = body.length > MAX_ISSUE_BODY ? `${body.slice(0, MAX_ISSUE_BODY)}\n\n_(truncated)_` : body;
  const existing = await findOpenIssue({ fetchImpl, token, repository, title });
  if (existing) {
    const comment = await github(fetchImpl, token, "POST", `/repos/${repository}/issues/${existing.number}/comments`, { body: text });
    return { action: "commented", number: existing.number, url: comment?.html_url ?? existing.html_url };
  }
  const created = await github(fetchImpl, token, "POST", `/repos/${repository}/issues`, { title, body: text, labels });
  return { action: "created", number: created.number, url: created.html_url };
}

/* ----------------------------------------------------------------- dispatch */

/**
 * alert = { issues: [{ title, body }], discord: <payload> }.
 * Returns { ok, results } and never throws for delivery problems (the caller maps ok=false to exit code 2).
 */
export async function deliverAlert({ channel, env, alert, fetchImpl = fetch, log = console.log, dryRun = false, prefix = "[monitor]" }) {
  if (dryRun) {
    log(`${prefix} --dry-run: alert NOT sent (channel: ${channel}). Payload:`);
    log(JSON.stringify(channel === "discord" ? alert.discord : alert.issues, null, 2));
    return { ok: true, results: [] };
  }
  try {
    if (channel === "discord") {
      if (!env.DISCORD_WEBHOOK_URL) {
        log(`${prefix} threshold exceeded but DISCORD_WEBHOOK_URL is not set; alert not delivered.`);
        return { ok: false, results: [] };
      }
      await postDiscord(env.DISCORD_WEBHOOK_URL, alert.discord, fetchImpl);
      log(`${prefix} alert delivered to Discord.`);
      return { ok: true, results: [{ channel: "discord" }] };
    }
    if (!env.GITHUB_TOKEN || !env.GITHUB_REPOSITORY) {
      log(`${prefix} alert not delivered: GITHUB_TOKEN and GITHUB_REPOSITORY are required for MONITOR_CHANNEL=github.`);
      return { ok: false, results: [] };
    }
    const results = [];
    for (const issue of alert.issues) {
      const r = await upsertGitHubIssue({ fetchImpl, token: env.GITHUB_TOKEN, repository: env.GITHUB_REPOSITORY, title: issue.title, body: issue.body });
      results.push(r);
      log(`${prefix} GitHub issue #${r.number} ${r.action}: ${r.url}`);
    }
    return { ok: true, results };
  } catch (error) {
    log(`${prefix} alert NOT delivered: ${String(error?.message ?? error).split("\n")[0]}`);
    return { ok: false, results: [] };
  }
}

/** Standard issue title: "[Monitor] <type>: <summary>". Keep <summary> free of changing numbers. */
export function issueTitle(type, summary) {
  return `[Monitor] ${type}: ${summary}`;
}
