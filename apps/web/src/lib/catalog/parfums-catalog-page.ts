import "server-only";

import { unstable_cache } from "next/cache";
import {
  catalogFacets,
  catalogQueryKey,
  catalogQueryToFilters,
  filterCatalogProducts,
  hasDecantOffer,
  paginateCatalog,
  type CatalogFacets,
  type CatalogQuery,
} from "@/domains/catalog/catalog-query";
import { toCardProduct, type CatalogCardProduct } from "@/domains/catalog/card-product";
import { loadParfumsStorefront } from "./parfums-storefront";
import { PARFUMS_CATALOG_CACHE_TAG, PARFUMS_CATALOG_REVALIDATE_SECONDS } from "./parfums-storefront-cache";

export type CatalogPageData = CatalogFacets & {
  items: CatalogCardProduct[];
  /** The view actually served (a `?vista=` beyond the last one is clamped). */
  page: number;
  pageCount: number;
  /** Products matching the filters, across every view. */
  total: number;
  /** The storefront could not read the catalog (shown as a notice, not as an empty catalog). */
  source: "supabase" | "legacy_fixture" | "unavailable";
};

/**
 * One view of the Parfums catalog, computed on the server from the storefront's already cached rows: filter, search and
 * sort with the same domain rules the catalog always used, then keep only the requested 24 products as card projections.
 * The browser never receives the other views. The result is cached per query under the catalog tag, so an admin
 * mutation invalidates the pages together with the rows they were built from.
 *
 * Why not Supabase `.range()`: price ordering, the decant-only rule and the search over notes/family cannot be expressed
 * in PostgREST without a view or RPC, and a schema change cannot be rolled out with this change. `loadCatalogPage` is the
 * seam: replacing its body by an RPC (`public_list_parfums_catalog`) changes nothing for the page or the client.
 */
async function computeCatalogPage(query: CatalogQuery): Promise<CatalogPageData> {
  const { catalog, source } = await loadParfumsStorefront();
  const products = catalog.listFragrances().filter(hasDecantOffer);
  const results = filterCatalogProducts(products, catalogQueryToFilters(query));
  const view = paginateCatalog(results, query.page);
  return {
    ...catalogFacets(products),
    items: view.items.map(toCardProduct),
    page: view.page,
    pageCount: view.pageCount,
    total: view.total,
    source,
  };
}

const cachedCatalogPage = unstable_cache(
  async (key: string, query: CatalogQuery) => {
    void key;
    return computeCatalogPage(query);
  },
  ["parfums-catalog-page"],
  { revalidate: PARFUMS_CATALOG_REVALIDATE_SECONDS, tags: [PARFUMS_CATALOG_CACHE_TAG] },
);

export function loadCatalogPage(query: CatalogQuery): Promise<CatalogPageData> {
  return cachedCatalogPage(catalogQueryKey(query), query);
}
