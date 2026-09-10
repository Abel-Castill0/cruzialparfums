import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PRESENTATION_CLASSES, normalizeIdentity, reconcileConsolidado, stableId } from "./import-consolidado-reconciliation.mjs";

const staging = JSON.parse(await readFile(new URL("../../supabase/staging/import/sexto-consolidado-staging.json", import.meta.url), "utf8"));
const reviewed = reconcileConsolidado(staging);

test("normalization is conservative and stable", () => {
  assert.equal(normalizeIdentity("  Café & Oud  "), "cafe and oud");
  assert.notEqual(normalizeIdentity("Libre EDT"), normalizeIdentity("Libre EDP"));
  assert.equal(stableId("x", "same"), stableId("x", "same"));
});

test("all source occurrences are preserved byte-for-byte as data", () => {
  assert.equal(reviewed.source_records.length, 845);
  assert.deepEqual(reviewed.source_records, staging.commercial_records);
  assert.deepEqual(new Set(reviewed.source_records.map((r) => r.record_id)).size, 845);
  assert.equal(reviewed.generated_from.source_sha256, staging.document.source_sha256);
});

test("only three proven duplicate pairs merge canonical identity", () => {
  assert.equal(reviewed.counts.canonical_products, 842);
  assert.equal(reviewed.counts.duplicate_groups_reviewed, 6);
  assert.equal(reviewed.counts.duplicate_groups_merged, 3);
});

test("similar text does not cause destructive fuzzy merging", () => {
  const bir = reviewed.canonical_products.filter((p) => p.source_record_ids.some((id) => id.includes("p039-b06") || id.includes("p039-b11")));
  assert.equal(bir.length, 2);
  assert.deepEqual(bir.map((p) => p.canonical_name).sort(), ["Born in Roma Uomo Extradose", "Donna Born in Roma Extradose"]);
  const khamrah = reviewed.canonical_products.filter((p) => p.source_record_ids.some((id) => id.includes("p074-b02") || id.includes("p074-b03")));
  assert.equal(khamrah.length, 2);
});

test("brand resolution covers every canonical product and carries provenance", () => {
  assert.ok(reviewed.canonical_products.every((p) => p.brand.provenance?.type));
  assert.equal(reviewed.counts.brands_unresolved, 0);
  assert.ok(reviewed.canonical_products.some((p) => p.brand.provenance.method === "external_verification"));
});

test("designer and niche are resolved per canonical product without price inference", () => {
  assert.equal(reviewed.counts.designer, 264);
  assert.equal(reviewed.counts.niche, 164);
  assert.ok(reviewed.canonical_products.filter((p) => p.import_segment.value === "designer").every((p) => p.import_segment.provenance === "OFFICIAL_PDF_PAGE_SEQUENCE"));
  assert.ok(reviewed.canonical_products.filter((p) => p.import_segment.value === "niche").every((p) => p.import_segment.provenance === "OFFICIAL_PDF_PAGE_SEQUENCE"));
  assert.ok(reviewed.canonical_products.filter((p) => p.source_record_ids.some((id) => id.includes("p003-"))).every((p) => p.import_segment.value === null && p.import_segment.status === "not_applicable"));
});

test("presentation classes are exhaustive and packs are never public combos", () => {
  const valid = new Set(Object.values(PRESENTATION_CLASSES));
  assert.ok(reviewed.canonical_products.every((p) => valid.has(p.presentation_class)));
  assert.equal(reviewed.counts.pack_set, 32);
  assert.equal(reviewed.counts.single_presentation, 738);
  assert.equal(reviewed.counts.multi_presentation, 60);
  assert.equal(reviewed.counts.presentation_ambiguous, 12);
  assert.ok(reviewed.canonical_offers.filter((o) => o.pack_set_evidence).every((o) => !("combo" in o.pack_set_evidence)));
});

test("all 60 multi-price records map every printed price to a deterministic offer", () => {
  assert.equal(reviewed.counts.multi_price_source_records, 60);
  assert.equal(reviewed.counts.multi_price_resolved, 60);
  assert.equal(reviewed.counts.multi_price_unresolved, 0);
  for (const source of staging.commercial_records.filter((r) => r.campaign_offer.price_options_candidate.length > 1)) {
    const offers = reviewed.canonical_offers.filter((o) => o.source_record_id === source.record_id);
    assert.equal(offers.length, source.campaign_offer.price_options_candidate.length);
  }
});

test("page 7 ambiguity remains unresolved and no inferred price is introduced", () => {
  const offer = reviewed.canonical_offers.find((o) => o.source_record_id === "sc-p007-b05-bceb44e1f8");
  assert.equal(offer.status, "source_ambiguous");
  assert.equal(offer.price.amount, null);
});

test("availability only resolves the 12 explicit AGOTADO occurrences", () => {
  assert.equal(reviewed.counts.explicit_out_of_stock, 12);
  assert.equal(reviewed.counts.availability_unknown, 833);
  assert.equal(reviewed.canonical_offers.filter((o) => o.availability_candidate === "out_of_stock").length, 12);
});

test("a second reconciliation produces identical data", () => {
  assert.deepEqual(reconcileConsolidado(staging), reviewed);
  assert.equal(new Set(reviewed.canonical_products.map((p) => p.canonical_product_id)).size, 842);
  assert.ok(reviewed.canonical_products.every((p) => /^scp-[0-9a-f]{16}$/.test(p.canonical_product_id)));
  assert.equal(new Set(reviewed.canonical_offers.map((o) => o.canonical_offer_id)).size, 913);
});
