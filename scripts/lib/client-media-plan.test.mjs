// Run with: node --test scripts/lib/client-media-plan.test.mjs
// Node's built-in test runner — no new dependency, matching this repo's
// existing "no framework unless one is already used" convention for scripts.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  basenameNoExt,
  buildMediaMigrationPlan,
  computePortablePublicId,
  planProductMedia,
  selectEligibleRecords,
  stableAssetId,
} from "./client-media-plan.mjs";

function record(overrides) {
  return {
    legacy_product_id: "some-product",
    legacy_product_name: "Some Product",
    brand: "Brand",
    current_legacy_image: null,
    client_original_filename: "Some Product.png",
    media_role: "bottle",
    status: "EXACT_MATCH",
    ...overrides,
  };
}

test("basenameNoExt strips directory and extension", () => {
  assert.equal(basenameNoExt("img/perfumes/webp/9 PM Rebel (2).webp"), "9 PM Rebel (2)");
  assert.equal(basenameNoExt("Purple Melancholia.png"), "Purple Melancholia");
  assert.equal(basenameNoExt(null), null);
});

test("selectEligibleRecords keeps only EXACT_MATCH and ALIAS_CONFIRMED", () => {
  const manifest = {
    records: [
      record({ status: "EXACT_MATCH" }),
      record({ status: "ALIAS_CONFIRMED" }),
      record({ status: "AMBIGUOUS" }),
      record({ status: "NO_MATCH" }),
      record({ status: "CLIENT_ASSET_MISSING" }),
    ],
  };
  assert.equal(selectEligibleRecords(manifest).length, 2);
});

test("computePortablePublicId never encodes an environment UUID", () => {
  assert.equal(
    computePortablePublicId("9pm-rebel", "set"),
    "cruzial/parfums/catalog/9pm-rebel/set",
  );
});

test("stableAssetId is bottle/set as-is, additional-NN for multi-slot", () => {
  assert.equal(stableAssetId("bottle", null), "bottle");
  assert.equal(stableAssetId("set", null), "set");
  assert.equal(stableAssetId("additional", 1), "additional-01");
  assert.equal(stableAssetId("additional", 12), "additional-12");
});

test("a product with one set + one bottle record: set is primary, sort_order 0/1", () => {
  const records = [
    record({ media_role: "set", client_original_filename: "X (2).png" }),
    record({ media_role: "bottle", client_original_filename: "X.png" }),
  ];
  const plan = planProductMedia("x", records, () => null);
  assert.equal(plan.conflicts.length, 0);
  assert.equal(plan.items.length, 2);
  assert.equal(plan.items[0].mediaRole, "set");
  assert.equal(plan.items[0].isPrimary, true);
  assert.equal(plan.items[0].sortOrder, 0);
  assert.equal(plan.items[1].mediaRole, "bottle");
  assert.equal(plan.items[1].isPrimary, false);
  assert.equal(plan.items[1].sortOrder, 1);
});

test("a product with only a bottle record: bottle becomes primary (never assumed)", () => {
  const records = [record({ media_role: "bottle", client_original_filename: "Only Bottle.png" })];
  const plan = planProductMedia("x", records, () => null);
  assert.equal(plan.items.length, 1);
  assert.equal(plan.items[0].mediaRole, "bottle");
  assert.equal(plan.items[0].isPrimary, true);
});

test("duplicate single-slot candidates resolve via current_legacy_image basename match (Purple Melancholia case)", () => {
  const records = [
    record({
      media_role: "set",
      client_original_filename: "Purple Melancholia (2).png",
      current_legacy_image: "img/perfumes/webp/Purple Melancholia (2).webp",
    }),
    record({
      media_role: "set",
      client_original_filename: "VALENTINO - VALENTINO MELANCHOLIA (2).png",
      current_legacy_image: "img/perfumes/webp/Purple Melancholia (2).webp",
    }),
  ];
  const plan = planProductMedia("purple-melancholia", records, () => null);
  assert.equal(plan.conflicts.length, 0);
  assert.equal(plan.items.length, 1);
  assert.equal(plan.items[0].record.client_original_filename, "Purple Melancholia (2).png");
  assert.equal(plan.excluded.length, 1);
  assert.equal(plan.excluded[0].client_original_filename, "VALENTINO - VALENTINO MELANCHOLIA (2).png");
  assert.equal(plan.excluded[0].exclusion_reason, "duplicate_slot_not_selected");
});

