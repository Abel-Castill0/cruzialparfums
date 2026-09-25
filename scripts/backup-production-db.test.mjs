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
  readOutputDirArg,
  readProjectRef,
  resolveNpxCommand,
  timestamp,
  validateOutputDir,
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
