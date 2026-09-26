// Run with: node --test scripts/restore-validate-backup.test.mjs
//
// Pure filtering, entrypoint, and schema assessments; the direct no-args
// check spawns Node only. None of these tests starts psql or touches a DB.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  assessSchemaObjects,
  buildRestoreCommands,
  declaredSnapshotObjects,
  filterRolesSql,
  filterStorageSchemaData,
  isMainEntry,
} from "./restore-validate-backup.mjs";

const helperUrl = new URL("./restore-validate-backup.mjs", import.meta.url);
const baseline = () => ({
  rlsEnabledTables: { inventory: true, complaint_book_entries: true, audit_log: true },
  functions: { admin_update_inventory: true, admin_create_variant: true },
  constraints: {},
});
const gateASchema = [
  'CREATE FUNCTION "public"."check_abuse_rate_limit"(p_purpose text) RETURNS boolean;',
  'ALTER TABLE ONLY "public"."inventory"\n    ADD CONSTRAINT "inventory_tracked_zero_not_available_check" CHECK (true);',
].join("\n");
// The real pg_dump shape: a CHECK constraint inlined inside CREATE TABLE,
// not a separate ALTER TABLE ... ADD CONSTRAINT (that form is what pg_dump
// actually emits, confirmed against a real Production backup).
const inlineCheckSchema = [
  'CREATE TABLE "public"."inventory" (',
  '    "variant_id" "uuid" NOT NULL,',
  '    CONSTRAINT "inventory_tracked_zero_not_available_check" CHECK ((NOT (("inventory_mode" = \'tracked_quantity\'::"text"))))',
  ');',
].join("\n");

test("Windows entrypoint URL comparison works with a native Windows path", () => {
  const path = "C:\\Cruzial Tools\\restore-validate-backup.mjs";
  assert.equal(isMainEntry("file:///C:/Cruzial%20Tools/restore-validate-backup.mjs", path, "win32"), true);
});

test("POSIX entrypoint URL comparison works", () => {
  assert.equal(isMainEntry("file:///tmp/Cruzial%20Tools/restore-validate-backup.mjs", "/tmp/Cruzial Tools/restore-validate-backup.mjs", "linux"), true);
});

test("importing the module does not select its main entrypoint", () => {
  assert.equal(isMainEntry(helperUrl.href, fileURLToPath(import.meta.url)), false);
  assert.equal(isMainEntry(helperUrl.href, undefined), false);
});

test("direct entrypoint is selected and missing args fail non-zero", () => {
  assert.equal(isMainEntry(helperUrl.href, fileURLToPath(helperUrl)), true);
  const result = spawnSync(process.execPath, [fileURLToPath(helperUrl)], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Usage: node scripts\/restore-validate-backup\.mjs/);
});

test("missing a baseline RLS or function fails validation", () => {
  for (const [kind, name] of [["rlsEnabledTables", "inventory"], ["functions", "admin_create_variant"]]) {
    const observed = baseline();
    observed[kind][name] = false;
    const result = assessSchemaObjects("", observed);
    assert.equal(result.ok, false);
    assert.equal(result.checks.find((check) => check.name === name).status, "missing");
  }
});

test("baseline objects restored pass validation", () => {
  const result = assessSchemaObjects("", baseline());
  assert.equal(result.ok, true);
  assert.equal(result.checks.filter((check) => check.status === "present").length, 5);
});

test("Gate A objects absent from the schema are outside that backup snapshot", () => {
  const schema = "-- CREATE FUNCTION public.check_abuse_rate_limit(...)\n-- ADD CONSTRAINT inventory_tracked_zero_not_available_check";
  assert.deepEqual(declaredSnapshotObjects(schema), []);
  const result = assessSchemaObjects(schema, baseline());
  assert.equal(result.ok, true);
  assert.equal(result.checks.filter((check) => check.status === "not part of this backup snapshot").length, 2);
});

test("a Gate A function declared in schema but missing after restore fails", () => {
  const result = assessSchemaObjects(gateASchema, baseline());
  assert.equal(result.ok, false);
  assert.equal(result.checks.find((check) => check.name === "check_abuse_rate_limit").status, "missing");
});

