export interface LegacySourceProduct {
  id?: string;
  name?: string;
  type?: string;
  price?: Record<number, number>;
  bottle?: Record<string, number>;
  officialPdfMembers?: string[] | null;
  [key: string]: unknown;
}

export interface LegacyComboMetadata {
  composition_verification_status: "official_pdf";
  source_state: "OFFICIAL_PDF_CONFIRMED";
  composition_legacy_ids: string[];
}

export interface LegacyCatalogEntry {
  legacy_id: string;
  product: Record<string, unknown>;
  variants: Array<Record<string, unknown>>;
  categories: Array<{ kind: string; slug: string }>;
  media: Array<Record<string, unknown>>;
  combo?: LegacyComboMetadata;
  fingerprint: string;
}

export function buildLegacyCatalogEntries(
  products: LegacySourceProduct[],
  previousEntries?: LegacyCatalogEntry[],
): {
  entries: LegacyCatalogEntry[];
  blocked: Array<{ legacy_id: string; reason: string }>;
  invalid: Array<{ legacy_id: string | null; problems: string[] }>;
  report: { created: number; updated: number; unchanged: number; blocked: number; invalid: number };
};
