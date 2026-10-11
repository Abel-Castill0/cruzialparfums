/**
 * Supabase health agent (deterministic version): every run it asks the hosted Supabase MCP server for
 *   1. `get_advisors` (security + performance) and compares them with a committed baseline, and
 *   2. `query_logs` for API (/rest/v1) and Auth (/auth/v1) gateway requests in the last hour and in the hour before,
 * and raises an alert (a GitHub issue per condition by default; Discord with MONITOR_CHANNEL=discord) when the server-error rate of a service rose by MORE than 50% (or an advisor regressed).
 * The same procedure, written as a prompt for an LLM agent, is in docs/supabase-health-agent.md.
 *
 * READ-ONLY by construction: the endpoint is built here as
 *   https://mcp.supabase.com/mcp?project_ref=<ref>&read_only=true&features=debugging
 * (only the "debugging" tool group: get_advisors and query_logs), only those two tools may be called, and the run aborts
 * if the server advertises any other tool. It creates no tables and changes nothing in the project.
 *
 * Usage:  SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_REF=... [GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/name] node scripts/supabase-health.mjs [--dry-run]
 *
 * Environment (secrets only through the environment, never argv):
 *   SUPABASE_ACCESS_TOKEN  required. A personal access token for the project; only ever sent to mcp.supabase.com.
 *   SUPABASE_PROJECT_REF   required, 20 lowercase letters. Not a secret.
 *   MONITOR_CHANNEL        "github" (default) or "discord". See scripts/lib/alert-channels.mjs.
 *   GITHUB_TOKEN, GITHUB_REPOSITORY  channel github: one issue per condition with a STABLE title ("[Monitor] supabase-api: ...",
 *                          "supabase-auth", "supabase-advisors"); an open issue with the same title gets a comment instead
 *                          of a duplicate. In Actions: `${{ github.token }}` + `issues: write`.
 *   DISCORD_WEBHOOK_URL    channel discord only (discord.com webhooks only).
 *   HEALTH_MIN_REQUESTS    minimum requests in the current hour for a service to be evaluated (default 20).
 *   HEALTH_MIN_ERRORS      minimum server errors in the current hour (default 3).
 *   HEALTH_INCREASE        relative rate increase that triggers (default 0.5 = strictly more than +50%).
 *   HEALTH_FLOOR_RATE      when the previous hour had NO errors, the current error rate must reach this (default 0.05).
 *   HEALTH_ERROR_MIN_STATUS  first HTTP status counted as an error (default 500). Use 400 to include client errors (noisy:
 *                            wrong passwords are 400/401). A bad service-role key shows up as 401, not 5xx.
 *
 * Error rate = responses with status >= HEALTH_ERROR_MIN_STATUS / all responses, per service, from the API gateway logs
 * (`edge_logs`). Production traffic is small (~25 API requests per hour), so the minimum volume/error guards prevent
 * "1 error out of 2 requests" from paging anyone; below them the service is reported as "not enough traffic".
 *
 * Dry run: `--dry-run` or DRY_RUN=true. The project is still read, but nothing is written anywhere (no issue, comment or webhook).
 * When the MCP call fails (e.g. the token is rejected) the agent is blind: it raises "[Monitor] supabase-health: monitor cannot
 * run" (at most one comment per 24 h on the open issue) and still exits 1.
 *
 * Exit codes: 0 = nothing to report / alert delivered / dry run; 1 = configuration, MCP or parsing failure;
 *             2 = something to report but the alert could not be delivered.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildFailureAlert, deliverAlert, isDryRun, issueTitle, readChannel, runUrlFrom } from "./lib/alert-channels.mjs";

export const MCP_ORIGIN = "https://mcp.supabase.com";
export const ALLOWED_TOOLS = Object.freeze(["get_advisors", "query_logs"]);
export const PROTOCOL_VERSION = "2025-06-18";
export const SERVICES = Object.freeze(["api", "auth"]);
const REF_PATTERN = /^[a-z]{20}$/;
const BASELINE_PATH = fileURLToPath(new URL("./supabase-health-baseline.json", import.meta.url));

/* ------------------------------------------------------------------ config */