test("a Gate A constraint declared in schema but missing after restore fails", () => {
  const observed = baseline();
  observed.functions.check_abuse_rate_limit = true;
  const result = assessSchemaObjects(gateASchema, observed);
  assert.equal(result.ok, false);
  assert.equal(result.checks.find((check) => check.name === "inventory_tracked_zero_not_available_check").status, "missing");
});

test("declared Gate A objects restored pass validation", () => {
  const observed = baseline();
  observed.functions.check_abuse_rate_limit = true;
  observed.constraints.inventory_tracked_zero_not_available_check = true;
  const result = assessSchemaObjects(gateASchema, observed);
  assert.equal(result.ok, true);
  assert.equal(result.checks.filter((check) => check.status === "present").length, 7);
});

test("a CHECK constraint inlined in CREATE TABLE is recognized as declared (real pg_dump shape)", () => {
  assert.equal(
    declaredSnapshotObjects(inlineCheckSchema).some((object) => object.name === "inventory_tracked_zero_not_available_check"),
    true,
  );
  const result = assessSchemaObjects(inlineCheckSchema, baseline());
  assert.equal(result.checks.find((check) => check.name === "inventory_tracked_zero_not_available_check").status, "missing");
});

test("filterRolesSql drops the realtime-admin parameter GRANT", () => {
  const input = [
    "ALTER ROLE \"anon\" SET \"statement_timeout\" TO '3s';",
    'GRANT SET ON PARAMETER "log_min_messages" TO "supabase_realtime_admin";',
    "RESET ALL;",
  ].join("\n");
  const out = filterRolesSql(input);
  assert.equal(out.includes("GRANT SET ON PARAMETER"), false);
  assert.ok(out.includes("ALTER ROLE"));
  assert.ok(out.includes("RESET ALL"));
});

test("filterRolesSql is a no-op when there is nothing to filter", () => {
  const input = "ALTER ROLE \"authenticated\" SET \"statement_timeout\" TO '8s';";
  assert.equal(filterRolesSql(input), input);
});

test("filterStorageSchemaData drops storage-schema COPY blocks entirely", () => {
  const input = [
    "-- Data for Name: products; Type: TABLE DATA; Schema: public; Owner: postgres",
    'COPY "public"."products" ("id") FROM stdin;',
    "1",
    "\\.",
    "",
    "-- Data for Name: buckets_vectors; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin",
    'COPY "storage"."buckets_vectors" ("id") FROM stdin;',
    "\\.",
  ].join("\n");
  const out = filterStorageSchemaData(input);
  assert.ok(out.includes("public"));
  assert.equal(out.includes("storage"), false);
  assert.equal(out.includes("buckets_vectors"), false);
});

test("filterStorageSchemaData keeps non-storage schemas untouched", () => {
  const input = [
    "-- Data for Name: order_request_rate_events; Type: TABLE DATA; Schema: private; Owner: postgres",
    'COPY "private"."order_request_rate_events" ("id") FROM stdin;',
    "\\.",
  ].join("\n");
  assert.equal(filterStorageSchemaData(input), input);
});

test("buildRestoreCommands produces roles, schema, data in that exact order", () => {
  const steps = buildRestoreCommands("postgresql://x", {
    roles: "/tmp/roles.sql",
    schema: "/tmp/schema.sql",
    data: "/tmp/data.sql",
  });
  assert.deepEqual(
    steps.map((s) => s.name),
    ["roles", "schema", "data"],
  );
});

test("every restore command uses --single-transaction and ON_ERROR_STOP=1", () => {
  const steps = buildRestoreCommands("postgresql://x", {
    roles: "/tmp/roles.sql",
    schema: "/tmp/schema.sql",
    data: "/tmp/data.sql",
  });
  for (const step of steps) {
    assert.ok(step.args.includes("--single-transaction"), `${step.name} must be atomic`);
    assert.ok(step.args.includes("ON_ERROR_STOP=1"), `${step.name} must fail fast`);
  }
});

test("each restore command targets its own named file", () => {
  const steps = buildRestoreCommands("postgresql://x", {
    roles: "/tmp/roles.sql",
    schema: "/tmp/schema.sql",
    data: "/tmp/data.sql",
  });
  assert.ok(steps[0].args.includes("/tmp/roles.sql"));
  assert.ok(steps[1].args.includes("/tmp/schema.sql"));
  assert.ok(steps[2].args.includes("/tmp/data.sql"));
});
