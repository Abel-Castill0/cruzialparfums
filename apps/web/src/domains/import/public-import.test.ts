import { describe, expect, it } from "vitest";
import {
  IMPORT_CATALOG_MAX_PAGE,
  IMPORT_FALLBACK_MEDIA,
  availabilityLabel,
  buildImportCatalogHref,
  formatCampaignPrice,
  mapPublicImportProduct,
  mapPublicImportProducts,
  parsePublicImportFilters,
  presentationClassLabel,
  selectPublicImportCampaign,
} from "./public-import";

const presentation = {
  id: "presentation-1",
  label: "100 ml",
  class: "single_fixed",
  capacityMl: 100,
  price: "210.00",
  currency: "PEN",
  availability: "available",
} as const;

const productRow = {
  product_id: "product-1",
  slug: "armaf-product",
  name: "Product",
  brand: "Armaf",
  category_slug: "arabic",
  category_name: "Arabic",
  media_url: null,
  media_alt: null,
  presentations: [presentation],
};

describe("public Import campaign selection", () => {
  const row = {
    number: 6,
    name: "Sexto Consolidado",
    opens_at: null,
    closes_at: null,
    public_message: null,
  };

  it("maps exactly one selected campaign", () => {
    expect(selectPublicImportCampaign([row])).toEqual({
      number: 6,
      name: "Sexto Consolidado",
      opensAt: null,
      closesAt: null,
      publicMessage: null,
    });
  });

  it("fails closed for zero or multiple campaign rows", () => {
    expect(selectPublicImportCampaign([])).toBeNull();
    expect(selectPublicImportCampaign([row, { ...row, number: 7 }])).toBeNull();
  });
});

describe("public Import URL filters", () => {
  it("trims and bounds search, category and page", () => {
    const filters = parsePublicImportFilters({
      q: `  ${"a".repeat(140)}  `,
      categoria: "arabic",
      page: "9999",
    });
    expect(filters.query).toHaveLength(120);
    expect(filters.category).toBe("arabic");
    expect(filters.page).toBe(IMPORT_CATALOG_MAX_PAGE);
  });

  it("normalizes invalid pages and preserves active filters in pagination URLs", () => {
    expect(parsePublicImportFilters({ page: "-2" }).page).toBe(1);
    expect(buildImportCatalogHref({ query: "armaf", category: "arabic", page: 2 }, { page: 3 }))
      .toBe("/import?q=armaf&categoria=arabic&page=3");
  });
});

describe("public Import product mapping", () => {
  it("groups presentation data supplied by the bounded DB row", () => {
    const mapped = mapPublicImportProduct({
      ...productRow,
      presentations: [presentation, { ...presentation, id: "presentation-2", label: "Extrait 100 ml", price: "240.00" }],
    });
    expect(mapped?.presentations).toHaveLength(2);
    expect(mapped?.presentations.map((item) => item.price)).toEqual(["210.00", "240.00"]);
  });

  it("keeps distinct canonical identities separate even when names match", () => {
    const mapped = mapPublicImportProducts([
      productRow,
      { ...productRow, product_id: "product-2", slug: "armaf-product-split" },
    ]);
    expect(mapped.map((item) => item.id)).toEqual(["product-1", "product-2"]);
  });

  it("uses the branded media fallback when no approved media exists", () => {
    const mapped = mapPublicImportProduct(productRow);
    expect(mapped?.mediaUrl).toBe(IMPORT_FALLBACK_MEDIA);
    expect(mapped?.hasApprovedMedia).toBe(false);
  });

  it("rejects rows without an eligible mapped presentation", () => {
    expect(mapPublicImportProduct({ ...productRow, presentations: [] })).toBeNull();
    expect(mapPublicImportProduct({
      ...productRow,
      presentations: [{ ...presentation, availability: "unconfirmed" }],
    })).toBeNull();
  });
});

describe("public Import presentation display", () => {
  it("maps availability and every supported presentation class", () => {
    expect(availabilityLabel("available")).toBe("Disponible");
    expect(availabilityLabel("out_of_stock")).toBe("Agotado");
    expect(presentationClassLabel("single_fixed")).toBe("Presentación única");
    expect(presentationClassLabel("multi_presentation")).toBe("Presentación");
    expect(presentationClassLabel("pack_set")).toBe("Pack o set");
    expect(presentationClassLabel("ambiguous")).toBe("Presentación indicada");
  });

  it("formats campaign prices without changing their numeric value", () => {
    expect(formatCampaignPrice("210.00", "PEN")).toContain("210.00");
  });
});
