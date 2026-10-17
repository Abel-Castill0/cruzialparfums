import type { CatalogProduct, CatalogProductVariant } from "./types";

/**
 * What a whole-bottle card reads, and nothing else. Same idea as `CatalogCardProduct`, but for `/parfums/frascos`:
 * the bottle sizes and their prices, never the decants. The server sends one of these per product so the page's RSC
 * payload stays small.
 */
export type CatalogBottleCardProduct = Pick<
  CatalogProduct,
  "productId" | "legacyId" | "slug" | "name" | "brand" | "imageUrl" | "imageAlt" | "tag" | "discontinued" | "availabilityStatus" | "bottlePrices"
> & {
  variants: Array<Pick<CatalogProductVariant, "kind" | "sizeMl" | "isAvailable">>;
};

export function toBottleCardProduct(product: CatalogProduct): CatalogBottleCardProduct {
  return {
    productId: product.productId,
    legacyId: product.legacyId,
    slug: product.slug,
    name: product.name,
    brand: product.brand,
    imageUrl: product.imageUrl,
    imageAlt: product.imageAlt,
    tag: product.tag,
    discontinued: product.discontinued,
    availabilityStatus: product.availabilityStatus,
    bottlePrices: product.bottlePrices,
    variants: product.variants
      .filter((variant) => variant.kind === "bottle")
      .map((variant) => ({ kind: variant.kind, sizeMl: variant.sizeMl, isAvailable: variant.isAvailable })),
  };
}

export type BottleSizeOption = {
  size: number;
  price: number;
  /** Priced and in stock: only these can be selected. */
  available: boolean;
};

export type BottleOfferSource = {
  bottlePrices: Record<string, number> | null;
  variants: ReadonlyArray<Pick<CatalogProductVariant, "kind" | "sizeMl" | "isAvailable">>;
};

/** The bottle sizes of a product with their price and whether each can be bought right now, smallest first. */
export function bottleSizeOptions(product: BottleOfferSource): BottleSizeOption[] {
  return Object.entries(product.bottlePrices ?? {})
    .map(([size, price]) => {
      const sizeMl = String(size);
      const inStock = product.variants.some(
        (variant) => variant.kind === "bottle" && variant.sizeMl === sizeMl && variant.isAvailable,
      );
      return { size: Number(size), price, available: inStock };
    })
    .sort((a, b) => a.size - b.size);
}

/** Smallest bottle size that can be bought, or null when none can. */
export function defaultBottleSize(options: readonly BottleSizeOption[]): number | null {
  return options.find((option) => option.available)?.size ?? null;
}
