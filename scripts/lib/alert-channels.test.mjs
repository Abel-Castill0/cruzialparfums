// Run with: node --test scripts/lib/alert-channels.test.mjs
// No network: GitHub and Discord are faked through an injected fetch that records every call.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertDiscordWebhook,
  assertRepository,
  deliverAlert,
  findOpenIssue,
  issueTitle,
  postDiscord,
  readChannel,
  upsertGitHubIssue,
} from "./alert-channels.mjs";

const REPO = "Abel-Castill0/cruzialparfums";
const TOKEN = "ghs_test_token_value";
const WEBHOOK = "https://discord.com/api/webhooks/1/SECRETPART";
const TITLE = issueTitle("vercel-production", "deployment error events above threshold");
const json = (body, status = 200) => ({ ok: true, status, json: async () => body });

/** Fake GitHub REST API. `open` is the list of open issues/PRs the "repository" holds. */
function fakeGithub({ open = [], forced = {} } = {}) {
  const calls = [];
  let next = 100;
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(String(url));
    const method = init.method ?? "GET";
    calls.push({ method, host: u.host, path: u.pathname, query: u.search, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined });
    const status = forced[`${method} ${u.pathname}`];
    if (status) return { ok: false, status, json: async () => ({ message: "BODY-THAT-MUST-NOT-LEAK" }) };
    if (method === "GET" && u.pathname.endsWith("/issues")) {
      const page = Number(u.searchParams.get("page") ?? 1);
      return json(open.slice((page - 1) * 100, page * 100));
    }
    const comment = u.pathname.match(/\/issues\/(\d+)\/comments$/);
    if (method === "POST" && comment) return json({ html_url: `https://github.com/${REPO}/issues/${comment[1]}#issuecomment-1` }, 201);
    if (method === "POST" && u.pathname.endsWith("/issues")) {
      const number = next++;
      return json({ number, html_url: `https://github.com/${REPO}/issues/${number}` }, 201);
    }
    throw new Error(`unexpected call ${method} ${u.pathname}`);
  };
  return { fetchImpl, calls };
}
const issue = (number, title, extra = {}) => ({ number, title, html_url: `https://github.com/${REPO}/issues/${number}`, ...extra });

test("readChannel: github by default, discord on request, anything else is rejected", () => {
  assert.equal(readChannel({}), "github");
  assert.equal(readChannel({ MONITOR_CHANNEL: "" }), "github");
  assert.equal(readChannel({ MONITOR_CHANNEL: "Discord" }), "discord");
  assert.equal(readChannel({ MONITOR_CHANNEL: " github " }), "github");
  assert.throws(() => readChannel({ MONITOR_CHANNEL: "slack" }), /MONITOR_CHANNEL must be one of: github, discord/);
});

test("issue titles follow [Monitor] <type>: <summary>", () => {
  assert.equal(TITLE, "[Monitor] vercel-production: deployment error events above threshold");
  assert.match(issueTitle("supabase-api", "server error rate up"), /^\[Monitor\] supabase-api: .+/);
});

test("repository must look like owner/name (it is placed in a URL path)", () => {
  assert.equal(assertRepository(REPO), REPO);
  for (const bad of ["", "no-slash", "a/b/c", "../etc/passwd", "owner/na me", "owner/name?x=1", undefined, 7]) {
    assert.throws(() => assertRepository(bad), /owner\/name/, String(bad));
  }
});

test("creates an issue (with the monitor label) when no open issue has that title", async () => {
  const gh = fakeGithub({ open: [issue(7, "Something else")] });
  const r = await upsertGitHubIssue({ fetchImpl: gh.fetchImpl, token: TOKEN, repository: REPO, title: TITLE, body: "counts" });
  assert.deepEqual([r.action, r.number], ["created", 100]);
  const post = gh.calls.at(-1);
  assert.equal(post.method, "POST");
  assert.equal(post.path, `/repos/${REPO}/issues`);
  assert.deepEqual(post.body, { title: TITLE, body: "counts", labels: ["monitor"] });
});

