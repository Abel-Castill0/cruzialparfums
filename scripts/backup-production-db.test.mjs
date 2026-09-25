// Run with: node --test scripts/backup-production-db.test.mjs
//
// Only the pure command-construction functions are unit tested here —
// buildDumpCommands never spawns a process. The `import.meta.url` guard at
// the bottom of backup-production-db.mjs keeps `main()` from running on
// import, matching the convention in migrate-client-media.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDumpCommands, readProjectRef, timestamp } from "./backup-production-db.mjs";

test("readProjectRef falls back to the default when --project-ref is absent", () => {
  assert.equal(readProjectRef([]), "iyxidhglyqkzoziyewlc");
});

test("readProjectRef reads an explicit --project-ref", () => {
  assert.equal(readProjectRef(["--project-ref", "abcxyz"]), "abcxyz");
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
