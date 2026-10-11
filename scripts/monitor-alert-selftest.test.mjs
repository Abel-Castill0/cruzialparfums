// Run with: node --test scripts/monitor-alert-selftest.test.mjs
// No network: GitHub and Discord are faked through an injected fetch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { retryPolicy } from "./lib/alert-channels.mjs";
import { buildSelftest, run } from "./monitor-alert-selftest.mjs";

retryPolicy.retryDelayMs = 0;
const REPO = "Abel-Castill0/cruzialparfums";
const TOKEN = "ghs_test_token_value";
const ghEnv = { GITHUB_TOKEN: TOKEN, GITHUB_REPOSITORY: REPO, MONITOR_SELFTEST_SOURCE: "monitor-vercel" };
const json = (body, status = 200) => ({ ok: true, status, json: async () => body });

function fakeGithub({ open = [], failPatch = false } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(String(url));
    const method = init.method ?? "GET";
    calls.push({ method, path: u.pathname, body: init.body ? JSON.parse(init.body) : undefined });
    if (method === "GET") return json(open);
    if (method === "PATCH") return failPatch ? { ok: false, status: 403, json: async () => ({}) } : json({ html_url: "x" });
    if (/\/comments$/.test(u.pathname)) return json({ html_url: "c" }, 201);
    return json({ number: 41, html_url: `https://github.com/${REPO}/issues/41` }, 201);
  };
  return { fetchImpl, calls };
}

test("buildSelftest: clearly labelled, stable per source, no Production data", () => {
  const a = buildSelftest({ source: "monitor-vercel", runUrl: "https://github.com/o/r/actions/runs/3" });
  assert.equal(a.issues[0].title, "[Monitor] selftest: alert delivery check (monitor-vercel)");
  assert.match(a.issues[0].body, /This is not an incident/);
  assert.match(a.issues[0].body, /actions\/runs\/3/);
  assert.deepEqual(a.discord.allowed_mentions, { parse: [] });
});

test("run (github): creates the self-test issue, then comments and closes it -> exit 0", async () => {
  const gh = fakeGithub();
  const logs = [];
  assert.equal(await run({ env: ghEnv, argv: [], fetchImpl: gh.fetchImpl, log: (m) => logs.push(m) }), 0);
  assert.deepEqual(gh.calls.map((c) => `${c.method} ${c.path}`), [
    `GET /repos/${REPO}/issues`,
    `POST /repos/${REPO}/issues`,
    `POST /repos/${REPO}/issues/41/comments`,
    `PATCH /repos/${REPO}/issues/41`,
  ]);
  assert.equal(gh.calls[3].body.state, "closed");
  assert.ok(!logs.join("\n").includes(TOKEN));
});

test("run (github): reuses a leftover open self-test issue (comment) and closes it", async () => {
  const gh = fakeGithub({ open: [{ number: 12, title: "[Monitor] selftest: alert delivery check (monitor-vercel)", html_url: "u" }] });
  assert.equal(await run({ env: ghEnv, argv: [], fetchImpl: gh.fetchImpl, log: () => {} }), 0);
  assert.equal(gh.calls.filter((c) => c.method === "POST" && c.path.endsWith("/issues")).length, 0, "no duplicate issue");
  assert.ok(gh.calls.some((c) => c.method === "PATCH" && c.path.endsWith("/issues/12")));
});

test("run: missing permission or failed clean-up -> exit 2; bad source -> exit 1; dry run writes nothing", async () => {
  assert.equal(await run({ env: ghEnv, argv: [], fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({}) }), log: () => {} }), 2);
  assert.equal(await run({ env: ghEnv, argv: [], fetchImpl: fakeGithub({ failPatch: true }).fetchImpl, log: () => {} }), 2);
  assert.equal(await run({ env: { ...ghEnv, MONITOR_SELFTEST_SOURCE: "Bad Source!" }, argv: [], log: () => {} }), 1);
  const never = async () => { throw new Error("must not be called"); };
  assert.equal(await run({ env: { ...ghEnv, DRY_RUN: "true" }, argv: [], fetchImpl: never, log: () => {} }), 0);
  assert.equal(await run({ env: ghEnv, argv: ["--dry-run"], fetchImpl: never, log: () => {} }), 0);
});

test("run (discord): posts one message to the webhook and nothing to GitHub", async () => {
  const sent = [];
  const env = { ...ghEnv, MONITOR_CHANNEL: "discord", DISCORD_WEBHOOK_URL: "https://discord.com/api/webhooks/1/x" };
  assert.equal(await run({ env, argv: [], fetchImpl: async (u) => { sent.push(new URL(String(u)).host); return { ok: true, status: 204 }; }, log: () => {} }), 0);
  assert.deepEqual(sent, ["discord.com"]);
});
