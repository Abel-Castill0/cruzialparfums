import "server-only";

import { unstable_cache } from "next/cache";
import {
  catalogFacets,
  catalogQueryKey,
  catalogQueryToFilters,
  filterCatalogProducts,
  hasBottleVariant,
  minimumPrice,
  paginateCatalog,
  type CatalogFacets,
  type CatalogQuery,
} from "@/domains/catalog/catalog-query";
import { toBottleCardProduct, type CatalogBottleCardProduct } from "@/domains/catalog/bottle-card-product";
import { loadParfumsStorefront } from "./parfums-storefront";
import { PARFUMS_CATALOG_CACHE_TAG, PARFUMS_CATALOG_REVALIDATE_SECONDS } from "./parfums-storefront-cache";

export type FrascosPageData = CatalogFacets & {
  items: CatalogBottleCardProduct[];
  /** The view actually served (a `?vista=` beyond the last one is clamped). */
  page: number;
  pageCount: number;
  /** Products with a whole-bottle offer, across every view. */
  total: number;
  /** The storefront could not read the catalog (shown as a notice, not as an empty catalog). */
  source: "supabase" | "legacy_fixture" | "unavailable";
};

/**
 * One view of the whole-bottle catalog (`/parfums/frascos`), computed on the server from the storefront's already cached
 * rows: keep only products with a bottle offer, filter and search, then sort by the bottle price the customer actually
 * pays (the shared filter sorts by decant price, which is the wrong axis here) and keep the requested view as card
 * projections. Cached per query under the catalog tag, so an admin mutation invalidates it with the rows.
 */
async function computeFrascosPage(query: CatalogQuery): Promise<FrascosPageData> {
  const { catalog, source } = await loadParfumsStorefront();
  const products = catalog.listFragrances().filter(hasBottleVariant);
  const results = filterCatalogProducts(products, catalogQueryToFilters(query));
  if (query.sort === "priceAsc") {
    results.sort((a, b) => minimumPrice(a.bottlePrices!) - minimumPrice(b.bottlePrices!));
  } else if (query.sort === "priceDesc") {
    results.sort((a, b) => minimumPrice(b.bottlePrices!) - minimumPrice(a.bottlePrices!));
  }
  const view = paginateCatalog(results, query.page);
  return {
    ...catalogFacets(products),
    items: view.items.map(toBottleCardProduct),
    page: view.page,
    pageCount: view.pageCount,
    total: view.total,
    source,
  };
}

const cachedFrascosPage = unstable_cache(
  async (key: string, query: CatalogQuery) => {
    void key;
    return computeFrascosPage(query);
  },
  ["parfums-frascos-page"],
  { revalidate: PARFUMS_CATALOG_REVALIDATE_SECONDS, tags: [PARFUMS_CATALOG_CACHE_TAG] },
);

export function loadFrascosPage(query: CatalogQuery): Promise<FrascosPageData> {
  return cachedFrascosPage(catalogQueryKey(query), query);
}