function numberEnv(raw, fallback, { min = 0, integer = false } = {}) {
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || (integer && !Number.isInteger(n))) throw new Error(`Invalid value "${raw}".`);
  return n;
}

export function readConfig(env) {
  if (!env.SUPABASE_ACCESS_TOKEN) throw new Error("SUPABASE_ACCESS_TOKEN is required.");
  const projectRef = env.SUPABASE_PROJECT_REF;
  if (!projectRef || !REF_PATTERN.test(projectRef)) throw new Error("SUPABASE_PROJECT_REF is required (20 lowercase letters).");
  return {
    token: env.SUPABASE_ACCESS_TOKEN,
    projectRef,
    channel: readChannel(env),
    minRequests: numberEnv(env.HEALTH_MIN_REQUESTS, 20, { min: 1, integer: true }),
    minErrors: numberEnv(env.HEALTH_MIN_ERRORS, 3, { min: 1, integer: true }),
    increase: numberEnv(env.HEALTH_INCREASE, 0.5, { min: 0 }),
    floorRate: numberEnv(env.HEALTH_FLOOR_RATE, 0.05, { min: 0 }),
    errorMinStatus: numberEnv(env.HEALTH_ERROR_MIN_STATUS, 500, { min: 400, integer: true }),
  };
}

export function mcpEndpoint(projectRef) {
  if (!REF_PATTERN.test(projectRef)) throw new Error("Invalid project ref.");
  return `${MCP_ORIGIN}/mcp?project_ref=${projectRef}&read_only=true&features=debugging`;
}

/* ------------------------------------------------------------- tool output */

/** Tool text may be bare JSON or wrapped as "...<untrusted-data-UUID>{json}</untrusted-data-UUID>...". */
export function parseToolText(text) {
  if (typeof text !== "string") throw new Error("Tool result has no text.");
  const wrapped = text.match(/<untrusted-data-[^>]+>\s*([\s\S]*?)\s*<\/untrusted-data-[^>]+>/);
  const raw = (wrapped ? wrapped[1] : text).trim();
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Tool result is not valid JSON.");
  }
}

/* ---------------------------------------------------------------- MCP client */

