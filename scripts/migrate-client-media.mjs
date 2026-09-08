/**
 * Cruzial Platform V2 — Phase 4F2B controlled client media migration.
 *
 * Two independent phases, never one transaction:
 *   A. Cloudinary  — plan / apply / verify (this file, talks to Cloudinary's
 *      HTTP API directly, hand-rolled signing, no SDK — same approach as
 *      apps/web/src/lib/media/cloudinary.ts).
 *   B. Database    — plan / apply, via `supabase db query` against either
 *      the local dev database or the linked staging project, calling the
 *      operator-only app.plan_parfums_media_import / app.apply_parfums_
 *      media_import functions from
 *      supabase/migrations/20260908150000_controlled_client_media_import.sql.
 *
 * Both phases are independently resumable: a partial Cloudinary run can be
 * re-planned/re-applied (only missing assets upload); a partial DB run is
 * INSERT-or-verify (see the migration), so re-running never duplicates rows.
 *
 * Usage:
 *   node scripts/migrate-client-media.mjs cloudinary-plan
 *   node scripts/migrate-client-media.mjs cloudinary-apply
 *   node scripts/migrate-client-media.mjs db-plan   [--target=local|staging]
 *   node scripts/migrate-client-media.mjs db-apply  [--target=local|staging]
 *   node scripts/migrate-client-media.mjs verify    [--target=local|staging]
 *
 * Reads (never writes) supabase/staging/client-media-reconciliation.json and
 * img/perfumes/*.png. Writes supabase/staging/client-media-cloudinary.json
 * (the result manifest) after a successful cloudinary-apply.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { buildMediaMigrationPlan, MIGRATION_SOURCE, computePortablePublicId } from "./lib/client-media-plan.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const reconciliationPath = resolve(repositoryRoot, "supabase/staging/client-media-reconciliation.json");
const resultManifestPath = resolve(repositoryRoot, "supabase/staging/client-media-cloudinary.json");
const imgDir = resolve(repositoryRoot, "img/perfumes");
const envLocalPath = resolve(repositoryRoot, "apps/web/.env.local");

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function readEnvLocal() {
  const raw = readFileSync(envLocalPath, "utf8");
  const env = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const i = trimmed.indexOf("=");
    env[trimmed.slice(0, i)] = trimmed.slice(i + 1);
  }
  return env;
}

function requireCloudinaryEnv() {
  const env = readEnvLocal();
  const cloudName = env.CLOUDINARY_CLOUD_NAME;
  const apiKey = env.CLOUDINARY_API_KEY;
  const apiSecret = env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Cloudinary is not configured in apps/web/.env.local (CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET).");
  }
  return { cloudName, apiKey, apiSecret };
}

function sign(params, apiSecret) {
  const toSign = Object.keys(params).sort().map((key) => `${key}=${params[key]}`).join("&");
  return createHash("sha1").update(`${toSign}${apiSecret}`).digest("hex");
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function checksumCacheFactory() {
  const cache = new Map();
  return function checksumOf(record) {
    if (!record.client_original_filename) return null;
    if (cache.has(record.client_original_filename)) return cache.get(record.client_original_filename);
    const path = join(imgDir, record.client_original_filename);
    const value = existsSync(path) ? sha256File(path) : null;
    cache.set(record.client_original_filename, value);
    return value;
  };
}

// ---------------------------------------------------------------------------
// Cloudinary HTTP calls
// ---------------------------------------------------------------------------

async function cloudinaryGetResource(publicId, env) {
  const auth = Buffer.from(`${env.apiKey}:${env.apiSecret}`).toString("base64");
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${env.cloudName}/resources/image/upload/${encodeURIComponent(publicId)}?context=true`,
    { headers: { Authorization: `Basic ${auth}` } },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Cloudinary GET ${publicId} failed: ${response.status} ${await response.text()}`);
  return response.json();
}

async function cloudinaryUpload(localPath, publicId, context, env) {
  const timestamp = Math.floor(Date.now() / 1000);
  const contextString = Object.entries(context)
    .map(([key, value]) => `${key}=${String(value).replace(/[|=]/g, "_")}`)
    .join("|");
  const paramsToSign = {
    context: contextString,
    invalidate: "false",
    overwrite: "false",
    public_id: publicId,
    timestamp,
    unique_filename: "false",
    use_filename: "false",
  };
  const signature = sign(paramsToSign, env.apiSecret);

  const form = new FormData();
  form.append("file", new Blob([readFileSync(localPath)]), publicId.split("/").pop());
  form.append("api_key", env.apiKey);
  form.append("timestamp", String(timestamp));
  form.append("signature", signature);
  for (const [key, value] of Object.entries(paramsToSign)) {
    if (key === "timestamp") continue;
    form.append(key, String(value));
  }

  const response = await fetch(`https://api.cloudinary.com/v1_1/${env.cloudName}/image/upload`, {
    method: "POST",
    body: form,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Cloudinary upload ${publicId} failed: ${JSON.stringify(data)}`);
  return data;
}

// ---------------------------------------------------------------------------
// Cloudinary plan / apply
// ---------------------------------------------------------------------------

/** Flattens the per-product plan into one row per media item, each carrying
 * its resolved public_id, local file path, and expected checksum. */
