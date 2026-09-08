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
  products: ReconciledProduct[];
  blocked: Array<Record<string, unknown>>;
  conflicts: Array<{ code: string; legacy_ids: string[]; detail: string }>;
}

export const MIGRATION_STATUSES: readonly string[];
export const PUBLISH_ELIGIBILITIES: readonly string[];
export const PROVENANCE_VALUES: readonly Provenance[];
export function normalizeCategorySlug(value: string): string;
export function reconcileCommercialCatalog(input: {
  staging: LegacyStaging;
  sourceFingerprints?: Record<string, string>;
  documentedBottlePriceCount?: number;
}): CommercialReconciliationArtifact;
export function serializeCommercialReconciliation(artifact: unknown): string;