/** Minimal Streamable-HTTP MCP client (JSON or SSE replies). Only get_advisors / query_logs can be called. */
export function createMcpClient({ endpoint, token, fetchImpl = fetch, allowTestEndpoint = false }) {
  const url = new URL(endpoint);
  if (!allowTestEndpoint && (url.origin !== MCP_ORIGIN || url.pathname !== "/mcp")) throw new Error(`The token may only be sent to ${MCP_ORIGIN}/mcp.`);
  let sessionId = null;
  let negotiated = PROTOCOL_VERSION;
  let nextId = 1;
  let toolSchemas = new Map();

  async function send(message) {
    const headers = {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": negotiated,
    };
    if (sessionId) headers["mcp-session-id"] = sessionId;
    const response = await fetchImpl(url, { method: "POST", headers, body: JSON.stringify(message), signal: AbortSignal.timeout(30_000) });
    const sid = response.headers?.get?.("mcp-session-id");
    if (sid) sessionId = sid;
    if (!response.ok) throw new Error(`MCP server answered HTTP ${response.status}.`);
    if (!("id" in message)) return null; // notification: no reply expected
    const body = await response.text();
    const type = response.headers?.get?.("content-type") ?? "";
    const payloads = type.includes("text/event-stream")
      ? body.split(/\r?\n\r?\n/).map((evt) => evt.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("\n")).filter(Boolean)
      : [body];
    for (const p of payloads) {
      let json;
      try { json = JSON.parse(p); } catch { continue; }
      if (json.id === message.id) {
        if (json.error) throw new Error(`MCP error ${json.error.code ?? ""}: ${String(json.error.message ?? "").split("\n")[0]}`);
        return json.result;
      }
    }
    throw new Error("MCP reply did not contain a response for the request.");
  }

  return {
    async initialize() {
      const result = await send({ jsonrpc: "2.0", id: nextId++, method: "initialize", params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "cruzial-supabase-health", version: "1.0.0" } } });
      if (result?.protocolVersion) negotiated = result.protocolVersion;
      await send({ jsonrpc: "2.0", method: "notifications/initialized" });
      const listed = await send({ jsonrpc: "2.0", id: nextId++, method: "tools/list", params: {} });
      const tools = listed?.tools ?? [];
      const extra = tools.map((t) => t.name).filter((n) => !ALLOWED_TOOLS.includes(n));
      if (extra.length) throw new Error(`Refusing to continue: the MCP server exposes unexpected tools (${extra.join(", ")}). Check read_only/features in the URL.`);
      for (const needed of ALLOWED_TOOLS) if (!tools.some((t) => t.name === needed)) throw new Error(`The MCP server does not expose ${needed}.`);
      toolSchemas = new Map(tools.map((t) => [t.name, t.inputSchema ?? {}]));
    },
    /** Calls an allowed tool; arguments are filtered to what the advertised schema accepts. */
    async callTool(name, candidateArgs) {
      if (!ALLOWED_TOOLS.includes(name)) throw new Error(`Tool ${name} is not allowed.`);
      const schema = toolSchemas.get(name);
      if (!schema) throw new Error("initialize() must succeed first.");
      const props = schema.properties ?? {};
      const args = Object.fromEntries(Object.entries(candidateArgs).filter(([k]) => k in props));
      for (const required of schema.required ?? []) if (!(required in args)) throw new Error(`Tool ${name} requires "${required}", which this script cannot provide.`);
      const result = await send({ jsonrpc: "2.0", id: nextId++, method: "tools/call", params: { name, arguments: args } });
      if (result?.isError) throw new Error(`Tool ${name} reported an error: ${String(result.content?.[0]?.text ?? "").split("\n")[0].slice(0, 200)}`);
      return parseToolText(result?.content?.find((c) => c.type === "text")?.text);
    },
  };
}

/* ------------------------------------------------------------- error rates */

export function logSql(minStatus) {
  const status = "toInt32OrZero(toString(log_attributes['response.status_code']))";
  return [
    "select multiIf(startsWith(toString(log_attributes['request.path']), '/auth/v1'), 'auth',",
    "startsWith(toString(log_attributes['request.path']), '/rest/v1'), 'api', 'other') as svc,",
    `count(*) as total, countIf(${status} >= ${Number(minStatus)}) as errors`,
    "from logs where source = 'edge_logs' group by svc order by svc",
  ].join(" ");
}

export function windows(now) {
  const hour = 3_600_000;
  const iso = (ms) => new Date(ms).toISOString();
  const t = now.getTime();
  return { current: { start: iso(t - hour), end: iso(t) }, previous: { start: iso(t - 2 * hour), end: iso(t - hour) } };
}

/** query_logs result -> { api: {total, errors}, auth: {total, errors} } (missing services are zero). */
export function toServiceCounts(result) {
  const rows = Array.isArray(result?.result) ? result.result : Array.isArray(result) ? result : [];
  const out = Object.fromEntries(SERVICES.map((s) => [s, { total: 0, errors: 0 }]));
  for (const row of rows) {
    if (!(row?.svc in out)) continue;
    out[row.svc] = { total: Number(row.total) || 0, errors: Number(row.errors) || 0 };
  }
  return out;
}

const rate = (c) => (c.total > 0 ? c.errors / c.total : 0);

