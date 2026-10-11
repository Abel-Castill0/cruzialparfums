// Run with: node --test scripts/monitor-workflows.test.mjs
// Contract between the monitor scripts and their workflows (plain text checks, no YAML dependency).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (name) => readFileSync(fileURLToPath(new URL(`../.github/workflows/${name}`, import.meta.url)), "utf8").replace(/\r\n/g, "\n");
const WORKFLOWS = [
  { file: "monitor-vercel.yml", script: "node scripts/monitor-vercel.mjs", source: "monitor-vercel", secret: "VERCEL_TOKEN" },
  { file: "supabase-health.yml", script: "node scripts/supabase-health.mjs", source: "supabase-health", secret: "SUPABASE_ACCESS_TOKEN" },
];

for (const w of WORKFLOWS) {
  test(`${w.file}: least privilege — read-only by default, issues: write only on the job`, () => {
    const s = read(w.file);
    assert.match(s, /^permissions:\n  contents: read\n\n/m, "workflow-level token stays read-only");
    assert.match(s, /\n    permissions:\n      contents: read\n      issues: write\n/, "the job may write issues");
    assert.ok(!/pull_request_target|pull_request:/.test(s), "never runs for pull requests");
    assert.ok(!/persist-credentials: true/.test(s));
    for (const uses of s.match(/uses: \S+/g) ?? []) assert.match(uses, /@[0-9a-f]{40}$/, `${uses} must be pinned to a commit SHA`);
  });

  test(`${w.file}: the GitHub channel gets the job token; Discord only when chosen`, () => {
    const s = read(w.file);
    assert.ok(s.includes("MONITOR_CHANNEL: ${{ vars.MONITOR_CHANNEL || 'github' }}"));
    assert.ok(s.includes("DISCORD_WEBHOOK_URL: ${{ vars.MONITOR_CHANNEL == 'discord' && secrets.DISCORD_WEBHOOK_URL || '' }}"));
    assert.equal((s.match(/GITHUB_TOKEN: \$\{\{ github\.token \}\}/g) ?? []).length, 2, "self-test step and monitor step only");
    assert.ok(!/secrets\.GITHUB_TOKEN|secrets\.GH_PAT|PERSONAL_ACCESS_TOKEN/.test(s), "no personal token for issues");
    assert.ok(s.includes(`${w.secret}: \${{ secrets.${w.secret} }}`));
  });

  test(`${w.file}: DRY_RUN reaches the script as an environment variable; schedule runs are real`, () => {
    const s = read(w.file);
    assert.ok(s.includes("DRY_RUN: ${{ inputs.dry_run == true }}"));
    assert.match(s, /dry_run:\n {8}description: [^\n]+\n {8}type: boolean\n {8}default: true/);
    assert.ok(s.includes(`run: ${w.script}\n`), "the script decides dry-run from DRY_RUN; no shell branching");
    assert.ok(!s.includes("--dry-run"), "one mechanism only");
    assert.match(s, /schedule:\n    - cron: "\d+ \* \* \* \*"/, "the hourly schedule stays enabled in the file");
  });

  test(`${w.file}: alert self-test step, opt-in`, () => {
    const s = read(w.file);
    assert.match(s, /alert_selftest:\n {8}description: [^\n]+\n {8}type: boolean\n {8}default: false/);
    assert.ok(s.includes(`if: inputs.alert_selftest == true\n        env:\n          MONITOR_SELFTEST_SOURCE: ${w.source}\n`));
    assert.ok(s.includes("run: node scripts/monitor-alert-selftest.mjs"));
  });
}
