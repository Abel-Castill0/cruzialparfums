import { describe, expect, it } from "vitest";
import { LegacyCatalogRepository } from "../catalog/legacy-catalog-repository";
import {
  calculateParfumsCartTotal,
  formatParfumsVariant,
  resolveParfumsCart,
} from "./parfums-cart-pricing";

describe("Parfums cart pricing", () => {
  const products = new LegacyCatalogRepository().listFragrances();

  it("resolves decant and bottle variants from catalog pricing", () => {
    const resolved = resolveParfumsCart([
      { productId: "khamrah-clasico", variantId: "decant-5ml", quantity: 2 },
      { productId: "khamrah-clasico", variantId: "bottle-100ml", quantity: 1 },
    ], products);

    expect(resolved.map((line) => line.subtotal)).toEqual([32, 380]);
    expect(calculateParfumsCartTotal(resolved)).toBe(412);
    expect(formatParfumsVariant(resolved[0]!)).toBe("Decant 5 ml");
    expect(formatParfumsVariant(resolved[1]!)).toBe("Frasco 100 ml");
  });

  it("fails closed for stale products, variants and discontinued items", () => {
    expect(resolveParfumsCart([
      { productId: "missing", variantId: "decant-3ml", quantity: 1 },
      { productId: "khamrah-clasico", variantId: "missing", quantity: 1 },
      { productId: "lovely-cherry", variantId: "decant-3ml", quantity: 1 },
    ], products)).toEqual([]);
  });
});
