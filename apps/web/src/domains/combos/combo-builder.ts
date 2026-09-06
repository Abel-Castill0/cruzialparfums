import type { CatalogProduct } from "../catalog/types";

export const COMBO_MIN_ITEMS = 3;
export const COMBO_MAX_ITEMS = 6;
export const COMBO_SIZES = [3, 5, 10] as const;

export type ComboSize = (typeof COMBO_SIZES)[number];

export function listComboEligibleProducts(products: readonly CatalogProduct[]) {
  return products.filter((product) => product.type !== "combo" && !product.discontinued);
}

export function filterComboProducts(
  products: readonly CatalogProduct[],
  query: string,
) {
  const needle = query.trim().toLocaleLowerCase("es");
  if (!needle) return products;
  return products.filter((product) =>
    `${product.brand} ${product.name} ${product.family}`
      .toLocaleLowerCase("es")
      .includes(needle),
  );
}

export function resolveComboSelection(
  products: readonly CatalogProduct[],
  selectedIds: readonly string[],
) {
  const byId = new Map(products.map((product) => [product.legacyId, product]));
  return selectedIds.flatMap((id) => byId.get(id) ?? []);
}

export function calculateComboTotal(
  products: readonly CatalogProduct[],
  size: ComboSize,
) {
  return products.reduce(
    (total, product) => total + (product.decantPrices[String(size)] ?? 0),
    0,
  );
}

export function canSendCombo(count: number) {
  return count >= COMBO_MIN_ITEMS && count <= COMBO_MAX_ITEMS;
}
