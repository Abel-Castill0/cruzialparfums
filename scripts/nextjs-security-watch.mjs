/**
 * Next.js security watch (read-only, no dependencies).
 *
 * Compares the Next.js version installed in apps/web (package-lock.json) with the published GitHub security advisories of
 * vercel/next.js and, informationally, with the npm `latest` dist-tag. When an advisory affects the installed version it
 * raises a GitHub issue "[Monitor] nextjs-security: <GHSA> affects installed next" (stable title, de-duplicated by
 * scripts/lib/alert-channels.mjs), so the announced out-of-band release of 2026-10-14 (and any other advisory) is noticed
 * even if Dependabot is slow. It never installs anything and never invents a version: patched versions come from the
 * advisory itself.
 *
 * Env: GITHUB_TOKEN + GITHUB_REPOSITORY (issue delivery and an authenticated advisory request), MONITOR_CHANNEL
 * (github default | discord), DRY_RUN=true or --dry-run (read, print, write nothing).
 * Exit codes: 0 = checked (findings, if any, delivered or dry run); 1 = could not check (also raises a throttled
 * "monitor cannot run" issue); 2 = a finding could not be delivered.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildFailureAlert, deliverAlert, isDryRun, issueTitle, readChannel, runUrlFrom } from "./lib/alert-channels.mjs";

export const ADVISORY_URL = "https://api.github.com/repos/vercel/next.js/security-advisories?per_page=50&state=published";
export const NPM_URL = "https://registry.npmjs.org/-/package/next/dist-tags";
const LOCK_PATH = fileURLToPath(new URL("../apps/web/package-lock.json", import.meta.url));

export function parseVersion(value) {
  const m = String(value ?? "").trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function compareVersions(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
}

/**
 * GitHub advisory ranges look like "< 16.3.8", ">= 16.0.0, < 16.4.2" or "16.3.0" (exact).
 * Returns true / false, or null when the range cannot be parsed (the caller treats null as "review manually").
 */
export function normalizeConstraint(text) {
  return String(text)
    .replace(/≥/g, ">=")
    .replace(/≤/g, "<=")
    .replace(/\s+and\s+/gi, ", ")
    .replace(/(>=|<=|>|<|=)\s+/g, "$1");
}

export function satisfiesRange(version, range) {
  const v = parseVersion(version);
  if (!v || typeof range !== "string" || range.trim() === "") return null;
  const parts = normalizeConstraint(range).split(/\s*,\s*|\s+(?=[<>=])/).map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  for (const part of parts) {
    const m = part.match(/^(>=|<=|>|<|=)?\s*(\d+\.\d+\.\d+)$/);
    if (!m) return null;
    const target = parseVersion(m[2]);
    const c = compareVersions(v, target);
    const op = m[1] ?? "=";
    const ok = op === ">=" ? c >= 0 : op === "<=" ? c <= 0 : op === ">" ? c > 0 : op === "<" ? c < 0 : c === 0;
    if (!ok) return false;
  }
  return true;
}

export function installedNextVersion(lockText) {
  const lock = JSON.parse(lockText);
  const v = lock?.packages?.["node_modules/next"]?.version;
  if (!parseVersion(v)) throw new Error("next is not in apps/web/package-lock.json");
  return v;
}

/**
 * Is `installed` already at or beyond the advisory's patched version(s)? Returns true / false / null (unknown).
 * Patched versions are "16.3.8" or, when the exact patch number is not published yet, a wildcard like "16.3.?".
 * Releases are monotonic, so being at or past a patched version means the fix is included. With a wildcard, a LATER minor
 * line (16.4.x vs 16.3.?) is patched, the same line is unknown, an earlier line is not patched.
 */
export function isPatched(installed, patchedField) {
  const v = parseVersion(installed);
  if (!v || typeof patchedField !== "string") return false;
  let unknown = false;
  for (const raw of normalizeConstraint(patchedField).split(/\s*,\s*/).filter(Boolean)) {
    if (/^(<=|<)/.test(raw)) continue; // an upper bound describes an older line, not a fix at or below the installed version
    const token = raw.replace(/^>=?/, "");
    const exact = parseVersion(token);
    if (exact && !/\?/.test(token)) {
      if (compareVersions(v, exact) >= 0) return true;
      continue;
    }
    const wild = token.match(/^(\d+)\.(\d+)\.\?$/);
    if (wild) {
      const line = [Number(wild[1]), Number(wild[2])];
      if (v[0] > line[0] || (v[0] === line[0] && v[1] > line[1])) return true;
      if (v[0] === line[0] && v[1] === line[1]) unknown = true;
    }
  }
  return unknown ? null : false;
}

