import { describe, expect, it } from "vitest";
import { LegacyCatalogRepository } from "./legacy-catalog-repository";
import { bottleSizeOptions, defaultBottleSize, toBottleCardProduct } from "./bottle-card-product";

describe("whole-bottle card projection", () => {
  const products = new LegacyCatalogRepository().list();
  const product = products.find((item) => item.type !== "combo" && item.bottlePrices !== null)!;
  const card = toBottleCardProduct(product);

  it("keeps what a bottle card reads", () => {
    expect(card.slug).toBe(product.slug);
    expect(card.name).toBe(product.name);
    expect(card.brand).toBe(product.brand);
    expect(card.imageUrl).toBe(product.imageUrl);
    expect(card.availabilityStatus).toBe(product.availabilityStatus);
    expect(card.bottlePrices).toEqual(product.bottlePrices);
  });

  it("drops the editorial payload it never reads, so the page payload stays small", () => {
    const keys = Object.keys(card);
    expect(keys).not.toContain("description");
    expect(keys).not.toContain("notes");
    expect(keys).not.toContain("media");
    expect(keys).not.toContain("decantPrices");
    expect(keys).not.toContain("comboContent");
    expect(JSON.stringify(card).length).toBeLessThan(JSON.stringify(product).length);
  });

  it("keeps only bottle variants, and only their kind, size and stock", () => {
    expect(card.variants.length).toBeGreaterThan(0);
    expect(card.variants.every((variant) => variant.kind === "bottle")).toBe(true);
    for (const variant of card.variants) expect(Object.keys(variant).sort()).toEqual(["isAvailable", "kind", "sizeMl"]);
  });
});

describe("whole-bottle size options", () => {
  const products = new LegacyCatalogRepository().list();
  const product = products.find((item) => item.type !== "combo" && item.bottlePrices !== null && Object.keys(item.bottlePrices).length >= 2)!;

  it("prices each bottle size from the product, smallest first, defaulting to the smallest in stock", () => {
    const options = bottleSizeOptions(product);
    expect(options.length).toBe(Object.keys(product.bottlePrices!).length);
    expect(options.map((option) => option.size)).toEqual([...options.map((option) => option.size)].sort((a, b) => a - b));
    for (const option of options) expect(option.price).toBe(product.bottlePrices![String(option.size)]);
    expect(defaultBottleSize(options)).toBe(options.find((option) => option.available)?.size ?? null);
    expect(defaultBottleSize(options)).toBe(options[0]!.size);
  });

  it("a size with no stock is not selectable and the default skips it", () => {
    const firstSize = String(bottleSizeOptions(product)[0]!.size);
    const options = bottleSizeOptions({
      bottlePrices: product.bottlePrices,
      variants: product.variants.map((variant) => (variant.kind === "bottle" && variant.sizeMl === firstSize ? { ...variant, isAvailable: false } : variant)),
    });
    expect(options.find((option) => option.size === Number(firstSize))?.available).toBe(false);
    expect(defaultBottleSize(options)).not.toBe(Number(firstSize));
    expect(defaultBottleSize(options)).toBe(options.find((option) => option.available)?.size ?? null);
  });

  it("no options and no default without bottle prices", () => {
    expect(bottleSizeOptions({ bottlePrices: null, variants: [] })).toEqual([]);
    expect(defaultBottleSize([])).toBeNull();
  });
});
