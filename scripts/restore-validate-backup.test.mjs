// Run with: node --test scripts/restore-validate-backup.test.mjs
//
// Only the pure filtering/command-construction functions are tested here —
// none of this spawns psql or touches any database. The `import.meta.url`
// guard at the bottom of restore-validate-backup.mjs keeps `main()` from
// running on import.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRestoreCommands, filterRolesSql, filterStorageSchemaData } from "./restore-validate-backup.mjs";

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
