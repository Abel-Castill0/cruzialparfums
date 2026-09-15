import { describe, expect, it } from "vitest";

import {
  buildLegacyCatalogEntries,
  type LegacySourceProduct,
} from "../../../../../scripts/etl-legacy-catalog.mjs";

function sourceProduct(overrides: Partial<LegacySourceProduct> = {}): LegacySourceProduct {
  return {
    id: "sample-product",
    name: "Sample Product",
    type: "arab",
    family: "Ámbar",
    price: { 3: 12, 5: 16, 10: 26 },
    bottle: {},
    ...overrides,
  };
}

describe("4K-C2 legacy combo staging", () => {
  it("stages an official-PDF-confirmed combo as a normal product entry with conservative variants", () => {
    const result = buildLegacyCatalogEntries([sourceProduct({
      id: "combo-sample",
      name: "Sample Combo",
      type: "combo",
      officialPdfMembers: ["sample-product"],
      price: { 3: 27, 5: 39, 10: 65 },
    })]);

    expect(result.blocked).toEqual([]);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      legacy_id: "combo-sample",
      product: { legacy_id: "combo-sample", slug: "combo-sample", publication_status: "draft" },
      combo: {
        composition_verification_status: "official_pdf",
        source_state: "OFFICIAL_PDF_CONFIRMED",
        composition_legacy_ids: ["sample-product"],
      },
    });
    expect(result.entries[0]?.variants).toHaveLength(3);
    expect(result.entries[0]?.variants.every((variant) => variant.price_verification_status === "legacy")).toBe(true);
  });

  it("keeps a combo without confirmed composition blocked", () => {
    const result = buildLegacyCatalogEntries([sourceProduct({ id: "combo-pending", type: "combo" })]);

    expect(result.entries).toEqual([]);
    expect(result.blocked).toEqual([{
      legacy_id: "combo-pending",
      reason: "combo composition is CLIENT_PROVIDED_PENDING_RECONFIRMATION",
    }]);
  });

  it("keeps a confirmed combo blocked unless all exact 3/5/10 prices are positive", () => {
    const result = buildLegacyCatalogEntries([sourceProduct({
      id: "combo-invalid-price",
      type: "combo",
      officialPdfMembers: ["sample-product"],
      price: { 3: 27, 5: 39 },
    })]);

    expect(result.entries).toEqual([]);
    expect(result.blocked[0]?.reason).toContain("valid positive 3/5/10 prices");
  });

  it("preserves combo media and olfactory-family data without inventing a combo commercial category", () => {
    const result = buildLegacyCatalogEntries([sourceProduct({
      id: "combo-media",
      name: "Media Combo",
      type: "combo",
      family: "Gourmand",
      img: "img/combos/media.webp",
      officialPdfMembers: ["sample-product"],
    })]);
    const entry = result.entries[0];

    expect(entry?.categories).toEqual([{ kind: "olfactory_family", slug: "gourmand" }]);
    expect(entry?.media).toEqual([expect.objectContaining({ secure_url: "img/combos/media.webp", is_primary: true })]);
  });

  it("does not change an existing non-combo entry when confirmed combos are added", () => {
    const normal = sourceProduct();
    const withoutCombo = buildLegacyCatalogEntries([normal]).entries[0];
    const withCombo = buildLegacyCatalogEntries([
      normal,
      sourceProduct({ id: "combo-sample", name: "Sample Combo", type: "combo", officialPdfMembers: ["sample-product"] }),
    ]).entries.find((entry) => entry.legacy_id === "sample-product");

    expect(withCombo).toEqual(withoutCombo);
  });
});
