import { describe, expect, it } from "vitest";
import { toCardProduct } from "./card-product";
import { LegacyCatalogRepository } from "./legacy-catalog-repository";

describe("toCardProduct", () => {
  const product = new LegacyCatalogRepository().list().find((p) => p.type !== "combo")!;
  const card = toCardProduct(product);

  it("keeps what a card reads", () => {
    expect(card.slug).toBe(product.slug);
    expect(card.name).toBe(product.name);
    expect(card.decantPrices).toEqual(product.decantPrices);
    expect(card.availabilityStatus).toBe(product.availabilityStatus);
  });

  it("drops what a card never reads (descriptions, notes, media, bottles) and is much smaller", () => {
    const keys = Object.keys(card);
    for (const gone of ["description", "notes", "media", "bottlePrices", "comboContent", "family", "gender"]) expect(keys).not.toContain(gone);
    expect(JSON.stringify(card).length).toBeLessThan(JSON.stringify(product).length);
  });

  it("only keeps decant variants and only their kind, size and stock", () => {
    expect(card.variants.every((variant) => variant.kind === "decant")).toBe(true);
    for (const variant of card.variants) expect(Object.keys(variant).sort()).toEqual(["isAvailable", "kind", "sizeMl"]);
  });
});
