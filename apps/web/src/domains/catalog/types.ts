export type LegacyVerificationStatus = "legacy";
export type ComboCompositionVerificationStatus =
  | "client_provided_pending_reconfirmation"
  | null;

export type LegacyProductType = "arab" | "designer" | "niche" | "combo";
export type LegacyGender = "women" | "men" | "unisex";

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

export type CatalogComboContent = Omit<LegacyComboContent, "heroImage"> & {
  heroImageUrl: string | null;
  verificationStatus: "client_provided_pending_reconfirmation";
};

export type CatalogProduct = {
  legacyId: string;
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
  imageUrl: string | null;
  decantImageUrl: string | null;
  bottleImageUrl: string | null;
  imageAlt: string;
  verificationStatus: LegacyVerificationStatus;
  bottlePricingVerificationStatus: LegacyVerificationStatus | null;
  comboCompositionVerificationStatus: ComboCompositionVerificationStatus;
  comboContent: CatalogComboContent | null;
};

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
    };
  };
  config: {
    WA_NUMBER?: string;
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