test("comments on the open issue with the exact same title instead of creating a duplicate", async () => {
  const gh = fakeGithub({ open: [issue(9, "other"), issue(12, TITLE), issue(15, TITLE)] });
  const r = await upsertGitHubIssue({ fetchImpl: gh.fetchImpl, token: TOKEN, repository: REPO, title: TITLE, body: "still failing" });
  assert.deepEqual([r.action, r.number], ["commented", 12]); // the oldest duplicate wins
  assert.equal(gh.calls.filter((c) => c.method === "POST").length, 1);
  assert.equal(gh.calls.at(-1).path, `/repos/${REPO}/issues/12/comments`);
  assert.deepEqual(gh.calls.at(-1).body, { body: "still failing" });
});

test("only an EXACT title matches; pull requests with the same title are ignored", async () => {
  const gh = fakeGithub({ open: [issue(3, `${TITLE} (older)`), issue(4, TITLE.toLowerCase()), issue(5, TITLE, { pull_request: { url: "x" } })] });
  assert.equal(await findOpenIssue({ fetchImpl: gh.fetchImpl, token: TOKEN, repository: REPO, title: TITLE }), null);
  const r = await upsertGitHubIssue({ fetchImpl: gh.fetchImpl, token: TOKEN, repository: REPO, title: TITLE, body: "b" });
  assert.equal(r.action, "created");
});

test("looks through up to three pages of open issues", async () => {
  const filler = Array.from({ length: 150 }, (_, i) => issue(1000 + i, `filler ${i}`));
  const gh = fakeGithub({ open: [...filler, issue(1200, TITLE)] });
  const found = await findOpenIssue({ fetchImpl: gh.fetchImpl, token: TOKEN, repository: REPO, title: TITLE });
  assert.equal(found.number, 1200);
  assert.equal(gh.calls.filter((c) => c.method === "GET").length, 2);
});

test("the token only goes to api.github.com, with the documented headers", async () => {
  const gh = fakeGithub();
  await upsertGitHubIssue({ fetchImpl: gh.fetchImpl, token: TOKEN, repository: REPO, title: TITLE, body: "b" });
  assert.ok(gh.calls.every((c) => c.host === "api.github.com"));
  assert.ok(gh.calls.every((c) => c.headers.authorization === `Bearer ${TOKEN}` && c.headers["x-github-api-version"] === "2022-11-28"));
});

test("a very long body is truncated", async () => {
  const gh = fakeGithub();
  await upsertGitHubIssue({ fetchImpl: gh.fetchImpl, token: TOKEN, repository: REPO, title: TITLE, body: "x".repeat(70_000) });
  assert.ok(gh.calls.at(-1).body.body.length < 61_000);
  assert.match(gh.calls.at(-1).body.body, /truncated/);
});

test("API errors name the status and the missing permission, never the response body or the token", async () => {
  const gh = fakeGithub({ forced: { [`POST /repos/${REPO}/issues`]: 403 } });
  await assert.rejects(
    () => upsertGitHubIssue({ fetchImpl: gh.fetchImpl, token: TOKEN, repository: REPO, title: TITLE, body: "b" }),
    (e) => /HTTP 403/.test(e.message) && /issues: write/.test(e.message) && !e.message.includes("BODY-THAT-MUST-NOT-LEAK") && !e.message.includes(TOKEN),
  );
  await assert.rejects(() => upsertGitHubIssue({ fetchImpl: gh.fetchImpl, token: "", repository: REPO, title: TITLE, body: "b" }), /GITHUB_TOKEN is not set/);
});

test("Discord webhook validation and delivery keep working", async () => {
  assert.doesNotThrow(() => assertDiscordWebhook(WEBHOOK));
  for (const bad of ["http://discord.com/api/webhooks/1/x", "https://evil.example/api/webhooks/1/x", "https://discord.com.evil.example/api/webhooks/1/x", "https://discord.com/other/1/x", "not a url"]) {
    assert.throws(() => assertDiscordWebhook(bad), /DISCORD_WEBHOOK_URL/, bad);
  }
  const sent = [];
  await postDiscord(WEBHOOK, { content: "x" }, async (url, init) => { sent.push([String(url), JSON.parse(init.body)]); return { ok: true, status: 204 }; });
  assert.deepEqual(sent, [[WEBHOOK, { content: "x" }]]);
  await assert.rejects(() => postDiscord(WEBHOOK, {}, async () => ({ ok: false, status: 500 })), /HTTP 500/);
});