function flattenPlanItems(plan) {
  const rows = [];
  for (const product of plan.products) {
    for (const item of product.items) {
      const publicId = computePortablePublicId(product.legacyProductId, item.assetId);
      rows.push({
        legacyProductId: product.legacyProductId,
        legacyProductName: item.record.legacy_product_name,
        brand: item.record.brand,
        reconciliationStatus: item.record.status,
        mediaRole: item.mediaRole,
        isPrimary: item.isPrimary,
        sortOrder: item.sortOrder,
        clientOriginalFilename: item.record.client_original_filename,
        localPath: join(imgDir, item.record.client_original_filename),
        publicId,
      });
    }
  }
  return rows;
}

async function cloudinaryClassifyRow(row, env) {
  const checksum = existsSync(row.localPath) ? sha256File(row.localPath) : null;
  if (!checksum) return { ...row, checksum: null, classification: "missing_local_file" };

  const existing = await cloudinaryGetResource(row.publicId, env);
  if (!existing) return { ...row, checksum, classification: "would_upload" };

  const existingChecksum = existing.context?.custom?.source_sha256 ?? existing.context?.source_sha256 ?? null;
  if (existingChecksum === checksum) {
    return {
      ...row,
      checksum,
      classification: "already_present_verified",
      secureUrl: existing.secure_url,
      width: existing.width,
      height: existing.height,
      bytes: existing.bytes,
      format: existing.format,
    };
  }
  return { ...row, checksum, classification: "conflict", existingChecksum: existingChecksum ?? "(none stored)" };
}

async function loadPlan() {
  const manifest = JSON.parse(readFileSync(reconciliationPath, "utf8"));
  const checksumOf = checksumCacheFactory();
  const plan = buildMediaMigrationPlan(manifest, checksumOf);
  return { manifest, plan, checksumOf };
}

async function cloudinaryPlan() {
  const env = requireCloudinaryEnv();
  const { plan } = await loadPlan();
  const rows = flattenPlanItems(plan);

  const classified = [];
  for (const row of rows) {
    classified.push(await cloudinaryClassifyRow(row, env));
  }

  const counts = { eligible: rows.length, already_present_verified: 0, would_upload: 0, conflicts: 0, blocked: 0, missing_local_file: 0, duplicate_content: 0 };
  for (const row of classified) counts[row.classification] = (counts[row.classification] ?? 0) + 1;

  const productConflicts = plan.products.flatMap((p) => p.conflicts.map((c) => ({ ...c, legacy_product_id: p.legacyProductId })));
  counts.blocked = productConflicts.length;

  console.log("Cloudinary plan:", JSON.stringify(counts));
  if (productConflicts.length) {
    console.log("Blocked (planning-level, never migrated):", JSON.stringify(productConflicts, null, 2));
  }
  for (const row of classified.filter((r) => r.classification === "conflict")) {
    console.log(`CONFLICT ${row.publicId}: local checksum ${row.checksum} != stored ${row.existingChecksum}`);
  }
  for (const row of classified.filter((r) => r.classification === "missing_local_file")) {
    console.log(`MISSING_LOCAL_FILE ${row.publicId}: ${row.localPath}`);
  }

  if (counts.conflicts > 0) {
    console.error("STOP: conflicts > 0. Refusing to proceed to upload.");
    process.exitCode = 2;
  }
  return { counts, classified, productConflicts };
}