export function evaluateService(current, previous, { minRequests, minErrors, increase, floorRate }) {
  const cur = { ...current, rate: rate(current) };
  const prev = { ...previous, rate: rate(previous) };
  const relative = prev.rate > 0 ? (cur.rate - prev.rate) / prev.rate : null;
  if (cur.total < minRequests) return { cur, prev, relative, alert: false, reason: `not enough traffic (${cur.total} < ${minRequests} requests)` };
  if (cur.errors < minErrors) return { cur, prev, relative, alert: false, reason: `fewer than ${minErrors} errors` };
  if (prev.rate > 0) {
    const up = relative > increase;
    return { cur, prev, relative, alert: up, reason: up ? `rate up ${(relative * 100).toFixed(0)}% (limit ${(increase * 100).toFixed(0)}%)` : "within limit" };
  }
  const up = cur.rate >= floorRate;
  return { cur, prev, relative, alert: up, reason: up ? `no errors the hour before, now ${(cur.rate * 100).toFixed(1)}% (floor ${(floorRate * 100).toFixed(1)}%)` : "below floor rate" };
}

/* ---------------------------------------------------------------- advisors */

export function loadBaseline(path = BASELINE_PATH) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function lintSummary(advisorResult) {
  const lints = advisorResult?.result?.lints ?? advisorResult?.lints ?? [];
  return lints.map((l) => ({ name: String(l.name), level: String(l.level ?? "UNKNOWN").toUpperCase(), count: Number(l.count ?? l.findings?.length ?? 0) }));
}

/** Regressions vs the committed baseline. Security: any new lint or higher count. Performance: new lint names or ERROR level only. */
export function evaluateAdvisors(kind, lints, baseline) {
  const known = baseline?.[kind] ?? {};
  const regressions = [];
  for (const l of lints) {
    const base = known[l.name];
    if (l.level === "ERROR") regressions.push({ name: l.name, why: `ERROR-level advisor (${l.count})` });
    else if (base === undefined) regressions.push({ name: l.name, why: `new advisor not in the baseline (${l.count})` });
    else if (kind === "security" && l.count > base) regressions.push({ name: l.name, why: `count rose from ${base} to ${l.count}` });
  }
  const improved = Object.entries(known).filter(([name, base]) => (lints.find((l) => l.name === name)?.count ?? 0) < base).map(([name]) => name);
  return { regressions, improved };
}

/* ------------------------------------------------------------------- alert */

export function buildAlert({ projectRef, services, advisorRegressions, runUrl }) {
  const lines = [`🚨 **Supabase health** (\`${projectRef}\`)`];
  for (const s of services.filter((x) => x.alert)) {
    lines.push(`• **${s.service}**: ${s.cur.errors}/${s.cur.total} errors this hour (${(s.cur.rate * 100).toFixed(1)}%) vs ${s.prev.errors}/${s.prev.total} before (${(s.prev.rate * 100).toFixed(1)}%) — ${s.reason}`);
  }
  for (const r of advisorRegressions) lines.push(`• **advisor ${r.kind}** \`${r.name}\`: ${r.why}`);
  if (runUrl) lines.push(`Run: <${runUrl}>`);
  return { content: lines.join("\n").slice(0, 1900), allowed_mentions: { parse: [] } };
}

/**
 * One issue per condition, each with a STABLE title (the numbers are in the body) so a sustained problem comments on the
 * open issue instead of opening a new one every hour.
 */
export function buildIssues({ projectRef, services, advisorRegressions, runUrl }) {
  const footer = [...(runUrl ? [`Run: ${runUrl}`] : []), "Counts and names only; no log text. Close this issue when the problem is solved."];
  const out = [];
  for (const s of services.filter((x) => x.alert)) {
    out.push({
      title: issueTitle(`supabase-${s.service}`, "server error rate up"),
      body: [
        `Project \`${projectRef}\`: ${s.service.toUpperCase()} server errors (status >= the configured floor) rose.`,
        "",
        "| Window | Errors | Requests | Rate |",
        "| --- | --- | --- | --- |",
        `| last hour | ${s.cur.errors} | ${s.cur.total} | ${(s.cur.rate * 100).toFixed(1)}% |`,
        `| hour before | ${s.prev.errors} | ${s.prev.total} | ${(s.prev.rate * 100).toFixed(1)}% |`,
        "",
        `Verdict: ${s.reason}.`,
        "",
        ...footer,
      ].join("\n"),
    });
  }
  if (advisorRegressions.length) {
    out.push({
      title: issueTitle("supabase-advisors", "regression vs baseline"),
      body: [
        `Project \`${projectRef}\`: advisor findings worse than \`scripts/supabase-health-baseline.json\`.`,
        "",
        ...advisorRegressions.map((r) => `- **${r.kind}** \`${r.name}\`: ${r.why}`),
        "",
        ...footer,
      ].join("\n"),
    });
  }
  return out;
}

