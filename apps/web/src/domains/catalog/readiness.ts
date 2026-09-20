import type { CatalogProduct, CatalogProductVariant, CatalogVerificationStatus } from "./types";

/**
 * Variant-scoped readiness classifier for storefront visibility.
 *
 * A non-ready bottle must NOT automatically hide an otherwise-ready
 * official_pdf decant variant. Product-level blockers are audit rollup,
 * not automatic variant-wide hiding.
 *
 * Readiness is conjunctive AND at the variant level. A product is
 * "storefront-ready" when at least one of its variants is ready.
 *
 * Client-confirmed 2026-09-06 (docs/client-decisions.md):
 * "descontinuado" (production stopped) and "agotado" (no stock) are
 * independent facts. A discontinued product can still be `available`
 * and must remain purchasable. Only `out_of_stock` blocks purchase.
 */

export type VariantReadinessBlocker =
  | "variant_price_not_ready";

/**
 * Pre-publication readiness blockers for admin planning / C1 publication
 * decisions. These operate on raw database state before rows become public.
 */
export type PrePublicationBlocker =
  | "product_archived"
  | "product_hidden"
  | "variant_not_published"
  | "variant_price_not_ready";

export type VariantReadiness = {
  ready: boolean;
  blockers: VariantReadinessBlocker[];
};

export type ProductReadiness = {
  ready: boolean;
  readyVariants: string[];
  allBlockers: VariantReadinessBlocker[];
};

export type PrePublicationReadiness = {
  ready: boolean;
  readyVariantCount: number;
  blockers: PrePublicationBlocker[];
};

const READY_VERIFICATION_STATUSES: ReadonlySet<CatalogVerificationStatus> = new Set([
  "official_pdf",
  "client_confirmed",
]);

/**
 * Runtime storefront readiness for a single variant.
 *
 * Operates on already-mapped CatalogProductVariant instances. Only
 * price verification status is checked — publication/archival filtering
 * is handled by the repository query (SupabasePublicCatalogRepository
 * only returns published, non-archived products with published variants).
 *
 * Discontinued products remain purchasable and storefront-visible.
 */
export function classifyVariantReadiness(
  variant: CatalogProductVariant,
): VariantReadiness {
  const blockers: VariantReadinessBlocker[] = [];
  if (!READY_VERIFICATION_STATUSES.has(variant.priceVerificationStatus)) {
    blockers.push("variant_price_not_ready");
  }
  return { ready: blockers.length === 0, blockers };
}

/**
 * Runtime storefront readiness for a product.
 *
 * A product is "storefront-ready" when at least one of its variants
 * passes price verification. The repository already guarantees that
 * the product is published and not archived.
 */
export function classifyProductReadiness(product: CatalogProduct): ProductReadiness {
  const allBlockers: VariantReadinessBlocker[] = [];
  const readyVariants: string[] = [];
  for (const variant of product.variants) {
    const vr = classifyVariantReadiness(variant);
    if (vr.ready) readyVariants.push(variant.variantId);
    allBlockers.push(...vr.blockers);
  }

  return {
    ready: readyVariants.length > 0,
    readyVariants,
    allBlockers,
  };
}

/**
 * Filters a product list to only those with at least one storefront-ready variant.
 */
export function filterStorefrontReady(products: readonly CatalogProduct[]): CatalogProduct[] {
  return products.filter((product) => classifyProductReadiness(product).ready);
}

/**
 * Pre-publication readiness classifier for admin planning / C1 publication
 * decisions. Operates on raw database state before rows become public.
 *
 * Answers: "Can this current draft row safely transition to published?"
 *
 * This is used by admin publication tooling to decide which products
 * should be published. It checks:
 * - Product archived/hidden blocks publication
 * - Product draft or published may be eligible
 * - Variant archived blocks publication
 * - Variant draft or published may be eligible
 * - Variant price authority must be client_confirmed or official_pdf
 *
 * Discontinued products are NOT blocked — they can still be published
 * and remain purchasable.
 *
 * A product in draft is NOT automatically blocked. Draft is eligible
 * for publication if metadata and variant conditions are met.
 */
export function classifyPrePublicationReadiness(row: {
  publication_status: string;
  archived_at: string | null;
  variants: Array<{
    publication_status: string;
    price_verification_status: string;
  }>;
}): PrePublicationReadiness {
  const blockers: PrePublicationBlocker[] = [];

  if (row.archived_at !== null) blockers.push("product_archived");
  if (row.publication_status === "hidden") blockers.push("product_hidden");

  let readyVariantCount = 0;
  for (const variant of row.variants) {
    if (variant.publication_status !== "published" && variant.publication_status !== "draft") {
      blockers.push("variant_not_published");
    }
    if (!READY_VERIFICATION_STATUSES.has(variant.price_verification_status as CatalogVerificationStatus)) {
      blockers.push("variant_price_not_ready");
    }
    if (
      (variant.publication_status === "published" || variant.publication_status === "draft")
      && READY_VERIFICATION_STATUSES.has(variant.price_verification_status as CatalogVerificationStatus)
    ) {
      readyVariantCount++;
    }
  }

  const isArchived = row.archived_at !== null;
  const isHidden = row.publication_status === "hidden";

  return {
    ready: readyVariantCount > 0 && !isArchived && !isHidden,
    readyVariantCount,
    blockers,
  };
}
