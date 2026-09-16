export type CatalogVerificationStatus =
  | "legacy"
  | "client_confirmed"
  | "derived_validated"
  | "official_pdf"
  | "unknown";
/** @deprecated Fixture-only alias. Public catalog code uses CatalogVerificationStatus. */
export type LegacyVerificationStatus = "legacy";
export type ComboCompositionVerificationStatus =
  | "official_pdf"
  | "pending_reconfirmation"
  | "client_confirmed"
  | "unknown"
  | null;

export type CatalogProductType = "arab" | "designer" | "niche" | "combo";
export type CatalogGender = "women" | "men" | "unisex";
/** @deprecated Fixture-only aliases retained while the runtime remains legacy. */
export type LegacyProductType = CatalogProductType;
export type LegacyGender = CatalogGender;

/**
 * Client-confirmed 2026-09-06 (see docs/client-decisions.md): "descontinuado"
 * (production stopped) and "agotado" (no stock) are independent facts. A
 * discontinued product can still be `available` and must remain purchasable.
 * `discontinued` on the record models production status; `outOfStock` is the
 * only thing that blocks a purchase. No current product has evidence of
 * `outOfStock: true` — it exists so real inventory can be modeled later
 * without inventing a number today.
 */
export type AvailabilityStatus = "available" | "out_of_stock";

export type LegacyProductRecord = {
  id: string;
  legacy_id: string;
  source: "assets/data.js";
  verificationStatus: LegacyVerificationStatus;
  pricingVerificationStatus: LegacyVerificationStatus;
  bottlePricingVerificationStatus: LegacyVerificationStatus | null;
  comboCompositionVerificationStatus: ComboCompositionVerificationStatus;
  brand: string;
  name: string;
  gender: LegacyGender;
  type: LegacyProductType;
  family: string;
  conc: string;
  price: Record<string, number>;
  notes: string[];
  mood: Record<string, string>;
  tag: string;
  desc: string;
  bottle: Record<string, number> | null;
  bestseller?: boolean;
  discontinued?: boolean;
  hidden?: boolean;
  outOfStock?: boolean;
  isFeatured?: boolean;
  featuredRank?: number | null;
  featuredFrom?: string | null;
  featuredUntil?: string | null;
  img: string | null;
  imgBottle: string | null;
  imgSet: string | null;
};

export type LegacyComboContent = {
  name: string;
  desc: string;
  perfumes: string[];
  ml: number;
  atomizaciones: string;
  heroImage: string;
  heroCta: string;
};

/**
 * DB-backed combo content fields that Supabase truth provides.
 * heroCta and atomizaciones are presentation-only legacy fields not
 * present in the database — they remain optional for legacy compat.
 */
export type CatalogComboContent = {
  name: string;
  desc: string;
  perfumes: string[];
  ml: number;
  heroImageUrl: string | null;
  verificationStatus: ComboCompositionVerificationStatus;
  /** Legacy presentation-only. Not in DB. */
  heroCta?: string;
  /** Legacy presentation-only. Not in DB. */
  atomizaciones?: string;
};

export type CatalogProductVariant = {
  /**
   * Canonical database identity. UUID from product_variants.id.
   * Stable across page reloads, safe for cart/order validation.
   * null when sourced from the legacy fixture (no DB row).
   */
  dbVariantId: string | null;
  /**
   * Compatibility alias used by the current cart and legacy fixture.
   * Format: `decant-{size}ml` or `bottle-{size}ml`.
   * Retained for backward-compatible localStorage cart entries.
   */
  variantId: string;
  kind: "decant" | "bottle";
  sizeMl: string;
  label: string;
  /** Canonical decimal text. Arithmetic belongs at an explicit money boundary. */
  priceAmount: string;
  currency: "PEN";
  sortOrder: number;
  priceVerificationStatus: CatalogVerificationStatus;
};

export type CatalogProductMedia = {
  url: string;
  alt: string;
  isPrimary: boolean;
  sortOrder: number;
};

