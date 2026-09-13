export type Provenance =
  | "OFFICIAL_PDF"
  | "CLIENT_CONFIRMED"
  | "DERIVED_VALIDATED"
  | "MARKETING_COPY"
  | "UNKNOWN"
  | "legacy";

export interface Evidence {
  provenance: Provenance[];
  basis: string;
}

export interface LegacyStagingEntry {
  legacy_id: string;
  product: Record<string, unknown> & {
    slug: string;
    name: string;
    specs?: Record<string, unknown>;
  };
  variants: Array<Record<string, unknown>>;
  categories: Array<{ kind: string; slug: string }>;
  fingerprint?: string;
}

export interface LegacyStaging {
  metadata?: Record<string, unknown>;
  entries?: LegacyStagingEntry[];
  blocked?: Array<{ legacy_id?: string | null; reason: string }>;
  invalid?: Array<{ legacy_id?: string | null; problems?: string[] }>;
}

export interface ReconciledVariant extends Record<string, unknown> {
  label: string;
  price_amount: number;
  price_verification_status: string;
}

export interface ReconciledCategory extends Record<string, unknown> {
  kind: string;
  source_slug: string;
  target_slug: string | null;
  source_provenance: Evidence;
}

export interface ReconciledProduct {
  legacy_id: string;
  migration_status: string;
  publish_eligibility: string;
  target_product: Record<string, unknown>;
  field_provenance: Record<string, Evidence>;
  variants: ReconciledVariant[];
  categories: ReconciledCategory[];
  inventory_intent: Record<string, unknown>;
  warnings: string[];
  blockers: string[];
  conflicts: Array<{ code: string; detail: string }>;
  source_fingerprint: string;
}

export interface CommercialReconciliationArtifact {
  metadata: Record<string, unknown>;
  summary: Record<string, number>;
  category_targets: Array<Record<string, unknown>>;
  products: ReconciledProduct[];
  blocked: Array<Record<string, unknown>>;
  conflicts: Array<{ code: string; legacy_ids: string[]; detail: string }>;
}

export type PriceVerificationStatus =
  | "unknown"
  | "legacy"
  | "provisional_market"
  | "official_pdf"
  | "client_confirmed";

export interface VariantPriceOverride {
  legacy_id?: string | null;
  slug?: string;
  variant_kind: string;
  size_ml: number | null;
  price_amount: number;
  price_verification_status: PriceVerificationStatus;
  evidence: Evidence;
}

export interface ProductLifecycleOverride {
  legacy_id?: string | null;
  slug?: string;
  publication_status: "draft" | "published" | "hidden" | "archived";
  evidence: Evidence;
}

export interface SupplementalProduct {
  slug: string;
  name: string;
  brand?: string | null;
  description?: string | null;
  gender?: string | null;
  concentration?: string | null;
  variants?: Array<Record<string, unknown>>;
  categories?: Array<{ kind: string; slug: string }>;
  fieldEvidence?: Record<string, Evidence>;
}

export const MIGRATION_STATUSES: readonly string[];
export const PUBLISH_ELIGIBILITIES: readonly string[];
export const PROVENANCE_VALUES: readonly Provenance[];
export const PRICE_VERIFICATION_STATUSES: readonly PriceVerificationStatus[];
export const VARIANT_PRICE_OVERRIDES: readonly VariantPriceOverride[];
export const PRODUCT_LIFECYCLE_OVERRIDES: readonly ProductLifecycleOverride[];
export const SUPPLEMENTAL_PRODUCTS: readonly SupplementalProduct[];
export function normalizeCategorySlug(value: string): string;
export function reconcileCommercialCatalog(input: {
  staging: LegacyStaging;
  sourceFingerprints?: Record<string, string>;
  documentedBottlePriceCount?: number;
  variantPriceOverrides?: VariantPriceOverride[];
  productLifecycleOverrides?: ProductLifecycleOverride[];
  supplementalProducts?: SupplementalProduct[];
}): CommercialReconciliationArtifact;
export function serializeCommercialReconciliation(artifact: unknown): string;
