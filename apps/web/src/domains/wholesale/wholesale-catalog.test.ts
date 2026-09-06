import { describe, expect, it } from "vitest";
import { LegacyCatalogRepository } from "../catalog/legacy-catalog-repository";
import { filterWholesaleCatalog } from "./wholesale-catalog";

describe("wholesale catalog", () => {
  const entries = new LegacyCatalogRepository().listWholesale();

  it("filters the legacy inventory by type", () => {
    expect(filterWholesaleCatalog(entries, "", "arab")).toHaveLength(67);
    expect(filterWholesaleCatalog(entries, "", "designer")).toHaveLength(22);
    expect(filterWholesaleCatalog(entries, "", "niche")).toHaveLength(4);
  });

  it("searches brand and fragrance names case-insensitively", () => {
    const results = filterWholesaleCatalog(entries, "KHAMRAH", "all");
    expect(results.map(({ product }) => product.name)).toEqual([
      "Khamrah Clásico",
      "Khamrah Dukhan",
      "Khamrah Qahwa",
      "Khamrah Waha",
    ]);
  });
});
