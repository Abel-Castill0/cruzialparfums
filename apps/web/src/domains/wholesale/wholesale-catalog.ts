import type { CatalogWholesaleProduct, LegacyProductType } from "@/domains/catalog/types";

export type WholesaleFilter = "all" | Exclude<LegacyProductType, "combo">;

export function filterWholesaleCatalog(
  entries: readonly CatalogWholesaleProduct[],
  query: string,
  filter: WholesaleFilter,
) {
  const normalized = query.trim().toLocaleLowerCase("es");
  return entries.filter(({ product }) => {
    if (filter !== "all" && product.type !== filter) return false;
    if (!normalized) return true;
    return `${product.brand} ${product.name}`
      .toLocaleLowerCase("es")
      .includes(normalized);
  });
}
