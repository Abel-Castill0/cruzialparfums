import type { CatalogProduct } from "./types";

export type CatalogSort = "featured" | "priceAsc" | "priceDesc" | "name";

export type CatalogFilters = {
  search: string;
  gender: string;
  family: string;
  type: string;
  format: string;
  price: string;
  sort: CatalogSort;
};

export const DEFAULT_CATALOG_FILTERS: CatalogFilters = {
  search: "",
  gender: "all",
  family: "all",
  type: "all",
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
