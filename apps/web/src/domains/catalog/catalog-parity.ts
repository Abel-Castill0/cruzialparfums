import type { CatalogProduct, CatalogProductVariant } from "./types";

export type CatalogParityClassification =
  | "EXPECTED_BLOCKED"
  | "EXPECTED_SOURCE_DIFFERENCE"
  | "REAL_MAPPING_BUG";

export type CatalogParityDifference = {
  identity: string;
  field: string;
  legacy: unknown;
  supabase: unknown;
  classification: CatalogParityClassification;
};

function comparableProduct(product: CatalogProduct) {
  return {
    legacyId: product.legacyId,
    slug: product.slug,
    brand: product.brand,
    name: product.name,
    type: product.type,
    family: product.family,
    concentration: product.concentration,
    discontinued: product.discontinued,
    availabilityStatus: product.availabilityStatus,
    variants: product.variants.map(comparableVariant),
    media: product.media.map((item) => ({
      url: item.url,
      alt: item.alt,
      isPrimary: item.isPrimary,
      sortOrder: item.sortOrder,
    })),
    isFeatured: product.isFeatured,
    featuredRank: product.featuredRank,
    featuredFrom: product.featuredFrom,
    featuredUntil: product.featuredUntil,
  };
}

function comparableVariant(variant: CatalogProductVariant) {
  return {
    variantId: variant.variantId,
    kind: variant.kind,
    sizeMl: variant.sizeMl,
    label: variant.label,
    priceAmount: variant.priceAmount,
    currency: variant.currency,
    priceVerificationStatus: variant.priceVerificationStatus,
  };
}

/** Deterministic oracle for only the rows legitimately comparable at cutover. */
export function compareCatalogs(
  legacyProducts: readonly CatalogProduct[],
  supabaseProducts: readonly CatalogProduct[],
): CatalogParityDifference[] {
  const legacyById = new Map(legacyProducts.map((item) => [item.legacyId, item]));
  const supabaseById = new Map(supabaseProducts.map((item) => [item.legacyId, item]));
  const identities = [...new Set([...legacyById.keys(), ...supabaseById.keys()])].sort();
  const differences: CatalogParityDifference[] = [];

  for (const identity of identities) {
    const legacy = legacyById.get(identity);
    const supabase = supabaseById.get(identity);
    if (!legacy || !supabase) {
      differences.push({
        identity,
        field: "publication",
        legacy: Boolean(legacy),
        supabase: Boolean(supabase),
        classification: "EXPECTED_BLOCKED",
      });
      continue;
    }
    const left = comparableProduct(legacy);
    const right = comparableProduct(supabase);
    for (const field of Object.keys(left) as Array<keyof typeof left>) {
      if (JSON.stringify(left[field]) !== JSON.stringify(right[field])) {
        differences.push({
          identity,
          field,
          legacy: left[field],
          supabase: right[field],
          classification: field === "media" ? "EXPECTED_SOURCE_DIFFERENCE" : "REAL_MAPPING_BUG",
        });
      }
    }
  }
  return differences;
}