/** Advisories whose `next` entry includes `installed` and is not yet patched in it (unparseable → uncertain). */
export function findAffecting(installed, advisories) {
  const out = [];
  for (const a of Array.isArray(advisories) ? advisories : []) {
    for (const v of a.vulnerabilities ?? []) {
      if (v?.package?.name !== "next") continue;
      const patched = isPatched(installed, v.patched_versions);
      if (patched === true) continue;
      const inRange = satisfiesRange(installed, v.vulnerable_version_range);
      if (inRange === false) continue;
      const hit = inRange === null || patched === null ? null : true;
      out.push({
        id: a.ghsa_id,
        severity: a.severity ?? "unknown",
        summary: String(a.summary ?? "").slice(0, 200),
        url: a.html_url ?? `https://github.com/vercel/next.js/security/advisories/${a.ghsa_id}`,
        range: v.vulnerable_version_range ?? "unknown",
        patched: v.patched_versions ?? "not stated",
        published: a.published_at ?? null,
        uncertain: hit === null,
      });
      break;
    }
  }
  return out;
}

export function buildIssues(findings, { installed, latest, runUrl }) {
  return findings.map((f) => ({
    title: issueTitle("nextjs-security", `${f.id} affects installed next`),
    body: [
      `Advisory **${f.id}** (${f.severity}) ${f.uncertain ? "may affect (range could not be parsed — review manually)" : "affects"} the installed Next.js **${installed}**.`,
      "",
      `- Summary: ${f.summary}`,
      `- Affected range: \`${f.range}\``,
      `- Patched version(s) per the advisory: \`${f.patched}\``,
      `- Advisory: ${f.url}`,
      `- npm \`latest\` today: \`${latest ?? "unknown"}\``,
      ...(runUrl ? [`- Run: ${runUrl}`] : []),
      "",
      "Next step: upgrade on an isolated branch to the patched version named by the advisory (never a version it does not list), run `npm ci`, `npm audit --omit=dev`, `npm run check`, test the Preview, then merge. Close this issue when the deployed version is patched.",
    ].join("\n"),
  }));
}

async function getJson(fetchImpl, url, headers) {
  let response;
  for (let attempt = 1; attempt <= 3; attempt++) {
    response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(15_000) });
    if (response.ok || (response.status < 500 && response.status !== 429)) break;
  }
  if (!response.ok) throw new Error(`${new URL(url).host} answered HTTP ${response.status}`);
  return response.json();
}

export async function run({ env = process.env, argv = process.argv.slice(2), fetchImpl = fetch, log = console.log, readLock = () => readFileSync(LOCK_PATH, "utf8") } = {}) {
  const dryRun = isDryRun(argv, env);
  let channel;
  try {
    channel = readChannel(env);
  } catch (error) {
    log(`[nextjs-watch] configuration error: ${error.message}`);
    return 1;
  }
  const runUrl = runUrlFrom(env);
  let installed, advisories, latest;
  try {
    installed = installedNextVersion(readLock());
    const gh = { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "cruzial-monitor", ...(env.GITHUB_TOKEN ? { authorization: `Bearer ${env.GITHUB_TOKEN}` } : {}) };
    advisories = await getJson(fetchImpl, ADVISORY_URL, gh);
    latest = (await getJson(fetchImpl, NPM_URL, { "user-agent": "cruzial-monitor" })).latest ?? null;
  } catch (error) {
    const reason = `Next.js watch could not complete: ${String(error?.message ?? error).split("\n")[0].slice(0, 200)}`;
    log(`[nextjs-watch] ${reason}`);
    await deliverAlert({ channel, env, alert: buildFailureAlert({ type: "nextjs-security", service: "Next.js security watch", reason, runUrl, fix: "check network/GitHub API status and re-run the workflow" }), fetchImpl, log, dryRun, prefix: "[nextjs-watch]" });
    return 1;
  }
  const findings = findAffecting(installed, advisories);
  log(`[nextjs-watch] installed next ${installed}; npm latest ${latest}; ${Array.isArray(advisories) ? advisories.length : 0} published advisories; ${findings.length} affecting.`);
  if (latest && parseVersion(latest) && compareVersions(parseVersion(latest), parseVersion(installed)) > 0) log(`[nextjs-watch] note: a newer release exists on npm (${latest}); see the advisories for whether it is a security fix.`);
  for (const f of findings) log(`[nextjs-watch]   ${f.id} ${f.severity} range ${f.range} patched ${f.patched}${f.uncertain ? " (uncertain)" : ""}`);
  if (!findings.length) return 0;
  const alert = { issues: buildIssues(findings, { installed, latest, runUrl }), discord: { content: `Next.js advisory affects installed next ${installed}: ${findings.map((f) => f.id).join(", ")}${runUrl ? `\n${runUrl}` : ""}`, allowed_mentions: { parse: [] } } };
  const { ok } = await deliverAlert({ channel, env, alert, fetchImpl, log, dryRun, prefix: "[nextjs-watch]" });
  return ok ? 0 : 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().then((code) => process.exit(code));
}
