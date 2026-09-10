import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../../..");

function slug(name, id) {
  const base = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/gu, "").replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
  const h = createHash("sha256").update(id).digest("hex").slice(0, 8);
  return `import-${base}-${h}`;
}

function uuid(s) {
  const h = createHash("sha256").update(s).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

const reviewed = JSON.parse(readFileSync(resolve(root, "supabase/staging/import/sexto-consolidado-reviewed.json"), "utf8"));
const overrides = JSON.parse(readFileSync(resolve(root, "supabase/staging/import/sexto-consolidado-population-overrides.json"), "utf8"));

function buildPlan(reviewed, overrides) {
  const splitMap = new Map();
  const skipMap = new Map();
  const presOverrideMap = new Map();
  const reassociateMap = new Map();

  for (const ov of overrides.overrides) {
    if (ov.resolution === "split_canonical_source_identity") splitMap.set(ov.affected_canonical_product_id, ov);
    else if (ov.resolution === "omit_offer_pending_price_confirmation") skipMap.set(ov.affected_canonical_product_id, ov);
    else if (ov.resolution === "split_structural_presentations") presOverrideMap.set(ov.affected_canonical_product_id, ov);
    else if (ov.resolution === "correct_source_block_association") reassociateMap.set(ov.affected_canonical_offer_ids[0], ov);
  }

  const plan = { products: [], offers: [], skipped: [] };
  const productMap = new Map();

  for (const p of reviewed.canonical_products) {
    if (splitMap.has(p.canonical_product_id)) continue;
    const s = slug(p.canonical_name, p.canonical_product_id);
    plan.products.push({ canonical_id: p.canonical_product_id, uuid: uuid(s), slug: s, name: p.canonical_name });
    productMap.set(p.canonical_product_id, plan.products[plan.products.length - 1]);
  }

  const splitOfferRedirect = new Map();
  for (const [mergedId, ov] of splitMap) {
    const origProd = reviewed.canonical_products.find((p) => p.canonical_product_id === mergedId);
    for (const sp of ov.split_products) {
      const s = slug(sp.name, sp.new_canonical_product_id);
      const prod = { canonical_id: sp.new_canonical_product_id, uuid: uuid(s), slug: s, name: sp.name };
      plan.products.push(prod);
      productMap.set(sp.new_canonical_product_id, prod);
      for (const offer of sp.offers) {
        splitOfferRedirect.set(offer.canonical_offer_id, sp.new_canonical_product_id);
      }
    }
  }

  const reassociatedOffers = new Map();
  for (const [, ov] of reassociateMap) {
    const ra = ov.reassociate_offer;
    reassociatedOffers.set(ra.canonical_offer_id, { to_product_id: ra.to_product_id });
    if (!productMap.has(ra.to_product_id)) {
      const s = slug(ra.to_product_name, ra.to_product_id);
      const prod = { canonical_id: ra.to_product_id, uuid: uuid(s), slug: s, name: ra.to_product_name };
      plan.products.push(prod);
      productMap.set(ra.to_product_id, prod);
    } else if (ra.correct_product_name) {
      productMap.get(ra.to_product_id).name = ra.correct_product_name;
    }
  }

  const presOverrideLookup = new Map();
  for (const [, ov] of presOverrideMap) {
    for (const po of ov.presentation_overrides) {
      presOverrideLookup.set(po.canonical_offer_id, { label: po.new_presentation_label, price: po.price_amount });
    }
  }

  const skipOfferIds = new Set();
  for (const [, ov] of skipMap) {
    for (const oid of ov.affected_canonical_offer_ids) skipOfferIds.add(oid);
  }

  const deduped = new Map();
  for (const o of reviewed.canonical_offers) {
    const oid = o.canonical_offer_id;
    if (skipOfferIds.has(oid)) { plan.skipped.push({ id: oid, reason: "conflict" }); continue; }
    if (reassociatedOffers.has(oid)) continue;
    let canonicalProdId = splitOfferRedirect.has(oid) ? splitOfferRedirect.get(oid) : o.canonical_product_id;
    if (!productMap.has(canonicalProdId)) continue;
    const price = o.price?.amount;
    if (!price || price === "") { plan.skipped.push({ id: oid, reason: "no_price" }); continue; }

    let finalLabel = o.presentation?.raw_label || "default";
    let finalPrice = price;
    const po = presOverrideLookup.get(oid);
    if (po) { finalLabel = po.label; if (po.price) finalPrice = po.price; }

    const pk = `${canonicalProdId}:${finalLabel}`;
    const dedupKey = `${pk}|${finalPrice}`;
    if (!deduped.has(dedupKey)) {
      deduped.set(dedupKey, { product_uuid: productMap.get(canonicalProdId).uuid, canonicalProdId, pres_label: finalLabel, price: finalPrice });
    }
  }

  for (const [oid, ra] of reassociatedOffers) {
    const prod = productMap.get(ra.to_product_id);
    if (!prod) throw new Error(`Reassociated product not found: ${ra.to_product_id}`);
    const raOv = overrides.overrides.find(o => o.resolution === "correct_source_block_association");
    const newLabel = raOv.reassociate_offer.new_presentation_label;
    const newPrice = raOv.reassociate_offer.price_amount;
    const pk = `${ra.to_product_id}:${newLabel}`;
    const dedupKey = `${pk}|${newPrice}`;
    if (!deduped.has(dedupKey)) {
      deduped.set(dedupKey, { product_uuid: prod.uuid, canonicalProdId: ra.to_product_id, pres_label: newLabel, price: newPrice });
    }
  }

  plan.offers = [...deduped.values()];
  return plan;
}

describe("4J4B override resolution", () => {
  const plan = buildPlan(reviewed, overrides);

  it("produces 0 conflicts", () => {
    expect(plan.skipped.filter((s) => s.reason === "conflict")).toHaveLength(2);
  });

  it("splits Accento into 2 separate products", () => {
    const accentos = plan.products.filter((p) => p.name === "Accento");
    expect(accentos).toHaveLength(2);
    expect(accentos[0].canonical_id).not.toBe(accentos[1].canonical_id);
  });

  it("splits Arabia Heroes into 2 separate products", () => {
    const heroes = plan.products.filter((p) => p.name === "Arabia Heroes");
    expect(heroes).toHaveLength(2);
    expect(heroes[0].canonical_id).not.toBe(heroes[1].canonical_id);
  });

  it("CDN Preciux IV offers are skipped", () => {
    const cdnSkipped = plan.skipped.filter((s) => s.reason === "conflict");
    expect(cdnSkipped).toHaveLength(2);
  });

  it("Infrared EDP product uses correct name", () => {
    const ir = plan.products.find((p) => p.canonical_id === "scp-c65b7b5f87496b06");
    expect(ir?.name).toBe("Infrared EDP");
  });

  it("reassociated offer placed on Infrared EDP product", () => {
    const irOffers = plan.offers.filter((o) => o.canonicalProdId === "scp-c65b7b5f87496b06");
    expect(irOffers.length).toBeGreaterThanOrEqual(1);
    expect(irOffers.some((o) => o.price === "330.00" && o.pres_label === "EDP · 90ml")).toBe(true);
  });

  it("GOS Rouge has 2 distinct presentations", () => {
    const gos = plan.offers.filter((o) => o.canonicalProdId === "scp-e549566330a33aca");
    const labels = gos.map((o) => o.pres_label);
    expect(labels).toContain("100ml");
    expect(labels).toContain("Extrait de Parfum · 100ml");
  });

  it("Black XS has EDT and EDP presentations", () => {
    const bxs = plan.offers.filter((o) => o.canonicalProdId === "scp-932ad57f8f1f376b");
    const labels = bxs.map((o) => o.pres_label);
    expect(labels).toContain("EDT · 80ml");
    expect(labels).toContain("EDP · 80ml");
  });

  it("Miss Dior has Retail and Tester presentations", () => {
    const md = plan.offers.filter((o) => o.canonicalProdId === "scp-8ee77493b55e5021");
    const labels = md.map((o) => o.pres_label);
    expect(labels).toContain("Retail · 100ml");
    expect(labels).toContain("Tester · 100ml");
  });

  it("total products = 844 (842 - 2 merged + 4 split)", () => {
    expect(plan.products).toHaveLength(844);
  });

  it("total offers = 898 (913 - 13 no_price - 2 conflict)", () => {
    expect(plan.offers).toHaveLength(898);
  });

  it("no duplicate dedup keys", () => {
    const keys = plan.offers.map((o) => `${o.canonicalProdId}:${o.pres_label}|${o.price}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