export type CatalogProduct = {
  /**
   * Canonical database identity. UUID from products.id.
   * Stable across page reloads, safe for cart/order validation.
   * null when sourced from the legacy fixture (no DB row).
   */
  productId: string | null;
  /**
   * Legacy compatibility identifier. Used by the cart, order validation,
   * and legacy URL redirects. null for supplemental products that have
   * no legacy origin.
   */
  legacyId: string | null;
  slug: string;
  brand: string;
  name: string;
  gender: LegacyGender;
  type: LegacyProductType;
  family: string;
  concentration: string;
  decantPrices: Record<string, number>;
  bottlePrices: Record<string, number> | null;
  notes: string[];
  tag: string;
  description: string;
  discontinued: boolean;
  bestseller: boolean;
  hidden: boolean;
  availabilityStatus: AvailabilityStatus;
  isFeatured: boolean;
  featuredRank: number | null;
  featuredFrom: string | null;
  featuredUntil: string | null;
  imageUrl: string | null;
  decantImageUrl: string | null;
  bottleImageUrl: string | null;
  imageAlt: string;
  verificationStatus: CatalogVerificationStatus;
  bottlePricingVerificationStatus: CatalogVerificationStatus | null;
  comboCompositionVerificationStatus: ComboCompositionVerificationStatus;
  comboContent: CatalogComboContent | null;
  variants: CatalogProductVariant[];
  media: CatalogProductMedia[];
};

/**
 * Returns the best available runtime cart/order identity for a product.
 * Prefers canonical productId (Supabase UUID) when available, falls back
 * to legacyId for pre-cutover products. Throws if neither exists.
 */
export function cartIdentity(product: CatalogProduct): string {
  if (product.productId) return product.productId;
  if (product.legacyId) return product.legacyId;
  throw new Error(`Product "${product.name}" has no cart identity (both productId and legacyId are null)`);
}

/** Shared provider-neutral read boundary. Both repositories satisfy it. */
export interface PublicCatalogRepository {
  list(): CatalogProduct[];
  listFragrances(): CatalogProduct[];
  listCombos(): CatalogProduct[];
  listFeatured(): CatalogProduct[];
  findByLegacyId(legacyId: string): CatalogProduct | null;
  findBySlug(slug: string): CatalogProduct | null;
  findByProductId(productId: string): CatalogProduct | null;
  /**
   * Provider-neutral cart identity resolution. Accepts a cart line productId
   * which may be either a canonical product UUID or a legacy identifier.
   * Tries productId match first, then legacyId. Returns null if not found.
   */
  resolveCartIdentity(identity: string): CatalogProduct | null;
  listRelated(product: CatalogProduct, limit?: number): CatalogProduct[];
}

export type LegacyWholesalePrice = {
  unit: number;
  m4: number;
  m12: number;
};

export type CatalogWholesaleProduct = {
  product: CatalogProduct;
  prices: LegacyWholesalePrice;
  verificationStatus: LegacyVerificationStatus;
};

export type LegacyCatalogFixture = {
  metadata: {
    notice: string;
    purpose: "legacy_visual_parity_only";
    futureSeedEligible: false;
    sourcePath: "assets/data.js";
    sourceSha256: string;
    verificationStatus: LegacyVerificationStatus;
    counts: {
      total: number;
      active: number;
      discontinued: number;
      arab: number;
      designer: number;
      niche: number;
      combo: number;
      duplicateIds: number;
      bottlePrices: number;
      hidden: number;
    };
  };
  config: {
    WA_NUMBER?: string;
    PHONE_DISPLAY?: string;
    CONTACT_EMAIL?: string;
    INSTAGRAM_URL?: string;
    INSTAGRAM_HANDLE?: string;
    STORE?: string;
    CITY?: string;
    SIZES?: number[];
    ATOMIZACIONES?: Record<string, string>;
  };
  comboContents: Record<string, LegacyComboContent>;
  wholesale: Record<string, LegacyWholesalePrice>;
  products: LegacyProductRecord[];
};
