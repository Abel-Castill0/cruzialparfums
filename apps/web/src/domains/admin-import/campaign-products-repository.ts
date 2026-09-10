import "server-only";

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  mapPostgrestError,
  type AdminRepositoryError,
  type AdminRepositoryResult,
} from "@/domains/admin-parfums/products-repository";
import {
  isCampaignProductAvailability,
  type CampaignProductAvailability,
  type CampaignProductItemInput,
} from "./campaign-products-schema";
import type { CampaignRow } from "./campaigns-repository";
import type {
  ProductPublicationStatus,
  VariantPublicationStatus,
} from "./campaign-readiness";
import { canonicalizeCampaignMoneyText } from "./campaign-money";

export type CampaignProductRow = Database["public"]["Tables"]["campaign_products"]["Row"];

export type CampaignProductMutationError =
  | AdminRepositoryError
  | { type: "invalid_reference" }
  | { type: "archived_reference" }
  | { type: "archived_campaign" };

export type CampaignProductMutationResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: CampaignProductMutationError };

/** One eligible Import product, with its (non-archived) variants embedded —
 * the bounded picker's data source (searchEligibleProducts). No price/stock
 * is invented here: variants carry their own base price_amount only as a
 * label aid, never as the campaign price (campaign price is always entered
 * fresh — client-decisions.md: "products/prices/availability may differ by
 * campaign"). publicationStatus is included so the picker can visually
 * distinguish Publicado/Borrador/Oculto — archived (archived_at) products
 * are excluded upstream entirely, never returned as "selectable but archived". */
export type EligibleImportProduct = {
  id: string;
  name: string;
  slug: string;
  brand: string | null;
  publicationStatus: Exclude<ProductPublicationStatus, "archived">;
  variants: { id: string; label: string; sizeMl: number | null; publicationStatus: Exclude<VariantPublicationStatus, "archived"> }[];
};

/** quantity_limit is deliberately NOT part of this read model (4J2
 * correction): it is not a confirmed Import feature and the admin UI never
 * needs to display it — keeping it out of the type keeps it out of the
 * server-action response payload sent to the browser. productPublicationStatus/
 * productArchivedAt/variantPublicationStatus/variantArchivedAt exist only to
 * feed classifyOfferReadiness (campaign-readiness.ts), mirroring the same
 * fields RLS itself gates on — never exposed as raw catalog data beyond that. */
export type CampaignProductItem = {
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  productBrand: string | null;
  productArchived: boolean;
  productArchivedAt: string | null;
  productPublicationStatus: ProductPublicationStatus | null;
  productVariantId: string | null;
  variantLabel: string | null;
  variantArchived: boolean;
  variantArchivedAt: string | null;
  variantPublicationStatus: VariantPublicationStatus | null;
  priceAmount: string;
  currency: string;
  availabilityStatus: CampaignProductAvailability;
  sortOrder: number;
};

function mapCampaignProductError(error: PostgrestError): CampaignProductMutationError {
  switch (error.code) {
    case "P2004":
      return { type: "invalid_reference" };
    case "P2007":
      return { type: "archived_campaign" };
    case "22023":
      return { type: "archived_reference" };
    default:
      return mapPostgrestError(error);
  }
}

/**
 * Admin Import — campaign_products (price/availability/quantity per
 * consolidado) data access (Phase 4J2). Every write goes through
 * admin_set_campaign_products (supabase/migrations/
 * 20260909020000_admin_import_campaign_products.sql), a full-replace RPC —
 * never a raw insert/update/delete: authenticated has no table-level write
 * grant on campaign_products (closed in Phase 4J1), and a direct write would
 * both fail and skip the atomic audit_log entry.
 */
export class AdminImportCampaignProductsRepository {
  constructor(
    private readonly supabase: SupabaseClient<Database>,
    private readonly businessUnitId: string,
  ) {}

  /** Bounded, server-side, Import-only product search — the "add to
   * campaign" picker's data source (4J2 correction: replaces the old
   * listEligibleProducts, which loaded the entire non-archived Import
   * catalog on every page load; that does not scale once 4J3 populates a
   * much larger catalog). Archived products (archived_at set) are excluded
   * entirely — never returned as "selectable but archived". An empty query
   * returns a bounded first page ordered by name, not an error; the picker
   * UI must handle zero results gracefully (4J3 has not populated the
   * catalog yet). */
  async searchEligibleProducts({
    query,
    limit,
  }: {
    query: string;
    limit: number;
  }): Promise<AdminRepositoryResult<EligibleImportProduct[]>> {
    const boundedLimit = Math.min(50, Math.max(1, limit));
    const term = query.trim().replace(/[%_]/g, (character) => `\\${character}`);

    let builder = this.supabase
      .from("products")
      .select("id, name, slug, brand, publication_status, product_variants(id, label, size_ml, publication_status, archived_at)")
      .eq("business_unit_id", this.businessUnitId)
      .is("archived_at", null)
      .neq("publication_status", "archived")
      .is("product_variants.archived_at", null)
      .neq("product_variants.publication_status", "archived")
      .order("name", { ascending: true })
      .limit(boundedLimit);

    if (term) {
      // Search by name or brand only — the useful identity fields for an
      // admin picking a product, never by internal id.
      builder = builder.or(`name.ilike.%${term}%,brand.ilike.%${term}%`);
    }

    const { data, error } = await builder;
    if (error) return { ok: false, error: mapPostgrestError(error) };

    const items: EligibleImportProduct[] = (data ?? []).flatMap((row) => {
      if (!isSelectableProductPublicationStatus(row.publication_status)) return [];
      return [{
        id: row.id,
        name: row.name,
        slug: row.slug,
        brand: row.brand,
        publicationStatus: row.publication_status,
        variants: (row.product_variants ?? []).flatMap((variant) => {
          if (variant.archived_at !== null || !isSelectableVariantPublicationStatus(variant.publication_status)) return [];
          return [{
            id: variant.id,
            label: variant.label,
            sizeMl: variant.size_ml,
            publicationStatus: variant.publication_status,
          }];
        }),
      }];
    });

    return { ok: true, data: items };
  }

