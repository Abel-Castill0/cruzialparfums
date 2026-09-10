/**
 * Cruzial Platform V2 — Deterministic Sexto Consolidado population plan generator.
 *
 * Reads sexto-consolidado-reviewed.json + population-overrides.json,
 * builds the canonical plan via shared module, outputs deterministic JSON.
 *
 * Usage:
 *   node scripts/gen-population-plan.mjs [--output path]
 *
 * Produces byte-identical output for same reviewed SHA + override SHA + PLAN_VERSION.
 */

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPopulationPlan, buildCanonicalManifest, PLAN_VERSION } from "./lib/import-consolidado-plan.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const reviewedPath = resolve(repoRoot, "supabase/staging/import/sexto-consolidado-reviewed.json");
const overridesPath = resolve(repoRoot, "supabase/staging/import/sexto-consolidado-population-overrides.json");
const defaultOutputPath = resolve(repoRoot, "supabase/staging/import/sexto-consolidado-population-plan-4j4b.json");

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

async function main() {
  const outIdx = process.argv.indexOf("--output");
  const outputPath = outIdx !== -1 ? resolve(process.argv[outIdx + 1]) : defaultOutputPath;

  const reviewedRaw = await readFile(reviewedPath, "utf8");
  const overridesRaw = await readFile(overridesPath, "utf8");

  const reviewed = JSON.parse(reviewedRaw);
  const overrides = JSON.parse(overridesRaw);

  // Attach SHA for manifest
  reviewed._sha256 = sha256(reviewedRaw);
  overrides._sha256 = sha256(overridesRaw);

  const plan = buildPopulationPlan(reviewed, overrides);
  const manifest = buildCanonicalManifest(reviewed, overrides, plan);

  const manifestJson = JSON.stringify(manifest, null, 2) + "\n";
  const manifestSha = sha256(manifestJson);

  // Write manifest with SHA in footer (outside canonical body)
  const output = manifestJson.trimEnd() + `\n\n<!-- manifest-sha256: ${manifestSha} -->\n`;

  await writeFile(outputPath, output, "utf8");
  console.log(`[gen] Plan version: ${PLAN_VERSION}`);
  console.log(`[gen] Reviewed SHA: ${reviewed._sha256}`);
  console.log(`[gen] Overrides SHA: ${overrides._sha256}`);
  console.log(`[gen] Manifest SHA: ${manifestSha}`);
  console.log(`[gen] Products: ${plan.stats.products}`);
  console.log(`[gen] Structural presentations: ${plan.stats.structural_presentations}`);
  console.log(`[gen] Priced offers: ${plan.stats.priced_offers}`);
  console.log(`[gen] Skipped (no price): ${plan.stats.skipped_no_price}`);
  console.log(`[gen] Skipped (conflict): ${plan.stats.skipped_conflict}`);
  console.log(`[gen] Written to: ${outputPath}`);
}

main().catch((err) => {
  console.error(`[gen] FATAL: ${err.message}`);
  process.exit(1);
});
