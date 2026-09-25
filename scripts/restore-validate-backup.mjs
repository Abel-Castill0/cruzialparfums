#!/usr/bin/env node
/**
 * Gate A6 — restore-validation helper.
 *
 * Restores a roles.sql/schema.sql/data.sql backup (produced by
 * scripts/backup-production-db.mjs) into a target the operator supplies via
 * --db-url, then runs a small set of non-PII sanity checks. This script
 * NEVER creates or manages that target itself — see
 * docs/backup-runbook.md for how to stand up a disposable, empty Supabase
 * project to restore into. Pointing --db-url at anything that already has
 * Cruzial's schema (including the normal local dev stack) will conflict;
 * pointing it at a hosted project, especially Production, is never correct
 * for a "does this backup restore cleanly" test.
 *
 * Usage:
 *   node scripts/restore-validate-backup.mjs --backup-dir backups/cruzial-<ref>-<ts> --db-url postgresql://postgres:postgres@127.0.0.1:<port>/postgres
 *
 * Two known, narrow filtering steps are applied automatically (both
 * confirmed empirically against a real restore, not assumed):
 *   - roles.sql: a `GRANT SET ON PARAMETER log_min_messages TO
 *     supabase_realtime_admin` statement fails outside a hosted Supabase
 *     project, because the local/managed `postgres` role is not a true
 *     PostgreSQL superuser and cannot itself grant a parameter-level
 *     privilege. This one statement only tunes Realtime's own logging
 *     verbosity — dropping it does not affect restored data or schema.
 *   - data.sql: rows for the `storage` schema (Supabase's file-storage
 *     subsystem) are skipped. Cruzial stores media in Cloudinary, not
 *     Supabase Storage, so these tables are always empty for this project,
 *     and several are RLS-protected in a way the restoring role cannot
 *     bypass (owned by supabase_storage_admin; `postgres` is not
 *     superuser and has no BYPASSRLS).
 *
 * Never prints a row of restored data — only counts.
 */

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export function filterRolesSql(content) {
  return content
    .split("\n")
    .filter((line) => !line.includes("GRANT SET ON PARAMETER"))
    .join("\n");
}

export function filterStorageSchemaData(content) {
  const lines = content.split("\n");
  const out = [];
  let skipping = false;
  for (const line of lines) {
    if (/^-- Data for Name: .*; Schema: storage;/.test(line)) {
      skipping = true;
      continue;
    }
    if (skipping) {
      if (line === "\\.") skipping = false;
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

/** Pure: the three restore invocations, in official order, each atomic and fail-fast. */
export function buildRestoreCommands(dbUrl, files) {
  return [
    { name: "roles", file: files.roles },
    { name: "schema", file: files.schema },
    { name: "data", file: files.data },
  ].map((step) => ({
    ...step,
    args: ["psql", dbUrl, "-v", "ON_ERROR_STOP=1", "--single-transaction", "-f", step.file],
  }));
}

const COUNT_TABLES = [
  "products",
  "campaigns",
  "orders",
  "customers",
  "complaint_book_entries",
  "admin_memberships",
];

const EXPECTED_OBJECTS = {
  rlsEnabledTables: ["inventory", "complaint_book_entries", "audit_log"],
  functions: ["admin_update_inventory", "admin_create_variant", "check_abuse_rate_limit"],
  constraints: ["inventory_tracked_zero_not_available_check"],
};

function readArg(argv, flag) {
  const i = argv.indexOf(flag);
  return i !== -1 ? argv[i + 1] : undefined;
}

function runPsql(dbUrl, sql) {
  const result = spawnSync("psql", [dbUrl, "-t", "-A", "-c", sql], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`psql query failed: ${result.stderr}`);
  return result.stdout.trim();
}

function runStep(step) {
  console.log(`[restore-validate] ${step.name}...`);
  const result = spawnSync(step.args[0], step.args.slice(1), { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`[restore-validate] ${step.name} restore failed (exit ${result.status ?? "unknown"})`);
  }
}

async function main() {
  const backupDir = readArg(process.argv, "--backup-dir");
  const dbUrl = readArg(process.argv, "--db-url");
  if (!backupDir || !dbUrl) {
    console.error("Usage: node scripts/restore-validate-backup.mjs --backup-dir <dir> --db-url <postgresql://...>");
    process.exit(1);
  }

  const tmp = mkdtempSync(join(tmpdir(), "cruzial-restore-"));
  try {
    const rolesFiltered = join(tmp, "roles.sql");
    const dataFiltered = join(tmp, "data.sql");
    writeFileSync(rolesFiltered, filterRolesSql(readFileSync(resolve(backupDir, "roles.sql"), "utf8")));
    writeFileSync(dataFiltered, filterStorageSchemaData(readFileSync(resolve(backupDir, "data.sql"), "utf8")));

    const steps = buildRestoreCommands(dbUrl, {
      roles: rolesFiltered,
      schema: resolve(backupDir, "schema.sql"),
      data: dataFiltered,
    });
    for (const step of steps) runStep(step);

    console.log("\n[restore-validate] row counts (no data printed, counts only):");
    for (const table of COUNT_TABLES) {
      const count = runPsql(dbUrl, `select count(*) from public.${table};`);
      console.log(`  ${table}: ${count}`);
    }

    console.log("\n[restore-validate] schema object checks:");
    for (const table of EXPECTED_OBJECTS.rlsEnabledTables) {
      const rls = runPsql(
        dbUrl,
        `select relrowsecurity from pg_class where relname='${table}' and relnamespace='public'::regnamespace;`,
      );
      console.log(`  RLS enabled on ${table}: ${rls === "t" ? "yes" : "NO -- unexpected"}`);
    }
    for (const fn of EXPECTED_OBJECTS.functions) {
      const found = runPsql(dbUrl, `select count(*) from pg_proc where proname='${fn}' and pronamespace='public'::regnamespace;`);
      console.log(`  function ${fn} present: ${found !== "0" ? "yes" : "NO -- unexpected"}`);
    }
    for (const constraint of EXPECTED_OBJECTS.constraints) {
      const found = runPsql(dbUrl, `select count(*) from pg_constraint where conname='${constraint}';`);
      console.log(`  constraint ${constraint} present: ${found !== "0" ? "yes" : "NO -- unexpected"}`);
    }

    console.log("\n[restore-validate] restore mechanism proven. Reminder: this validates the SQL");
    console.log("backup only -- it does not restore Cloudinary media assets or Vercel/platform");
    console.log("configuration (env vars, domains, deployment settings).");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("[restore-validate] failed:", err.message);
    process.exit(1);
  });
}
