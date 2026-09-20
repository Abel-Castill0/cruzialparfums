import type { CatalogProduct } from "../catalog/types";

export const COMBO_MIN_ITEMS = 3;
export const COMBO_MAX_ITEMS = 6;
export const COMBO_SIZES = [3, 5, 10] as const;

export type ComboSize = (typeof COMBO_SIZES)[number];

/**
 * Client-confirmed 2026-09-06 (docs/client-decisions.md): each fragrance in
 * a custom combo picks its OWN size. Changing one line's size must never
 * change any other line. `quantity` is modeled for a future per-line
 * quantity control; this builder only ever creates lines with quantity 1.
 */
export type ComboLine = {
  productId: string;
  size: ComboSize;
  quantity: number;
};

export type ResolvedComboLine = {
  product: CatalogProduct;
  line: ComboLine;
  price: number;
};

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

export function createComboLine(
  productId: string,
  size: ComboSize = COMBO_SIZES[0],
): ComboLine {
  return { productId, size, quantity: 1 };
}

export function addComboLine(
  lines: readonly ComboLine[],
  productId: string,
): ComboLine[] {
  if (lines.some((line) => line.productId === productId)) return [...lines];
  if (lines.length >= COMBO_MAX_ITEMS) return [...lines];
  return [...lines, createComboLine(productId)];
}

export function removeComboLine(
  lines: readonly ComboLine[],
  productId: string,
): ComboLine[] {
  return lines.filter((line) => line.productId !== productId);
}

/**
 * Updates the size of exactly one line. Every other line's `size` is
 * returned unchanged — this is the guarantee the client asked for.
 */
export function setComboLineSize(
  lines: readonly ComboLine[],
  productId: string,
  size: ComboSize,
): ComboLine[] {
  return lines.map((line) =>
    line.productId === productId ? { ...line, size } : line,
  );
}

export function resolveComboLines(
  products: readonly CatalogProduct[],
  lines: readonly ComboLine[],
): ResolvedComboLine[] {
  const byId = new Map(products.map((product) => [product.legacyId, product]));
  return lines.flatMap((line) => {
    const product = byId.get(line.productId);
    if (!product) return [];
    const unitPrice = product.decantPrices[String(line.size)] ?? 0;
    return [{ product, line, price: unitPrice * line.quantity }];
  });
}

export function calculateComboLinesTotal(
  resolved: readonly ResolvedComboLine[],
): number {
  return resolved.reduce((total, entry) => total + entry.price, 0);
}

export function canSendCombo(count: number) {
  return count >= COMBO_MIN_ITEMS && count <= COMBO_MAX_ITEMS;
}