  async getCampaignProducts(campaignId: string): Promise<AdminRepositoryResult<CampaignProductItem[]>> {
    const { data, error } = await this.supabase.rpc("admin_get_import_campaign_products", {
      p_campaign_id: campaignId,
    });

    if (error) return { ok: false, error: mapPostgrestError(error) };

    const items: CampaignProductItem[] = [];
    for (const row of data ?? []) {
      const priceAmount = canonicalizeCampaignMoneyText(row.price_amount);
      if (priceAmount === null) {
        return { ok: false, error: { type: "unknown", message: "Invalid campaign price returned by database" } };
      }
      if (!isCampaignProductAvailability(row.availability_status)) {
        return { ok: false, error: { type: "unknown", message: "Invalid campaign availability returned by database" } };
      }
      items.push({
        id: row.id,
        productId: row.product_id,
        productName: row.product_name ?? "(producto eliminado)",
        productSlug: row.product_slug ?? "",
        productBrand: row.product_brand,
        productArchived: row.product_archived_at !== null,
        productArchivedAt: row.product_archived_at,
        productPublicationStatus: isProductPublicationStatus(row.product_publication_status)
          ? row.product_publication_status
          : null,
        productVariantId: row.product_variant_id,
        variantLabel: row.variant_label,
        variantArchived: row.variant_archived_at !== null,
        variantArchivedAt: row.variant_archived_at,
        variantPublicationStatus: isVariantPublicationStatus(row.variant_publication_status)
          ? row.variant_publication_status
          : null,
        priceAmount,
        currency: row.currency,
        availabilityStatus: row.availability_status,
        sortOrder: row.sort_order,
      });
    }

    return { ok: true, data: items };
  }

  /** Full replace, one RPC call. Returns the fresh campaign row (bumped
   * updated_at) alongside the new item count, so the caller has a valid
   * concurrency token for whatever mutates next — same pattern as
   * AdminParfumsCombosRepository.setComposition. Only the count is
   * returned, not the full rows: the RPC's `setof campaign_products`
   * result carries quantity_limit, and that field is deliberately kept
   * server-internal (4J2 correction) rather than round-tripped into the
   * server action's response payload just to report a save count the UI
   * only ever reads the length of. */
  async setCampaignProducts(
    campaignId: string,
    expectedUpdatedAt: string,
    items: CampaignProductItemInput[],
  ): Promise<CampaignProductMutationResult<{ campaign: CampaignRow; itemCount: number }>> {
    // quantity_limit is deliberately never sent: it is not a
    // browser-authoritative field (4J2 correction). The RPC preserves any
    // existing value server-side by (product_id, product_variant_id) and
    // sets NULL for brand-new associations — the browser cannot overwrite it.
    const payload = items.map((item) => ({
      product_id: item.productId,
      product_variant_id: item.productVariantId,
      // Canonical decimal text (e.g. "16.00") — passed through unmodified,
      // never routed through Number()/arithmetic on this side either.
      price_amount: item.priceAmount,
      availability_status: item.availabilityStatus,
      sort_order: item.sortOrder,
    }));

    const { data, error } = await this.supabase.rpc("admin_set_campaign_products", {
      p_campaign_id: campaignId,
      p_expected_updated_at: expectedUpdatedAt,
      p_items: payload,
    });
    if (error) return { ok: false, error: mapCampaignProductError(error) };

    const { data: campaignRow, error: campaignError } = await this.supabase
      .from("campaigns")
      .select("*")
      .eq("id", campaignId)
      .maybeSingle();
    if (campaignError) return { ok: false, error: mapPostgrestError(campaignError) };
    if (!campaignRow) return { ok: false, error: { type: "not_found" } };

    return { ok: true, data: { campaign: campaignRow, itemCount: (data ?? []).length } };
  }
}

function isProductPublicationStatus(value: unknown): value is ProductPublicationStatus {
  return value === "draft" || value === "published" || value === "hidden" || value === "archived";
}

function isVariantPublicationStatus(value: unknown): value is VariantPublicationStatus {
  return value === "draft" || value === "published" || value === "archived";
}

function isSelectableProductPublicationStatus(
  value: unknown,
): value is Exclude<ProductPublicationStatus, "archived"> {
  return value === "draft" || value === "published" || value === "hidden";
}

function isSelectableVariantPublicationStatus(
  value: unknown,
): value is Exclude<VariantPublicationStatus, "archived"> {
  return value === "draft" || value === "published";
}
