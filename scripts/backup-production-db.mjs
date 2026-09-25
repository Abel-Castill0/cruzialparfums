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
 * Requires the operator to already be authenticated (`npx supabase login`)
 * with access to the target project — this script never reads, stores, or
 * prints a Supabase access token, database password, or any dumped row.
 *
 * Usage:
 *   node scripts/backup-production-db.mjs [--project-ref <ref>]
 *
 * The database password is read from the SUPABASE_DB_PASSWORD environment
 * variable if set (recommended for a non-interactive run); otherwise the
 * Supabase CLI prompts for it interactively. Never pass it on the command
 * line — command-line arguments are visible to every other process on the
 * machine via the process list.
 *
 * WARNING: the resulting file is an UNENCRYPTED logical dump containing
 * real customer PII (names, phone numbers, addresses, order history). Never
 * upload it as a public (or unencrypted) GitHub Actions artifact, never
 * commit it (backups/ is gitignored), and never attach it to a public
 * issue/PR. If it needs to leave this machine, encrypt it first and send it
 * only to an approved private destination.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_PROJECT_REF = "iyxidhglyqkzoziyewlc";

function readProjectRef(argv) {
  const flagIndex = argv.indexOf("--project-ref");
  if (flagIndex !== -1 && argv[flagIndex + 1]) return argv[flagIndex + 1];
  return DEFAULT_PROJECT_REF;
}

function timestamp() {
  // Sortable, filesystem-safe, unambiguous UTC timestamp.
  return new Date().toISOString().replace(/[:.]/g, "-");
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

async function main() {
  const projectRef = readProjectRef(process.argv.slice(2));
  const backupsDir = resolve(process.cwd(), "backups");
  mkdirSync(backupsDir, { recursive: true });

  const outFile = resolve(backupsDir, `cruzial-${projectRef}-${timestamp()}.sql`);

  console.log(`[backup] project: ${projectRef}`);
  console.log(`[backup] output:  ${outFile}`);
  console.log("[backup] running `supabase db dump`... (no secret values or row data will be printed)");

  const args = ["supabase", "db", "dump", "--project-ref", projectRef, "--file", outFile];
  if (process.env.SUPABASE_DB_PASSWORD) {
    args.push("--password", process.env.SUPABASE_DB_PASSWORD);
  }

  const result = spawnSync("npx", args, {
    stdio: ["inherit", "inherit", "inherit"],
    env: process.env,
  });

  if (result.status !== 0) {
    console.error("[backup] supabase db dump failed. See the CLI output above for details.");
    process.exit(result.status ?? 1);
  }

  if (!existsSync(outFile) || statSync(outFile).size === 0) {
    console.error("[backup] dump file is missing or empty — treating this as a failed backup.");
    process.exit(1);
  }

  const checksum = await sha256File(outFile);
  const checksumFile = `${outFile}.sha256`;
  writeFileSync(checksumFile, `${checksum}  ${outFile.split(/[\\/]/).pop()}\n`);

  const sizeBytes = statSync(outFile).size;
  console.log(`[backup] done. size: ${(sizeBytes / 1024 / 1024).toFixed(2)} MiB`);
  console.log(`[backup] sha256: ${checksum}`);
  console.log(`[backup] checksum file: ${checksumFile}`);
  console.log("");
  console.log("Next steps (see docs/backup-runbook.md):");
  console.log("  1. Verify the checksum if the file is copied anywhere.");
  console.log("  2. Validate the backup restores cleanly (restore-validation section).");
  console.log("  3. Move it to an approved private off-site destination if one exists,");
  console.log("     ENCRYPTED — never upload it unencrypted anywhere, including CI artifacts.");
  console.log("  4. Delete the local copy once it is safely stored elsewhere, if policy requires it.");
}

main().catch((err) => {
  console.error("[backup] unexpected error:", err.message);
  process.exit(1);
});
