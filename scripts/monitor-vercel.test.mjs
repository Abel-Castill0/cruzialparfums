// Run with: node --test scripts/monitor-vercel.test.mjs
// No network, no Vercel SDK and no Discord: both are injected.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertDiscordWebhook,
  buildDiscordPayload,
  collectDeployments,
  countErrorEvents,
  normalizeEvents,
  postDiscord,
  readConfig,
  run,
  shouldAlert,
} from "./monitor-vercel.mjs";

const WEBHOOK = "https://discord.com/api/webhooks/123456/abcdefSECRET";
const baseEnv = { VERCEL_TOKEN: "tok_test", VERCEL_PROJECT_ID: "prj_test", VERCEL_TEAM_ID: "team_test" };
const ev = (type, text = "x") => ({ type, text, created: 1 });

/** Fake SDK: `plan` maps a deployment id to its events. Records every call. */
function fakeSdk(plan, { deploymentsOverride } = {}) {
  const calls = [];
  const deployments = deploymentsOverride ?? Object.keys(plan).map((id, i) => ({ uid: id, url: `${id}.vercel.app`, readyState: "READY", created: 1_700_000_000_000 + i, inspectorUrl: `https://vercel.com/team/proj/${id}` }));
  return {
    calls,
    deployments: {
      getDeployments: async (req) => { calls.push(["getDeployments", req]); return { deployments }; },
      getDeploymentEvents: async (req) => { calls.push(["getDeploymentEvents", req]); return plan[req.idOrUrl]; },
    },
  };
}

test("counts only error and fatal events; stderr/warning/stdout are not errors", () => {
  const events = [ev("stdout"), ev("stderr"), ev("warning"), ev("error"), ev("fatal"), ev("deployment-state"), ev("error")];
  assert.equal(countErrorEvents(events), 3);
  assert.equal(countErrorEvents([]), 0);
});

test("normalizes an array with nulls, a single event object and garbage", () => {
  assert.deepEqual(normalizeEvents([ev("error"), null, undefined]).length, 1);
  assert.equal(countErrorEvents(ev("error")), 1);
  assert.equal(countErrorEvents(null), 0);
  assert.equal(countErrorEvents("oops"), 0);
});

test("the threshold is strict: exactly 10 does not alert, 11 does", () => {
  assert.equal(shouldAlert(10, 10), false);
  assert.equal(shouldAlert(11, 10), true);
  assert.equal(shouldAlert(0, 0), false);
  assert.equal(shouldAlert(1, 0), true);
  assert.equal(shouldAlert(Number.NaN, 10), false);
});

test("collectDeployments asks for the latest N production deployments and their build events, read-only", async () => {
  const sdk = fakeSdk({ d1: [ev("error"), ev("stdout")], d2: [ev("stderr")], d3: null });
  const rows = await collectDeployments({ sdk, projectId: "prj_test", teamId: "team_test", limit: 5, target: "production" });
  assert.deepEqual(rows.map((r) => [r.id, r.errors]), [["d1", 1], ["d2", 0], ["d3", 0]]);
  const [list, ...eventCalls] = sdk.calls;
  assert.deepEqual(list[1], { projectId: "prj_test", teamId: "team_test", limit: 5, target: "production" });
  assert.equal(eventCalls.length, 3);
  for (const [name, req] of eventCalls) {
    assert.equal(name, "getDeploymentEvents");
    assert.equal(req.limit, -1);
    assert.equal(req.builds, 1);
  }
  assert.deepEqual([...new Set(sdk.calls.map((c) => c[0]))].sort(), ["getDeploymentEvents", "getDeployments"]);
  const all = await collectDeployments({ sdk: fakeSdk({ d1: [] }), projectId: "p", limit: 5, target: "all" });
  assert.equal(all.length, 1);
});

test("target=all does not filter by target", async () => {
  const sdk = fakeSdk({ d1: [] });
  await collectDeployments({ sdk, projectId: "p", limit: 5, target: "all" });
  assert.equal("target" in sdk.calls[0][1], false);
});

test("never inspects more deployments than the limit even if the API returns more", async () => {
  const many = Array.from({ length: 9 }, (_, i) => ({ uid: `d${i}`, url: `d${i}.vercel.app`, readyState: "READY", created: i }));
  const plan = Object.fromEntries(many.map((d) => [d.uid, []]));
  const rows = await collectDeployments({ sdk: fakeSdk(plan, { deploymentsOverride: many }), projectId: "p", limit: 5, target: "production" });
  assert.equal(rows.length, 5);
});

test("config: required values, defaults and validation", () => {
  assert.throws(() => readConfig({}), /VERCEL_TOKEN/);
  assert.throws(() => readConfig({ VERCEL_TOKEN: "t" }), /VERCEL_PROJECT_ID/);
  const c = readConfig(baseEnv);
  assert.equal(c.deployments, 5);
  assert.equal(c.threshold, 10);
  assert.equal(c.target, "production");
  assert.equal(readConfig({ ...baseEnv, MONITOR_DEPLOYMENTS: "99" }).deployments, 20);
  assert.throws(() => readConfig({ ...baseEnv, MONITOR_DEPLOYMENTS: "0" }), /positive integer/);
  assert.throws(() => readConfig({ ...baseEnv, MONITOR_THRESHOLD: "-1" }), /non-negative/);
  assert.throws(() => readConfig({ ...baseEnv, MONITOR_TARGET: "staging" }), /production/);
});

