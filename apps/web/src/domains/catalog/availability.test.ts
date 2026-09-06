import { describe, expect, it } from "vitest";
import { isProductPurchasable } from "./availability";
import type { CatalogProduct } from "./types";

function product(overrides: Partial<CatalogProduct>): CatalogProduct {
  return {
    legacyId: "test",
    slug: "test",
    brand: "Test",
    name: "Test",
    gender: "unisex",
    type: "arab",
    family: "Fresco",
    concentration: "EDP",
    decantPrices: { 3: 10 },
    bottlePrices: null,
    notes: [],
    tag: "Árabe",
    description: "",
    discontinued: false,
    bestseller: false,
    hidden: false,
    availabilityStatus: "available",
    imageUrl: null,
    decantImageUrl: null,
    bottleImageUrl: null,
    imageAlt: "",
    verificationStatus: "legacy",
    bottlePricingVerificationStatus: null,
    comboCompositionVerificationStatus: null,
    comboContent: null,
    ...overrides,
  };
}

describe("discontinued != agotado", () => {
  it("is purchasable when active and available", () => {
    expect(isProductPurchasable(product({ discontinued: false }))).toBe(true);
  });

  it("stays purchasable when discontinued but still available", () => {
    expect(
      isProductPurchasable(product({ discontinued: true, availabilityStatus: "available" })),
    ).toBe(true);
  });

  it("blocks purchase only when explicitly out of stock", () => {
    expect(
      isProductPurchasable(product({ discontinued: true, availabilityStatus: "out_of_stock" })),
    ).toBe(false);
    expect(
      isProductPurchasable(product({ discontinued: false, availabilityStatus: "out_of_stock" })),
    ).toBe(false);
  });
});
