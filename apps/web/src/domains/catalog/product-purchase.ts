import type { CatalogProduct } from "./types";

export type ProductVariantGroup = "decant" | "bottle";

export type ProductPurchaseVariant = {
  group: ProductVariantGroup;
  size: number;
  price: number;
  variantId: string;
  /** Canonical DB UUID from product_variants. null for legacy fixture variants. */
  dbVariantId: string | null;
  /** Effective purchasability from product.variants (see CatalogProductVariant.
   * isAvailable). true when no matching DB variant is found — a legacy
   * fixture entry with no DB row is never inventory-tracked. DB persistence
   * remains the final authority regardless of this UI-only signal. */
  isAvailable: boolean;
};

export function listProductPurchaseVariants(
  product: CatalogProduct,
): ProductPurchaseVariant[] {
  const variantById = new Map(
    product.variants.map((v) => [v.variantId, v]),
  );
  const decants = Object.entries(product.decantPrices)
    .map(([size, price]) => ({
      group: "decant" as const,
      size: Number(size),
      price,
      variantId: `decant-${size}ml`,
      dbVariantId: variantById.get(`decant-${size}ml`)?.dbVariantId ?? null,
      isAvailable: variantById.get(`decant-${size}ml`)?.isAvailable ?? true,
    }))
    .sort((a, b) => a.size - b.size);
  const bottles = Object.entries(product.bottlePrices ?? {})
    .map(([size, price]) => ({
      group: "bottle" as const,
      size: Number(size),
      price,
      variantId: `bottle-${size}ml`,
      dbVariantId: variantById.get(`bottle-${size}ml`)?.dbVariantId ?? null,
      isAvailable: variantById.get(`bottle-${size}ml`)?.isAvailable ?? true,
    }))
    .sort((a, b) => a.size - b.size);
  return [...decants, ...bottles];
}

export function resolveInitialProductVariant(
  product: CatalogProduct,
  requestedGroup: string | undefined,
): ProductPurchaseVariant {
  const variants = listProductPurchaseVariants(product);
  const requested = variants.find(
    (variant) => variant.group === requestedGroup && variant.isAvailable,
  ) ?? variants.find((variant) => variant.group === requestedGroup);
  // Prefer defaulting to a purchasable size so the customer doesn't land on
  // an out-of-stock one by chance; if every size is out of stock, still
  // return one so the UI can render the disabled state honestly.
  const fallback = variants.find((variant) => variant.isAvailable) ?? variants.at(0);
  if (!fallback) throw new Error(`Product ${product.legacyId} has no variants`);
  return requested ?? fallback;
}

export function calculatePurchaseTotal(
  variant: ProductPurchaseVariant,
  quantity: number,
): number {
  return variant.price * quantity;
}

export function clampPurchaseQuantity(quantity: number): number {
  return Math.min(99, Math.max(1, Math.trunc(quantity)));
}
