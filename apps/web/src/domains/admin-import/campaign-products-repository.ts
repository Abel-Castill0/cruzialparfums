import "server-only";

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  mapPostgrestError,
  type AdminRepositoryError,
  type AdminRepositoryResult,
} from "@/domains/admin-parfums/products-repository";
import type { CampaignProductItemInput } from "./campaign-products-schema";
import type { CampaignRow } from "./campaigns-repository";
import type { PublicationStatus } from "./campaign-readiness";

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
  publicationStatus: PublicationStatus;
  variants: { id: string; label: string; sizeMl: number | null; publicationStatus: PublicationStatus }[];
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
  productPublicationStatus: PublicationStatus;
  productVariantId: string | null;
  variantLabel: string | null;
  variantArchived: boolean;
  variantArchivedAt: string | null;
  variantPublicationStatus: PublicationStatus | null;
  priceAmount: number;
  currency: string;
  availabilityStatus: string;
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
      .order("name", { ascending: true })
      .limit(boundedLimit);

    if (term) {
      // Search by name or brand only — the useful identity fields for an
      // admin picking a product, never by internal id.
      builder = builder.or(`name.ilike.%${term}%,brand.ilike.%${term}%`);
    }

    const { data, error } = await builder;
    if (error) return { ok: false, error: mapPostgrestError(error) };

    const items: EligibleImportProduct[] = (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      brand: row.brand,
      publicationStatus: row.publication_status as PublicationStatus,
      variants: (row.product_variants ?? [])
        .filter((variant) => variant.archived_at === null)
        .map((variant) => ({
          id: variant.id,
          label: variant.label,
          sizeMl: variant.size_ml,
          publicationStatus: variant.publication_status as PublicationStatus,
        })),
    }));

    return { ok: true, data: items };
  }

  async getCampaignProducts(campaignId: string): Promise<AdminRepositoryResult<CampaignProductItem[]>> {
    const { data, error } = await this.supabase
      .from("campaign_products")
      .select(
        "id, product_id, product_variant_id, price_amount, currency, availability_status, sort_order, product:products(name, slug, brand, archived_at, publication_status), variant:product_variants(label, archived_at, publication_status)",
      )
      .eq("campaign_id", campaignId)
      .order("sort_order", { ascending: true });

    if (error) return { ok: false, error: mapPostgrestError(error) };

    const items: CampaignProductItem[] = (data ?? []).map((row) => {
      const product = row.product as unknown as {
        name: string;
        slug: string;
        brand: string | null;
        archived_at: string | null;
        publication_status: PublicationStatus;
      } | null;
      const variant = row.variant as unknown as {
        label: string;
        archived_at: string | null;
        publication_status: PublicationStatus;
      } | null;
      return {
        id: row.id,
        productId: row.product_id,
        productName: product?.name ?? "(producto eliminado)",
        productSlug: product?.slug ?? "",
        productBrand: product?.brand ?? null,
        productArchived: product?.archived_at !== null && product?.archived_at !== undefined,
        productArchivedAt: product?.archived_at ?? null,
        // A deleted product's row is treated as the safest (most hidden)
        // classification, never as "published" by default.
        productPublicationStatus: product?.publication_status ?? "archived",
        productVariantId: row.product_variant_id,
        variantLabel: variant?.label ?? null,
        variantArchived: variant ? variant.archived_at !== null : false,
        variantArchivedAt: variant?.archived_at ?? null,
        variantPublicationStatus: variant ? variant.publication_status : null,
        priceAmount: row.price_amount,
        currency: row.currency,
        availabilityStatus: row.availability_status,
        sortOrder: row.sort_order,
      };
    });

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