/* -------------------------------------------------------------------- main */

export async function run({ env = process.env, argv = process.argv.slice(2), clientFactory, fetchImpl = fetch, now = new Date(), log = console.log, baseline } = {}) {
  const dryRun = isDryRun(argv, env);
  let config;
  try {
    config = readConfig(env);
  } catch (error) {
    log(`[health] configuration error: ${error.message}`);
    return 1;
  }
  let services;
  const advisorRegressions = [];
  const improved = [];
  try {
    const client = clientFactory ? await clientFactory(config) : createMcpClient({ endpoint: mcpEndpoint(config.projectRef), token: config.token });
    await client.initialize();
    const w = windows(now);
    const sql = logSql(config.errorMinStatus);
    const ask = (win) => client.callTool("query_logs", { project_id: config.projectRef, sql, iso_timestamp_start: win.start, iso_timestamp_end: win.end });
    const current = toServiceCounts(await ask(w.current));
    const previous = toServiceCounts(await ask(w.previous));
    services = SERVICES.map((service) => ({ service, ...evaluateService(current[service], previous[service], config) }));
    const base = baseline ?? loadBaseline();
    for (const kind of ["security", "performance"]) {
      const result = await client.callTool("get_advisors", { project_id: config.projectRef, type: kind });
      const { regressions, improved: better } = evaluateAdvisors(kind, lintSummary(result), base);
      advisorRegressions.push(...regressions.map((r) => ({ kind, ...r })));
      improved.push(...better.map((n) => `${kind}:${n}`));
    }
  } catch (error) {
    const reason = String(error?.message ?? error).split("\n")[0].slice(0, 300);
    log(`[health] failure: ${reason}`);
    const alert = buildFailureAlert({ type: "supabase-health", service: "Supabase health", reason, runUrl: runUrlFrom(env), fix: "check the SUPABASE_ACCESS_TOKEN repository secret (see docs/supabase-health-agent.md)" });
    await deliverAlert({ channel: config.channel, env, alert, fetchImpl, log, dryRun, prefix: "[health]" });
    return 1;
  }
  for (const s of services) {
    log(`[health] ${s.service}: now ${s.cur.errors}/${s.cur.total} (${(s.cur.rate * 100).toFixed(1)}%), before ${s.prev.errors}/${s.prev.total} (${(s.prev.rate * 100).toFixed(1)}%) -> ${s.alert ? "ALERT" : "ok"} (${s.reason})`);
  }
  log(`[health] advisors: ${advisorRegressions.length ? advisorRegressions.map((r) => `${r.kind}:${r.name} (${r.why})`).join("; ") : "no regression vs baseline"}`);
  if (improved.length) log(`[health] advisors below baseline (consider lowering it): ${improved.join(", ")}`);
  const anyAlert = services.some((s) => s.alert) || advisorRegressions.length > 0;
  if (!anyAlert) return 0;

  const runUrl = runUrlFrom(env);
  const args = { projectRef: config.projectRef, services, advisorRegressions, runUrl };
  const alert = { discord: buildAlert(args), issues: buildIssues(args) };
  const { ok } = await deliverAlert({ channel: config.channel, env, alert, fetchImpl, log, dryRun, prefix: "[health]" });
  return ok ? 0 : 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().then((code) => process.exit(code));
}
