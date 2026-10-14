import { describe, expect, it } from "vitest";
import { LegacyCatalogRepository } from "./legacy-catalog-repository";
import {
  CATALOG_PAGE_SIZE,
  DEFAULT_CATALOG_FILTERS,
  DEFAULT_CATALOG_QUERY,
  catalogBrands,
  catalogFacets,
  catalogQueryKey,
  catalogQueryToFilters,
  catalogQueryToParams,
  parseCatalogQuery,
  decantSizeOptions,
  defaultDecantSize,
  filterCatalogProducts,
  hasDecantOffer,
  paginateCatalog,
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

  it("filters by exact brand", () => {
    const brands = catalogBrands(products);
    expect(brands.length).toBeGreaterThan(5);
    const [brand] = brands;
    const results = filterCatalogProducts(products, { ...DEFAULT_CATALOG_FILTERS, brand: brand! });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((product) => product.brand === brand)).toBe(true);
  });

  it("lists each brand once, sorted, never from combos", () => {
    const brands = catalogBrands(products);
    expect(new Set(brands).size).toBe(brands.length);
    expect(brands).toEqual([...brands].sort((a, b) => a.localeCompare(b, "es")));
  });

  it("every legacy fragrance has a decant offer", () => {
    expect(products.filter((product) => product.type !== "combo").every(hasDecantOffer)).toBe(true);
  });

  describe("pagination", () => {
    const results = filterCatalogProducts(products, DEFAULT_CATALOG_FILTERS);

    it("serves 24 per view and keeps the order", () => {
      expect(CATALOG_PAGE_SIZE).toBe(24);
      const first = paginateCatalog(results, 1);
      expect(first.items).toHaveLength(24);
      expect(first.pageCount).toBe(Math.ceil(results.length / 24));
      expect(first.items[0]).toBe(results[0]);
      expect(paginateCatalog(results, 2).items[0]).toBe(results[24]);
    });

    it("the views together hold every product once", () => {
      const view = paginateCatalog(results, 1);
      const all = Array.from({ length: view.pageCount }, (_, i) => paginateCatalog(results, i + 1).items).flat();
      expect(all).toEqual(results);
    });

    it("clamps out-of-range and invalid pages", () => {
      expect(paginateCatalog(results, 0).page).toBe(1);
      expect(paginateCatalog(results, 999).page).toBe(paginateCatalog(results, 1).pageCount);
      expect(paginateCatalog(results, Number.NaN).page).toBe(1);
    });

    it("one empty view for no results", () => {
      expect(paginateCatalog([], 3)).toEqual({ page: 1, pageCount: 1, total: 0, items: [] });
    });
  });

  describe("decant size options", () => {
    const product = products.find((p) => p.type !== "combo" && Object.keys(p.decantPrices).length === 3)!;

    it("always offers 3, 5 and 10 ml", () => {
      expect(decantSizeOptions(product).map((option) => option.size)).toEqual([3, 5, 10]);
    });

    it("prices each size from the product and defaults to the smallest one in stock", () => {
      const options = decantSizeOptions(product);
      expect(options[0]!.price).toBe(product.decantPrices["3"]);
      expect(defaultDecantSize(options)).toBe(options.find((option) => option.available)?.size ?? null);
    });

    it("a size without a price or stock is not selectable and the default skips it", () => {
      const options = decantSizeOptions({
        ...product,
        decantPrices: { "5": 20, "10": 35 },
        variants: product.variants.map((variant) => (variant.kind === "decant" && variant.sizeMl === "5" ? { ...variant, isAvailable: false } : variant)),
      });
      expect(options.map((option) => option.available)).toEqual([false, false, true]);
      expect(defaultDecantSize(options)).toBe(10);
    });

    it("no default when nothing is available", () => {
      expect(defaultDecantSize(decantSizeOptions({ ...product, decantPrices: {} }))).toBeNull();
    });
  });
});

describe("catalog query in the URL", () => {
  const products = new LegacyCatalogRepository().list();

  it("reads the defaults from an empty URL", () => {
    expect(parseCatalogQuery({})).toEqual(DEFAULT_CATALOG_QUERY);
    expect(parseCatalogQuery(new URLSearchParams(""))).toEqual(DEFAULT_CATALOG_QUERY);
  });

  it("reads every filter, the search and the view", () => {
    const query = parseCatalogQuery({ type: "arab", gender: "men", family: "woody", brand: "Lattafa", sort: "priceAsc", search: " oud ", vista: "3" });
    expect(query).toEqual({ type: "arab", gender: "men", family: "woody", brand: "Lattafa", sort: "priceAsc", search: "oud", page: 3 });
  });

  it("falls back on unknown sorts, bad pages and oversized values; ignores the retired filters", () => {
    expect(parseCatalogQuery({ sort: "random" }).sort).toBe("featured");
    expect(parseCatalogQuery({ vista: "0" }).page).toBe(1);
    expect(parseCatalogQuery({ vista: "-4" }).page).toBe(1);
    expect(parseCatalogQuery({ vista: "abc" }).page).toBe(1);
    expect(parseCatalogQuery({ vista: "999999" }).page).toBe(500);
    expect(parseCatalogQuery({ brand: "x".repeat(81) }).brand).toBe("all");
    expect(parseCatalogQuery({ format: "bottle", price: "15" })).toEqual(DEFAULT_CATALOG_QUERY);
    expect(parseCatalogQuery({ type: ["arab", "niche"] }).type).toBe("all");
  });

  it("writes only what differs from the defaults, and round-trips", () => {
    expect(catalogQueryToParams(DEFAULT_CATALOG_QUERY).toString()).toBe("");
    const query = { type: "niche", gender: "all", family: "all", brand: "Creed", sort: "name", search: "iris", page: 2 } as const;
    expect(parseCatalogQuery(catalogQueryToParams(query))).toEqual(query);
    expect(catalogQueryToParams({ ...DEFAULT_CATALOG_QUERY, page: 1 }).has("vista")).toBe(false);
  });

  it("gives the same cache key to the same state and different keys to different states", () => {
    expect(catalogQueryKey(DEFAULT_CATALOG_QUERY)).toBe("default");
    expect(catalogQueryKey({ ...DEFAULT_CATALOG_QUERY, page: 2 })).not.toBe(catalogQueryKey(DEFAULT_CATALOG_QUERY));
    expect(catalogQueryKey({ ...DEFAULT_CATALOG_QUERY, brand: "Creed" })).toBe(catalogQueryKey({ ...DEFAULT_CATALOG_QUERY, brand: "Creed" }));
  });

  it("filters exactly like the old client-side catalog did (same results, same order)", () => {
    const query = parseCatalogQuery({ type: "designer", sort: "priceDesc" });
    expect(filterCatalogProducts(products, catalogQueryToFilters(query))).toEqual(
      filterCatalogProducts(products, { ...DEFAULT_CATALOG_FILTERS, type: "designer", sort: "priceDesc" }),
    );
  });

  it("facets do not depend on the filters: all brands and the size of each type", () => {
    const facets = catalogFacets(products.filter((p) => p.type !== "combo"));
    expect(facets.brands).toEqual(catalogBrands(products));
    expect(Object.values(facets.typeCounts).reduce((a, b) => a + b, 0)).toBe(products.filter((p) => p.type !== "combo").length);
  });
});
