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
 * the picker's data source. No price/stock is invented here: variants carry
 * their own base price_amount only as a label aid, never as the campaign
 * price (campaign price is always entered fresh — client-decisions.md:
 * "products/prices/availability may differ by campaign"). */
export type EligibleImportProduct = {
  id: string;
  name: string;
  slug: string;
  brand: string | null;
  variants: { id: string; label: string; sizeMl: number | null }[];
};

export type CampaignProductItem = {
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  productArchived: boolean;
  productVariantId: string | null;
  variantLabel: string | null;
  variantArchived: boolean;
  priceAmount: number;
  currency: string;
  availabilityStatus: string;
  quantityLimit: number | null;
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

  /** Non-archived Import products with their non-archived variants — the
   * "add to campaign" picker's data source. Empty until 4J3 populates the
   * Import base catalog; the UI must handle that gracefully, not treat it
   * as an error. */
  async listEligibleProducts(): Promise<AdminRepositoryResult<EligibleImportProduct[]>> {
    const { data, error } = await this.supabase
      .from("products")
      .select("id, name, slug, brand, product_variants(id, label, size_ml, archived_at)")
      .eq("business_unit_id", this.businessUnitId)
      .is("archived_at", null)
      .order("name", { ascending: true });

    if (error) return { ok: false, error: mapPostgrestError(error) };

    const items: EligibleImportProduct[] = (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      brand: row.brand,
      variants: (row.product_variants ?? [])
        .filter((variant) => variant.archived_at === null)
        .map((variant) => ({ id: variant.id, label: variant.label, sizeMl: variant.size_ml })),
    }));

    return { ok: true, data: items };
  }

  async getCampaignProducts(campaignId: string): Promise<AdminRepositoryResult<CampaignProductItem[]>> {
    const { data, error } = await this.supabase
      .from("campaign_products")
      .select(
        "id, product_id, product_variant_id, price_amount, currency, availability_status, quantity_limit, sort_order, product:products(name, slug, archived_at), variant:product_variants(label, archived_at)",
      )
      .eq("campaign_id", campaignId)
      .order("sort_order", { ascending: true });

    if (error) return { ok: false, error: mapPostgrestError(error) };

    const items: CampaignProductItem[] = (data ?? []).map((row) => {
      const product = row.product as unknown as { name: string; slug: string; archived_at: string | null } | null;
      const variant = row.variant as unknown as { label: string; archived_at: string | null } | null;
      return {
        id: row.id,
        productId: row.product_id,
        productName: product?.name ?? "(producto eliminado)",
        productSlug: product?.slug ?? "",
        productArchived: product?.archived_at !== null && product?.archived_at !== undefined,
        productVariantId: row.product_variant_id,
        variantLabel: variant?.label ?? null,
        variantArchived: variant ? variant.archived_at !== null : false,
        priceAmount: row.price_amount,
        currency: row.currency,
        availabilityStatus: row.availability_status,
        quantityLimit: row.quantity_limit,
        sortOrder: row.sort_order,
      };
    });

    return { ok: true, data: items };
  }

  /** Full replace, one RPC call. Returns the fresh campaign row (bumped
   * updated_at) alongside the new items, so the caller has a valid
   * concurrency token for whatever mutates next — same pattern as
   * AdminParfumsCombosRepository.setComposition. */
  async setCampaignProducts(
    campaignId: string,
    expectedUpdatedAt: string,
    items: CampaignProductItemInput[],
  ): Promise<CampaignProductMutationResult<{ campaign: CampaignRow; items: CampaignProductRow[] }>> {
    const payload = items.map((item) => ({
      product_id: item.productId,
      product_variant_id: item.productVariantId,
      price_amount: item.priceAmount,
      availability_status: item.availabilityStatus,
      quantity_limit: item.quantityLimit,
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

    return { ok: true, data: { campaign: campaignRow, items: (data ?? []) as CampaignProductRow[] } };
  }
}
