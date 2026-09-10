/**
 * Cruzial Platform V2 — Deterministic Sexto Consolidado population loader.
 *
 * Reads sexto-consolidado-reviewed.json + population-overrides.json,
 * builds plan via shared module, applies to target database.
 *
 * Usage:
 *   node scripts/load-import-consolidado.mjs --target local --dry-run
 *   node scripts/load-import-consolidado.mjs --target local --apply
 *   node scripts/load-import-consolidado.mjs --target local --verify
 *   node scripts/load-import-consolidado.mjs --target staging --dry-run
 *   node scripts/load-import-consolidado.mjs --target staging --verify
 *
 * Target routing:
 *   --target local   → local Supabase Docker only
 *   --target staging → hosted staging project iyxidhglyqkzoziyewlc
 *
 * NEVER falls back from staging to local.
 * NEVER creates synthetic auth users on staging.
 * NEVER supports Production.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { buildPopulationPlan, IMPORT_UNIT_ID, CAMPAIGN_NUMBER, CAMPAIGN_NAME, PLAN_VERSION } from "./lib/import-consolidado-plan.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const reviewedPath = resolve(repoRoot, "supabase/staging/import/sexto-consolidado-reviewed.json");
const overridesPath = resolve(repoRoot, "supabase/staging/import/sexto-consolidado-population-overrides.json");
const configPath = resolve(repoRoot, "supabase/config.toml");

const STAGING_PROJECT_ID = "iyxidhglyqkzoziyewlc";

// ─── CLI ────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const tIdx = args.indexOf("--target");
  const target = tIdx !== -1 ? args[tIdx + 1] : "local";
  const modes = ["--dry-run", "--apply", "--verify"].filter((m) => args.includes(m));
  if (!["local", "staging"].includes(target)) throw new Error("Usage: --target=local|staging --dry-run|--apply|--verify");
  if (modes.length !== 1) throw new Error("Choose exactly one: --dry-run, --apply, or --verify.");
  if (target === "staging" && modes[0] === "--apply") throw new Error("Staging apply is not supported by this script. Use staging-specific operator flow.");
  return { target, mode: modes[0] };
}

// ─── DB helpers ─────────────────────────────────────────────────────────────

function getLocalContainer() {
  const cfg = readFileSync(configPath, "utf8");
  const m = cfg.match(/^project_id\s*=\s*"([a-zA-Z0-9_-]+)"\s*$/mu);
  if (!m) throw new Error("supabase/config.toml has no safe project_id.");
  return `supabase_db_${m[1]}`;
}

function docker(args, opts = {}) {
  const r = spawnSync("docker", args, { cwd: repoRoot, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, ...opts });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || `docker exit ${r.status}`).trim());
  return r.stdout;
}

function assertDB(c) {
  const ok = docker(["inspect", "--format={{.State.Running}}", c]).trim();
  if (ok !== "true") throw new Error(`Container not running: ${c}`);
}

function psqlDocker(container, sql) {
  return docker(["exec", "-i", container, "psql", "--username=postgres", "--dbname=postgres", "--quiet", "--no-align", "--tuples-only", "--set=ON_ERROR_STOP=1"], { input: sql });
}

function getTargetIdentity(target) {
  if (target === "local") {
    const container = getLocalContainer();
    return { kind: "local", container, label: `local Docker container: ${container}` };
  }
  // staging
  return {
    kind: "staging",
    project_id: STAGING_PROJECT_ID,
    label: `hosted Supabase project: ${STAGING_PROJECT_ID}`,
  };
}

function assertTargetSafety(target, identity) {
  console.log(`[4J4B] TARGET: ${identity.label}`);
  if (identity.kind === "staging") {
    console.log("[4J4B] WARNING: Staging target selected. Verify operations only. Apply not supported by this script.");
  }
}

// ─── SQL builders ──────────────────────────────────────────────────────────

function buildApplySQL_local(plan) {
  const L = [];
  L.push("BEGIN;\n");

  // Categories — natural identity: Import BU + kind + slug
  L.push("INSERT INTO public.categories (business_unit_id, kind, name, slug, publication_status) VALUES");
  L.push(`  ('${IMPORT_UNIT_ID}', 'import_category', 'Designer', 'import-designer', 'draft'),`);
  L.push(`  ('${IMPORT_UNIT_ID}', 'import_category', 'Niche', 'import-niche', 'draft'),`);
  L.push(`  ('${IMPORT_UNIT_ID}', 'import_category', 'Arabic', 'import-arabic', 'draft')`);
  L.push("ON CONFLICT DO NOTHING;\n");

  // Campaign #6 — resolve by Import BU + number
  // FAIL-CLOSED: if exists, verify expected state
  L.push("-- Campaign #6: create if absent, verify if exists");
  L.push(`DO $camp$`);
  L.push(`DECLARE v_camp RECORD;`);
  L.push(`BEGIN`);
  L.push(`  SELECT * INTO v_camp FROM public.campaigns WHERE business_unit_id = '${IMPORT_UNIT_ID}' AND number = ${CAMPAIGN_NUMBER};`);
  L.push(`  IF v_camp.id IS NULL THEN`);
  L.push(`    INSERT INTO public.campaigns (business_unit_id, number, name, status) VALUES ('${IMPORT_UNIT_ID}', ${CAMPAIGN_NUMBER}, '${CAMPAIGN_NAME}', 'draft');`);
  L.push(`  ELSE`);
  L.push(`    IF v_camp.name != '${CAMPAIGN_NAME}' THEN RAISE EXCEPTION 'campaign #6 name drift: expected %, got %', '${CAMPAIGN_NAME}', v_camp.name; END IF;`);
  L.push(`    IF v_camp.status != 'draft' THEN RAISE EXCEPTION 'campaign #6 status drift: expected draft, got %', v_camp.status; END IF;`);
  L.push(`  END IF;`);
  L.push(`END $camp$;\n`);

  // Products — resolve by Import BU + slug (legacy_id = canonical_id)
  L.push("-- Products: create or verify");
  for (const p of plan.products) {
    L.push(`DO $prod$`);
    L.push(`DECLARE v_prod RECORD;`);
    L.push(`BEGIN`);
    L.push(`  SELECT * INTO v_prod FROM public.products WHERE business_unit_id = '${IMPORT_UNIT_ID}' AND slug = '${p.slug}';`);
    L.push(`  IF v_prod.id IS NULL THEN`);
    L.push(`    INSERT INTO public.products (business_unit_id, legacy_id, slug, name, brand, sales_mode, publication_status, verification_status) VALUES ('${IMPORT_UNIT_ID}', '${p.canonical_id}', '${p.slug}', ${esc(p.name)}, ${esc(p.brand)}, 'campaign', 'draft', 'official_pdf');`);
    L.push(`  ELSE`);
    L.push(`    IF v_prod.name != ${esc(p.name)} THEN RAISE EXCEPTION 'product % name drift: expected %, got %', '${p.slug}', ${esc(p.name)}, v_prod.name; END IF;`);
    L.push(`    IF v_prod.brand IS DISTINCT FROM ${esc(p.brand)} THEN RAISE EXCEPTION 'product % brand drift: expected %, got %', '${p.slug}', ${esc(p.brand)}, v_prod.brand; END IF;`);
    L.push(`  END IF;`);
    L.push(`END $prod$;\n`);
  }

  // Categories link
  L.push("-- Product categories");
  for (const p of plan.products) {
    const catSlug = p.import_segment === "designer" ? "import-designer" : p.import_segment === "niche" ? "import-niche" : "import-arabic";
    L.push(`INSERT INTO public.product_categories (product_id, category_id, sort_order) SELECT p.id, c.id, 0 FROM public.products p, public.categories c WHERE p.business_unit_id = '${IMPORT_UNIT_ID}' AND p.slug = '${p.slug}' AND c.business_unit_id = '${IMPORT_UNIT_ID}' AND c.slug = '${catSlug}' ON CONFLICT DO NOTHING;`);
  }
  L.push("");

  // Presentations — resolve by product DB id + stable_key
  L.push("-- Presentations: create or verify");
  for (const pr of plan.presentations) {
    const cap = pr.capacity_ml != null ? `'${pr.capacity_ml}'` : "NULL";
    L.push(`DO $pres$`);
    L.push(`DECLARE v_pres RECORD; v_prod_id uuid;`);
    L.push(`BEGIN`);
    L.push(`  SELECT p.id INTO v_prod_id FROM public.products p WHERE p.business_unit_id = '${IMPORT_UNIT_ID}' AND p.slug = '${pr.product_slug}';`);
    L.push(`  IF v_prod_id IS NULL THEN RAISE EXCEPTION 'presentation product not found: %', '${pr.product_slug}'; END IF;`);
    L.push(`  SELECT * INTO v_pres FROM public.import_presentations WHERE product_id = v_prod_id AND stable_key = '${pr.stable_key}';`);
    L.push(`  IF v_pres.id IS NULL THEN`);
    L.push(`    INSERT INTO public.import_presentations (product_id, stable_key, label, presentation_class, capacity_ml, publication_status) VALUES (v_prod_id, '${pr.stable_key}', ${esc(pr.label)}, '${pr.presentation_class}', ${cap}, 'draft');`);
    L.push(`  ELSE`);
    L.push(`    IF v_pres.label != ${esc(pr.label)} THEN RAISE EXCEPTION 'presentation % label drift: expected %, got %', '${pr.stable_key}', ${esc(pr.label)}, v_pres.label; END IF;`);
    L.push(`  END IF;`);
    L.push(`END $pres$;\n`);
  }

  // Campaign products via RPC
  // Setup auth user + admin membership as postgres (bypasses RLS), then switch role for RPC
  L.push("-- Campaign products via RPC");
  // Ensure auth user exists for JWT sub (idempotent)
  L.push("INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)");
  L.push("SELECT '89000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'loader@test.local', '', now(), now()");
  L.push("WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE id = '89000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa');\n");

  // Ensure admin membership for Import BU (idempotent)
  L.push("INSERT INTO public.admin_memberships (user_id, business_unit_id, role, is_active)");
  L.push(`SELECT '89000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '${IMPORT_UNIT_ID}', 'admin', true`);
  L.push(`WHERE NOT EXISTS (SELECT 1 FROM public.admin_memberships WHERE user_id = '89000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa' AND business_unit_id = '${IMPORT_UNIT_ID}');\n`);

  // Switch role for RPC call
  L.push("SET LOCAL role authenticated;");
  L.push(`SET LOCAL request.jwt.claims to '{"sub":"89000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';\n`);

  L.push("CREATE TEMPORARY TABLE _cp_items (");
  L.push("  idx int PRIMARY KEY,");
  L.push("  product_slug text NOT NULL,");
  L.push("  pres_stable_key text NOT NULL,");
  L.push("  price_amount text NOT NULL,");
  L.push("  availability_status text NOT NULL");
  L.push(") ON COMMIT DROP;\n");

  const batchSize = 200;
  for (let start = 0; start < plan.offers.length; start += batchSize) {
    const batch = plan.offers.slice(start, start + batchSize);
    const values = batch.map((o, i) => `(${start + i}, '${o.product_slug}', '${o.pres_stable_key}', ${esc(o.price_amount)}, '${o.availability_status}')`).join(",");
    L.push(`INSERT INTO _cp_items VALUES ${values};`);
  }
  L.push("");

  L.push("SELECT public.admin_set_campaign_products(");
  L.push(`  (SELECT id FROM public.campaigns WHERE business_unit_id = '${IMPORT_UNIT_ID}' AND number = ${CAMPAIGN_NUMBER}),`);
  L.push(`  (SELECT updated_at FROM public.campaigns WHERE business_unit_id = '${IMPORT_UNIT_ID}' AND number = ${CAMPAIGN_NUMBER}),`);
  L.push("  (SELECT coalesce(jsonb_agg(jsonb_build_object(");
  L.push("    'product_id', p.id,");
  L.push("    'import_presentation_id', ip.id,");
  L.push("    'price_amount', t.price_amount::numeric,");
  L.push("    'availability_status', t.availability_status,");
  L.push("    'sort_order', t.idx");
  L.push("  ) ORDER BY t.idx), '[]'::jsonb)");
  L.push("  FROM _cp_items t");
  L.push(`  JOIN public.products p ON p.business_unit_id = '${IMPORT_UNIT_ID}' AND p.slug = t.product_slug`);
  L.push("  JOIN public.import_presentations ip ON ip.product_id = p.id AND ip.stable_key = t.pres_stable_key");
  L.push("));\n");

  L.push("RESET role;\nCOMMIT;");
  return L.join("\n");
}

function buildVerifySQL_local(plan) {
  // Plan-scoped verification — only checks rows belonging to this population
  const slugs = plan.products.map((p) => `'${p.slug}'`).join(",");
  const presKeys = plan.presentations.map((p) => `'${p.stable_key}'`).join(",");

  return `SELECT json_build_object(
  'plan_products_exist', (SELECT count(*)::int FROM public.products WHERE business_unit_id = '${IMPORT_UNIT_ID}' AND slug IN (${slugs})),
  'plan_products_total', ${plan.products.length},
  'plan_presentations_exist', (SELECT count(*)::int FROM public.import_presentations ip JOIN public.products p ON ip.product_id = p.id WHERE p.business_unit_id = '${IMPORT_UNIT_ID}' AND p.slug IN (${slugs}) AND ip.stable_key IN (${presKeys})),
  'plan_presentations_total', ${plan.presentations.length},
  'campaign_6_exists', (SELECT count(*)::int FROM public.campaigns WHERE business_unit_id = '${IMPORT_UNIT_ID}' AND number = ${CAMPAIGN_NUMBER}),
  'campaign_6_status', (SELECT status FROM public.campaigns WHERE business_unit_id = '${IMPORT_UNIT_ID}' AND number = ${CAMPAIGN_NUMBER}),
  'plan_offers_exist', (SELECT count(*)::int FROM public.campaign_products cp JOIN public.campaigns c ON cp.campaign_id = c.id WHERE c.business_unit_id = '${IMPORT_UNIT_ID}' AND c.number = ${CAMPAIGN_NUMBER}),
  'plan_offers_total', ${plan.offers.length},
  'null_price', (SELECT count(*)::int FROM public.campaign_products cp JOIN public.campaigns c ON cp.campaign_id = c.id WHERE c.business_unit_id = '${IMPORT_UNIT_ID}' AND c.number = ${CAMPAIGN_NUMBER} AND cp.price_amount IS NULL),
  'null_presentation', (SELECT count(*)::int FROM public.campaign_products cp JOIN public.campaigns c ON cp.campaign_id = c.id WHERE c.business_unit_id = '${IMPORT_UNIT_ID}' AND c.number = ${CAMPAIGN_NUMBER} AND cp.import_presentation_id IS NULL),
  'null_quantity_limit', (SELECT count(*)::int FROM public.campaign_products cp JOIN public.campaigns c ON cp.campaign_id = c.id WHERE c.business_unit_id = '${IMPORT_UNIT_ID}' AND c.number = ${CAMPAIGN_NUMBER} AND cp.quantity_limit IS NULL),
  'null_variant', (SELECT count(*)::int FROM public.campaign_products cp JOIN public.campaigns c ON cp.campaign_id = c.id WHERE c.business_unit_id = '${IMPORT_UNIT_ID}' AND c.number = ${CAMPAIGN_NUMBER} AND cp.product_variant_id IS NOT NULL),
  'all_draft_products', (SELECT count(*)::int FROM public.products WHERE business_unit_id = '${IMPORT_UNIT_ID}' AND slug IN (${slugs}) AND publication_status != 'draft'),
  'all_draft_presentations', (SELECT count(*)::int FROM public.import_presentations ip JOIN public.products p ON ip.product_id = p.id WHERE p.business_unit_id = '${IMPORT_UNIT_ID}' AND p.slug IN (${slugs}) AND ip.stable_key IN (${presKeys}) AND ip.publication_status != 'draft'),
  'avail', (SELECT jsonb_object_agg(availability_status, cnt) FROM (SELECT cp.availability_status, count(*)::int cnt FROM public.campaign_products cp JOIN public.campaigns c ON cp.campaign_id = c.id WHERE c.business_unit_id = '${IMPORT_UNIT_ID}' AND c.number = ${CAMPAIGN_NUMBER} GROUP BY cp.availability_status) s),
  'vanilla_freak_product', (SELECT count(*)::int FROM public.products WHERE business_unit_id = '${IMPORT_UNIT_ID}' AND slug LIKE '%vanilla-freak%'),
  'vanilla_freak_offer', (SELECT count(*)::int FROM public.campaign_products cp JOIN public.products p ON cp.product_id = p.id WHERE p.slug LIKE '%vanilla-freak%'),
  'cdn_preciux_iv_product', (SELECT count(*)::int FROM public.products WHERE business_unit_id = '${IMPORT_UNIT_ID}' AND slug LIKE '%cdn-preciux-iv%'),
  'cdn_preciux_iv_offer', (SELECT count(*)::int FROM public.campaign_products cp JOIN public.products p ON cp.product_id = p.id WHERE p.slug LIKE '%cdn-preciux-iv%')
)::text;`;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function esc(s) {
  return s === null || s === undefined ? "NULL" : `'${String(s).replace(/'/g, "''")}'`;
}

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const { target, mode } = parseArgs(process.argv);
  const identity = getTargetIdentity(target);

  console.log(`[4J4B] Plan version: ${PLAN_VERSION}`);
  console.log(`[4J4B] Target: ${identity.label}`);
  console.log(`[4J4B] Mode: ${mode}`);

  assertTargetSafety(target, identity);

  const reviewedRaw = await readFile(reviewedPath, "utf8");
  const overridesRaw = await readFile(overridesPath, "utf8");
  const reviewed = JSON.parse(reviewedRaw);
  const overrides = JSON.parse(overridesRaw);
  reviewed._sha256 = sha256(reviewedRaw);
  overrides._sha256 = sha256(overridesRaw);

  const plan = buildPopulationPlan(reviewed, overrides);

  // Attach product_slug to presentations for SQL generation
  const productSlugMap = new Map(plan.products.map((p) => [p.canonical_id, p.slug]));
  for (const pr of plan.presentations) {
    pr.product_slug = productSlugMap.get(pr.product_canonical_id);
  }
  // Attach product_slug to offers for SQL generation
  for (const o of plan.offers) {
    o.product_slug = productSlugMap.get(o.product_canonical_id);
  }

  console.log(`[4J4B] Plan: ${plan.stats.products} products, ${plan.stats.structural_presentations} presentations, ${plan.stats.priced_offers} offers`);
  console.log(`  skipped (no price): ${plan.stats.skipped_no_price}`);
  console.log(`  skipped (conflict): ${plan.stats.skipped_conflict}`);
  console.log(`  conflicts: ${plan.stats.conflicts}`);

  if (plan.stats.conflicts > 0) {
    console.log(`\n[4J4B] BLOCKED: ${plan.stats.conflicts} unresolved conflicts.`);
    process.exit(1);
  }

  if (mode === "--dry-run") {
    console.log(`[4J4B] Dry run complete. No database changes.`);
    return;
  }

  if (target === "staging") {
    console.log(`[4J4B] Staging verify: connect to ${identity.label} and run verify SQL.`);
    console.log(`[4J4B] Use: npx supabase db push --dry-run for schema-only check.`);
    return;
  }

  // Local operations
  const container = identity.container;
  assertDB(container);

  if (mode === "--verify") {
    console.log(`[4J4B] Verify:\n${psqlDocker(container, buildVerifySQL_local(plan))}`);
    return;
  }

  // --apply (local only)
  console.log(`[4J4B] Applying to local...`);
  psqlDocker(container, buildApplySQL_local(plan));
  console.log(`[4J4B] Apply complete.`);
  console.log(`[4J4B] Post-apply verify:\n${psqlDocker(container, buildVerifySQL_local(plan))}`);
}

main().catch((err) => {
  console.error(`[4J4B] FATAL: ${err.message}`);
  process.exit(1);
});
