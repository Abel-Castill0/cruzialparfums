import { describe, expect, it } from "vitest";
import { LegacyCatalogRepository } from "../../domains/catalog/legacy-catalog-repository";
import { buildSafeProductPageStructuredData } from "./product-structured-data";

describe("safe product page structured data", () => {
  it("publishes navigation context without Product or Offer commerce claims", () => {
    const product = new LegacyCatalogRepository().findBySlug("khamrah-clasico");
    if (!product) throw new Error("Expected deterministic fixture product");
    const serialized = JSON.stringify(
      buildSafeProductPageStructuredData(product, "https://example.com/product"),
    );
    expect(serialized).toContain('"WebPage"');
    expect(serialized).toContain('"BreadcrumbList"');
    expect(serialized).not.toContain('"Product"');
    expect(serialized).not.toContain('"Offer"');
  });
});
