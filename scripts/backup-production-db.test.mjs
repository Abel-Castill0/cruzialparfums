// Run with: node --test scripts/backup-production-db.test.mjs
//
// Only the pure command-construction functions are unit tested here —
// buildDumpCommands never spawns a process. The `import.meta.url` guard at
// the bottom of backup-production-db.mjs keeps `main()` from running on
// import, matching the convention in migrate-client-media.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDumpCommands,
  quoteForWindowsShell,
  readOutputDirArg,
  readProjectRef,
  resolveNpxCommand,
  timestamp,
  validateOutputDir,
  validateProjectRef,
} from "./backup-production-db.mjs";

test("readProjectRef falls back to the default when --project-ref is absent", () => {
  assert.equal(readProjectRef([]), "iyxidhglyqkzoziyewlc");
});

test("readProjectRef reads an explicit --project-ref", () => {
  assert.equal(readProjectRef(["--project-ref", "abcxyz"]), "abcxyz");
});

test("readOutputDirArg returns undefined when --output-dir is absent", () => {
  assert.equal(readOutputDirArg([]), undefined);
});

test("readOutputDirArg reads an explicit --output-dir", () => {
  assert.equal(readOutputDirArg(["--output-dir", "C:\\cruzial-private-backups"]), "C:\\cruzial-private-backups");
});

test("validateOutputDir rejects a missing --output-dir", () => {
  const result = validateOutputDir(undefined, "C:\\repo");
  assert.equal(result.ok, false);
});

test("validateOutputDir rejects a relative path", () => {
  const result = validateOutputDir("backups", "C:\\repo");
  assert.equal(result.ok, false);
  assert.match(result.reason, /absolute/i);
});

test("validateOutputDir rejects a path inside the current working directory", () => {
  const result = validateOutputDir("C:\\repo\\backups", "C:\\repo");
  assert.equal(result.ok, false);
  assert.match(result.reason, /current working directory|repository/i);
});

test("validateOutputDir rejects a path equal to the current working directory", () => {
  const result = validateOutputDir("C:\\repo", "C:\\repo");
  assert.equal(result.ok, false);
});

test("validateOutputDir rejects OneDrive-synced paths case-insensitively", () => {
  for (const p of [
    "C:\\Users\\ABEL\\OneDrive\\Desktop\\backups",
    "C:\\Users\\ABEL\\onedrive\\Desktop\\backups",
    "C:\\Users\\ABEL\\ONEDRIVE\\Desktop\\backups",
  ]) {
    const result = validateOutputDir(p, "C:\\somewhere-else");
    assert.equal(result.ok, false, `expected ${p} to be rejected`);
    assert.match(result.reason, /cloud-sync|onedrive/i);
  }
});

test("validateOutputDir rejects Dropbox, Google Drive, and iCloud paths", () => {
  for (const p of [
    "C:\\Users\\ABEL\\Dropbox\\backups",
    "C:\\Users\\ABEL\\Google Drive\\backups",
    "/Users/abel/Library/Mobile Documents/com~apple~CloudDocs/backups",
  ]) {
    const result = validateOutputDir(p, "/somewhere-else");
    assert.equal(result.ok, false, `expected ${p} to be rejected`);
  }
});

test("validateOutputDir accepts a genuinely separate absolute private path", () => {
  const result = validateOutputDir("C:\\cruzial-private-backups", "C:\\Users\\ABEL\\OneDrive\\Desktop\\cruzialparfums");
  assert.equal(result.ok, true);
});

test("resolveNpxCommand uses npx.cmd with shell:true only on win32", () => {
  assert.deepEqual(resolveNpxCommand("win32"), { command: "npx.cmd", shell: true });
});

test("resolveNpxCommand uses plain npx with no shell on other platforms", () => {
  assert.deepEqual(resolveNpxCommand("linux"), { command: "npx", shell: false });
  assert.deepEqual(resolveNpxCommand("darwin"), { command: "npx", shell: false });
});

test("timestamp is filesystem-safe (no colons or dots)", () => {
  const ts = timestamp();
  assert.equal(/[:.]/.test(ts), false);
});

test("buildDumpCommands produces exactly three steps: roles, schema, data", () => {
  const steps = buildDumpCommands("proj123", "/tmp/out");
  assert.deepEqual(
    steps.map((s) => s.name),
    ["roles", "schema", "data"],
  );
});

test("the data step includes --data-only and --use-copy", () => {
  const [, , dataStep] = buildDumpCommands("proj123", "/tmp/out");
  assert.ok(dataStep.args.includes("--data-only"));
  assert.ok(dataStep.args.includes("--use-copy"));
});

