import "server-only";

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import {
  IMPORT_CATALOG_PAGE_SIZE,
  mapPublicImportProduct,
  mapPublicImportProducts,
  selectPublicImportCampaign,
  type PublicImportCampaign,
  type PublicImportCampaignRow,
  type PublicImportCategory,
  type PublicImportFilters,
  type PublicImportProduct,
} from "./public-import";

type RpcResult = Promise<{ data: unknown; error: PostgrestError | null }>;
type Rpc = (name: string, args?: Record<string, unknown>) => RpcResult;

type CatalogRow = Parameters<typeof mapPublicImportProduct>[0] & {
  total_count: number | string;
};

type ProductRow = Parameters<typeof mapPublicImportProduct>[0] & {
  campaign_number: number;
  campaign_name: string;
  campaign_closes_at: string | null;
};

type CategoryRow = { slug: string; name: string; product_count: number | string };

export type PublicImportPageResult =
  | { status: "closed" }
  | { status: "error" }
  | {
      status: "active";
      campaign: PublicImportCampaign;
      categories: PublicImportCategory[];
      products: PublicImportProduct[];
      total: number;
      totalPages: number;
    };

export class PublicImportRepository {
  private readonly rpc: Rpc;

  constructor(supabase: SupabaseClient<Database>) {
    this.rpc = supabase.rpc.bind(supabase) as unknown as Rpc;
  }

  async readCatalog(filters: PublicImportFilters): Promise<PublicImportPageResult> {
    const campaignResult = await this.rpc("public_get_import_current_campaign");
    if (campaignResult.error) return { status: "error" };
    const campaign = selectPublicImportCampaign(
      (campaignResult.data ?? []) as PublicImportCampaignRow[],
    );
    if (!campaign) return { status: "closed" };

    const [categoryResult, catalogResult] = await Promise.all([
      this.rpc("public_list_import_categories"),
      this.rpc("public_list_import_catalog", {
        p_query: filters.query || null,
        p_category_slug: filters.category || null,
        p_page: filters.page,
        p_page_size: IMPORT_CATALOG_PAGE_SIZE,
      }),
    ]);
    if (categoryResult.error || catalogResult.error) return { status: "error" };

    const categories = ((categoryResult.data ?? []) as CategoryRow[]).map((row) => ({
      slug: row.slug,
      name: row.name,
      productCount: Number(row.product_count),
    }));
    const rows = (catalogResult.data ?? []) as CatalogRow[];
    const products = mapPublicImportProducts(rows);
    const total = Number(rows[0]?.total_count ?? 0);
    return {
      status: "active",
      campaign,
      categories,
      products,
      total,
      totalPages: Math.max(1, Math.ceil(total / IMPORT_CATALOG_PAGE_SIZE)),
    };
  }

  async readProduct(slug: string): Promise<{
    product: PublicImportProduct;
    campaign: Pick<PublicImportCampaign, "number" | "name" | "closesAt">;
  } | null> {
    const result = await this.rpc("public_get_import_product", { p_slug: slug.slice(0, 180) });
    if (result.error) throw new Error(`Public Import product read failed: ${result.error.message}`);
    const row = ((result.data ?? []) as ProductRow[])[0];
    if (!row) return null;
    const product = mapPublicImportProduct({ ...row, presentations: row.presentations as Json });
    if (!product) return null;
    return {
      product,
      campaign: {
        number: row.campaign_number,
        name: row.campaign_name,
        closesAt: row.campaign_closes_at,
      },
    };
  }
}
