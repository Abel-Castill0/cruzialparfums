/**
 * Alert delivery self-test for the monitors (scripts/monitor-vercel.mjs, scripts/supabase-health.mjs).
 *
 * Proves that the job's credentials can really deliver an alert, without waiting for a real incident:
 *   channel github (default): creates (or comments on) the issue "[Monitor] selftest: alert delivery check (<source>)",
 *     then comments and CLOSES it, so nothing stays open. It only contains the run URL — no customer or Production data.
 *   channel discord: posts one short "self-test" message to DISCORD_WEBHOOK_URL.
 *
 * Usage (Actions: the workflows run it when dispatched with alert_selftest=true):
 *   GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/name MONITOR_SELFTEST_SOURCE=monitor-vercel node scripts/monitor-alert-selftest.mjs [--dry-run]
 *
 * Dry run (`--dry-run` or DRY_RUN=true): prints what would be sent and writes nothing.
 * Exit codes: 0 = delivered and cleaned up (or dry run); 1 = configuration error; 2 = delivery or clean-up failed.
 */
import { pathToFileURL } from "node:url";
import { closeGitHubIssue, deliverAlert, isDryRun, issueTitle, readChannel, runUrlFrom } from "./lib/alert-channels.mjs";

const SOURCE_PATTERN = /^[a-z0-9-]{1,40}$/;

export function buildSelftest({ source, runUrl }) {
  const title = issueTitle("selftest", `alert delivery check (${source})`);
  const body = [
    `Automated alert-delivery self-test of the \`${source}\` monitor. This is not an incident.`,
    "",
    ...(runUrl ? [`- Run: ${runUrl}`] : []),
    "- Contains no customer or Production data. The workflow closes this issue automatically.",
  ].join("\n");
  return {
    issues: [{ title, body }],
    discord: { content: `Self-test of the ${source} monitor alert channel. Not an incident.${runUrl ? `\n${runUrl}` : ""}`, allowed_mentions: { parse: [] } },
  };
}

export async function run({ env = process.env, argv = process.argv.slice(2), fetchImpl = fetch, log = console.log } = {}) {
  const dryRun = isDryRun(argv, env);
  let channel;
  const source = String(env.MONITOR_SELFTEST_SOURCE ?? "").trim();
  try {
    channel = readChannel(env);
    if (!SOURCE_PATTERN.test(source)) throw new Error("MONITOR_SELFTEST_SOURCE must be 1-40 lowercase letters, digits or dashes.");
  } catch (error) {
    log(`[selftest] configuration error: ${error.message}`);
    return 1;
  }
  const alert = buildSelftest({ source, runUrl: runUrlFrom(env) });
  const { ok, results } = await deliverAlert({ channel, env, alert, fetchImpl, log, dryRun, prefix: "[selftest]" });
  if (!ok) return 2;
  if (dryRun || channel !== "github") return 0;
  try {
    for (const r of results) {
      await closeGitHubIssue({
        fetchImpl,
        token: env.GITHUB_TOKEN,
        repository: env.GITHUB_REPOSITORY,
        number: r.number,
        comment: "Self-test passed: this job can create, comment on and close monitor issues. Closed automatically.",
      });
      log(`[selftest] GitHub issue #${r.number} closed.`);
    }
  } catch (error) {
    log(`[selftest] clean-up failed: ${String(error?.message ?? error).split("\n")[0]}`);
    return 2;
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().then((code) => process.exit(code));
}
