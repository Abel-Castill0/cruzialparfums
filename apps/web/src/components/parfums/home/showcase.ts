import { minimumPrice } from "@/domains/catalog/catalog-query";
import type { CatalogProduct, CatalogProductType } from "@/domains/catalog/types";
import type { MarqueeItem } from "@/components/storefront/home/product-marquee";

export const SHOWCASE_LIMIT = 16;

function money(value: number) {
  return `S/ ${value.toFixed(2)}`;
}

function isShowable(product: CatalogProduct) {
  return !product.hidden && product.availabilityStatus === "available" && Boolean(product.imageUrl);
}

/** Round-robin across brands so a long run of one house never fills the rail. */
function interleaveByBrand(products: readonly CatalogProduct[]): CatalogProduct[] {
  const byBrand = new Map<string, CatalogProduct[]>();
  for (const product of products) {
    const group = byBrand.get(product.brand);
    if (group) group.push(product);
    else byBrand.set(product.brand, [product]);
  }
  const groups = [...byBrand.values()];
  const mixed: CatalogProduct[] = [];
  for (let round = 0; mixed.length < products.length; round += 1) {
    for (const group of groups) {
      const product = group[round];
      if (product) mixed.push(product);
    }
  }
  return mixed;
}

/**
 * Real, currently purchasable fragrances with a photo. Curated (featured)
 * products lead; the rest of the published catalog fills the rail, mixed
 * across brands, so the strip never depends on admin curation to exist and
 * never shows a product that is hidden, out of stock or imageless.
 */
export function selectShowcaseProducts(
  featured: readonly CatalogProduct[],
  fragrances: readonly CatalogProduct[],
  limit = SHOWCASE_LIMIT,
): CatalogProduct[] {
  const lead = featured.filter(isShowable);
  const leadSlugs = new Set(lead.map((product) => product.slug));
  const rest = interleaveByBrand(
    fragrances.filter((product) => isShowable(product) && !leadSlugs.has(product.slug)),
  );
  return [...lead, ...rest].slice(0, limit);
}

export function toShowcaseItem(product: CatalogProduct): MarqueeItem {
  const lowest = minimumPrice(product.decantPrices);
  return {
    id: product.slug,
    href: `/parfums/productos/${product.slug}`,
    image: product.imageUrl,
    alt: product.imageAlt || `${product.brand} ${product.name}`,
    kicker: product.brand,
    title: product.name,
    meta: Number.isFinite(lowest) ? `Desde ${money(lowest)}` : null,
  };
}

export function countFragrancesByType(
  fragrances: readonly CatalogProduct[],
): Record<CatalogProductType, number> {
  const counts: Record<CatalogProductType, number> = { arab: 0, designer: 0, niche: 0, combo: 0 };
  for (const product of fragrances) {
    if (!product.hidden) counts[product.type] += 1;
  }
  return counts;
}
