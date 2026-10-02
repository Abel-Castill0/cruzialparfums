import { describe, expect, it } from "vitest";
import type { PublicImportProduct } from "@/domains/import/public-import";
import { buildCategoryTiles, toImportShowcaseItems } from "./import-showcase";

function presentation(price: string, availability: "available" | "out_of_stock" = "available") {
  return {
    id: `p-${price}`,
    offerId: `o-${price}`,
    offerUpdatedAt: "2026-01-01T00:00:00Z",
    label: "Frasco",
    presentationClass: "single_fixed" as const,
    capacityMl: null,
    price,
    currency: "PEN",
    availability,
  };
}

function product(overrides: Partial<PublicImportProduct>): PublicImportProduct {
  return {
    id: "1",
    slug: "prod",
    name: "Producto",
    brand: "Marca",
    categorySlug: "cat",
    categoryName: "Cat",
    mediaUrl: "/m.webp",
    mediaAlt: "alt",
    hasApprovedMedia: true,
    presentations: [presentation("120.00")],
    ...overrides,
  };
}

describe("import home showcase", () => {
  it("skips products without approved media", () => {
    const items = toImportShowcaseItems([
      product({ id: "a", hasApprovedMedia: false }),
      product({ id: "b" }),
    ]);
    expect(items.map((item) => item.id)).toEqual(["b"]);
  });

  it("shows the lowest available price and says Desde only when there are several presentations", () => {
    const [single] = toImportShowcaseItems([product({})]);
    expect(single?.meta).toMatch(/120\.00/);
    expect(single?.meta?.startsWith("Desde")).toBe(false);
    const [multi] = toImportShowcaseItems([
      product({ presentations: [presentation("200.00"), presentation("90.00"), presentation("50.00", "out_of_stock")] }),
    ]);
    expect(multi?.meta).toMatch(/^Desde .*90\.00/);
  });

  it("never lists products without an available presentation under a rail that promises availability", () => {
    const items = toImportShowcaseItems([
      product({ id: "sold-out", presentations: [presentation("10.00", "out_of_stock")] }),
      product({ id: "no-presentations", presentations: [] }),
      product({ id: "partly", presentations: [presentation("10.00", "out_of_stock"), presentation("30.00")] }),
    ]);
    expect(items.map((item) => item.id)).toEqual(["partly"]);
    expect(items[0]?.meta).toMatch(/30\.00/);
  });

  it("fills the limit with available products, skipping sold-out ones in between", () => {
    const list = [
      product({ id: "a" }),
      product({ id: "x", presentations: [presentation("10.00", "out_of_stock")] }),
      product({ id: "b" }),
      product({ id: "c" }),
    ];
    expect(toImportShowcaseItems(list, 2).map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("borrows a category photo only from an approved product image", () => {
    const tiles = buildCategoryTiles(
      [
        { slug: "a", name: "A", productCount: 2 },
        { slug: "b", name: "B", productCount: 1 },
      ],
      [
        product({ categorySlug: "a", hasApprovedMedia: false, mediaUrl: "/fallback.png" }),
        product({ id: "2", categorySlug: "a", mediaUrl: "/real.webp" }),
      ],
    );
    expect(tiles[0]?.image).toBe("/real.webp");
    expect(tiles[1]?.image).toBeNull();
  });
});
