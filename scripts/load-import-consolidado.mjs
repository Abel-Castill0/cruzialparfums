/**
 * Cruzial Platform V2 — Deterministic Sexto Consolidado population loader.
 *
 * Reads the reviewed artifact and populates Import products, presentations,
 * campaign #6, and campaign_products into the target Supabase database.
 *
 * Usage:
 *   node scripts/load-import-consolidado.mjs --target local --dry-run
 *   node scripts/load-import-consolidado.mjs --target local --apply
 *   node scripts/load-import-consolidado.mjs --target local --verify
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const reviewedPath = resolve(repositoryRoot, "supabase/staging/import/sexto-consolidado-reviewed.json");
const configPath = resolve(repositoryRoot, "supabase/config.toml");

const IMPORT_UNIT_ID = "22222222-2222-4222-8222-222222222222";
const CAMPAIGN_NUMBER = 6;
const CAMPAIGN_NAME = "Sexto Consolidado";
const CAMPAIGN_ID = "aa400000-0000-4000-8000-000000000006";

const PRESENTATION_CLASS_MAP = Object.freeze({
  A_SINGLE_FIXED_PRESENTATION: "single_fixed",
  B_MULTI_PRESENTATION: "multi_presentation",
  C_PACK_SET: "pack_set",
  D_PRESENTATION_AMBIGUOUS: "ambiguous",
});

const CATEGORY_IDS = Object.freeze({
  designer: "aa300000-0000-4000-8000-000000000001",
  niche: "aa300000-0000-4000-8000-000000000002",
  arabic: "aa300000-0000-4000-8000-000000000003",
});

// ─── CLI ────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const targetIdx = args.indexOf("--target");
  const target = targetIdx !== -1 ? args[targetIdx + 1] : "local";
  const modes = ["--dry-run", "--apply", "--verify"].filter((m) => args.includes(m));
  if (!["local", "staging"].includes(target)) throw new Error("Usage: --target=local|staging --dry-run|--apply|--verify");
  if (modes.length !== 1) throw new Error("Choose exactly one: --dry-run, --apply, or --verify.");
  return { target, mode: modes[0] };
}

// ─── Database ───────────────────────────────────────────────────────────────

function getContainer() {
  const config = readFileSync(configPath, "utf8");
  const match = config.match(/^project_id\s*=\s*"([a-zA-Z0-9_-]+)"\s*$/mu);
  if (!match) throw new Error("supabase/config.toml has no safe local project_id.");
  return `supabase_db_${match[1]}`;
}

function runDocker(args, options = {}) {
  const result = spawnSync("docker", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `docker exited ${result.status}`).trim());
  }
  return result.stdout;
}

function assertLocalDatabase(container) {
  const running = runDocker(["inspect", "--format={{.State.Running}}", container]).trim();
  if (running !== "true") throw new Error(`Container not running: ${container}`);
}

function psql(container, sql) {
  return runDocker([
    "exec", "-i", container,
    "psql", "--username=postgres", "--dbname=postgres",
    "--quiet", "--no-align", "--tuples-only", "--set=ON_ERROR_STOP=1",
  ], { input: sql });
}

// ─── Identity ───────────────────────────────────────────────────────────────

function slugFromCanonical(canonicalId, canonicalName) {
  const base = canonicalName
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
  const hash = createHash("sha256").update(canonicalId).digest("hex").slice(0, 8);
  return `import-${base}-${hash}`;
}

function presKey(canonicalProductId, rawLabel) {
  const label = (rawLabel || "default").toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
  const hash = createHash("sha256").update(`${canonicalProductId}:${rawLabel}`).digest("hex").slice(0, 8);
  return `pres-${label}-${hash}`;
}

function slugToUuid(slug) {
  const h = createHash("sha256").update(slug).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function esc(s) {
  if (s === null || s === undefined) return "NULL";
  return `'${String(s).replace(/'/g, "''")}'`;
}

// ─── Plan ───────────────────────────────────────────────────────────────────

function buildPlan(reviewed) {
  const plan = {
    products: [],
    presentations: [],
    offers: [],
    skipped: [],
    conflicts: [],
    stats: {},
  };

  const productMap = new Map();
  for (const p of reviewed.canonical_products) {
    const slug = slugFromCanonical(p.canonical_product_id, p.canonical_name);
    const product = {
      canonical_id: p.canonical_product_id,
      uuid: slugToUuid(slug),
      slug,
      name: p.canonical_name,
      brand: p.brand?.value || null,
      import_segment: p.import_segment?.value || null,
      presentation_class: PRESENTATION_CLASS_MAP[p.presentation_class] || "ambiguous",
    };
    plan.products.push(product);
    productMap.set(p.canonical_product_id, product);
  }

  // Presentations from offers
  const presSeen = new Map();
  for (const o of reviewed.canonical_offers) {
    const rawLabel = o.presentation?.raw_label || "default";
    const pid = o.canonical_product_id;
    const key = `${pid}|${rawLabel}`;
    if (presSeen.has(key)) continue;
    const prod = productMap.get(pid);
    const sk = presKey(pid, rawLabel);
    presSeen.set(key, {
      canonical_product_id: pid,
      product_uuid: prod.uuid,
      stable_key: sk,
      label: rawLabel,
      presentation_class: prod.presentation_class,
      capacity_ml: o.presentation?.size_ml_candidate || null,
    });
  }
  plan.presentations = [...presSeen.values()];

  // Offers with conflict detection
  const identityMap = new Map();
  for (const o of reviewed.canonical_offers) {
    const rawLabel = o.presentation?.raw_label || "default";
    const idKey = `${o.canonical_product_id}|${rawLabel}`;
    if (!identityMap.has(idKey)) identityMap.set(idKey, []);
    identityMap.get(idKey).push(o);
  }

  const conflictingKeys = new Set();
  for (const [idKey, entries] of identityMap) {
    const prices = [...new Set(entries.map((e) => e.price?.amount).filter(Boolean))];
    if (entries.length > 1 && prices.length > 1) {
      conflictingKeys.add(idKey);
      plan.conflicts.push({
        key: idKey,
        offers: entries.map((e) => ({
          id: e.canonical_offer_id,
          price: e.price?.amount,
          source: e.source_record_id,
        })),
      });
    }
  }

  const deduped = new Map();
  for (const o of reviewed.canonical_offers) {
    const rawLabel = o.presentation?.raw_label || "default";
    const idKey = `${o.canonical_product_id}|${rawLabel}`;
    if (conflictingKeys.has(idKey)) continue;

    const price = o.price?.amount;
    if (!price || price === "") {
      plan.skipped.push({ id: o.canonical_offer_id, reason: "no_price", product: o.canonical_product_id });
      continue;
    }

    const dedupKey = `${idKey}|${price}`;
    if (deduped.has(dedupKey)) {
      deduped.get(dedupKey).source_records.push(o.source_record_id);
      continue;
    }

    let avail = "unconfirmed";
    if (o.availability_candidate === "OUT_OF_STOCK") avail = "out_of_stock";
    else if (o.availability_candidate === "available") avail = "available";

    const prod = productMap.get(o.canonical_product_id);
    deduped.set(dedupKey, {
      product_uuid: prod.uuid,
      pres_stable_key: presKey(o.canonical_product_id, rawLabel),
      price_amount: price,
      availability_status: avail,
      source_records: [o.source_record_id],
    });
  }
  plan.offers = [...deduped.values()];

  plan.stats = {
    source_occurrences: reviewed.counts.source_occurrences,
    products: plan.products.length,
    presentations: plan.presentations.length,
    offers: plan.offers.length,
    skipped_no_price: plan.skipped.length,
    conflicting_groups: plan.conflicts.length,
    conflicting_offers: plan.conflicts.reduce((s, c) => s + c.offers.length, 0),
  };

  return plan;
}

// ─── Apply SQL ──────────────────────────────────────────────────────────────

function buildApplySQL(plan) {
  const L = [];
  L.push("BEGIN;");
  L.push("");

  // Auth user for assert_admin_for
  L.push("INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)");
  L.push("VALUES ('89000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'import-admin-4j4b@example.test', '', now(), now()) ON CONFLICT DO NOTHING;");
  L.push("INSERT INTO public.admin_memberships (user_id, business_unit_id, role) VALUES ('89000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '${IMPORT_UNIT_ID}', 'admin') ON CONFLICT DO NOTHING;");
  L.push("");

  // Categories
  L.push("INSERT INTO public.categories (id, business_unit_id, kind, name, slug, publication_status) VALUES");
  L.push(`  ('${CATEGORY_IDS.designer}', '${IMPORT_UNIT_ID}', 'import_category', 'Designer', 'import-designer', 'draft'),`);
  L.push(`  ('${CATEGORY_IDS.niche}', '${IMPORT_UNIT_ID}', 'import_category', 'Niche', 'import-niche', 'draft'),`);
  L.push(`  ('${CATEGORY_IDS.arabic}', '${IMPORT_UNIT_ID}', 'import_category', 'Arabic', 'import-arabic', 'draft')`);
  L.push("ON CONFLICT DO NOTHING;");
  L.push("");

  // Campaign
  L.push(`INSERT INTO public.campaigns (id, business_unit_id, number, name, status) VALUES ('${CAMPAIGN_ID}', '${IMPORT_UNIT_ID}', ${CAMPAIGN_NUMBER}, ${esc(CAMPAIGN_NAME)}, 'draft') ON CONFLICT (business_unit_id, number) DO UPDATE SET name = EXCLUDED.name;`);
  L.push("");

  // Products
  L.push("-- Products");
  for (const p of plan.products) {
    const catId = p.import_segment === "designer" ? CATEGORY_IDS.designer
      : p.import_segment === "niche" ? CATEGORY_IDS.niche
      : CATEGORY_IDS.arabic;
    L.push(`INSERT INTO public.products (id, business_unit_id, legacy_id, slug, name, brand, sales_mode, publication_status, verification_status) VALUES ('${p.uuid}', '${IMPORT_UNIT_ID}', ${esc(p.canonical_id)}, ${esc(p.slug)}, ${esc(p.name)}, ${esc(p.brand)}, 'campaign', 'draft', 'official_pdf') ON CONFLICT (business_unit_id, slug) DO UPDATE SET name = EXCLUDED.name, brand = EXCLUDED.brand;`);
    L.push(`INSERT INTO public.product_categories (product_id, category_id, sort_order) VALUES ('${p.uuid}', '${catId}', 0) ON CONFLICT DO NOTHING;`);
  }
  L.push("");

  // Presentations
  L.push("-- Presentations");
  for (const pres of plan.presentations) {
    const cap = pres.capacity_ml ? String(pres.capacity_ml) : "NULL";
    L.push(`INSERT INTO public.import_presentations (product_id, stable_key, label, presentation_class, capacity_ml, publication_status) VALUES ('${pres.product_uuid}', ${esc(pres.stable_key)}, ${esc(pres.label)}, ${esc(pres.presentation_class)}, ${cap}, 'draft') ON CONFLICT (product_id, stable_key) DO NOTHING;`);
  }
  L.push("");

  // Campaign offers via direct insert (as postgres, bypasses RLS)
  L.push("-- Campaign offers");
  L.push("SET LOCAL request.jwt.claims to '{\"sub\":\"89000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa\",\"role\":\"authenticated\"}';");
  L.push("SET LOCAL role authenticated;");
  L.push("");

  for (let i = 0; i < plan.offers.length; i++) {
    const o = plan.offers[i];
    L.push(`INSERT INTO public.campaign_products (campaign_id, product_id, import_presentation_id, price_amount, currency, availability_status, quantity_limit, sort_order) VALUES ('${CAMPAIGN_ID}', '${o.product_uuid}', (SELECT id FROM public.import_presentations WHERE product_id = '${o.product_uuid}' AND stable_key = ${esc(o.pres_stable_key)}), ${esc(o.price_amount)}, 'PEN', ${esc(o.availability_status)}, NULL, ${i}) ON CONFLICT DO NOTHING;`);
  }
  L.push("");
  L.push("RESET role;");
  L.push("COMMIT;");
  return L.join("\n");
}

// ─── Verify SQL ─────────────────────────────────────────────────────────────

function verifySQL() {
  return `SELECT json_build_object(
  'import_products', (SELECT count(*)::int FROM public.products WHERE business_unit_id = '${IMPORT_UNIT_ID}' AND slug LIKE 'import-%'),
  'import_presentations', (SELECT count(*)::int FROM public.import_presentations),
  'campaign_6_exists', (SELECT count(*)::int FROM public.campaigns WHERE id = '${CAMPAIGN_ID}'),
  'campaign_6_status', (SELECT status FROM public.campaigns WHERE id = '${CAMPAIGN_ID}'),
  'campaign_products', (SELECT count(*)::int FROM public.campaign_products WHERE campaign_id = '${CAMPAIGN_ID}'),
  'null_price', (SELECT count(*)::int FROM public.campaign_products WHERE campaign_id = '${CAMPAIGN_ID}' AND price_amount IS NULL),
  'null_presentation', (SELECT count(*)::int FROM public.campaign_products WHERE campaign_id = '${CAMPAIGN_ID}' AND import_presentation_id IS NULL),
  'null_quantity_limit', (SELECT count(*)::int FROM public.campaign_products WHERE campaign_id = '${CAMPAIGN_ID}' AND quantity_limit IS NULL),
  'avail', (SELECT jsonb_object_agg(availability_status, cnt) FROM (SELECT availability_status, count(*)::int cnt FROM public.campaign_products WHERE campaign_id = '${CAMPAIGN_ID}' GROUP BY availability_status) s)
)::text;`;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const { target, mode } = parseArgs(process.argv);
  console.log(`[4J4B] target=${target} mode=${mode}`);

  const reviewed = JSON.parse(await readFile(reviewedPath, "utf8"));
  const plan = buildPlan(reviewed);

  console.log(`[4J4B] Plan: ${plan.stats.products} products, ${plan.stats.presentations} presentations, ${plan.stats.offers} offers, ${plan.stats.skipped_no_price} skipped (no price), ${plan.stats.conflicting_groups} conflict groups`);

  if (plan.conflicts.length > 0) {
    console.log(`\n[4J4B] CONFLICTS:`);
    for (const c of plan.conflicts) {
      console.log(`  ${c.key}:`);
      for (const o of c.offers) console.log(`    ${o.id}: S/${o.price} (${o.source})`);
    }
  }

  if (mode === "--dry-run") {
    if (plan.conflicts.length > 0) {
      console.log(`\n[4J4B] BLOCKED: ${plan.conflicts.length} conflicting groups must resolve before apply.`);
      process.exit(1);
    }
    console.log(`[4J4B] Dry run complete. No database changes.`);
    return;
  }

  if (mode === "--verify") {
    const container = getContainer();
    assertLocalDatabase(container);
    const result = psql(container, verifySQL());
    console.log(`[4J4B] Verify:\n${result}`);
    return;
  }

  // --apply
  if (plan.conflicts.length > 0) {
    console.log(`\n[4J4B] BLOCKED: ${plan.conflicts.length} conflicting groups must resolve before apply.`);
    process.exit(1);
  }

  const container = getContainer();
  assertLocalDatabase(container);
  const sql = buildApplySQL(plan);
  console.log(`[4J4B] Applying...`);
  psql(container, sql);
  console.log(`[4J4B] Apply complete.`);

  // Auto-verify
  const result = psql(container, verifySQL());
  console.log(`[4J4B] Post-apply verify:\n${result}`);
}

main().catch((err) => {
  console.error(`[4J4B] FATAL: ${err.message}`);
  process.exit(1);
});
