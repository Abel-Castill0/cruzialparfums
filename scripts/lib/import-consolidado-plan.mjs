/**
 * Cruzial Platform V2 — Shared Sexto Consolidado population plan builder.
 *
 * Single source of truth for:
 *   - product structural candidates (from reviewed + overrides)
 *   - presentation structural candidates (independent of campaign-price eligibility)
 *   - campaign offer eligibility (priced-only)
 *   - availability mapping
 *   - skip/omit logic
 *
 * Consumed by: generator, loader, tests.
 *
 * Deterministic: same reviewed SHA + override SHA + PLAN_VERSION → identical plan.
 */

import { createHash } from "node:crypto";

export const PLAN_VERSION = "4j4b-v2";

export const IMPORT_UNIT_ID = "22222222-2222-4222-8222-222222222222";
export const CAMPAIGN_NUMBER = 6;
export const CAMPAIGN_NAME = "Sexto Consolidado";

export const PRES_CLASS_MAP = Object.freeze({
  A_SINGLE_FIXED_PRESENTATION: "single_fixed",
  B_MULTI_PRESENTATION: "multi_presentation",
  C_PACK_SET: "pack_set",
  D_PRESENTATION_AMBIGUOUS: "ambiguous",
});

// ─── Identity helpers ──────────────────────────────────────────────────────

export function slugFromCanonical(name, id) {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
  const h = createHash("sha256").update(id).digest("hex").slice(0, 8);
  return `import-${base}-${h}`;
}

export function pkeyFromCanonical(pid, label) {
  const l = (label || "default")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
  const h = createHash("sha256").update(`${pid}:${label}`).digest("hex").slice(0, 8);
  return `pres-${l}-${h}`;
}

export function extractCapacity(label) {
  const m = label.match(/(\d+(?:\.\d+)?)\s*ml/i);
  return m ? parseFloat(m[1]) : null;
}

// ─── Availability mapping ──────────────────────────────────────────────────

export function mapAvailability(availabilityCandidate) {
  // Only explicit OUT_OF_STOCK evidence → out_of_stock.
  // Unknown/null → unconfirmed.
  // Explicit "available" → available (when actually supported).
  if (availabilityCandidate === "OUT_OF_STOCK") return "out_of_stock";
  if (availabilityCandidate === "available") return "available";
  return "unconfirmed";
}

// ─── Plan builder ──────────────────────────────────────────────────────────

/**
 * Build the complete population plan from reviewed data + overrides.
 *
 * Structural presentations are derived from reviewed candidates + overrides
 * BEFORE filtering campaign offers by price. This ensures products like
 * Vanilla Freak and CDN Preciux IV always get structural rows even when
 * no priced offer exists.
 */
