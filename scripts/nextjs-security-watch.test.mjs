// Run with: node --test scripts/nextjs-security-watch.test.mjs   (no network: fetch is injected)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { retryPolicy } from "./lib/alert-channels.mjs";
import { ADVISORY_URL, NPM_URL, findAffecting, installedNextVersion, isPatched, run, satisfiesRange } from "./nextjs-security-watch.mjs";

retryPolicy.retryDelayMs = 0;
const REPO = "Abel-Castill0/cruzialparfums";
const lock = JSON.stringify({ packages: { "node_modules/next": { version: "16.4.0" } } });
const adv = (id, range, extra = {}) => ({ ghsa_id: id, severity: "high", summary: `summary of ${id}`, published_at: "2026-10-14T00:00:00Z", vulnerabilities: [{ package: { name: "next" }, vulnerable_version_range: range, patched_versions: "16.4.2" }], ...extra });

function fakeFetch({ advisories, latest = "16.4.0", ghOpen = [], failAdvisories = 0 } = {}) {
  const calls = [];
  let advisoryFails = failAdvisories;
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(String(url));
    const method = init.method ?? "GET";
    calls.push({ method, host: u.host, path: u.pathname, body: init.body ? JSON.parse(init.body) : undefined });
    const ok = (body, status = 200) => ({ ok: true, status, json: async () => body });
    if (String(url) === ADVISORY_URL) { if (advisoryFails-- > 0) return { ok: false, status: 503, json: async () => ({}) }; return ok(advisories); }
    if (String(url) === NPM_URL) return ok({ latest });
    if (u.host === "api.github.com" && method === "GET" && u.pathname.endsWith("/issues")) return ok(ghOpen);
    if (u.host === "api.github.com" && method === "POST" && /\/comments$/.test(u.pathname)) return ok({ html_url: "c" }, 201);
    if (u.host === "api.github.com" && method === "POST") return ok({ number: 7, html_url: `https://github.com/${REPO}/issues/7` }, 201);
    throw new Error(`unexpected ${method} ${url}`);
  };
  return { fetchImpl, calls };
}
const ghEnv = { GITHUB_TOKEN: "ghs_test", GITHUB_REPOSITORY: REPO };

test("satisfiesRange: comparator lists, exact versions and unparseable ranges", () => {
  assert.equal(satisfiesRange("16.4.0", "< 16.3.8"), false);
  assert.equal(satisfiesRange("16.3.0", "< 16.3.8"), true);
  assert.equal(satisfiesRange("16.4.0", ">= 16.0.0, < 16.4.2"), true);
  assert.equal(satisfiesRange("16.4.2", ">= 16.0.0, < 16.4.2"), false);
  assert.equal(satisfiesRange("16.3.0", "16.3.0"), true);
  assert.equal(satisfiesRange("16.4.0", "16.3.0"), false);
  assert.equal(satisfiesRange("16.4.0", ">= 16.4.0 <= 16.4.0"), true);
  assert.equal(satisfiesRange("16.4.0", "^16"), null);
  assert.equal(satisfiesRange("16.4.0", ""), null);
});

test("isPatched: exact, wildcard and multi-line patched versions", () => {
  assert.equal(isPatched("16.4.0", "16.3.8"), true);
  assert.equal(isPatched("16.3.8", "16.3.8"), true);
  assert.equal(isPatched("16.3.7", "16.3.8"), false);
  assert.equal(isPatched("16.4.0", "16.3.?"), true, "a later minor line includes the fix");
  assert.equal(isPatched("16.3.4", "16.3.?"), null, "same line, exact patch unknown");
  assert.equal(isPatched("16.2.9", "16.3.?"), false);
  assert.equal(isPatched("16.4.0", "15.5.9, 16.3.8"), true);
  assert.equal(isPatched("16.4.0", "16.4.2"), false);
  assert.equal(isPatched("16.4.0", undefined), false);
  assert.equal(isPatched("16.4.0", "≤15.0.4 and ≥15.2.0"), true, "prose with unicode comparators");
  assert.equal(isPatched("15.1.0", "≤15.0.4 and ≥15.2.0"), false);
  assert.equal(satisfiesRange("15.1.0", ">15.0.4 and <15.2.0"), true);
  assert.equal(satisfiesRange("16.4.0", ">15.0.4 and <15.2.0"), false);
});

test("findAffecting: real-shaped 2026-09 advisories do NOT affect 16.4.0, a pending 16.4.x fix does", () => {
  const real = [
    adv("GHSA-h694", "16.3.0", { vulnerabilities: [{ package: { name: "next" }, vulnerable_version_range: "16.3.0", patched_versions: "16.3.8" }] }),
    adv("GHSA-cjq9", ">= 16.0.0 < 16.3.?", { vulnerabilities: [{ package: { name: "next" }, vulnerable_version_range: ">= 16.0.0 < 16.3.?", patched_versions: "16.3.?" }] }),
    adv("GHSA-39w2", ">= 16.0.0", { vulnerabilities: [{ package: { name: "next" }, vulnerable_version_range: ">= 16.0.0", patched_versions: "16.3.?" }] }),
    adv("GHSA-canary", "15.0.0-canary.0", { vulnerabilities: [{ package: { name: "next" }, vulnerable_version_range: "15.0.0-canary.0", patched_versions: "15.0.1" }] }),
  ];
  assert.deepEqual(findAffecting("16.4.0", real), []);
  const pending = [...real, adv("GHSA-new", ">= 16.4.0 < 16.4.2")];
  assert.deepEqual(findAffecting("16.4.0", pending).map((x) => x.id), ["GHSA-new"]);
});

