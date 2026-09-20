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
 * availability_status gates public RLS: only 'available' and 'out_of_stock'
 * are publicly visible; 'unconfirmed' is intentionally hidden. An out_of_stock
 * offer is still publicly readable once every publication gate above passes —
 * the storefront is expected to show it as "Agotado", not hide it. Never
 * collapse visibility and availability into one label.
 */

export type ProductPublicationStatus = "draft" | "published" | "hidden" | "archived";
export type VariantPublicationStatus = "draft" | "published" | "archived";
export type ImportPresentationPublicationStatus = "draft" | "published" | "archived";

export type CampaignReadinessInput = {
  campaignStatus: string;
  campaignArchivedAt: string | null;
  productPublicationStatus: ProductPublicationStatus | null;
  productArchivedAt: string | null;
  /** null when the offer is product-level (no variant selected). */
  productVariantId: string | null;
  variantPublicationStatus: VariantPublicationStatus | null;
  variantArchivedAt: string | null;
  importPresentationId: string | null;
  presentationPublicationStatus: ImportPresentationPublicationStatus | null;
  presentationArchivedAt: string | null;
  availabilityStatus: "unconfirmed" | "available" | "out_of_stock";
};

export type VisibilityReason =
  | "visible"
  | "campaign_not_open"
  | "campaign_archived"
  | "product_draft"
  | "product_hidden"
  | "product_archived"
  | "variant_not_published"
  | "variant_archived"
  | "presentation_not_published"
  | "presentation_archived"
  | "availability_unconfirmed"
  | "unknown_publication_status";

export type OfferReadiness = {
  isPubliclyVisible: boolean;
  visibilityReason: VisibilityReason;
  /** Independent of visibility — see module doc. Passed straight through
   * from campaign_products.availability_status, never derived. */
  availability: "unconfirmed" | "available" | "out_of_stock";
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
  presentation_not_published: "Presentación no publicada",
  presentation_archived: "Presentación archivada",
  availability_unconfirmed: "Disponibilidad por confirmar",
  unknown_publication_status: "Estado de publicación desconocido",
};

export const AVAILABILITY_STATUS_LABELS: Record<"unconfirmed" | "available" | "out_of_stock", string> = {
  unconfirmed: "Por confirmar",
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
  switch (input.productPublicationStatus) {
    case "published":
      break;
    case "draft":
      return "product_draft";
    case "hidden":
      return "product_hidden";
    case "archived":
      return "product_archived";
    default:
      return "unknown_publication_status";
  }

  // variant_is_public (only when product_variant_id exists on the offer)
  if (input.productVariantId !== null) {
    if (input.variantArchivedAt !== null) return "variant_archived";
    switch (input.variantPublicationStatus) {
      case "published":
        break;
      case "draft":
        return "variant_not_published";
      case "archived":
        return "variant_archived";
      default:
        return "unknown_publication_status";
    }
  }


  // import_presentation_is_public (mutually exclusive with product variant)
  if (input.importPresentationId !== null) {
    if (input.presentationArchivedAt !== null) return "presentation_archived";
    switch (input.presentationPublicationStatus) {
      case "published":
        break;
      case "draft":
        return "presentation_not_published";
      case "archived":
        return "presentation_archived";
      default:
        return "unknown_publication_status";
    }
  }

  if (input.availabilityStatus === "unconfirmed") return "availability_unconfirmed";

  return "visible";
}
