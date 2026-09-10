/**
 * Pure public-readiness classifier for one campaign_products offer,
 * mirroring the REAL RLS contract exactly (never a looser admin-only
 * approximation):
 *
 *   app.campaign_is_public(campaign_id)
 *     — business unit = import, status = 'open', archived_at is null
 *   AND app.product_is_public(product_id)
 *     — publication_status = 'published', archived_at is null
 *   AND (product_variant_id IS NULL OR app.variant_is_public(product_variant_id))
 *     — same two conditions on the variant
 *
 * (supabase/migrations/20260909000000_admin_import_consolidados.sql,
 * 20260907154358_rls_policies.sql — untouched by this file; this is a
 * read-only mirror for the admin UI, not a rewrite of the policy itself.)
 *
 * availability_status is a DELIBERATELY independent dimension: RLS does not
 * gate on it at all, so an out_of_stock offer is still publicly readable
 * once every publication gate above passes — the storefront is expected to
 * show it as "Agotado", not hide it. Never collapse visibility and
 * availability into one label.
 */

export type PublicationStatus = "draft" | "published" | "archived";

export type CampaignReadinessInput = {
  campaignStatus: string;
  campaignArchivedAt: string | null;
  productPublicationStatus: PublicationStatus;
  productArchivedAt: string | null;
  /** null when the offer is product-level (no variant selected). */
  variantPublicationStatus: PublicationStatus | null;
  variantArchivedAt: string | null;
  availabilityStatus: "available" | "out_of_stock";
};

export type VisibilityReason =
  | "visible"
  | "campaign_not_open"
  | "campaign_archived"
  | "product_draft"
  | "product_hidden"
  | "product_archived"
  | "variant_not_published"
  | "variant_archived";

export type OfferReadiness = {
  isPubliclyVisible: boolean;
  visibilityReason: VisibilityReason;
  /** Independent of visibility — see module doc. Passed straight through
   * from campaign_products.availability_status, never derived. */
  availability: "available" | "out_of_stock";
};

export const VISIBILITY_REASON_LABELS: Record<VisibilityReason, string> = {
  visible: "Visible públicamente",
  campaign_not_open: "Campaña no abierta",
  campaign_archived: "Campaña archivada",
  product_draft: "Producto en borrador",
  product_hidden: "Producto oculto",
  product_archived: "Producto archivado",
  variant_not_published: "Variante no publicada",
  variant_archived: "Variante archivada",
};

export const AVAILABILITY_STATUS_LABELS: Record<"available" | "out_of_stock", string> = {
  available: "Disponible",
  out_of_stock: "Agotado",
};

/**
 * Classifies one offer. Order matches the RLS conjunction: campaign gates
 * first, then product gates, then (if a variant is selected) variant gates.
 * The first failing gate is the reason — never combined into one label, and
 * never evaluated past the first failure (exactly like `AND` short-circuits
 * in the policy itself).
 */
export function classifyOfferReadiness(input: CampaignReadinessInput): OfferReadiness {
  const reason = computeVisibilityReason(input);
  return {
    isPubliclyVisible: reason === "visible",
    visibilityReason: reason,
    availability: input.availabilityStatus,
  };
}

function computeVisibilityReason(input: CampaignReadinessInput): VisibilityReason {
  // campaign_is_public
  if (input.campaignArchivedAt !== null) return "campaign_archived";
  if (input.campaignStatus !== "open") return "campaign_not_open";

  // product_is_public
  if (input.productArchivedAt !== null) return "product_archived";
  if (input.productPublicationStatus === "draft") return "product_draft";
  if (input.productPublicationStatus === "archived") return "product_hidden";

  // variant_is_public (only when the offer has a variant at all)
  if (input.variantPublicationStatus !== null) {
    if (input.variantArchivedAt !== null) return "variant_archived";
    if (input.variantPublicationStatus !== "published") return "variant_not_published";
  }

  return "visible";
}