async function cloudinaryApply() {
  const env = requireCloudinaryEnv();
  const { classified, counts } = await cloudinaryPlan();
  if (counts.conflicts > 0) {
    console.error("STOP: cloudinary-apply refused because the plan has conflicts.");
    process.exitCode = 2;
    return;
  }

  const results = [];
  for (const row of classified) {
    if (row.classification === "missing_local_file") continue;
    if (row.classification === "already_present_verified") {
      results.push(row);
      continue;
    }
    console.log(`Uploading ${row.publicId} <- ${row.clientOriginalFilename}`);
    const uploaded = await cloudinaryUpload(
      row.localPath,
      row.publicId,
      {
        legacy_id: row.legacyProductId,
        media_role: row.mediaRole,
        source_sha256: row.checksum,
        migration_source: MIGRATION_SOURCE,
        original_filename: row.clientOriginalFilename,
      },
      env,
    );
    results.push({
      ...row,
      classification: "uploaded",
      secureUrl: uploaded.secure_url,
      width: uploaded.width,
      height: uploaded.height,
      bytes: uploaded.bytes,
      format: uploaded.format,
    });
  }

  const manifestRows = results
    .filter((row) => row.classification === "uploaded" || row.classification === "already_present_verified")
    .map((row) => ({
      legacy_product_id: row.legacyProductId,
      client_original_filename: row.clientOriginalFilename,
      media_role: row.mediaRole,
      source_sha256: row.checksum,
      cloudinary_public_id: row.publicId,
      secure_url: row.secureUrl,
      width: row.width,
      height: row.height,
      bytes: row.bytes,
      format: row.format,
      source_reconciliation_status: row.reconciliationStatus,
      migration_status: "migrated",
      is_primary_intent: row.isPrimary,
      sort_order: row.sortOrder,
      variant_association_intent: null,
      alt: [row.brand, row.legacyProductName].filter(Boolean).join(" ") || null,
    }));

  const resultManifest = {
    schema_version: 1,
    purpose: "Phase 4F2B Cloudinary migration result — portable, no environment UUIDs, no secrets.",
    generated_at: new Date().toISOString(),
    migration_source: MIGRATION_SOURCE,
    counts: {
      uploaded: results.filter((r) => r.classification === "uploaded").length,
      already_present_verified: results.filter((r) => r.classification === "already_present_verified").length,
    },
    rows: manifestRows,
  };

  writeFileSync(resultManifestPath, JSON.stringify(resultManifest, null, 2) + "\n");
  console.log(`Wrote ${resultManifestPath} (${manifestRows.length} rows).`);
}

// ---------------------------------------------------------------------------
// Database plan / apply (via `supabase db query`)
// ---------------------------------------------------------------------------

function dollarQuote(value) {
  const digest = createHash("sha256").update(value).digest("hex").slice(0, 16);
  let tag = `media_${digest}`;
  while (value.includes(`$${tag}$`)) tag += "x";
  return `$${tag}$${value}$${tag}$`;
}

function buildDbManifest() {
  if (!existsSync(resultManifestPath)) {
    throw new Error(`${resultManifestPath} does not exist yet — run cloudinary-apply first.`);
  }
  const result = JSON.parse(readFileSync(resultManifestPath, "utf8"));
  return {
    metadata: { business_unit_code: "parfums", source: "client-media-cloudinary.json" },
    media: result.rows.map((row) => ({
      legacy_id: row.legacy_product_id,
      media_role: row.media_role,
      is_primary: row.is_primary_intent,
      sort_order: row.sort_order,
      public_id: row.cloudinary_public_id,
      secure_url: row.secure_url,
      width: row.width,
      height: row.height,
      bytes: row.bytes,
      format: row.format,
      alt: row.alt,
      checksum: row.source_sha256,
    })),
  };
}