export function buildPopulationPlan(reviewed, overrides) {
  // Index overrides
  const splitMap = new Map();
  const skipMap = new Map();
  const presOverrideMap = new Map();
  const reassociateMap = new Map();

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

  // ── Phase 1: Products ──────────────────────────────────────────────────
  const plan = { products: [], presentations: [], offers: [], skipped: [], stats: {} };
  const productMap = new Map(); // canonical_product_id → product

  // Non-merged products
  for (const p of reviewed.canonical_products) {
    if (splitMap.has(p.canonical_product_id)) continue;
    const s = slugFromCanonical(p.canonical_name, p.canonical_product_id);
    const prod = {
      canonical_id: p.canonical_product_id,
      slug: s,
      name: p.canonical_name,
      brand: p.brand?.value || null,
      import_segment: p.import_segment?.value || null,
      presentation_class: PRES_CLASS_MAP[p.presentation_class] || "ambiguous",
    };
    plan.products.push(prod);
    productMap.set(p.canonical_product_id, prod);
  }

  // Split products from overrides
  const splitOfferRedirect = new Map();
  for (const [mergedId, ov] of splitMap) {
    const origProd = reviewed.canonical_products.find((p) => p.canonical_product_id === mergedId);
    for (const sp of ov.split_products) {
      const s = slugFromCanonical(sp.name, sp.new_canonical_product_id);
      const prod = {
        canonical_id: sp.new_canonical_product_id,
        slug: s,
        name: sp.name,
        brand: origProd?.brand?.value || null,
        import_segment: origProd?.import_segment?.value || null,
        presentation_class: origProd?.presentation_class
          ? PRES_CLASS_MAP[origProd.presentation_class] || "ambiguous"
          : "ambiguous",
      };
      plan.products.push(prod);
      productMap.set(sp.new_canonical_product_id, prod);
      for (const offer of sp.offers) {
        splitOfferRedirect.set(offer.canonical_offer_id, sp.new_canonical_product_id);
      }
    }
  }

  // Reassociated offers → create target product if missing
  const reassociatedOffers = new Map();
  for (const [, ov] of reassociateMap) {
    const ra = ov.reassociate_offer;
    reassociatedOffers.set(ra.canonical_offer_id, {
      to_product_id: ra.to_product_id,
      new_presentation_label: ra.new_presentation_label,
      price_amount: ra.price_amount,
    });
    if (!productMap.has(ra.to_product_id)) {
      const s = slugFromCanonical(ra.to_product_name, ra.to_product_id);
      const origProd = reviewed.canonical_products.find((p) => p.canonical_product_id === ov.affected_canonical_product_id);
      const prod = {
        canonical_id: ra.to_product_id,
        slug: s,
        name: ra.correct_product_name || ra.to_product_name,
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

  // ── Phase 2: Structural presentations (before price filtering) ─────────
  // Every reviewed offer contributes a structural presentation candidate.
  // This ensures Vanilla Freak, CDN Preciux IV, etc. always get presentations.
  const structuralPres = new Map(); // `${canonical_product_id}|${pres_stable_key}` → pres

  // Presentation overrides lookup
  const presOverrideLookup = new Map();
  for (const [, ov] of presOverrideMap) {
    for (const po of ov.presentation_overrides) {
      presOverrideLookup.set(po.canonical_offer_id, {
        label: po.new_presentation_label,
        suffix: po.new_stable_key_suffix,
      });
    }
  }

  // Skip offer IDs
  const skipOfferIds = new Set();
  for (const [, ov] of skipMap) {
    for (const oid of ov.affected_canonical_offer_ids) skipOfferIds.add(oid);
  }

  for (const o of reviewed.canonical_offers) {
    const oid = o.canonical_offer_id;
    if (skipOfferIds.has(oid)) continue;
    if (reassociatedOffers.has(oid)) continue;

    let canonicalProdId = splitOfferRedirect.has(oid) ? splitOfferRedirect.get(oid) : o.canonical_product_id;
    if (!productMap.has(canonicalProdId)) continue;

    const rawLabel = o.presentation?.raw_label || "default";

    let finalLabel = rawLabel;
    let presSuffix = rawLabel;
    const pOverride = presOverrideLookup.get(oid);
    if (pOverride) {
      finalLabel = pOverride.label;
      presSuffix = pOverride.suffix;
    }

    const pk = pkeyFromCanonical(canonicalProdId, presSuffix);
    const key = `${canonicalProdId}|${pk}`;

    if (!structuralPres.has(key)) {
      structuralPres.set(key, {
        product_canonical_id: canonicalProdId,
        stable_key: pk,
        label: finalLabel,
        presentation_class: productMap.get(canonicalProdId)?.presentation_class || "single_fixed",
        capacity_ml: extractCapacity(finalLabel),
      });
    }
  }

  // Reassociated offer structural pres
  for (const [oid, ra] of reassociatedOffers) {
    const pk = pkeyFromCanonical(ra.to_product_id, ra.new_presentation_label);
    const key = `${ra.to_product_id}|${pk}`;
    if (!structuralPres.has(key)) {
      structuralPres.set(key, {
        product_canonical_id: ra.to_product_id,
        stable_key: pk,
        label: ra.new_presentation_label,
        presentation_class: productMap.get(ra.to_product_id)?.presentation_class || "single_fixed",
        capacity_ml: extractCapacity(ra.new_presentation_label),
      });
    }
  }

  plan.presentations = [...structuralPres.values()];

  // ── Phase 3: Campaign offers (priced-only, deduped) ────────────────────
  const deduped = new Map();

  for (const o of reviewed.canonical_offers) {
    const oid = o.canonical_offer_id;
    if (skipOfferIds.has(oid)) {
      plan.skipped.push({ id: oid, reason: "conflicting_source_price_pending_confirmation", product: o.canonical_product_id });
      continue;
    }
    if (reassociatedOffers.has(oid)) continue;

    let canonicalProdId = splitOfferRedirect.has(oid) ? splitOfferRedirect.get(oid) : o.canonical_product_id;
    if (!productMap.has(canonicalProdId)) continue;

    const price = o.price?.amount;
    if (!price || price === "") {
      plan.skipped.push({ id: oid, reason: "no_price", product: canonicalProdId });
      continue;
    }

    let finalLabel = o.presentation?.raw_label || "default";
    let presSuffix = finalLabel;
    let finalPrice = price;
    const pOverride = presOverrideLookup.get(oid);
    if (pOverride) {
      finalLabel = pOverride.label;
      presSuffix = pOverride.suffix;
      if (pOverride.price) finalPrice = pOverride.price;
    }

    const pk = pkeyFromCanonical(canonicalProdId, presSuffix);
    const dedupKey = `${canonicalProdId}|${pk}|${finalPrice}`;

    if (deduped.has(dedupKey)) {
      deduped.get(dedupKey).source_records.push(o.source_record_id);
      continue;
    }

    deduped.set(dedupKey, {
      product_canonical_id: canonicalProdId,
      pres_stable_key: pk,
      pres_label: finalLabel,
      price_amount: finalPrice,
      availability_status: mapAvailability(o.availability_candidate),
      source_records: [o.source_record_id],
    });
  }

  // Reassociated offers
  for (const [oid, ra] of reassociatedOffers) {
    const pk = pkeyFromCanonical(ra.to_product_id, ra.new_presentation_label);
    const dedupKey = `${ra.to_product_id}|${pk}|${ra.price_amount}`;
    if (!deduped.has(dedupKey)) {
      deduped.set(dedupKey, {
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

  plan.stats = {
    source_occurrences: reviewed.counts.source_occurrences,
    plan_version: PLAN_VERSION,
    products: plan.products.length,
    structural_presentations: plan.presentations.length,
    priced_offers: plan.offers.length,
    skipped_no_price: plan.skipped.filter((s) => s.reason === "no_price").length,
    skipped_conflict: plan.skipped.filter((s) => s.reason === "conflicting_source_price_pending_confirmation").length,
    conflicts: 0,
  };

  return plan;
}

// ─── Canonical manifest ────────────────────────────────────────────────────

/**
 * Build a deterministic canonical manifest for commit.
 * No DB UUIDs, no generated_at inside canonical body.
 */
export function buildCanonicalManifest(reviewed, overrides, plan) {
  return {
    schema_version: PLAN_VERSION,
    reviewed_sha256: reviewed._sha256 || null,
    overrides_sha256: overrides._sha256 || null,
    campaign: {
      number: CAMPAIGN_NUMBER,
      name: CAMPAIGN_NAME,
      business_unit: "import",
    },
    stats: plan.stats,
    products: plan.products.map((p) => ({
      canonical_id: p.canonical_id,
      slug: p.slug,
      name: p.name,
      brand: p.brand,
      import_segment: p.import_segment,
    })),
    presentations: plan.presentations.map((p) => ({
      product_canonical_id: p.product_canonical_id,
      stable_key: p.stable_key,
      label: p.label,
      capacity_ml: p.capacity_ml,
    })),
    offers: plan.offers.map((o) => ({
      product_canonical_id: o.product_canonical_id,
      pres_stable_key: o.pres_stable_key,
      price_amount: o.price_amount,
      availability_status: o.availability_status,
    })),
    skipped: plan.skipped,
  };
}
