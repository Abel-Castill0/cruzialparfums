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
import { pathToFileURL } from "node:url";

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

const REQUIRED_OBJECTS = {
  rlsEnabledTables: ["inventory", "complaint_book_entries", "audit_log"],
  functions: ["admin_update_inventory", "admin_create_variant"],
};

const SNAPSHOT_OBJECTS = [
  {
    kind: "functions",
    name: "check_abuse_rate_limit",
    declaration: /^\s*CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:"public"|public)\.(?:"check_abuse_rate_limit"|check_abuse_rate_limit)\s*\(/im,
  },
  {
    kind: "constraints",
    name: "inventory_tracked_zero_not_available_check",
    // pg_dump inlines a CHECK constraint inside CREATE TABLE (only PK/FK/UNIQUE
    // get a separate ALTER TABLE ... ADD CONSTRAINT); a real Production backup
    // uses the inline form, so both shapes must be recognized or this falsely
    // reports the constraint as "not part of this backup snapshot".
    declaration: /^\s*CONSTRAINT\s+(?:"inventory_tracked_zero_not_available_check"|inventory_tracked_zero_not_available_check)\s+CHECK\b|^\s*ALTER\s+TABLE(?:\s+ONLY)?\s+(?:"public"|public)\.(?:"inventory"|inventory)\s+ADD\s+CONSTRAINT\s+(?:"inventory_tracked_zero_not_available_check"|inventory_tracked_zero_not_available_check)(?=\s)/im,
  },
];

/** The comparison is platform-specific, but testable on either host OS. */
export function isMainEntry(moduleUrl, entryPath, platform = process.platform) {
  return typeof entryPath === "string"
    && moduleUrl === pathToFileURL(entryPath, { windows: platform === "win32" }).href;
}

/** Decide which newer objects actually belong to this backup's schema. */
export function declaredSnapshotObjects(schemaSql) {
  const ddl = schemaSql.replace(/^\s*--[^\n]*$/gm, "");
  return SNAPSHOT_OBJECTS.filter(({ declaration }) => declaration.test(ddl));
}

/** Pure assessment; a missing baseline or declared snapshot object is fatal. */
export function assessSchemaObjects(schemaSql, observed) {
  const checks = [];
  for (const name of REQUIRED_OBJECTS.rlsEnabledTables) {
    checks.push({ kind: "rlsEnabledTables", name, status: observed.rlsEnabledTables?.[name] === true ? "present" : "missing" });
  }
  for (const name of REQUIRED_OBJECTS.functions) {
    checks.push({ kind: "functions", name, status: observed.functions?.[name] === true ? "present" : "missing" });
  }
  for (const { kind, name } of SNAPSHOT_OBJECTS) {
    const declared = declaredSnapshotObjects(schemaSql).some((object) => object.kind === kind && object.name === name);
    checks.push({
      kind,
      name,
      status: !declared ? "not part of this backup snapshot" : observed[kind]?.[name] === true ? "present" : "missing",
    });
  }
  return { ok: checks.every(({ status }) => status !== "missing"), checks };
}

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
    const schemaFile = resolve(backupDir, "schema.sql");
    const schemaSql = readFileSync(schemaFile, "utf8");
    const rolesFiltered = join(tmp, "roles.sql");
    const dataFiltered = join(tmp, "data.sql");
    writeFileSync(rolesFiltered, filterRolesSql(readFileSync(resolve(backupDir, "roles.sql"), "utf8")));
    writeFileSync(dataFiltered, filterStorageSchemaData(readFileSync(resolve(backupDir, "data.sql"), "utf8")));

    const steps = buildRestoreCommands(dbUrl, {
      roles: rolesFiltered,
      schema: schemaFile,
      data: dataFiltered,
    });
    for (const step of steps) runStep(step);

    console.log("\n[restore-validate] row counts (no data printed, counts only):");
    for (const table of COUNT_TABLES) {
      const count = runPsql(dbUrl, `select count(*) from public.${table};`);
      console.log(`  ${table}: ${count}`);
    }

    console.log("\n[restore-validate] schema object checks:");
    const observed = { rlsEnabledTables: {}, functions: {}, constraints: {} };
    for (const table of REQUIRED_OBJECTS.rlsEnabledTables) {
      observed.rlsEnabledTables[table] = runPsql(
        dbUrl,
        `select relrowsecurity from pg_class where relname='${table}' and relnamespace='public'::regnamespace;`,
      ) === "t";
    }
    const declared = declaredSnapshotObjects(schemaSql);
    const functionNames = [...REQUIRED_OBJECTS.functions, ...declared.filter(({ kind }) => kind === "functions").map(({ name }) => name)];
    for (const fn of functionNames) {
      const found = runPsql(dbUrl, `select count(*) from pg_proc where proname='${fn}' and pronamespace='public'::regnamespace;`);
      observed.functions[fn] = Number(found) > 0;
    }
    for (const { name } of declared.filter(({ kind }) => kind === "constraints")) {
      const found = runPsql(dbUrl, `select count(*) from pg_constraint where conname='${name}' and conrelid='public.inventory'::regclass;`);
      observed.constraints[name] = Number(found) > 0;
    }
    const assessment = assessSchemaObjects(schemaSql, observed);
    for (const { kind, name, status } of assessment.checks) {
      const label = kind === "rlsEnabledTables" ? `RLS enabled on ${name}` : `${kind === "functions" ? "function" : "constraint"} ${name} present`;
      console.log(`  ${label}: ${status === "present" ? "yes" : status}`);
    }
    if (!assessment.ok) {
      throw new Error(`required schema object checks failed: ${assessment.checks.filter(({ status }) => status === "missing").map(({ name }) => name).join(", ")}`);
    }

    console.log("\n[restore-validate] restore mechanism proven. Reminder: this validates the SQL");
    console.log("backup only -- it does not restore Cloudinary media assets or Vercel/platform");
    console.log("configuration (env vars, domains, deployment settings).");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (isMainEntry(import.meta.url, process.argv[1])) {
  main().catch((err) => {
    console.error("[restore-validate] failed:", err.message);
    process.exit(1);
  });
}
