import { describe, expect, it } from "vitest";
import { LegacyCatalogRepository } from "./legacy-catalog-repository";
import {
  DEFAULT_CATALOG_FILTERS,
  filterCatalogProducts,
} from "./catalog-query";

describe("catalog query", () => {
  const products = new LegacyCatalogRepository().list();

  it("starts with the 95 visible legacy fragrances, including discontinued states", () => {
    // 96 active minus hidden `bir-intense` (client does not carry it) = 95.
    const results = filterCatalogProducts(products, DEFAULT_CATALOG_FILTERS);
    expect(results).toHaveLength(95);
    expect(results.filter((product) => product.discontinued)).toHaveLength(3);
    expect(results.some((product) => product.type === "combo")).toBe(false);
    expect(results.some((product) => product.legacyId === "bir-intense")).toBe(false);
  });

  it("keeps the exact 22 visible bottle-price records available to parity UI", () => {
    // 23 legacy bottle records minus hidden `bir-intense` = 22.
    expect(
      filterCatalogProducts(products, {
        ...DEFAULT_CATALOG_FILTERS,
        format: "bottle",
      }),
    ).toHaveLength(22);
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
