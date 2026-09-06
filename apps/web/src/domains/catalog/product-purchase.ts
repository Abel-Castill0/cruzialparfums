import type { CatalogProduct } from "./types";

export type ProductVariantGroup = "decant" | "bottle";

export type ProductPurchaseVariant = {
  group: ProductVariantGroup;
  size: number;
  price: number;
  variantId: string;
};

export function listProductPurchaseVariants(
  product: CatalogProduct,
): ProductPurchaseVariant[] {
  const decants = Object.entries(product.decantPrices)
    .map(([size, price]) => ({
      group: "decant" as const,
      size: Number(size),
      price,
      variantId: `decant-${size}ml`,
    }))
    .sort((a, b) => a.size - b.size);
  const bottles = Object.entries(product.bottlePrices ?? {})
    .map(([size, price]) => ({
      group: "bottle" as const,
      size: Number(size),
      price,
      variantId: `bottle-${size}ml`,
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
    (variant) => variant.group === requestedGroup,
  );
  const fallback = variants.at(0);
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
