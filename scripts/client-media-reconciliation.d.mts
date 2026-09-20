export interface LegacyMediaProduct {
  id: string;
  name: string;
  brand?: string | null;
  type?: string;
  img?: string | null;
  imgBottle?: string | null;
  imgSet?: string | null;
}

export interface ReconciliationRecord {
  legacy_product_id: string | null;
  legacy_product_name: string | null;
  brand: string | null;
  current_legacy_image: string | null;
  client_original_filename: string | null;
  media_role: "bottle" | "set" | "additional" | null;
  status: "EXACT_MATCH" | "ALIAS_CONFIRMED" | "AMBIGUOUS" | "NO_MATCH" | "CLIENT_ASSET_MISSING";
  match_basis: string;
  notes: string;
  source: string[];
  candidate_legacy_product_ids: string[];
}

export const RECONCILIATION_STATUSES: readonly ReconciliationRecord["status"][];
export function normalizeMediaIdentity(value: string): string;
export function sortReconciliationRecords(records: ReconciliationRecord[]): ReconciliationRecord[];
export function reconcileClientMedia(input: {
  products: LegacyMediaProduct[];
  clientFilenames: string[];
}): {
  records: ReconciliationRecord[];
  report: Record<string, number>;
  unresolved: Record<string, unknown>;
  duplicate_analysis: Record<string, unknown>;
};
export function serializeReconciliationArtifact(artifact: unknown): string;
