#!/usr/bin/env node
/**
 * Gate A6 — operator-side logical backup of the production Supabase project.
 *
 * Not automated: the Supabase organization is on the Free plan, which has no
 * managed daily backups. This script is meant to be run BY A HUMAN OPERATOR
 * (never in CI, never on a schedule this repo controls) whenever a manual
 * backup is needed before a risky migration/cutover, or on whatever cadence
 * the operator decides.
 *
 * A plain `supabase db dump` is SCHEMA ONLY (confirmed via --dry-run against
 * the real CLI: it runs `pg_dump --schema-only`) and does not include
 * cluster roles either. A genuine logical backup needs all three pieces,
 * matching Supabase's own documented restore order:
 *
 *   roles.sql   <- `supabase db dump --role-only`   (pg_dumpall --roles-only)
 *   schema.sql  <- `supabase db dump`                (pg_dump --schema-only)
 *   data.sql    <- `supabase db dump --data-only --use-copy`
 *
 * Requires the operator to already be authenticated (`npx supabase login`)
 * with access to the target project — this script never reads, stores, or
 * prints a Supabase access token, database password, or any dumped row.
 *
 * Usage:
 *   node scripts/backup-production-db.mjs [--project-ref <ref>]
 *
 * The database password is read from the SUPABASE_DB_PASSWORD environment
 * variable if set. It is NEVER passed as a `--password`/`-p` CLI argument —
 * confirmed via `--dry-run` that the Supabase CLI itself picks up
 * SUPABASE_DB_PASSWORD from the environment and forwards it to the
 * underlying pg_dump/pg_dumpall subprocess as the PGPASSWORD environment
 * variable, never as a subprocess argv element. This script relies on that
 * same environment passthrough (`env: process.env` below) instead of ever
 * constructing a `--password` argument itself. If SUPABASE_DB_PASSWORD is
 * unset, the CLI prompts interactively (stdio is inherited so that prompt
 * reaches the operator) — this script never invents a non-interactive
 * fallback of its own.
 *
 * WARNING: the resulting files are an UNENCRYPTED logical dump containing
 * real customer PII (names, phone numbers, addresses, order history). Never
 * upload them as a public (or unencrypted) GitHub Actions artifact, never
 * commit them (backups/ is gitignored), and never attach them to a public
 * issue/PR. If they need to leave this machine, encrypt them first and send
 * them only to an approved private destination.
 *
 * NOT covered by this backup: external Cloudinary media assets (images are
 * stored with Cloudinary, not in the Supabase database) and Vercel/platform
 * configuration (env vars, domains, deployment settings) — those need their
 * own separate export/documentation if a full disaster-recovery copy is
 * ever needed.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export const DEFAULT_PROJECT_REF = "iyxidhglyqkzoziyewlc";

export function readProjectRef(argv) {
  const flagIndex = argv.indexOf("--project-ref");
  if (flagIndex !== -1 && argv[flagIndex + 1]) return argv[flagIndex + 1];
  return DEFAULT_PROJECT_REF;
}

export function timestamp() {
  // Sortable, filesystem-safe, unambiguous UTC timestamp.
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/**
 * Builds the three `supabase db dump` invocations for a given project ref
 * and output directory. Pure and side-effect-free so it can be unit tested
 * without ever spawning the CLI — in particular, this is what proves a
 * `--password`/`-p` argument is never constructed, and that `--data-only`
 * is present on the data dump.
 */
export function buildDumpCommands(projectRef, outDir) {
  return [
    {
      name: "roles",
      file: resolve(outDir, "roles.sql"),
      args: ["supabase", "db", "dump", "--project-ref", projectRef, "--role-only", "--file"],
    },
    {
      name: "schema",
      file: resolve(outDir, "schema.sql"),
      args: ["supabase", "db", "dump", "--project-ref", projectRef, "--file"],
    },
    {
      name: "data",
      file: resolve(outDir, "data.sql"),
      args: ["supabase", "db", "dump", "--project-ref", projectRef, "--data-only", "--use-copy", "--file"],
    },
  ].map((step) => ({ ...step, args: [...step.args, step.file] }));
}

async function sha256File(path) {
  return new Promise((resolvePromise, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolvePromise(hash.digest("hex")));
    stream.on("error", reject);
  });
}

function runStep(step) {
  console.log(`[backup] dumping ${step.name} -> ${step.file}`);
  const result = spawnSync("npx", step.args, {
    stdio: ["inherit", "inherit", "inherit"],
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`[backup] ${step.name} dump failed (exit ${result.status ?? "unknown"})`);
  }
  if (!existsSync(step.file) || statSync(step.file).size === 0) {
    throw new Error(`[backup] ${step.name} dump file is missing or empty`);
  }
}

async function main() {
  const projectRef = readProjectRef(process.argv.slice(2));
  const backupsDir = resolve(process.cwd(), "backups");
  const outDir = resolve(backupsDir, `cruzial-${projectRef}-${timestamp()}`);
  mkdirSync(outDir, { recursive: true });

  console.log(`[backup] project: ${projectRef}`);
  console.log(`[backup] output:  ${outDir}`);
  console.log("[backup] running roles/schema/data dumps... (no secret value or row data will be printed)");

  const steps = buildDumpCommands(projectRef, outDir);
  for (const step of steps) {
    runStep(step);
  }

  const checksumLines = [];
  for (const step of steps) {
    const checksum = await sha256File(step.file);
    checksumLines.push(`${checksum}  ${step.file.split(/[\\/]/).pop()}`);
  }
  const manifestFile = resolve(outDir, "checksums.sha256");
  writeFileSync(manifestFile, checksumLines.join("\n") + "\n");

  console.log("[backup] done.");
  for (const step of steps) {
    console.log(`[backup]   ${step.name}: ${(statSync(step.file).size / 1024).toFixed(1)} KiB`);
  }
  console.log(`[backup] checksums: ${manifestFile}`);
  console.log("");
  console.log("Next steps (see docs/backup-runbook.md):");
  console.log("  1. Verify checksums.sha256 against each file if this directory is copied anywhere.");
  console.log("  2. Validate the backup restores cleanly (restore-validation section).");
  console.log("  3. Move it to an approved private off-site destination if one exists,");
  console.log("     ENCRYPTED — never upload it unencrypted anywhere, including CI artifacts.");
  console.log("  4. Delete the local copy once it is safely stored elsewhere, if policy requires it.");
  console.log("");
  console.log("NOT included: Cloudinary-hosted media assets, Vercel/platform configuration.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("[backup] failed:", err.message);
    process.exit(1);
  });
}
