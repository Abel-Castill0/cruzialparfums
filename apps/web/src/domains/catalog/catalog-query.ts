import type { CatalogProduct } from "./types";

export type CatalogSort = "featured" | "priceAsc" | "priceDesc" | "name";

export type CatalogFilters = {
  search: string;
  gender: string;
  family: string;
  type: string;
  /** Exact brand name, or "all". */
  brand: string;
  format: string;
  price: string;
  sort: CatalogSort;
};

export const DEFAULT_CATALOG_FILTERS: CatalogFilters = {
  search: "",
  gender: "all",
  family: "all",
  type: "all",
  brand: "all",
  format: "all",
  price: "all",
  sort: "featured",
};

export function minimumPrice(prices: Record<string, number>): number {
  return Math.min(...Object.values(prices));
}

export function filterCatalogProducts(
  products: readonly CatalogProduct[],
  filters: CatalogFilters,
): CatalogProduct[] {
  const query = filters.search.trim().toLocaleLowerCase("es");
  let results = products.filter((product) => product.type !== "combo");

  if (query) {
    results = results.filter((product) =>
      `${product.brand} ${product.name} ${product.notes.join(" ")} ${product.family}`
        .toLocaleLowerCase("es")
        .includes(query),
    );
  }
  if (filters.gender !== "all") {
    results = results.filter((product) => product.gender === filters.gender);
  }
  if (filters.family !== "all") {
    results = results.filter((product) => product.family === filters.family);
  }
  if (filters.type !== "all") {
    results = results.filter((product) => product.type === filters.type);
  }
  if (filters.brand !== "all") {
    results = results.filter((product) => product.brand === filters.brand);
  }
  if (filters.format === "bottle") {
    results = results.filter((product) => product.bottlePrices !== null);
  }
  if (filters.price === "15") {
    results = results.filter(
      (product) => minimumPrice(product.decantPrices) <= 15,
    );
  } else if (filters.price === "25") {
    results = results.filter((product) => {
      const price = minimumPrice(product.decantPrices);
      return price > 15 && price <= 25;
    });
  } else if (filters.price === "26+") {
    results = results.filter(
      (product) => minimumPrice(product.decantPrices) > 25,
    );
  }

  if (filters.sort === "priceAsc") {
    results.sort(
      (a, b) => minimumPrice(a.decantPrices) - minimumPrice(b.decantPrices),
    );
  } else if (filters.sort === "priceDesc") {
    results.sort(
      (a, b) => minimumPrice(b.decantPrices) - minimumPrice(a.decantPrices),
    );
  } else if (filters.sort === "name") {
    results.sort((a, b) => a.name.localeCompare(b.name, "es"));
  }

  return results;
}

/** Products shown per view of the Parfums catalog. */
export const CATALOG_PAGE_SIZE = 24;

/** The Parfums catalog sells decants only (whole bottles have their own route), so a product with no decant price has no place in it. */
export function hasDecantOffer(product: CatalogProduct): boolean {
  return Object.keys(product.decantPrices).length > 0;
}

/** Distinct brands of the given products, sorted for display (Spanish collation). */
export function catalogBrands(products: readonly CatalogProduct[]): string[] {
  const brands = new Set<string>();
  for (const product of products) {
    const brand = product.brand.trim();
    if (brand && product.type !== "combo") brands.add(brand);
  }
  return [...brands].sort((a, b) => a.localeCompare(b, "es"));
}

export type CatalogView<T> = {
  /** 1-based, clamped into 1..pageCount. */
  page: number;
  pageCount: number;
  total: number;
  items: T[];
};

/** One "Vista" of the results. An out-of-range or non-numeric page falls back to the nearest valid one. */
export function paginateCatalog<T>(items: readonly T[], page: number, pageSize: number = CATALOG_PAGE_SIZE): CatalogView<T> {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safe = Number.isFinite(page) ? Math.min(pageCount, Math.max(1, Math.trunc(page))) : 1;
  return { page: safe, pageCount, total: items.length, items: items.slice((safe - 1) * pageSize, safe * pageSize) };
}

export const DECANT_SIZES = [3, 5, 10] as const;
export type DecantSize = (typeof DECANT_SIZES)[number];

export type DecantSizeOption = {
  size: DecantSize;
  price: number | null;
  /** Priced and in stock: only these can be selected. */
  available: boolean;
};

/** The three decant sizes of a product with their price and whether each can be bought right now. */
export function decantSizeOptions(product: CatalogProduct): DecantSizeOption[] {
  return DECANT_SIZES.map((size) => {
    const price = product.decantPrices[String(size)] ?? null;
    const inStock = product.variants.some(
      (variant) => variant.kind === "decant" && variant.sizeMl === String(size) && variant.isAvailable,
    );
    return { size, price, available: price !== null && inStock };
  });
}

/** Smallest size that can be bought, or null when none can. */
export function defaultDecantSize(options: readonly DecantSizeOption[]): DecantSize | null {
  return options.find((option) => option.available)?.size ?? null;
}
