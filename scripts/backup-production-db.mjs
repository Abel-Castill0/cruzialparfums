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
 *   node scripts/backup-production-db.mjs --output-dir <absolute-private-path> [--project-ref <ref>]
 *
 * --output-dir is REQUIRED and has no default. A real backup containing
 * customer/order/complaint PII must never silently land inside this
 * repository, the current working directory, or a cloud-sync folder
 * (OneDrive, Dropbox, Google Drive, iCloud) where it could be uploaded
 * unencrypted without anyone deciding that on purpose. The path must be
 * absolute; see validateOutputDir below for the exact checks. The operator
 * chooses the destination (e.g. C:\cruzial-private-backups on Windows) —
 * nothing here hardcodes or suggests a specific path in application logic.
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
 * commit them, and never attach them to a public issue/PR. If they need to
 * leave this machine, encrypt them first and send them only to an approved
 * private destination.
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
import { isAbsolute, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

export const DEFAULT_PROJECT_REF = "iyxidhglyqkzoziyewlc";

export function readProjectRef(argv) {
  const flagIndex = argv.indexOf("--project-ref");
  if (flagIndex !== -1 && argv[flagIndex + 1]) return argv[flagIndex + 1];
  return DEFAULT_PROJECT_REF;
}

export function readOutputDirArg(argv) {
  const flagIndex = argv.indexOf("--output-dir");
  if (flagIndex !== -1 && argv[flagIndex + 1]) return argv[flagIndex + 1];
  return undefined;
}

export function timestamp() {
  // Sortable, filesystem-safe, unambiguous UTC timestamp.
  return new Date().toISOString().replace(/[:.]/g, "-");
}

// Case-insensitive markers for common cloud-sync roots. Checked against
// each path segment (not a bare substring of the full path) so a legitimate
// directory that merely contains one of these words elsewhere in a longer
// unrelated path is not what triggers this — a segment named "OneDrive",
// "Google Drive", etc. is what actually indicates a synced tree.
const SYNCED_DIR_MARKERS = [
  "onedrive",
  "dropbox",
  "google drive",
  "googledrive",
  "icloud",
  "icloud drive",
  // macOS's actual iCloud Drive path segment is "com~apple~CloudDocs", not
  // a literal "icloud" — confirmed by testing the real path shape.
  "clouddocs",
];

/**
 * Pure validation for --output-dir. Never touches the filesystem. Returns
 * { ok: true } or { ok: false, reason } — callers must fail closed on
 * anything but ok: true.
 */
export function validateOutputDir(outputDir, cwd) {
  if (!outputDir) {
    return { ok: false, reason: "no --output-dir given: a real backup must never silently default into the repository/cwd" };
  }
  if (!isAbsolute(outputDir)) {
    return { ok: false, reason: `--output-dir must be an absolute path, got: ${outputDir}` };
  }

  const resolvedOut = resolve(outputDir);
  const resolvedCwd = resolve(cwd);
  if (resolvedOut === resolvedCwd || resolvedOut.startsWith(resolvedCwd + sep)) {
    return { ok: false, reason: `--output-dir must not be inside the current working directory (${resolvedCwd}) or the repository it contains` };
  }

  const segments = resolvedOut.toLowerCase().split(sep);
  for (const marker of SYNCED_DIR_MARKERS) {
    if (segments.some((seg) => seg.includes(marker))) {
      return { ok: false, reason: `--output-dir appears to be inside a cloud-sync folder ("${marker}") — a real backup must never land somewhere that could sync it unencrypted` };
    }
  }

  return { ok: true };
}

/**
 * The Supabase CLI is invoked through npx. On Windows, npx is a .cmd
 * wrapper, and Node's spawn/spawnSync cannot execute a .cmd file directly
 * (CreateProcess needs cmd.exe as the interpreter) — even with an absolute
 * path, `spawnSync("npx.cmd", ...)` fails with EINVAL unless shell: true.
 * This is confirmed against this exact Node/Windows combination, not
 * assumed. shell is scoped to win32 only; everywhere else the plain "npx"
 * binary runs directly, no shell involved.
 */
export function resolveNpxCommand(platform = process.platform) {
  return platform === "win32" ? { command: "npx.cmd", shell: true } : { command: "npx", shell: false };
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
  const { command, shell } = resolveNpxCommand();
  const result = spawnSync(command, step.args, {
    stdio: ["inherit", "inherit", "inherit"],
    env: process.env,
    shell,
  });
  if (result.status !== 0) {
    throw new Error(`[backup] ${step.name} dump failed (exit ${result.status ?? "unknown"})`);
  }
  if (!existsSync(step.file) || statSync(step.file).size === 0) {
    throw new Error(`[backup] ${step.name} dump file is missing or empty`);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const projectRef = readProjectRef(argv);
  const outputDirArg = readOutputDirArg(argv);

  const check = validateOutputDir(outputDirArg, process.cwd());
  if (!check.ok) {
    console.error(`[backup] refusing to run: ${check.reason}`);
    console.error("[backup] usage: node scripts/backup-production-db.mjs --output-dir <absolute-private-path> [--project-ref <ref>]");
    process.exit(1);
  }

  const outDir = resolve(outputDirArg, `cruzial-${projectRef}-${timestamp()}`);
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

const isMainEntry = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainEntry) {
  main().catch((err) => {
    console.error("[backup] failed:", err.message);
    process.exit(1);
  });
}
