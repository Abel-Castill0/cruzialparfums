import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  mapPostgrestError,
  type AdminRepositoryResult,
} from "./products-repository";
import type { WholesaleCommercialType, WholesalePolicyInput } from "./wholesale-schema";

export type WholesalePolicyRow = Database["public"]["Tables"]["wholesale_policies"]["Row"];
type WholesaleCatalogViewRow = Database["public"]["Views"]["admin_parfums_wholesale_catalog"]["Row"];

export type WholesaleEligibilityStatus =
  | "eligible"
  | "missing_classification"
  | "ambiguous_classification"
  | "unsupported_classification"
  | "policy_disabled";

export type WholesaleCatalogItem = WholesaleCatalogViewRow & {
  business_unit_id: string;
  product_id: string;
  product_name: string;
  product_publication_status: string;
  variant_id: string;
  variant_label: string;
  base_price_amount: number;
  currency: string;
  variant_publication_status: string;
  eligibility_status: WholesaleEligibilityStatus;
};

export type WholesaleCatalogFilters = {
  search?: string;
  commercialType?: WholesaleCommercialType;
  eligibilityStatus?: WholesaleEligibilityStatus;
};

export type WholesaleCatalogPage = {
  items: WholesaleCatalogItem[];
  total: number;
  page: number;
  pageSize: number;
};

function isCompleteCatalogRow(row: WholesaleCatalogViewRow): row is WholesaleCatalogItem {
  return Boolean(
    row.business_unit_id
      && row.product_id
      && row.product_name
      && row.product_publication_status
      && row.variant_id
      && row.variant_label
      && row.base_price_amount !== null
      && row.currency
      && row.variant_publication_status
      && row.eligibility_status,
  );
}

export class AdminParfumsWholesaleRepository {
  constructor(
    private readonly supabase: SupabaseClient<Database>,
    private readonly businessUnitId: string,
  ) {}

  async listPolicies(): Promise<AdminRepositoryResult<WholesalePolicyRow[]>> {
    const { data, error } = await this.supabase
      .from("wholesale_policies")
      .select("*")
      .eq("business_unit_id", this.businessUnitId)
      .eq("scope", "per_commercial_type")
      .is("archived_at", null)
      .order("commercial_type", { ascending: true });

    if (error) return { ok: false, error: mapPostgrestError(error) };
    return { ok: true, data: data ?? [] };
  }

  async listCatalog(
    filters: WholesaleCatalogFilters,
    pagination: { page: number; pageSize: number },
  ): Promise<AdminRepositoryResult<WholesaleCatalogPage>> {
    const page = Math.max(1, pagination.page);
    const pageSize = Math.min(100, Math.max(1, pagination.pageSize));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = this.supabase
      .from("admin_parfums_wholesale_catalog")
      .select("*", { count: "exact" })
      .eq("business_unit_id", this.businessUnitId)
      .order("product_name", { ascending: true })
      .order("variant_label", { ascending: true })
      .range(from, to);

    if (filters.commercialType) query = query.eq("commercial_type", filters.commercialType);
    if (filters.eligibilityStatus) query = query.eq("eligibility_status", filters.eligibilityStatus);
    if (filters.search?.trim()) {
      const term = filters.search.trim().replace(/[%_]/g, (character) => `\\${character}`);
      query = query.or(`product_name.ilike.%${term}%,brand.ilike.%${term}%,variant_label.ilike.%${term}%`);
    }

    const { data, error, count } = await query;
    if (error) return { ok: false, error: mapPostgrestError(error) };

    return {
      ok: true,
      data: {
        items: (data ?? []).filter(isCompleteCatalogRow),
        total: count ?? 0,
        page,
        pageSize,
      },
    };
  }

  async updatePolicy(
    policyId: string,
    expectedUpdatedAt: string,
    input: WholesalePolicyInput,
  ): Promise<AdminRepositoryResult<WholesalePolicyRow>> {
    const { data, error } = await this.supabase.rpc("admin_update_wholesale_policy", {
      p_policy_id: policyId,
      p_expected_updated_at: expectedUpdatedAt,
      p_min_quantity: input.minQuantity,
      // PostgREST accepts the canonical decimal string for a Postgres numeric.
      // Keep it as text over JSON so JavaScript never calculates money.
      p_discount_amount: input.discountAmount as unknown as number,
      p_is_active: input.isActive,
    });
    if (error) return { ok: false, error: mapPostgrestError(error) };
    return { ok: true, data: data as WholesalePolicyRow };
  }
}
