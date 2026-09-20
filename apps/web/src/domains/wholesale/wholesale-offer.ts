import type {
  CatalogProduct,
  CatalogProductType,
  CatalogProductVariant,
} from "@/domains/catalog/types";

/**
 * Public wholesale read model built from database truth only:
 *
 * - the product and its published, price-confirmed *bottle* variants come
 *   from the public catalog (same publication gate as the rest of the
 *   storefront — nothing appears here that is not purchasable retail);
 * - the discount, threshold and currency come from `wholesale_policies`
 *   (`scope = per_commercial_type`, client-confirmed 2026-09-08).
 *
 * The 40-unit threshold is counted per commercial type across the whole
 * request, exactly as `public.calculate_parfums_wholesale_quote` does.
 * Decants and combos are never wholesale (client rule: full bottles only).
 */

export type WholesaleCommercialType = Exclude<CatalogProductType, "combo">;

export type WholesalePolicy = {
  commercialType: WholesaleCommercialType;
  name: string;
  minQuantity: number;
  /** Canonical decimal text, PEN. */
  discountAmount: string;
};

export type WholesaleOffer = {
  product: CatalogProduct;
  variant: CatalogProductVariant;
  commercialType: WholesaleCommercialType;
  /** Retail bottle price, canonical decimal text. */
  basePriceAmount: string;
  /** null when no active policy covers this commercial type. */
  policy: WholesalePolicy | null;
  /** base − discount, floored at 0; null without a policy. */
  wholesaleUnitPriceAmount: string | null;
};

export type WholesalePolicyRow = {
  scope: string;
  commercial_type: string | null;
  name: string;
  min_quantity: number | null;
  discount_amount: number | string | null;
  currency: string;
  is_active: boolean;
  archived_at: string | null;
};

/** Database category slugs → storefront commercial type. */
export function wholesaleCommercialType(slug: string | null): WholesaleCommercialType | null {
  if (slug === "arab" || slug === "arabic") return "arab";
  if (slug === "designer" || slug === "niche") return slug;
  return null;
}

function decimal(value: number | string | null): string | null {
  if (value === null) return null;
  const raw = typeof value === "number" ? value.toFixed(2) : value.trim();
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(raw)) return null;
  const [whole = "0", fraction = ""] = raw.split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
}

/** Money arithmetic at an explicit boundary, in integer centavos. */
function subtractFloor(base: string, discount: string): string {
  const cents = (text: string) => {
    const [whole = "0", fraction = ""] = text.split(".");
    return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  };
  const result = Math.max(0, cents(base) - cents(discount));
  return `${Math.floor(result / 100)}.${String(result % 100).padStart(2, "0")}`;
}

export function mapWholesalePolicies(rows: readonly WholesalePolicyRow[]): WholesalePolicy[] {
  const policies: WholesalePolicy[] = [];
  for (const row of rows) {
    if (row.scope !== "per_commercial_type" || !row.is_active || row.archived_at !== null) continue;
    if (row.currency !== "PEN") continue;
    const commercialType = wholesaleCommercialType(row.commercial_type);
    const discountAmount = decimal(row.discount_amount);
    if (!commercialType || !discountAmount) continue;
    if (!Number.isSafeInteger(row.min_quantity) || (row.min_quantity as number) < 1) continue;
    if (policies.some((policy) => policy.commercialType === commercialType)) continue;
    policies.push({
      commercialType,
      name: row.name,
      minQuantity: row.min_quantity as number,
      discountAmount,
    });
  }
  return policies;
}

export function buildWholesaleOffers(
  products: readonly CatalogProduct[],
  policies: readonly WholesalePolicy[],
): WholesaleOffer[] {
  const offers: WholesaleOffer[] = [];
  for (const product of products) {
    if (product.type === "combo" || product.availabilityStatus !== "available") continue;
    const commercialType = product.type;
    const policy = policies.find((item) => item.commercialType === commercialType) ?? null;
    for (const variant of product.variants) {
      if (variant.kind !== "bottle") continue;
      offers.push({
        product,
        variant,
        commercialType,
        basePriceAmount: variant.priceAmount,
        policy,
        wholesaleUnitPriceAmount: policy
          ? subtractFloor(variant.priceAmount, policy.discountAmount)
          : null,
      });
    }
  }
  return offers.sort((a, b) =>
    a.product.brand.localeCompare(b.product.brand, "es")
    || a.product.name.localeCompare(b.product.name, "es")
    || Number(a.variant.sizeMl) - Number(b.variant.sizeMl));
}

export type WholesaleOfferFilter = "all" | WholesaleCommercialType;

export function filterWholesaleOffers(
  offers: readonly WholesaleOffer[],
  query: string,
  filter: WholesaleOfferFilter,
): WholesaleOffer[] {
  const normalized = query.trim().toLocaleLowerCase("es");
  return offers.filter((offer) => {
    if (filter !== "all" && offer.commercialType !== filter) return false;
    if (!normalized) return true;
    return `${offer.product.brand} ${offer.product.name}`
      .toLocaleLowerCase("es")
      .includes(normalized);
  });
}
