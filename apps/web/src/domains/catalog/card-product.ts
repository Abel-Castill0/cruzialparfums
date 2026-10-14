import type { CatalogProduct, CatalogProductVariant } from "./types";

/**
 * What a catalog card reads, and nothing else. The server sends 24 of these per view instead of 24 full products
 * (descriptions, notes, every photo, bottle prices…), which keeps the page's RSC payload small.
 */
export type CatalogCardProduct = Pick<
  CatalogProduct,
  "productId" | "legacyId" | "slug" | "name" | "brand" | "imageUrl" | "imageAlt" | "tag" | "discontinued" | "availabilityStatus" | "decantPrices"
> & {
  variants: Array<Pick<CatalogProductVariant, "kind" | "sizeMl" | "isAvailable">>;
};

export function toCardProduct(product: CatalogProduct): CatalogCardProduct {
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
    decantPrices: product.decantPrices,
    variants: product.variants
      .filter((variant) => variant.kind === "decant")
      .map((variant) => ({ kind: variant.kind, sizeMl: variant.sizeMl, isAvailable: variant.isAvailable })),
  };
}