test("only genuine Discord webhook URLs are accepted", () => {
  assert.doesNotThrow(() => assertDiscordWebhook(WEBHOOK));
  assert.doesNotThrow(() => assertDiscordWebhook("https://ptb.discord.com/api/webhooks/1/x"));
  for (const bad of ["http://discord.com/api/webhooks/1/x", "https://evil.example/api/webhooks/1/x", "https://discord.com.evil.example/api/webhooks/1/x", "https://discord.com/other/1/x", "https://user@evil.example/", "not a url", ""]) {
    assert.throws(() => assertDiscordWebhook(bad), /DISCORD_WEBHOOK_URL/, bad);
  }
});

test("the alert carries counts, ids, states and URLs only — no log text — and cannot ping anyone", () => {
  const rows = [{ id: "dpl_a", state: "ERROR", errors: 7, inspectorUrl: "https://vercel.com/t/p/dpl_a" }, { id: "dpl_b", state: "READY", errors: 6, inspectorUrl: null }];
  const payload = buildDiscordPayload({ total: 13, threshold: 10, rows, runUrl: "https://github.com/o/r/actions/runs/1" });
  assert.match(payload.content, /13 error event\(s\) in the last 2 deployment\(s\)/);
  assert.match(payload.content, /dpl_a/);
  assert.deepEqual(payload.allowed_mentions, { parse: [] });
  assert.ok(payload.content.length <= 1900);
  assert.ok(!JSON.stringify(payload).includes("SECRET"));
});

test("run: below or at the threshold sends nothing and exits 0", async () => {
  let posted = 0;
  const sdk = fakeSdk({ d1: Array.from({ length: 10 }, () => ev("error")) });
  const code = await run({ env: { ...baseEnv, DISCORD_WEBHOOK_URL: WEBHOOK }, argv: [], sdkFactory: async () => sdk, fetchImpl: async () => { posted++; return { ok: true }; }, log: () => {} });
  assert.equal(code, 0);
  assert.equal(posted, 0);
});

test("run: above the threshold posts exactly one alert to Discord and exits 0", async () => {
  const sent = [];
  const sdk = fakeSdk({ d1: Array.from({ length: 6 }, () => ev("error")), d2: Array.from({ length: 5 }, () => ev("fatal")) });
  const logs = [];
  const code = await run({
    env: { ...baseEnv, DISCORD_WEBHOOK_URL: WEBHOOK, GITHUB_SERVER_URL: "https://github.com", GITHUB_REPOSITORY: "o/r", GITHUB_RUN_ID: "42" },
    argv: [],
    sdkFactory: async () => sdk,
    fetchImpl: async (url, init) => { sent.push({ url: String(url), body: JSON.parse(init.body), method: init.method }); return { ok: true, status: 204 }; },
    log: (m) => logs.push(m),
  });
  assert.equal(code, 0);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].method, "POST");
  assert.equal(sent[0].url, WEBHOOK);
  assert.match(sent[0].body.content, /11 error event/);
  assert.match(sent[0].body.content, /actions\/runs\/42/);
  assert.ok(!logs.join("\n").includes("abcdefSECRET"), "the webhook secret must never be logged");
  assert.ok(!logs.join("\n").includes("tok_test"), "the token must never be logged");
});

test("run: --dry-run prints the payload and never calls fetch", async () => {
  const sdk = fakeSdk({ d1: Array.from({ length: 11 }, () => ev("error")) });
  const logs = [];
  const code = await run({ env: baseEnv, argv: ["--dry-run"], sdkFactory: async () => sdk, fetchImpl: async () => { throw new Error("must not be called"); }, log: (m) => logs.push(m) });
  assert.equal(code, 0);
  assert.match(logs.join("\n"), /--dry-run: alert NOT sent/);
});

test("run: exit 2 when over the threshold but the alert cannot be delivered", async () => {
  const sdk = fakeSdk({ d1: Array.from({ length: 11 }, () => ev("error")) });
  const noWebhook = await run({ env: baseEnv, argv: [], sdkFactory: async () => sdk, fetchImpl: async () => ({ ok: true }), log: () => {} });
  assert.equal(noWebhook, 2);
  const rejected = await run({ env: { ...baseEnv, DISCORD_WEBHOOK_URL: WEBHOOK }, argv: [], sdkFactory: async () => sdk, fetchImpl: async () => ({ ok: false, status: 500 }), log: () => {} });
  assert.equal(rejected, 2);
  const badUrl = await run({ env: { ...baseEnv, DISCORD_WEBHOOK_URL: "https://evil.example/x" }, argv: [], sdkFactory: async () => sdk, fetchImpl: async () => { throw new Error("must not be called"); }, log: () => {} });
  assert.equal(badUrl, 2);
});

test("run: configuration and API failures exit 1 without leaking the token", async () => {
  const logs = [];
  assert.equal(await run({ env: {}, argv: [], sdkFactory: async () => fakeSdk({}), log: (m) => logs.push(m) }), 1);
  const failing = { deployments: { getDeployments: async () => { throw new Error("401 Unauthorized\nstack..."); }, getDeploymentEvents: async () => [] } };
  assert.equal(await run({ env: baseEnv, argv: [], sdkFactory: async () => failing, log: (m) => logs.push(m) }), 1);
  assert.ok(logs.some((l) => l.includes("401 Unauthorized")));
  assert.ok(!logs.join("\n").includes("tok_test"));
  assert.ok(!logs.join("\n").includes("stack..."), "only the first line of an API error is logged");
});

test("postDiscord re-validates the URL even when called directly", async () => {
  await assert.rejects(() => postDiscord("https://evil.example/api/webhooks/1/x", {}, async () => ({ ok: true })), /DISCORD_WEBHOOK_URL/);
});
