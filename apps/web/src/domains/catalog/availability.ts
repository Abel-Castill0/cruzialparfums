import type { CatalogProduct } from "./types";

/**
 * Client-confirmed 2026-09-06 (see docs/client-decisions.md): "descontinuado"
 * (production stopped) and "agotado" (no stock) are independent facts. A
 * discontinued product with `availabilityStatus: "available"` must remain
 * purchasable — only `out_of_stock` blocks a purchase. Centralized here so
 * ProductCard and ProductDetail never diverge.
 */
export function isProductPurchasable(product: CatalogProduct): boolean {
  return product.availabilityStatus !== "out_of_stock";
}