test("duplicate single-slot candidates resolve via current_legacy_image basename match (Hawas Verde case)", () => {
  const records = [
    record({
      media_role: "bottle",
      client_original_filename: "Hawas Verde.png",
      current_legacy_image: "img/perfumes/webp/Hawas Verde.webp",
    }),
    record({
      media_role: "bottle",
      client_original_filename: "RASASI - HAWAS verde.png",
      current_legacy_image: null,
    }),
  ];
  const plan = planProductMedia("hawas-verde", records, () => null);
  assert.equal(plan.items.length, 1);
  assert.equal(plan.items[0].record.client_original_filename, "Hawas Verde.png");
});

test("a single-slot duplicate that cannot be resolved by current_legacy_image is a conflict, never a guess", () => {
  const records = [
    record({ media_role: "bottle", client_original_filename: "A.png", current_legacy_image: null }),
    record({ media_role: "bottle", client_original_filename: "B.png", current_legacy_image: null }),
  ];
  const plan = planProductMedia("ambiguous-product", records, () => null);
  assert.equal(plan.items.length, 0);
  assert.equal(plan.conflicts.length, 1);
  assert.equal(plan.conflicts[0].code, "DUPLICATE_SLOT_UNRESOLVED");
});

test("confirmed additional views are all kept when content differs", () => {
  const records = [
    record({ media_role: "additional", client_original_filename: "X (3).png" }),
    record({ media_role: "additional", client_original_filename: "X (4).png" }),
  ];
  const checksums = { "X (3).png": "hash-a", "X (4).png": "hash-b" };
  const plan = planProductMedia("x", records, (r) => checksums[r.client_original_filename]);
  assert.equal(plan.items.length, 2);
  assert.equal(plan.items[0].assetId, "additional-01");
  assert.equal(plan.items[1].assetId, "additional-02");
  assert.equal(plan.items.every((item) => item.isPrimary === false), true);
});

test("byte-identical additional views (duplicate content) are deduplicated to one asset", () => {
  const records = [
    record({ media_role: "additional", client_original_filename: "X (3).png" }),
    record({ media_role: "additional", client_original_filename: "X (3) copy.png" }),
  ];
  const checksums = { "X (3).png": "hash-same", "X (3) copy.png": "hash-same" };
  const plan = planProductMedia("x", records, (r) => checksums[r.client_original_filename]);
  assert.equal(plan.items.length, 1);
  assert.equal(plan.excluded.length, 1);
  assert.equal(plan.excluded[0].exclusion_reason, "duplicate_content");
});

test("sort_order for set + bottle + additional views is deterministic and never filesystem order", () => {
  const records = [
    record({ media_role: "additional", client_original_filename: "Z-later.png" }),
    record({ media_role: "bottle", client_original_filename: "A.png" }),
    record({ media_role: "additional", client_original_filename: "A-earlier.png" }),
    record({ media_role: "set", client_original_filename: "A (2).png", current_legacy_image: "img/perfumes/webp/A (2).webp" }),
  ];
  const plan = planProductMedia("x", records, () => null);
  const order = plan.items.map((item) => `${item.mediaRole}:${item.record.client_original_filename}`);
  assert.deepEqual(order, [
    "set:A (2).png",
    "bottle:A.png",
    "additional:A-earlier.png",
    "additional:Z-later.png",
  ]);
});

test("buildMediaMigrationPlan groups by product and skips AMBIGUOUS/NO_MATCH/CLIENT_ASSET_MISSING entirely", () => {
  const manifest = {
    records: [
      record({ legacy_product_id: "p1", media_role: "bottle", client_original_filename: "P1.png" }),
      record({ legacy_product_id: "p2", media_role: "bottle", status: "AMBIGUOUS", client_original_filename: "P2.png" }),
      record({ legacy_product_id: "p3", media_role: null, status: "CLIENT_ASSET_MISSING", client_original_filename: null }),
    ],
  };
  const plan = buildMediaMigrationPlan(manifest, () => null);
  assert.equal(plan.eligibleCount, 1);
  assert.equal(plan.products.length, 1);
  assert.equal(plan.products[0].legacyProductId, "p1");
});