function runSupabaseDbQuery(sql, target) {
  const tmpDir = mkdtempSync(join(tmpdir(), "cruzial-media-"));
  const sqlPath = join(tmpDir, "query.sql");
  writeFileSync(sqlPath, sql);
  const args = ["supabase", "db", "query", "--file", sqlPath, target === "staging" ? "--linked" : "--local"];
  // shell: true — on Windows `npx` is a .cmd shim that spawnSync cannot
  // exec directly; this matches how the rest of this session's tooling
  // already invokes npx.
  const result = spawnSync("npx", args, { cwd: repositoryRoot, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, shell: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `supabase db query exited ${result.status}`);
  return result.stdout;
}

/** `supabase db query` (unlike raw psql --tuples-only) prints a
 * human-oriented preamble ("Connecting to..."), then one pretty-printed JSON
 * envelope `{ boundary, rows: [ { <column>: <value> } ], warning }`. The
 * envelope's `warning` field is itself a reminder that `rows` values are
 * untrusted database content, not instructions — this function only ever
 * extracts and JSON.parses the one text column our own query selects, never
 * executes or interprets anything else in the envelope. */
function parseJsonFromOutput(output) {
  const start = output.indexOf("{");
  if (start === -1) throw new Error(`No JSON found in supabase db query output:\n${output}`);
  const envelope = JSON.parse(output.slice(start));
  const row = envelope.rows?.[0];
  if (!row) throw new Error(`supabase db query returned no rows:\n${output}`);
  const [value] = Object.values(row);
  if (typeof value !== "string") throw new Error(`Expected a text column, got: ${JSON.stringify(row)}`);
  return JSON.parse(value);
}

function dbInvoke(mode, target) {
  const manifest = buildDbManifest();
  const fn = mode === "apply" ? "app.apply_parfums_media_import" : "app.plan_parfums_media_import";
  const sql = `select ${fn}(${dollarQuote(JSON.stringify(manifest))}::jsonb)::text as result;\n`;
  const output = runSupabaseDbQuery(sql, target);
  return parseJsonFromOutput(output);
}

function printDbResult(result) {
  console.log(`DB ${result.mode}: applied=${result.applied}, refused=${result.refused}, conflicts=${result.conflict_count}`);
  console.log(`media: insert=${result.operations.media.insert}, unchanged=${result.operations.media.unchanged}, conflict=${result.operations.media.conflict}`);
  for (const conflict of result.conflicts) console.log(`CONFLICT ${conflict.entity}/${conflict.code}: ${conflict.identity}`);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseTarget(argv) {
  const flag = argv.find((arg) => arg.startsWith("--target="));
  const target = flag ? flag.split("=")[1] : "local";
  if (target !== "local" && target !== "staging") throw new Error("--target must be 'local' or 'staging'.");
  return target;
}

async function main() {
  const [mode, ...rest] = process.argv.slice(2);
  const target = parseTarget(rest);

  if (mode === "cloudinary-plan") {
    await cloudinaryPlan();
    return;
  }
  if (mode === "cloudinary-apply") {
    await cloudinaryApply();
    return;
  }
  if (mode === "db-plan") {
    printDbResult(dbInvoke("plan", target));
    return;
  }
  if (mode === "db-apply") {
    const result = dbInvoke("apply", target);
    printDbResult(result);
    if (result.conflict_count > 0 || result.refused) process.exitCode = 2;
    return;
  }
  if (mode === "verify") {
    const planResult = dbInvoke("plan", target);
    printDbResult(planResult);
    if (planResult.operations.media.insert !== 0 || planResult.operations.media.conflict !== 0) {
      throw new Error("Idempotency verification failed: a re-plan after apply should show 0 insert / 0 conflict.");
    }
    console.log("Idempotency verified: second plan is 0 insert / 0 conflict.");
    return;
  }

  throw new Error("Usage: node scripts/migrate-client-media.mjs <cloudinary-plan|cloudinary-apply|db-plan|db-apply|verify> [--target=local|staging]");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