const alert = { issues: [{ title: TITLE, body: "b1" }, { title: issueTitle("supabase-api", "server error rate up"), body: "b2" }], discord: { content: "hello", allowed_mentions: { parse: [] } } };

test("deliverAlert (github): one upsert per issue, ok=true, and secrets never reach the log", async () => {
  const gh = fakeGithub();
  const logs = [];
  const r = await deliverAlert({ channel: "github", env: { GITHUB_TOKEN: TOKEN, GITHUB_REPOSITORY: REPO, DISCORD_WEBHOOK_URL: WEBHOOK }, alert, fetchImpl: gh.fetchImpl, log: (m) => logs.push(m) });
  assert.equal(r.ok, true);
  assert.deepEqual(r.results.map((x) => x.action), ["created", "created"]);
  assert.ok(gh.calls.every((c) => c.host === "api.github.com"), "the Discord webhook is not used on the github channel");
  assert.ok(!logs.join("\n").includes(TOKEN) && !logs.join("\n").includes("SECRETPART"));
});

test("deliverAlert (github): missing token or repository -> ok=false without any call", async () => {
  for (const env of [{}, { GITHUB_TOKEN: TOKEN }, { GITHUB_REPOSITORY: REPO }]) {
    const r = await deliverAlert({ channel: "github", env, alert, fetchImpl: async () => { throw new Error("must not be called"); }, log: () => {} });
    assert.equal(r.ok, false);
  }
});

test("deliverAlert (github): a failing API call -> ok=false, one-line reason", async () => {
  const gh = fakeGithub({ forced: { [`GET /repos/${REPO}/issues`]: 500 } });
  const logs = [];
  const r = await deliverAlert({ channel: "github", env: { GITHUB_TOKEN: TOKEN, GITHUB_REPOSITORY: REPO }, alert, fetchImpl: gh.fetchImpl, log: (m) => logs.push(m) });
  assert.equal(r.ok, false);
  assert.match(logs.join("\n"), /alert NOT delivered: GitHub API GET \/repos\/Abel-Castill0\/cruzialparfums\/issues answered HTTP 500/);
});

test("deliverAlert (discord): posts the Discord payload only; missing/invalid webhook -> ok=false", async () => {
  const sent = [];
  const ok = await deliverAlert({ channel: "discord", env: { DISCORD_WEBHOOK_URL: WEBHOOK, GITHUB_TOKEN: TOKEN, GITHUB_REPOSITORY: REPO }, alert, fetchImpl: async (u, i) => { sent.push(String(u)); return { ok: true, status: 204 }; }, log: () => {} });
  assert.equal(ok.ok, true);
  assert.deepEqual(sent, [WEBHOOK]);
  assert.equal((await deliverAlert({ channel: "discord", env: {}, alert, log: () => {} })).ok, false);
  assert.equal((await deliverAlert({ channel: "discord", env: { DISCORD_WEBHOOK_URL: "https://evil.example/x" }, alert, fetchImpl: async () => { throw new Error("must not be called"); }, log: () => {} })).ok, false);
});

test("deliverAlert --dry-run prints the channel's payload and never calls fetch", async () => {
  for (const [channel, needle] of [["github", TITLE], ["discord", "hello"]]) {
    const logs = [];
    const r = await deliverAlert({ channel, env: {}, alert, dryRun: true, fetchImpl: async () => { throw new Error("must not be called"); }, log: (m) => logs.push(m) });
    assert.equal(r.ok, true);
    assert.match(logs.join("\n"), new RegExp(`channel: ${channel}`));
    assert.ok(logs.join("\n").includes(needle));
  }
});
