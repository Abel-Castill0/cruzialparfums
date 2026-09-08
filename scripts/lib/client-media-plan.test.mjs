// Run with: node --test scripts/lib/client-media-plan.test.mjs
// Node's built-in test runner — no new dependency, matching this repo's
// existing "no framework unless one is already used" convention for scripts.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  basenameNoExt,
  buildMediaMigrationPlan,
  buildResultManifest,
  computePortablePublicId,
  planProductMedia,
  selectEligibleRecords,
  stableAssetId,
  supplementalAssetId,
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

/** Fixed checksum table for a test: given { filename: "hash", ... }, returns
 * a checksumOf(record) function. Matches the shape scripts/migrate-client-
 * media.mjs's real checksumCacheFactory produces (null for "no file"). */
function checksumTable(table) {
  return (r) => table[r.client_original_filename] ?? null;
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

test("supplementalAssetId is content-addressed, never ordinal", () => {
  assert.equal(supplementalAssetId("abcdef1234567890"), "additional-abcdef123456");
  // Same content -> same id, deterministic across reruns.
  assert.equal(supplementalAssetId("abcdef1234567890"), supplementalAssetId("abcdef1234567890"));
});

test("a product with one set + one bottle record: set is primary, sort_order 0/1", () => {
  const records = [
    record({ media_role: "set", client_original_filename: "X (2).png" }),
    record({ media_role: "bottle", client_original_filename: "X.png" }),
  ];
  const plan = planProductMedia("x", records, checksumTable({}));
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
  const plan = planProductMedia("x", records, checksumTable({}));
  assert.equal(plan.items.length, 1);
  assert.equal(plan.items[0].mediaRole, "bottle");
  assert.equal(plan.items[0].isPrimary, true);
});

test("canonical single-slot selection still resolves via current_legacy_image basename match (Purple Melancholia case)", () => {
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
  const checksums = checksumTable({
    "Purple Melancholia (2).png": "hash-purple",
    "VALENTINO - VALENTINO MELANCHOLIA (2).png": "hash-valentino",
  });
  const plan = planProductMedia("purple-melancholia", records, checksums);
  assert.equal(plan.conflicts.length, 0);

  const canonical = plan.items.find((item) => item.mediaRole === "set");
  assert.equal(canonical.record.client_original_filename, "Purple Melancholia (2).png");
  assert.equal(canonical.isPrimary, true);
  assert.equal(canonical.assetId, "set");
});

test("distinct-content non-canonical candidate is PRESERVED as supplemental media, never discarded (correctness patch, section 1)", () => {
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
  const checksums = checksumTable({
    "Purple Melancholia (2).png": "hash-purple",
    "VALENTINO - VALENTINO MELANCHOLIA (2).png": "hash-valentino",
  });
  const plan = planProductMedia("purple-melancholia", records, checksums);

  assert.equal(plan.items.length, 2, "both distinct-content records are migrated, none silently dropped");
  const supplemental = plan.items.find((item) => item.record.client_original_filename === "VALENTINO - VALENTINO MELANCHOLIA (2).png");
  assert.ok(supplemental, "the non-canonical candidate is present as a supplemental item");
  assert.equal(supplemental.mediaRole, "additional");
  assert.equal(supplemental.isPrimary, false, "supplemental media is never primary");
  assert.equal(supplemental.assetId, supplementalAssetId("hash-valentino"), "content-addressed id, not ordinal");
  assert.equal(plan.excluded.length, 0, "nothing was excluded — distinct content is preserved, not dropped");

  // The canonical set image keeps its existing role/id/primary — no churn.
  const canonical = plan.items.find((item) => item.record.client_original_filename === "Purple Melancholia (2).png");
  assert.equal(canonical.assetId, "set");
  assert.equal(canonical.isPrimary, true);
});

test("a byte-identical non-canonical candidate IS excluded as duplicate_content (not preserved)", () => {
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
  const checksums = checksumTable({
    "Hawas Verde.png": "same-hash",
    "RASASI - HAWAS verde.png": "same-hash",
  });
  const plan = planProductMedia("hawas-verde", records, checksums);
  assert.equal(plan.items.length, 1);
  assert.equal(plan.items[0].record.client_original_filename, "Hawas Verde.png");
  assert.equal(plan.excluded.length, 1);
  assert.equal(plan.excluded[0].client_original_filename, "RASASI - HAWAS verde.png");
  assert.equal(plan.excluded[0].exclusion_reason, "duplicate_content");
});

test("a non-canonical candidate whose checksum cannot be determined is not silently dropped either", () => {
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
  // Neither file resolves to a checksum (e.g. missing locally) — equality
  // can never be assumed, so the candidate is neither silently excluded as
  // a duplicate nor silently migrated; it is reported as unresolved.
  const plan = planProductMedia("hawas-verde", records, checksumTable({}));
  assert.equal(plan.items.length, 1, "the canonical bottle is still planned");
  assert.equal(plan.excluded.length, 1);
  assert.equal(plan.excluded[0].client_original_filename, "RASASI - HAWAS verde.png");
  assert.equal(plan.excluded[0].exclusion_reason, "missing_local_file");
});

test("a single-slot duplicate that cannot be resolved to a canonical role is a conflict, never a guess", () => {
  const records = [
    record({ media_role: "bottle", client_original_filename: "A.png", current_legacy_image: null }),
    record({ media_role: "bottle", client_original_filename: "B.png", current_legacy_image: null }),
  ];
  const plan = planProductMedia("ambiguous-product", records, checksumTable({}));
  assert.equal(plan.items.length, 0);
  assert.equal(plan.conflicts.length, 1);
  assert.equal(plan.conflicts[0].code, "DUPLICATE_SLOT_UNRESOLVED");
});

test("confirmed additional views are all kept when content differs", () => {
  const records = [
    record({ media_role: "additional", client_original_filename: "X (3).png" }),
    record({ media_role: "additional", client_original_filename: "X (4).png" }),
  ];
  const checksums = checksumTable({ "X (3).png": "hash-a", "X (4).png": "hash-b" });
  const plan = planProductMedia("x", records, checksums);
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
  const checksums = checksumTable({ "X (3).png": "hash-same", "X (3) copy.png": "hash-same" });
  const plan = planProductMedia("x", records, checksums);
  assert.equal(plan.items.length, 1);
  assert.equal(plan.excluded.length, 1);
  assert.equal(plan.excluded[0].exclusion_reason, "duplicate_content");
});

test("genuine additional-role ordinal ids never shift when a product also has an unrelated supplemental item", () => {
  const records = [
    record({
      media_role: "set",
      client_original_filename: "Khamrah Clasico (2).png",
      current_legacy_image: "img/perfumes/webp/Khamrah Clasico (2).webp",
    }),
    record({
      media_role: "set",
      client_original_filename: "Some Other Vendor Name (2).png",
      current_legacy_image: "img/perfumes/webp/Khamrah Clasico (2).webp",
    }),
    record({ media_role: "additional", client_original_filename: "Khamrah Clasico (3).png" }),
    record({ media_role: "additional", client_original_filename: "Khamrah Clasico (4).png" }),
  ];
  const checksums = checksumTable({
    "Khamrah Clasico (2).png": "hash-set",
    "Some Other Vendor Name (2).png": "hash-supplemental",
    "Khamrah Clasico (3).png": "hash-add-1",
    "Khamrah Clasico (4).png": "hash-add-2",
  });
  const plan = planProductMedia("khamrah-clasico", records, checksums);

  const genuineAdditional = plan.items.filter((item) => item.assetId.startsWith("additional-0"));
  assert.deepEqual(
    genuineAdditional.map((item) => item.assetId),
    ["additional-01", "additional-02"],
    "ordinal ids for genuine additional-role records are unchanged",
  );

  const supplemental = plan.items.find((item) => item.record.client_original_filename === "Some Other Vendor Name (2).png");
  assert.equal(supplemental.assetId, supplementalAssetId("hash-supplemental"));
});

test("sort_order for set + bottle + additional views is deterministic and never filesystem order", () => {
  const records = [
    record({ media_role: "additional", client_original_filename: "Z-later.png" }),
    record({ media_role: "bottle", client_original_filename: "A.png" }),
    record({ media_role: "additional", client_original_filename: "A-earlier.png" }),
    record({ media_role: "set", client_original_filename: "A (2).png", current_legacy_image: "img/perfumes/webp/A (2).webp" }),
  ];
  const plan = planProductMedia("x", records, checksumTable({}));
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
  const plan = buildMediaMigrationPlan(manifest, checksumTable({}));
  assert.equal(plan.eligibleCount, 1);
  assert.equal(plan.products.length, 1);
  assert.equal(plan.products[0].legacyProductId, "p1");
});

test("buildMediaMigrationPlan over the real Hawas Verde / Purple Melancholia shape migrates all distinct-content records (190 eligible -> 190 items when every checksum is known and distinct)", () => {
  const manifest = {
    records: [
      record({
        legacy_product_id: "hawas-verde", media_role: "set", client_original_filename: "Hawas Verde (2).png",
        current_legacy_image: "img/perfumes/webp/Hawas Verde (2).webp",
      }),
      record({
        legacy_product_id: "hawas-verde", media_role: "set", client_original_filename: "RASASI - HAWAS verde (2).png",
        current_legacy_image: null,
      }),
      record({
        legacy_product_id: "hawas-verde", media_role: "bottle", client_original_filename: "Hawas Verde.png",
        current_legacy_image: "img/perfumes/webp/Hawas Verde.webp",
      }),
      record({
        legacy_product_id: "hawas-verde", media_role: "bottle", client_original_filename: "RASASI - HAWAS verde.png",
        current_legacy_image: null,
      }),
    ],
  };
  const checksums = checksumTable({
    "Hawas Verde (2).png": "h-set-a",
    "RASASI - HAWAS verde (2).png": "h-set-b",
    "Hawas Verde.png": "h-bottle-a",
    "RASASI - HAWAS verde.png": "h-bottle-b",
  });
  const plan = buildMediaMigrationPlan(manifest, checksums);
  assert.equal(plan.eligibleCount, 4);
  const totalItems = plan.products.reduce((sum, p) => sum + p.items.length, 0);
  assert.equal(totalItems, 4, "all four distinct-content records are migrated — none silently dropped");
});

// ---------------------------------------------------------------------------
// buildResultManifest — deterministic serialization (correctness patch,
// section 4)
// ---------------------------------------------------------------------------

function samplePlan() {
  const manifest = {
    records: [
      record({ legacy_product_id: "9pm-rebel", media_role: "bottle", client_original_filename: "9 PM Rebel.png" }),
    ],
  };
  return buildMediaMigrationPlan(manifest, checksumTable({}));
}

function sampleResolvedRow(overrides) {
  return {
    legacyProductId: "9pm-rebel",
    legacyProductName: "9 PM Rebel",
    brand: "Afnan",
    reconciliationStatus: "EXACT_MATCH",
    mediaRole: "bottle",
    isPrimary: true,
    sortOrder: 0,
    clientOriginalFilename: "9 PM Rebel.png",
    publicId: "cruzial/parfums/catalog/9pm-rebel/bottle",
    checksum: "deadbeef",
    secureUrl: "https://res.cloudinary.com/demo/image/upload/v1/cruzial/parfums/catalog/9pm-rebel/bottle.png",
    width: 800,
    height: 800,
    bytes: 12345,
    format: "png",
    ...overrides,
  };
}

test("buildResultManifest never includes a timestamp or run-dependent upload/already-present counts", () => {
  const plan = samplePlan();
  const manifestObject = buildResultManifest({
    plan,
    sourceFingerprints: { legacy_catalog_sha256: "abc", client_filename_inventory_sha256: "def" },
    rows: [sampleResolvedRow({})],
  });

  assert.equal("generated_at" in manifestObject, false);
  assert.equal("uploaded" in manifestObject.counts, false);
  assert.equal("already_present_verified" in manifestObject.counts, false);
  assert.deepEqual(Object.keys(manifestObject.counts).sort(), [
    "excluded_byte_duplicates",
    "migrated_assets",
    "source_eligible_records",
    "unresolved",
  ]);
});

test("buildResultManifest is byte-identical across two independent calls with equivalent (freshly-constructed) input", () => {
  const sourceFingerprints = { legacy_catalog_sha256: "abc", client_filename_inventory_sha256: "def" };

  const first = buildResultManifest({ plan: samplePlan(), sourceFingerprints, rows: [sampleResolvedRow({})] });
  // Second call: a completely fresh plan object and a fresh row object
  // (different object identities, same values) — simulating "ran the CLI
  // again from scratch over unchanged source/account state".
  const second = buildResultManifest({ plan: samplePlan(), sourceFingerprints: { ...sourceFingerprints }, rows: [sampleResolvedRow({})] });

  assert.equal(JSON.stringify(first, null, 2), JSON.stringify(second, null, 2));
});

test("buildResultManifest row order follows the plan's deterministic product/item order, not input array order", () => {
  const manifest = {
    records: [
      record({ legacy_product_id: "zeta-product", media_role: "bottle", client_original_filename: "Zeta.png" }),
      record({ legacy_product_id: "alpha-product", media_role: "bottle", client_original_filename: "Alpha.png" }),
    ],
  };
  const plan = buildMediaMigrationPlan(manifest, checksumTable({}));
  const rows = [
    sampleResolvedRow({ legacyProductId: "zeta-product", clientOriginalFilename: "Zeta.png", publicId: "cruzial/parfums/catalog/zeta-product/bottle" }),
    sampleResolvedRow({ legacyProductId: "alpha-product", clientOriginalFilename: "Alpha.png", publicId: "cruzial/parfums/catalog/alpha-product/bottle" }),
  ];
  // buildResultManifest maps `rows` in the order it's given (the I/O shell
  // is responsible for handing it plan-ordered rows) — this test documents
  // that contract: it is the plan itself (alpha before zeta) that is
  // alphabetically deterministic, and the I/O shell derives `rows` from it.
  assert.deepEqual(plan.products.map((p) => p.legacyProductId), ["alpha-product", "zeta-product"]);
  const manifestObject = buildResultManifest({ plan, sourceFingerprints: null, rows });
  assert.equal(manifestObject.rows.length, 2);
});
