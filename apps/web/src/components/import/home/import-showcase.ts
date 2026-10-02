import type { MarqueeItem } from "@/components/storefront/home/product-marquee";
import {
  formatCampaignPrice,
  type PublicImportPresentation,
  type PublicImportProduct,
} from "@/domains/import/public-import";

export const IMPORT_SHOWCASE_LIMIT = 16;

function lowestAvailable(presentations: readonly PublicImportPresentation[]) {
  let lowest: PublicImportPresentation | null = null;
  for (const presentation of presentations) {
    if (presentation.availability !== "available") continue;
    const amount = Number(presentation.price);
    if (!Number.isFinite(amount)) continue;
    if (!lowest || amount < Number(lowest.price)) lowest = presentation;
  }
  return lowest;
}

/**
 * Rail items for the open consolidado, under the heading "Productos
 * disponibles ahora": only products with approved media AND at least one
 * available presentation qualify. The shared fallback image repeated along a
 * rail would read as a broken catalog, and sold-out products stay listed (as
 * "Agotado") in the catalog grid below — never in a rail that promises
 * availability.
 */
export function toImportShowcaseItems(
  products: readonly PublicImportProduct[],
  limit = IMPORT_SHOWCASE_LIMIT,
): MarqueeItem[] {
  const items: MarqueeItem[] = [];
  for (const product of products) {
    if (items.length >= limit) break;
    if (!product.hasApprovedMedia) continue;
    const lowest = lowestAvailable(product.presentations);
    if (!lowest) continue;
    items.push({
      id: product.id,
      href: `/import/producto/${product.slug}`,
      image: product.mediaUrl,
      alt: product.mediaAlt,
      kicker: product.brand,
      title: product.name,
      meta: `${product.presentations.length > 1 ? "Desde " : ""}${formatCampaignPrice(lowest.price, lowest.currency)}`,
    });
  }
  return items;
}

export type CategoryTile = {
  slug: string;
  name: string;
  productCount: number;
  image: string | null;
  imageAlt: string;
};

/** A category's photo is the first approved product photo found for it. */
export function buildCategoryTiles(
  categories: readonly { slug: string; name: string; productCount: number }[],
  products: readonly PublicImportProduct[],
): CategoryTile[] {
  return categories.map((category) => {
    const sample = products.find(
      (product) => product.categorySlug === category.slug && product.hasApprovedMedia,
    );
    return {
      slug: category.slug,
      name: category.name,
      productCount: category.productCount,
      image: sample?.mediaUrl ?? null,
      imageAlt: sample?.mediaAlt ?? "",
    };
  });
}
