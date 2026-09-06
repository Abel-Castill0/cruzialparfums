import { describe, expect, it } from "vitest";
import { LegacyCatalogRepository } from "./legacy-catalog-repository";
import {
  calculatePurchaseTotal,
  clampPurchaseQuantity,
  listProductPurchaseVariants,
  resolveInitialProductVariant,
} from "./product-purchase";

describe("product purchase contract", () => {
  const product = new LegacyCatalogRepository().findBySlug("khamrah-clasico");
  if (!product) throw new Error("Expected deterministic fixture product");

  it("exposes decants and the legacy bottle as variants", () => {
    expect(listProductPurchaseVariants(product)).toEqual([
      { group: "decant", size: 3, price: 12, variantId: "decant-3ml" },
      { group: "decant", size: 5, price: 16, variantId: "decant-5ml" },
      { group: "decant", size: 10, price: 26, variantId: "decant-10ml" },
      { group: "bottle", size: 100, price: 380, variantId: "bottle-100ml" },
    ]);
  });

  it("honors a bottle deep-link only when that variant exists", () => {
    expect(resolveInitialProductVariant(product, "bottle").variantId).toBe(
      "bottle-100ml",
    );
    const withoutBottle = new LegacyCatalogRepository().findBySlug("khamrah-qahwa");
    if (!withoutBottle) throw new Error("Expected deterministic fixture product");
    expect(
      resolveInitialProductVariant(withoutBottle, "bottle").variantId,
    ).toBe("decant-3ml");
  });

  it("uses one total calculation and clamps quantity to 1–99", () => {
    const variant = resolveInitialProductVariant(product, "decant");
    expect(calculatePurchaseTotal(variant, 3)).toBe(36);
    expect(clampPurchaseQuantity(0)).toBe(1);
    expect(clampPurchaseQuantity(120)).toBe(99);
  });
});