test("the roles step includes --role-only and the schema step does not", () => {
  const [rolesStep, schemaStep] = buildDumpCommands("proj123", "/tmp/out");
  assert.ok(rolesStep.args.includes("--role-only"));
  assert.equal(schemaStep.args.includes("--role-only"), false);
  assert.equal(schemaStep.args.includes("--data-only"), false);
});

test("no step ever constructs a --password or -p argument", () => {
  for (const step of buildDumpCommands("proj123", "/tmp/out")) {
    assert.equal(step.args.includes("--password"), false, `${step.name} must never pass --password`);
    assert.equal(step.args.includes("-p"), false, `${step.name} must never pass -p`);
  }
});

test("every step targets the given project ref", () => {
  for (const step of buildDumpCommands("my-project-ref", "/tmp/out")) {
    assert.ok(step.args.includes("--project-ref"));
    assert.ok(step.args.includes("my-project-ref"));
  }
});

test("each step writes its own named file under the output directory", () => {
  const steps = buildDumpCommands("proj123", "/tmp/out");
  assert.ok(steps[0].file.endsWith("roles.sql"));
  assert.ok(steps[1].file.endsWith("schema.sql"));
  assert.ok(steps[2].file.endsWith("data.sql"));
});

// --- P2 follow-up: shell:true input hardening ---------------------------
//
// Confirmed empirically on this actual Windows host that shell: true does
// NOT safely isolate array elements from each other: spawnSync("npx.cmd",
// ["--version", "&&", "echo", "INJECTED"], { shell: true }) genuinely ran
// the injected command, even with "&&" as its own array entry. These tests
// prove the strict allowlists reject that class of value before it can
// ever reach spawnSync.

test("validateProjectRef accepts the real production ref (exactly 20 lowercase letters)", () => {
  assert.deepEqual(validateProjectRef("iyxidhglyqkzoziyewlc"), { ok: true });
});

test("validateProjectRef rejects anything not exactly 20 lowercase letters", () => {
  for (const bad of [
    "tooshort",
    "waytoolongtobearealprojectref12345",
    "iyxidhglyqkzoziyewl1", // digit
    "IYXIDHGLYQKZOZIYEWLC", // uppercase
    "",
    undefined,
    null,
  ]) {
    assert.equal(validateProjectRef(bad).ok, false, `expected ${JSON.stringify(bad)} to be rejected`);
  }
});

test("validateProjectRef rejects shell metacharacter injection attempts", () => {
  for (const bad of [
    "foo&whoami",
    "foo|whoami",
    "foo>file",
    "foo^&whoami",
    "%COMSPEC%",
    'foo"bar',
    "foo'bar",
    "foo\rbar",
    "foo\nbar",
    "foo bar",
  ]) {
    const result = validateProjectRef(bad);
    assert.equal(result.ok, false, `expected ${JSON.stringify(bad)} to be rejected`);
  }
});

test("validateOutputDir accepts a safe absolute Windows path containing spaces", () => {
  const result = validateOutputDir("C:\\Cruzial Private Backups", "C:\\Users\\ABEL\\OneDrive\\Desktop\\cruzialparfums");
  assert.equal(result.ok, true);
});

test("validateOutputDir rejects shell metacharacter injection attempts", () => {
  const cwd = "C:\\repo";
  for (const bad of [
    "C:\\backups && whoami",
    "C:\\backups & whoami",
    "C:\\backups | whoami",
    "C:\\backups > evil.txt",
    "C:\\backups ^& whoami",
    "%COMSPEC%\\backups",
    'C:\\backups"evil',
    "C:\\backups'evil",
    "C:\\backups\revil",
    "C:\\backups\nevil",
    "C:\\backups`whoami`",
    "C:\\backups$(whoami)",
  ]) {
    const result = validateOutputDir(bad, cwd);
    assert.equal(result.ok, false, `expected ${JSON.stringify(bad)} to be rejected`);
  }
});

test("validateOutputDir still rejects OneDrive/repo paths after the character allowlist check", () => {
  assert.equal(validateOutputDir("C:\\Users\\ABEL\\OneDrive\\backups", "C:\\somewhere-else").ok, false);
  assert.equal(validateOutputDir("C:\\repo\\backups", "C:\\repo").ok, false);
});

test("quoteForWindowsShell wraps an argument containing a space in double quotes", () => {
  assert.equal(quoteForWindowsShell("C:\\Cruzial Private Backups\\roles.sql"), '"C:\\Cruzial Private Backups\\roles.sql"');
});

test("quoteForWindowsShell leaves a space-free argument unquoted", () => {
  assert.equal(quoteForWindowsShell("--role-only"), "--role-only");
  assert.equal(quoteForWindowsShell("iyxidhglyqkzoziyewlc"), "iyxidhglyqkzoziyewlc");
});

test("quoteForWindowsShell quotes an empty string", () => {
  assert.equal(quoteForWindowsShell(""), '""');
});
