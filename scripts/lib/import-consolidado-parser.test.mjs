import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDuplicateGroups,
  canonicalDecimalText,
  parseCommercialBlock,
  validateStaging,
} from "./import-consolidado-parser.mjs";

const section = {
  key: "arabic",
  raw: "Synthetic category",
  candidateName: "Synthetic category",
  slug: "synthetic-category",
};

function parse(rawText, overrides = {}) {
  return parseCommercialBlock({
    page: overrides.page ?? 3,
    blockIndex: overrides.blockIndex ?? 1,
    rawText,
    section: overrides.section ?? section,
    mediaEvidence: overrides.mediaEvidence ?? "present",
    visualAvailability: overrides.visualAvailability ?? null,
    visualName: overrides.visualName ?? null,
    visualRawText: overrides.visualRawText ?? null,
  });
}

test("simple product and exact price are parsed without numeric money", () => {
  const record = parse("Sample Product\nS/. 129 * 100ml");
  assert.equal(record.product.raw_name, "Sample Product");
  assert.equal(record.campaign_offer.price_amount, "129.00");
  assert.equal(typeof record.campaign_offer.price_amount, "string");
  assert.equal(record.review.confidence, "high");
});

test("decimal price normalization is exact text", () => {
  assert.equal(canonicalDecimalText("129.9"), "129.90");
  assert.equal(canonicalDecimalText("129,90"), "129.90");
  assert.equal(canonicalDecimalText("1,120"), "1120.00");
  assert.equal(canonicalDecimalText("consultar"), null);
});

test("multiple prices remain options and require review", () => {
  const record = parse("Sample Product\nS/. 100 * 50ml\nS/. 150 * 100ml");
  assert.equal(record.campaign_offer.price_amount, null);
  assert.equal(record.campaign_offer.price_options_candidate.length, 2);
  assert.ok(record.review.issues.includes("multiple_prices"));
  assert.equal(record.review.confidence, "medium");
});

test("missing price remains source-incomplete or review-required", () => {
  const record = parse("Sample Product");
  assert.equal(record.campaign_offer.price_amount, null);
  assert.ok(record.review.issues.includes("price_missing"));
  assert.equal(record.review.status, "review_required");
});

test("pack/set block is never modeled as a Parfums combo", () => {
  const packSection = { ...section, key: "packs_sets_presentations" };
  const record = parse("Set Sample 3 Pcs\nS/. 180 * 3x30ml", { section: packSection });
  assert.equal(record.classification.offer_kind, "set");
  assert.equal(record.campaign_offer.pack_contents_raw, "Set Sample 3 Pcs");
  assert.ok(record.review.issues.includes("pack_composition_ambiguous"));
  assert.equal(record.variant_evidence.option_axes_candidate[0], "pack_presentation");
});

test("category heading remains raw and separate from candidate", () => {
  const record = parse("Sample Product\nS/. 100 * 100ml");
  assert.equal(record.classification.raw_category, "Synthetic category");
  assert.equal(record.classification.candidate_import_category.slug, "synthetic-category");
});

test("duplicate source occurrences are retained and reconciled separately", () => {
  const first = parse("Repeated Product\nS/. 100 * 100ml", { page: 3, blockIndex: 1 });
  const second = parse("Repeated Product\nS/. 110 * 100ml", { page: 4, blockIndex: 2 });
  const groups = buildDuplicateGroups([first, second]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].record_ids.length, 2);
  assert.notEqual(first.record_id, second.record_id);
});

test("availability is explicit only with source evidence", () => {
  const unknown = parse("Sample Product\nS/. 100 * 100ml");
  const unavailable = parse("Sample Product", { visualAvailability: "AGOTADO" });
  assert.equal(unknown.campaign_offer.availability_candidate, null);
  assert.ok(unknown.review.issues.includes("availability_unknown"));
  assert.equal(unavailable.campaign_offer.availability_candidate, "unavailable");
  assert.equal(unavailable.source.extraction_method, "native_pdf_text_layout+targeted_visual_review");
});

test("targeted visual name preserves the lossy native name separately", () => {
  const record = parse("Visual Nam�\nS/. 100 * 100ml", { visualName: "Visual Namé" });
  assert.equal(record.product.raw_name, "Visual Namé");
  assert.equal(record.source.native_raw_name, "Visual Nam�");
  assert.ok(record.review.issues.includes("source_text_incomplete"));
});

test("targeted visual raw text preserves a lossy native layout association", () => {
  const record = parse("Set Example\nx S/. 165 * 100ml", {
    section: { ...section, key: "packs_sets_presentations" },
    visualRawText: "Set Example\nS/. 165 * 100ml",
  });
  assert.equal(record.campaign_offer.price_amount, "165.00");
  assert.equal(record.source.native_raw_text, "Set Example\nx S/. 165 * 100ml");
  assert.ok(record.review.issues.includes("layout_association_ambiguous"));
});

test("variant evidence is generic and never forced to bottle/decant", () => {
  const record = parse("Sample Product\nS/. 100 * 75ml");
  assert.deepEqual(record.variant_evidence.option_axes_candidate, ["capacity"]);
  assert.equal(record.variant_evidence.requires_variant_model_review, true);
});

test("record IDs are deterministic and source-position sensitive", () => {
  const one = parse("Sample Product\nS/. 100 * 100ml");
  const again = parse("Sample Product\nS/. 100 * 100ml");
  const moved = parse("Sample Product\nS/. 100 * 100ml", { blockIndex: 2 });
  assert.equal(one.record_id, again.record_id);
  assert.notEqual(one.record_id, moved.record_id);
});

test("page coverage validation catches a missing page", () => {
  const record = parse("Sample Product\nS/. 100 * 100ml");
  const staging = {
    document: { page_count: 2 },
    page_coverage: [{ page: 1, status: "parsed", source_blocks_detected: 1, records_found: 1 }],
    commercial_records: [record],
  };
  assert.ok(validateStaging(staging).includes("page_coverage_count_mismatch"));
});

test("unknown commercial-looking block is retained for review", () => {
  const record = parse("Unclear commercial block\nS/. consultar");
  assert.ok(record);
  assert.equal(record.review.confidence, "low");
  assert.equal(record.review.status, "source_incomplete");
  assert.ok(record.review.issues.includes("price_ambiguous"));
});
