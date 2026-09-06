import { describe, expect, it } from "vitest";
import { LegacyCatalogRepository } from "./legacy-catalog-repository";
import {
  DEFAULT_CATALOG_FILTERS,
  filterCatalogProducts,
} from "./catalog-query";

describe("catalog query", () => {
  const products = new LegacyCatalogRepository().list();

  it("starts with the 96 legacy fragrances, including discontinued states", () => {
    const results = filterCatalogProducts(products, DEFAULT_CATALOG_FILTERS);
    expect(results).toHaveLength(96);
    expect(results.filter((product) => product.discontinued)).toHaveLength(3);
    expect(results.some((product) => product.type === "combo")).toBe(false);
  });

  it("keeps the exact 23 bottle-price records available to parity UI", () => {
    expect(
      filterCatalogProducts(products, {
        ...DEFAULT_CATALOG_FILTERS,
        format: "bottle",
      }),
    ).toHaveLength(23);
  });

  it("searches brand, name, notes, and family without globals", () => {
    const results = filterCatalogProducts(products, {
      ...DEFAULT_CATALOG_FILTERS,
      search: "Khamrah",
    });
    expect(results.map((product) => product.name)).toEqual([
      "Khamrah Clásico",
      "Khamrah Qahwa",
      "Khamrah Dukhan",
      "Khamrah Waha",
    ]);
  });
});
