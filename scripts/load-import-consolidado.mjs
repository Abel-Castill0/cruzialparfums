/**
 * Cruzial Platform V2 — Deterministic Sexto Consolidado population loader.
 *
 * Reads sexto-consolidado-reviewed.json + population-overrides.json
 * and populates Import products, presentations, campaign #6, and
 * campaign_products into the target Supabase database.
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

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const reviewedPath = resolve(repoRoot, "supabase/staging/import/sexto-consolidado-reviewed.json");
const overridesPath = resolve(repoRoot, "supabase/staging/import/sexto-consolidado-population-overrides.json");
const configPath = resolve(repoRoot, "supabase/config.toml");

const IMPORT_UNIT_ID = "22222222-2222-4222-8222-222222222222";
const CAMPAIGN_NUMBER = 6;
const CAMPAIGN_NAME = "Sexto Consolidado";
const CAMPAIGN_ID = "aa400000-0000-4000-8000-000000000006";

const PRES_CLASS_MAP = Object.freeze({
  A_SINGLE_FIXED_PRESENTATION: "single_fixed",
  B_MULTI_PRESENTATION: "multi_presentation",
  C_PACK_SET: "pack_set",
  D_PRESENTATION_AMBIGUOUS: "ambiguous",
});

const CAT_IDS = Object.freeze({
  designer: "aa300000-0000-4000-8000-000000000001",
  niche: "aa300000-0000-4000-8000-000000000002",
  arabic: "aa300000-0000-4000-8000-000000000003",
});

// ─── CLI ────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const tIdx = args.indexOf("--target");
  const target = tIdx !== -1 ? args[tIdx + 1] : "local";
  const modes = ["--dry-run", "--apply", "--verify"].filter((m) => args.includes(m));
  if (!["local", "staging"].includes(target)) throw new Error("Usage: --target=local|staging --dry-run|--apply|--verify");
  if (modes.length !== 1) throw new Error("Choose exactly one: --dry-run, --apply, or --verify.");
  return { target, mode: modes[0] };
}

// ─── DB helpers ─────────────────────────────────────────────────────────────

function getContainer() {
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

function psql(c, sql) {
  return docker(["exec", "-i", c, "psql", "--username=postgres", "--dbname=postgres", "--quiet", "--no-align", "--tuples-only", "--set=ON_ERROR_STOP=1"], { input: sql });
}

// ─── Identity ───────────────────────────────────────────────────────────────

function slug(name, id) {
  const base = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/gu, "").replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
  const h = createHash("sha256").update(id).digest("hex").slice(0, 8);
  return `import-${base}-${h}`;
}

function uuid(slugVal) {
  const h = createHash("sha256").update(slugVal).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function pkey(pid, label) {
  const l = (label || "default").toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
  const h = createHash("sha256").update(`${pid}:${label}`).digest("hex").slice(0, 8);
  return `pres-${l}-${h}`;
}

function esc(s) {
  return s === null || s === undefined ? "NULL" : `'${String(s).replace(/'/g, "''")}'`;
}

// ─── Plan builder ───────────────────────────────────────────────────────────

function buildPlan(reviewed, overrides) {
  // Index overrides by affected canonical_product_id
  const splitMap = new Map();    // canonical_product_id → override
  const skipMap = new Map();     // canonical_product_id → override
  const presOverrideMap = new Map(); // canonical_product_id → override
  const reassociateMap = new Map();  // canonical_offer_id → override

  for (const ov of overrides.overrides) {
    if (ov.resolution === "split_canonical_source_identity") {
      splitMap.set(ov.affected_canonical_product_id, ov);
    } else if (ov.resolution === "omit_offer_pending_price_confirmation") {
      skipMap.set(ov.affected_canonical_product_id, ov);
    } else if (ov.resolution === "split_structural_presentations") {
      presOverrideMap.set(ov.affected_canonical_product_id, ov);
    } else if (ov.resolution === "correct_source_block_association") {
      reassociateMap.set(ov.affected_canonical_offer_ids[0], ov);
    }
  }

  const plan = { products: [], presentations: [], offers: [], skipped: [], stats: {} };

  // ── Products ──
  const productMap = new Map();
  for (const p of reviewed.canonical_products) {
    // Skip merged products that have split overrides
    if (splitMap.has(p.canonical_product_id)) continue;

    const s = slug(p.canonical_name, p.canonical_product_id);
    const prod = {
      canonical_id: p.canonical_product_id,
      uuid: uuid(s), slug: s,
      name: p.canonical_name,
      brand: p.brand?.value || null,
      import_segment: p.import_segment?.value || null,
      presentation_class: PRES_CLASS_MAP[p.presentation_class] || "ambiguous",
    };
    plan.products.push(prod);
    productMap.set(p.canonical_product_id, prod);
  }

  // Add split products from overrides + build offer redirect map
  const splitOfferRedirect = new Map(); // canonical_offer_id → new_canonical_product_id
  for (const [mergedId, ov] of splitMap) {
    const origProd = reviewed.canonical_products.find((p) => p.canonical_product_id === mergedId);
    for (const sp of ov.split_products) {
      const s = slug(sp.name, sp.new_canonical_product_id);
      const prod = {
        canonical_id: sp.new_canonical_product_id,
        uuid: uuid(s), slug: s,
        name: sp.name,
        brand: origProd?.brand?.value || null,
        import_segment: origProd?.import_segment?.value || null,
        presentation_class: origProd?.presentation_class
          ? PRES_CLASS_MAP[origProd.presentation_class] || "ambiguous"
          : "ambiguous",
      };
      plan.products.push(prod);
      productMap.set(sp.new_canonical_product_id, prod);
      // Map each offer from the original merged product to its split product
      for (const offer of sp.offers) {
        splitOfferRedirect.set(offer.canonical_offer_id, sp.new_canonical_product_id);
      }
    }
  }

  // ── Offers ──
  // Build a lookup for reassociated offers
  const reassociatedOffers = new Map(); // offer_id → { to_product_id, new_presentation_label, price_amount }

  // Process reassociate overrides: the "from" offer is removed, the "to" product gets a new offer
  for (const [, ov] of reassociateMap) {
    const ra = ov.reassociate_offer;
    reassociatedOffers.set(ra.canonical_offer_id, {
      to_product_id: ra.to_product_id,
      to_product_name: ra.to_product_name,
      new_presentation_label: ra.new_presentation_label,
      price_amount: ra.price_amount,
    });
    // The "from" product keeps its other offers via keep_offers
    // But we need to also add the reassociated offer as a new product+offer
    if (!productMap.has(ra.to_product_id)) {
      const s = slug(ra.to_product_name, ra.to_product_id);
      const origProd = reviewed.canonical_products.find((p) => p.canonical_product_id === ov.affected_canonical_product_id);
      const prod = {
        canonical_id: ra.to_product_id,
        uuid: uuid(s), slug: s,
        name: ra.to_product_name,
        brand: origProd?.brand?.value || null,
        import_segment: origProd?.import_segment?.value || null,
        presentation_class: "single_fixed",
      };
      plan.products.push(prod);
      productMap.set(ra.to_product_id, prod);
    } else if (ra.correct_product_name) {
      productMap.get(ra.to_product_id).name = ra.correct_product_name;
    }
  }

  // Build presentation overrides lookup
  const presOverrideLookup = new Map(); // canonical_offer_id → { label, suffix }
  for (const [, ov] of presOverrideMap) {
    for (const po of ov.presentation_overrides) {
      presOverrideLookup.set(po.canonical_offer_id, {
        label: po.new_presentation_label,
        suffix: po.new_stable_key_suffix,
        price: po.price_amount,
      });
    }
  }

  // Build skip offers lookup (CDN Preciux IV)
  const skipOfferIds = new Set();
  for (const [, ov] of skipMap) {
    for (const oid of ov.affected_canonical_offer_ids) {
      skipOfferIds.add(oid);
    }
  }

  // Process all reviewed offers
  const deduped = new Map(); // dedupKey → offer
  for (const o of reviewed.canonical_offers) {
    const oid = o.canonical_offer_id;
    const rawLabel = o.presentation?.raw_label || "default";

    // Skip offers marked by omit_offer_pending_price_confirmation
    if (skipOfferIds.has(oid)) {
      plan.skipped.push({ id: oid, reason: "conflicting_source_price_pending_confirmation", product: o.canonical_product_id });
      continue;
    }

    // Handle reassociated offers: skip the original, will be added as new product below
    if (reassociatedOffers.has(oid)) continue;

    // Skip if product doesn't exist in our plan (was split and not re-added)
    // Redirect offers from merged products to their split products
    let canonicalProdId = splitOfferRedirect.has(oid) ? splitOfferRedirect.get(oid) : o.canonical_product_id;
    if (!productMap.has(canonicalProdId)) continue;

    const price = o.price?.amount;
    if (!price || price === "") {
      plan.skipped.push({ id: oid, reason: "no_price", product: canonicalProdId });
      continue;
    }

    // Determine final presentation label and key
    let finalLabel = rawLabel;
    let presSuffix = rawLabel;
    let finalPrice = price;
    const pOverride = presOverrideLookup.get(oid);
    if (pOverride) {
      finalLabel = pOverride.label;
      presSuffix = pOverride.suffix;
      if (pOverride.price) finalPrice = pOverride.price;
    }

    const prod = productMap.get(canonicalProdId);
    const pk = pkey(canonicalProdId, presSuffix);
    const dedupKey = `${canonicalProdId}|${pk}|${finalPrice}`;

    if (deduped.has(dedupKey)) {
      deduped.get(dedupKey).source_records.push(o.source_record_id);
      continue;
    }

    let avail = "unconfirmed";
    if (o.availability_candidate === "OUT_OF_STOCK") avail = "out_of_stock";
    else if (o.availability_candidate === "available") avail = "available";

    deduped.set(dedupKey, {
      product_uuid: prod.uuid,
      product_canonical_id: canonicalProdId,
      pres_stable_key: pk,
      pres_label: finalLabel,
      price_amount: finalPrice,
      availability_status: avail,
      source_records: [o.source_record_id],
    });
  }

  // Add reassociated offers as new product+offer
  for (const [oid, ra] of reassociatedOffers) {
    const prod = productMap.get(ra.to_product_id);
    if (!prod) throw new Error(`Reassociated product not found: ${ra.to_product_id}`);
    const pk = pkey(ra.to_product_id, ra.new_presentation_label);
    const dedupKey = `${ra.to_product_id}|${pk}|${ra.price_amount}`;
    if (!deduped.has(dedupKey)) {
      deduped.set(dedupKey, {
        product_uuid: prod.uuid,
        product_canonical_id: ra.to_product_id,
        pres_stable_key: pk,
        pres_label: ra.new_presentation_label,
        price_amount: ra.price_amount,
        availability_status: "unconfirmed",
        source_records: [oid],
      });
    }
  }

  plan.offers = [...deduped.values()];

  // Build presentations from final offers
  const presSeen = new Map();
  for (const o of plan.offers) {
    const key = `${o.product_uuid}|${o.pres_stable_key}`;
    if (presSeen.has(key)) continue;
    presSeen.set(key, {
      product_uuid: o.product_uuid,
      stable_key: o.pres_stable_key,
      label: o.pres_label,
      presentation_class: productMap.get(o.product_canonical_id)?.presentation_class || "single_fixed",
      capacity_ml: extractCapacity(o.pres_label),
    });
  }
  plan.presentations = [...presSeen.values()];

  plan.stats = {
    source_occurrences: reviewed.counts.source_occurrences,
    products: plan.products.length,
    presentations: plan.presentations.length,
    offers: plan.offers.length,
    skipped_no_price: plan.skipped.filter((s) => s.reason === "no_price").length,
    skipped_conflict: plan.skipped.filter((s) => s.reason === "conflicting_source_price_pending_confirmation").length,
    conflicts: 0,
  };

  return plan;
}

function extractCapacity(label) {
  const m = label.match(/(\d+(?:\.\d+)?)\s*ml/i);
  return m ? parseFloat(m[1]) : null;
}

// ─── SQL ────────────────────────────────────────────────────────────────────

function buildApplySQL(plan) {
  const L = [];
  L.push("BEGIN;\n");

  L.push("INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)");
  L.push("VALUES ('89000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'import-admin-4j4b@example.test', '', now(), now()) ON CONFLICT DO NOTHING;\n");

  L.push("INSERT INTO public.admin_memberships (user_id, business_unit_id, role)");
  L.push(`VALUES ('89000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '${IMPORT_UNIT_ID}', 'admin') ON CONFLICT DO NOTHING;\n`);

  L.push("INSERT INTO public.categories (id, business_unit_id, kind, name, slug, publication_status) VALUES");
  L.push(`  ('${CAT_IDS.designer}', '${IMPORT_UNIT_ID}', 'import_category', 'Designer', 'import-designer', 'draft'),`);
  L.push(`  ('${CAT_IDS.niche}', '${IMPORT_UNIT_ID}', 'import_category', 'Niche', 'import-niche', 'draft'),`);
  L.push(`  ('${CAT_IDS.arabic}', '${IMPORT_UNIT_ID}', 'import_category', 'Arabic', 'import-arabic', 'draft')`);
  L.push("ON CONFLICT DO NOTHING;\n");

  L.push(`INSERT INTO public.campaigns (id, business_unit_id, number, name, status) VALUES ('${CAMPAIGN_ID}', '${IMPORT_UNIT_ID}', ${CAMPAIGN_NUMBER}, ${esc(CAMPAIGN_NAME)}, 'draft') ON CONFLICT (business_unit_id, number) DO UPDATE SET name = EXCLUDED.name;\n`);

  L.push("-- Products");
  for (const p of plan.products) {
    const catId = p.import_segment === "designer" ? CAT_IDS.designer : p.import_segment === "niche" ? CAT_IDS.niche : CAT_IDS.arabic;
    L.push(`INSERT INTO public.products (id, business_unit_id, legacy_id, slug, name, brand, sales_mode, publication_status, verification_status) VALUES ('${p.uuid}', '${IMPORT_UNIT_ID}', ${esc(p.canonical_id)}, ${esc(p.slug)}, ${esc(p.name)}, ${esc(p.brand)}, 'campaign', 'draft', 'official_pdf') ON CONFLICT (business_unit_id, slug) DO UPDATE SET name = EXCLUDED.name, brand = EXCLUDED.brand;`);
    L.push(`INSERT INTO public.product_categories (product_id, category_id, sort_order) VALUES ('${p.uuid}', '${catId}', 0) ON CONFLICT DO NOTHING;`);
  }
  L.push("");

  L.push("-- Presentations");
  for (const pr of plan.presentations) {
    const cap = pr.capacity_ml ? String(pr.capacity_ml) : "NULL";
    L.push(`INSERT INTO public.import_presentations (product_id, stable_key, label, presentation_class, capacity_ml, publication_status) VALUES ('${pr.product_uuid}', ${esc(pr.stable_key)}, ${esc(pr.label)}, ${esc(pr.presentation_class)}, ${cap}, 'draft') ON CONFLICT (product_id, stable_key) DO NOTHING;`);
  }
  L.push("");

  // Use RPC admin_set_campaign_products to populate campaign products
  // Set role to authenticated with admin JWT claims
  L.push("SET LOCAL role authenticated;");
  L.push(`SET LOCAL request.jwt.claims to '{"sub":"89000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';\n`);

  // Use a temp table to stage items, then resolve presentation IDs and call RPC
  L.push("CREATE TEMPORARY TABLE _cp_items (");
  L.push("  idx int PRIMARY KEY,");
  L.push("  product_id uuid NOT NULL,");
  L.push("  pres_stable_key text NOT NULL,");
  L.push("  price_amount text NOT NULL,");
  L.push("  availability_status text NOT NULL");
  L.push(") ON COMMIT DROP;\n");

  // Batch INSERT into temp table
  const batchSize = 200;
  for (let start = 0; start < plan.offers.length; start += batchSize) {
    const batch = plan.offers.slice(start, start + batchSize);
    const values = batch.map((o, i) => `(${start + i}, '${o.product_uuid}', ${esc(o.pres_stable_key)}, ${esc(o.price_amount)}, ${esc(o.availability_status)})`).join(",");
    L.push(`INSERT INTO _cp_items VALUES ${values};`);
  }
  L.push("");

  L.push("-- Call RPC with resolved presentation IDs");
  L.push(`SELECT public.admin_set_campaign_products('${CAMPAIGN_ID}', (SELECT updated_at FROM public.campaigns WHERE id = '${CAMPAIGN_ID}'), (`);
  L.push("  SELECT coalesce(jsonb_agg(jsonb_build_object(");
  L.push("    'product_id', t.product_id,");
  L.push("    'import_presentation_id', ip.id,");
  L.push("    'price_amount', t.price_amount::numeric,");
  L.push("    'availability_status', t.availability_status,");
  L.push("    'sort_order', t.idx");
  L.push("  ) ORDER BY t.idx), '[]'::jsonb)");
  L.push("  FROM _cp_items t JOIN public.import_presentations ip ON ip.product_id = t.product_id AND ip.stable_key = t.pres_stable_key");
  L.push("));\n");

  L.push("RESET role;\nCOMMIT;");
  return L.join("\n");
}

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
  const overrides = JSON.parse(await readFile(overridesPath, "utf8"));
  const plan = buildPlan(reviewed, overrides);

  console.log(`[4J4B] Plan: ${plan.stats.products} products, ${plan.stats.presentations} presentations, ${plan.stats.offers} offers`);
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

  if (mode === "--verify") {
    const c = getContainer();
    assertDB(c);
    console.log(`[4J4B] Verify:\n${psql(c, verifySQL())}`);
    return;
  }

  // --apply
  const c = getContainer();
  assertDB(c);
  console.log(`[4J4B] Applying...`);
  psql(c, buildApplySQL(plan));
  console.log(`[4J4B] Apply complete.`);
  console.log(`[4J4B] Post-apply verify:\n${psql(c, verifySQL())}`);
}

main().catch((err) => {
  console.error(`[4J4B] FATAL: ${err.message}`);
  process.exit(1);
});