test("findAffecting: only advisories for `next` whose range includes the installed version (unparseable = uncertain)", () => {
  const advisories = [
    adv("GHSA-old", "< 16.3.8"),
    adv("GHSA-hit", ">= 16.0.0, < 16.4.2"),
    adv("GHSA-other", ">= 16.0.0", { vulnerabilities: [{ package: { name: "react" }, vulnerable_version_range: ">= 0.0.0" }] }),
    adv("GHSA-odd", "something odd"),
  ];
  const f = findAffecting("16.4.0", advisories);
  assert.deepEqual(f.map((x) => [x.id, x.uncertain]), [["GHSA-hit", false], ["GHSA-odd", true]]);
  assert.equal(f[0].patched, "16.4.2");
});

test("installedNextVersion reads the real lockfile and rejects a missing package", () => {
  const real = readFileSync(fileURLToPath(new URL("../apps/web/package-lock.json", import.meta.url)), "utf8");
  assert.match(installedNextVersion(real), /^\d+\.\d+\.\d+/);
  assert.throws(() => installedNextVersion("{}"), /not in/);
});

test("run: nothing affecting -> exit 0 and no write", async () => {
  const f = fakeFetch({ advisories: [adv("GHSA-old", "< 16.3.8")] });
  const logs = [];
  assert.equal(await run({ env: ghEnv, argv: [], fetchImpl: f.fetchImpl, log: (m) => logs.push(m), readLock: () => lock }), 0);
  assert.ok(f.calls.every((c) => c.method === "GET"), "read-only when nothing affects");
  assert.match(logs.join("\n"), /installed next 16\.4\.0; npm latest 16\.4\.0; 1 published advisories; 0 affecting/);
});

test("run: an affecting advisory creates ONE issue with a stable title; a repeat comments instead", async () => {
  const hit = adv("GHSA-hit", ">= 16.0.0, < 16.4.2");
  const first = fakeFetch({ advisories: [hit], latest: "16.4.2" });
  assert.equal(await run({ env: ghEnv, argv: [], fetchImpl: first.fetchImpl, log: () => {}, readLock: () => lock }), 0);
  const created = first.calls.find((c) => c.method === "POST");
  assert.equal(created.body.title, "[Monitor] nextjs-security: GHSA-hit affects installed next");
  assert.match(created.body.body, /Patched version\(s\) per the advisory: `16\.4\.2`/);
  assert.match(created.body.body, /npm `latest` today: `16\.4\.2`/);
  const again = fakeFetch({ advisories: [hit], ghOpen: [{ number: 7, title: created.body.title, html_url: "x", updated_at: "2026-10-14T00:00:00Z" }] });
  assert.equal(await run({ env: ghEnv, argv: [], fetchImpl: again.fetchImpl, log: () => {}, readLock: () => lock }), 0);
  assert.equal(again.calls.filter((c) => c.method === "POST" && !/comments/.test(c.path)).length, 0, "no duplicate issue");
  assert.ok(again.calls.some((c) => /\/issues\/7\/comments$/.test(c.path)));
});

test("run: dry run (flag or DRY_RUN) never writes; missing token -> exit 2", async () => {
  const hit = [adv("GHSA-hit", "< 16.5.0")];
  for (const opts of [{ argv: ["--dry-run"], env: ghEnv }, { argv: [], env: { ...ghEnv, DRY_RUN: "true" } }]) {
    const f = fakeFetch({ advisories: hit });
    assert.equal(await run({ ...opts, fetchImpl: f.fetchImpl, log: () => {}, readLock: () => lock }), 0);
    assert.ok(f.calls.every((c) => c.method === "GET"));
  }
  const f = fakeFetch({ advisories: hit });
  assert.equal(await run({ env: {}, argv: [], fetchImpl: f.fetchImpl, log: () => {}, readLock: () => lock }), 2);
});

test("run: API outage -> exit 1 and a throttled 'monitor cannot run' issue; transient 503 is retried", async () => {
  const down = fakeFetch({ advisories: [], failAdvisories: 9 });
  const logs = [];
  assert.equal(await run({ env: ghEnv, argv: [], fetchImpl: down.fetchImpl, log: (m) => logs.push(m), readLock: () => lock }), 1);
  assert.equal(down.calls.find((c) => c.method === "POST").body.title, "[Monitor] nextjs-security: monitor cannot run");
  assert.ok(!logs.join("\n").includes("ghs_test"));
  const flaky = fakeFetch({ advisories: [adv("GHSA-old", "< 16.3.8")], failAdvisories: 2 });
  assert.equal(await run({ env: ghEnv, argv: [], fetchImpl: flaky.fetchImpl, log: () => {}, readLock: () => lock }), 0);
});

test("workflow: least privilege, SHA-pinned, scheduled, dry-run default, token from the job", () => {
  const s = readFileSync(fileURLToPath(new URL("../.github/workflows/nextjs-security-watch.yml", import.meta.url)), "utf8").replace(/\r\n/g, "\n");
  assert.match(s, /^permissions:\n  contents: read\n\n/m);
  assert.match(s, /\n    permissions:\n      contents: read\n      issues: write\n/);
  for (const uses of s.match(/uses: \S+/g) ?? []) assert.match(uses, /@[0-9a-f]{40}$/, uses);
  assert.match(s, /schedule:\n    - cron: "\d+ [\d,]+ \* \* \*"/);
  assert.match(s, /dry_run:\n {8}description: [^\n]+\n {8}type: boolean\n {8}default: true/);
  assert.ok(s.includes("DRY_RUN: ${{ inputs.dry_run == true }}"));
  assert.ok(s.includes("GITHUB_TOKEN: ${{ github.token }}"));
  assert.ok(!/pull_request/.test(s));
  assert.ok(s.includes("run: node scripts/nextjs-security-watch.mjs"));
});
