import { describe, expect, it } from "vitest";
import type { CatalogProduct } from "@/domains/catalog/types";
import { countFragrancesByType, selectShowcaseProducts, toShowcaseItem } from "./showcase";

function product(overrides: Partial<CatalogProduct>): CatalogProduct {
  return {
    slug: "p",
    brand: "Marca",
    name: "Nombre",
    type: "arab",
    hidden: false,
    availabilityStatus: "available",
    imageUrl: "/x.webp",
    imageAlt: "alt",
    decantPrices: { "3": 20, "5": 30 },
    ...overrides,
  } as CatalogProduct;
}

describe("parfums home showcase", () => {
  it("leads with featured, fills from the catalog, de-duplicates and respects the limit", () => {
    const a = product({ slug: "a" });
    const b = product({ slug: "b" });
    const c = product({ slug: "c" });
    expect(selectShowcaseProducts([b], [a, b, c], 3).map((p) => p.slug)).toEqual(["b", "a", "c"]);
    expect(selectShowcaseProducts([b], [a, b, c], 2).map((p) => p.slug)).toEqual(["b", "a"]);
  });

  it("mixes brands instead of filling the rail with one house", () => {
    const list = [
      product({ slug: "l1", brand: "Lattafa" }),
      product({ slug: "l2", brand: "Lattafa" }),
      product({ slug: "l3", brand: "Lattafa" }),
      product({ slug: "a1", brand: "Afnan" }),
      product({ slug: "r1", brand: "Rasasi" }),
    ];
    expect(selectShowcaseProducts([], list, 4).map((p) => p.slug)).toEqual(["l1", "a1", "r1", "l2"]);
  });

  it("never shows hidden, out-of-stock or imageless products", () => {
    const list = [
      product({ slug: "hidden", hidden: true }),
      product({ slug: "oos", availabilityStatus: "out_of_stock" }),
      product({ slug: "noimg", imageUrl: null }),
      product({ slug: "ok" }),
    ];
    expect(selectShowcaseProducts([], list).map((p) => p.slug)).toEqual(["ok"]);
  });

  it("derives the card from real data and omits a price it cannot know", () => {
    expect(toShowcaseItem(product({ slug: "s" })).meta).toBe("Desde S/ 20.00");
    expect(toShowcaseItem(product({ slug: "s", decantPrices: {} })).meta).toBeNull();
  });

  it("counts visible fragrances per type", () => {
    const counts = countFragrancesByType([
      product({ type: "arab" }),
      product({ type: "arab" }),
      product({ type: "niche" }),
      product({ type: "designer", hidden: true }),
    ]);
    expect(counts).toMatchObject({ arab: 2, niche: 1, designer: 0 });
  });
});
