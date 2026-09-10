import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reviewed = JSON.parse(await readFile(resolve(root, "supabase/staging/import/sexto-consolidado-reviewed.json"), "utf8"));
const overrides = JSON.parse(await readFile(resolve(root, "supabase/staging/import/sexto-consolidado-population-overrides.json"), "utf8"));

const IMPORT_UNIT_ID = "22222222-2222-4222-8222-222222222222";
const CAMPAIGN_ID = "aa400000-0000-4000-8000-000000000006";
const CAMPAIGN_NUMBER = 6;
const CAMPAIGN_NAME = "Sexto Consolidado";

const PRES_CLASS_MAP = { A_SINGLE_FIXED_PRESENTATION: "single_fixed", B_MULTI_PRESENTATION: "multi_presentation", C_PACK_SET: "pack_set", D_PRESENTATION_AMBIGUOUS: "ambiguous" };

function slug(name, id) {
  const base = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/gu, "").replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
  const h = createHash("sha256").update(id).digest("hex").slice(0, 8);
  return `import-${base}-${h}`;
}

function uuid(s) {
  const h = createHash("sha256").update(s).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function pkey(pid, label) {
  const l = (label || "default").toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
  const h = createHash("sha256").update(`${pid}:${label}`).digest("hex").slice(0, 8);
  return `pres-${l}-${h}`;
}

// Index overrides
const splitMap = new Map(), skipMap = new Map(), presOverrideMap = new Map(), reassociateMap = new Map();
for (const ov of overrides.overrides) {
  if (ov.resolution === "split_canonical_source_identity") splitMap.set(ov.affected_canonical_product_id, ov);
  else if (ov.resolution === "omit_offer_pending_price_confirmation") skipMap.set(ov.affected_canonical_product_id, ov);
  else if (ov.resolution === "split_structural_presentations") presOverrideMap.set(ov.affected_canonical_product_id, ov);
  else if (ov.resolution === "correct_source_block_association") reassociateMap.set(ov.affected_canonical_offer_ids[0], ov);
}

// Products
const productMap = new Map();
const products = [];
for (const p of reviewed.canonical_products) {
  if (splitMap.has(p.canonical_product_id)) continue;
  const s = slug(p.canonical_name, p.canonical_product_id);
  const prod = { canonical_id: p.canonical_product_id, uuid: uuid(s), slug: s, name: p.canonical_name, brand: p.brand?.value || null, import_segment: p.import_segment?.value || null, presentation_class: PRES_CLASS_MAP[p.presentation_class] || "ambiguous" };
  products.push(prod);
  productMap.set(p.canonical_product_id, prod);
}

const splitOfferRedirect = new Map();
for (const [mergedId, ov] of splitMap) {
  const origProd = reviewed.canonical_products.find((p) => p.canonical_product_id === mergedId);
  for (const sp of ov.split_products) {
    const s = slug(sp.name, sp.new_canonical_product_id);
    const prod = { canonical_id: sp.new_canonical_product_id, uuid: uuid(s), slug: s, name: sp.name, brand: origProd?.brand?.value || null, import_segment: origProd?.import_segment?.value || null, presentation_class: origProd?.presentation_class ? PRES_CLASS_MAP[origProd.presentation_class] || "ambiguous" : "ambiguous" };
    products.push(prod);
    productMap.set(sp.new_canonical_product_id, prod);
    for (const offer of sp.offers) splitOfferRedirect.set(offer.canonical_offer_id, sp.new_canonical_product_id);
  }
}

// Reassociate
const reassociatedOffers = new Map();
for (const [, ov] of reassociateMap) {
  const ra = ov.reassociate_offer;
  reassociatedOffers.set(ra.canonical_offer_id, { to_product_id: ra.to_product_id, new_presentation_label: ra.new_presentation_label, price_amount: ra.price_amount });
  if (!productMap.has(ra.to_product_id)) {
    const s = slug(ra.to_product_name, ra.to_product_id);
    const origProd = reviewed.canonical_products.find((p) => p.canonical_product_id === ov.affected_canonical_product_id);
    const prod = { canonical_id: ra.to_product_id, uuid: uuid(s), slug: s, name: ra.correct_product_name || ra.to_product_name, brand: origProd?.brand?.value || null, import_segment: origProd?.import_segment?.value || null, presentation_class: "single_fixed" };
    products.push(prod);
    productMap.set(ra.to_product_id, prod);
  } else if (ra.correct_product_name) {
    productMap.get(ra.to_product_id).name = ra.correct_product_name;
  }
}

// Offer overrides
const presOverrideLookup = new Map();
for (const [, ov] of presOverrideMap) for (const po of ov.presentation_overrides) presOverrideLookup.set(po.canonical_offer_id, { label: po.new_presentation_label, suffix: po.new_stable_key_suffix, price: po.price_amount });

const skipOfferIds = new Set();
for (const [, ov] of skipMap) for (const oid of ov.affected_canonical_offer_ids) skipOfferIds.add(oid);

// Build offers
const deduped = new Map();
const skipped = [];
for (const o of reviewed.canonical_offers) {
  const oid = o.canonical_offer_id;
  if (skipOfferIds.has(oid)) { skipped.push({ id: oid, reason: "conflicting_source_price_pending_confirmation", product: o.canonical_product_id }); continue; }
  if (reassociatedOffers.has(oid)) continue;
  let canonicalProdId = splitOfferRedirect.has(oid) ? splitOfferRedirect.get(oid) : o.canonical_product_id;
  if (!productMap.has(canonicalProdId)) continue;
  const price = o.price?.amount;
  if (!price || price === "") { skipped.push({ id: oid, reason: "no_price", product: canonicalProdId }); continue; }

  let finalLabel = o.presentation?.raw_label || "default";
  let presSuffix = finalLabel;
  let finalPrice = price;
  const po = presOverrideLookup.get(oid);
  if (po) { finalLabel = po.label; presSuffix = po.suffix; if (po.price) finalPrice = po.price; }

  const pk = pkey(canonicalProdId, presSuffix);
  const dedupKey = `${canonicalProdId}|${pk}|${finalPrice}`;
  if (!deduped.has(dedupKey)) {
    deduped.set(dedupKey, { product_uuid: productMap.get(canonicalProdId).uuid, product_canonical_id: canonicalProdId, pres_stable_key: pk, pres_label: finalLabel, price_amount: finalPrice, availability_status: "unconfirmed", source_records: [o.source_record_id] });
  } else {
    deduped.get(dedupKey).source_records.push(o.source_record_id);
  }
}

for (const [oid, ra] of reassociatedOffers) {
  const prod = productMap.get(ra.to_product_id);
  const pk = pkey(ra.to_product_id, ra.new_presentation_label);
  const dedupKey = `${ra.to_product_id}|${pk}|${ra.price_amount}`;
  if (!deduped.has(dedupKey)) {
    deduped.set(dedupKey, { product_uuid: prod.uuid, product_canonical_id: ra.to_product_id, pres_stable_key: pk, pres_label: ra.new_presentation_label, price_amount: ra.price_amount, availability_status: "unconfirmed", source_records: [oid] });
  }
}

const offers = [...deduped.values()];

// Presentations
const presSeen = new Map();
for (const o of offers) {
  const key = `${o.product_uuid}|${o.pres_stable_key}`;
  if (presSeen.has(key)) continue;
  presSeen.set(key, { product_uuid: o.product_uuid, stable_key: o.pres_stable_key, label: o.pres_label, presentation_class: productMap.get(o.product_canonical_id)?.presentation_class || "single_fixed", capacity_ml: (o.pres_label.match(/(\d+(?:\.\d+)?)\s*ml/i) || [])[1] ? parseFloat((o.pres_label.match(/(\d+(?:\.\d+)?)\s*ml/i) || [])[1]) : null });
}
const presentations = [...presSeen.values()];

const plan = {
  schema_version: "4j4b-population-plan-v1",
  generated_at: new Date().toISOString(),
  campaign: { id: CAMPAIGN_ID, number: CAMPAIGN_NUMBER, name: CAMPAIGN_NAME, business_unit_id: IMPORT_UNIT_ID },
  reviewed_artifact: "supabase/staging/import/sexto-consolidado-reviewed.json",
  reviewed_sha256: "428d7f47c0a713d7593b8e2618664570dfcecee8b424e6215dfb08b6b27943c2",
  overrides_artifact: "supabase/staging/import/sexto-consolidado-population-overrides.json",
  stats: {
    source_occurrences: reviewed.counts.source_occurrences,
    products: products.length,
    presentations: presentations.length,
    offers: offers.length,
    skipped_no_price: skipped.filter((s) => s.reason === "no_price").length,
    skipped_conflict: skipped.filter((s) => s.reason === "conflicting_source_price_pending_confirmation").length,
    conflicts: 0,
  },
  products: products.map((p) => ({ canonical_id: p.canonical_id, uuid: p.uuid, slug: p.slug, name: p.name, brand: p.brand, import_segment: p.import_segment })),
  presentations: presentations.map((p) => ({ product_uuid: p.product_uuid, stable_key: p.stable_key, label: p.label, capacity_ml: p.capacity_ml })),
  offers: offers.map((o) => ({ product_uuid: o.product_uuid, pres_stable_key: o.pres_stable_key, pres_label: o.pres_label, price_amount: o.price_amount, currency: "PEN", availability_status: o.availability_status })),
  skipped,
};

const outPath = resolve(root, "supabase/staging/import/sexto-consolidado-population-plan-4j4b.json");
await writeFile(outPath, JSON.stringify(plan, null, 2), "utf8");
console.log(`Wrote ${outPath}`);
console.log(`Stats: ${plan.stats.products} products, ${plan.stats.presentations} presentations, ${plan.stats.offers} offers, ${plan.stats.conflicts} conflicts`);
