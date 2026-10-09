import "server-only";

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import {
  IMPORT_CATALOG_PAGE_SIZE,
  importGalleryPhotos,
  mapPublicImportProduct,
  mapPublicImportProducts,
  mapPublicImportPreviewProduct,
  selectPublicImportCampaign,
  type ImportGalleryPhoto,
  type ImportMediaRow,
  type PublicImportCampaign,
  type PublicImportCampaignRow,
  type PublicImportCategory,
  type PublicImportFilters,
  type PublicImportProduct,
  type PublicImportPreviewProduct,
  type PublicImportWholesaleRule,
} from "./public-import";

type RpcResult = Promise<{ data: unknown; error: PostgrestError | null }>;
type Rpc = (name: string, args?: Record<string, unknown>) => RpcResult;

type CatalogRow = Parameters<typeof mapPublicImportProduct>[0] & {
  campaign_id: string;
  campaign_number: number;
  total_count: number | string;
};

type ProductRow = Parameters<typeof mapPublicImportProduct>[0] & {
  campaign_id: string;
  campaign_number: number;
  campaign_name: string;
  campaign_closes_at: string | null;
};

type CategoryRow = { slug: string; name: string; product_count: number | string };
type PreviewRow = {
  campaign_id: string;
  campaign_number: number;
  product_id: string;
  slug: string;
  name: string;
  brand: string | null;
  category_slug: string | null;
  category_name: string | null;
  media_url: string | null;
  media_alt: string | null;
  presentations: Json;
  total_count: number | string;
};
type PreviewCampaignRow = {
  campaign_id: string;
  campaign_number: number;
  campaign_name: string;
  opens_at: string | null;
  closes_at: string | null;
  public_message: string | null;
};

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
    }
  | {
      status: "upcoming";
      campaign: PublicImportCampaign;
      categories: PublicImportCategory[];
      products: PublicImportPreviewProduct[];
      total: number;
      totalPages: number;
    };

export class PublicImportRepository {
  private readonly rpc: Rpc;
  private readonly supabase: SupabaseClient<Database>;

  constructor(supabase: SupabaseClient<Database>) {
    this.supabase = supabase;
    this.rpc = supabase.rpc.bind(supabase) as unknown as Rpc;
  }

  /** Ordered public photos of one product (public RLS: published product, non-archived photo).
   * Returns null on a read error so the page falls back to the single photo the product RPC resolved. */
  async readProductPhotos(productId: string): Promise<ImportMediaRow[] | null> {
    const result = await this.supabase
      .from("product_media")
      .select("secure_url,alt")
      .eq("product_id", productId)
      .is("archived_at", null)
      .order("is_primary", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true })
      .limit(12);
    return result.error ? null : (result.data ?? []);
  }

  /**
   * The "current campaign" and "catalog page" reads are two independent
   * statements — a consolidado can roll over between them. If that
   * happens while real offer rows are in flight, `attempt` reports
   * `"mismatch"` instead of ever returning a result that would let the UI
   * stamp a campaign-B offer with campaign A's uuid (Add-to-cart writes
   * that id into the browser cart — see Codex P1 review). `readCatalog`
   * retries once, bounded, on a mismatch; a second mismatch (or any error)
   * fails closed to `{status: "error"}` rather than risk a third read.
   *
   * A genuinely empty catalog page (zero rows for the current filters) is
   * NOT a mismatch — there is no offer to mis-stamp, so the separately-read
   * campaign safely remains the display context.
   */
  async readCatalog(filters: PublicImportFilters): Promise<PublicImportPageResult> {
    const first = await this.attemptReadCatalog(filters);
    if (first !== "mismatch") {
      if (first.status !== "closed") return first;
      return this.readUpcomingCatalog(filters);
    }

    const second = await this.attemptReadCatalog(filters);
    if (second === "mismatch") return { status: "error" };
    return second.status === "closed" ? this.readUpcomingCatalog(filters) : second;
  }

  async readWholesaleRules(): Promise<PublicImportWholesaleRule[]> {
    const result = await this.rpc("public_get_import_wholesale_rules");
    if (result.error || !Array.isArray(result.data)) return [];
    return (result.data as Array<Record<string, unknown>>).flatMap((row) => {
      const commercialType = row.commercial_type;
      const minQuantity = Number(row.min_quantity);
      if (
        (commercialType !== "arabic" && commercialType !== "designer" && commercialType !== "niche") ||
        !Number.isSafeInteger(minQuantity) || minQuantity < 1 ||
        (typeof row.discount_amount !== "string" && typeof row.discount_amount !== "number") ||
        row.currency !== "PEN"
      ) return [];
      return [{ commercialType, minQuantity, discountAmount: String(row.discount_amount), currency: "PEN" }];
    });
  }

  private async readUpcomingCatalog(filters: PublicImportFilters): Promise<PublicImportPageResult> {
    const campaignResult = await this.rpc("public_get_import_upcoming_campaign");
    if (campaignResult.error) return { status: "error" };
    const rows = (campaignResult.data ?? []) as PreviewCampaignRow[];
    if (rows.length !== 1) return { status: "closed" };
    const row = rows[0]!;
    const campaign = selectPublicImportCampaign([{
      id: row.campaign_id,
      number: row.campaign_number,
      name: row.campaign_name,
      opens_at: row.opens_at,
      closes_at: row.closes_at,
      public_message: row.public_message,
    }]);
    if (!campaign || !campaign.opensAt) return { status: "closed" };

    const [categoryResult, catalogResult] = await Promise.all([
      this.rpc("public_list_import_preview_categories"),
      this.rpc("public_list_import_campaign_preview", {
        p_query: filters.query || null,
        p_category_slug: filters.category || null,
        p_page: filters.page,
        p_page_size: IMPORT_CATALOG_PAGE_SIZE,
      }),
    ]);
    if (categoryResult.error || catalogResult.error) return { status: "error" };
    const categories = ((categoryResult.data ?? []) as CategoryRow[]).map((category) => ({
      slug: category.slug,
      name: category.name,
      productCount: Number(category.product_count),
    }));
    const products = ((catalogResult.data ?? []) as PreviewRow[]).map(mapPublicImportPreviewProduct)
      .filter((product): product is PublicImportPreviewProduct => product !== null);
    const resultRows = (catalogResult.data ?? []) as PreviewRow[];
    if (resultRows.some((product) => product.campaign_id !== campaign.id)) return { status: "error" };
    const total = Number(resultRows[0]?.total_count ?? 0);
    return {
      status: "upcoming",
      campaign,
      categories,
      products,
      total,
      totalPages: Math.max(1, Math.ceil(total / IMPORT_CATALOG_PAGE_SIZE)),
    };
  }

  private async attemptReadCatalog(
    filters: PublicImportFilters,
  ): Promise<PublicImportPageResult | "mismatch"> {
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

    // Authority check: every row is stamped (server-side, same statement as
    // the offers) with the campaign that actually produced it. Compare
    // against the separately-read "current campaign" — never trust that
    // the two reads landed on the same consolidado just because they were
    // requested together.
    if (rows.length > 0 && rows[0]!.campaign_id !== campaign.id) {
      return "mismatch";
    }

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
    photos: ImportGalleryPhoto[];
    campaign: Pick<PublicImportCampaign, "id" | "number" | "name" | "closesAt">;
  } | null> {
    const result = await this.rpc("public_get_import_product", { p_slug: slug.slice(0, 180) });
    if (result.error) throw new Error(`Public Import product read failed: ${result.error.message}`);
    const row = ((result.data ?? []) as ProductRow[])[0];
    if (!row) return null;
    const product = mapPublicImportProduct({ ...row, presentations: row.presentations as Json });
    if (!product) return null;
    const photos = importGalleryPhotos(await this.readProductPhotos(product.id), product);
    return {
      product,
      photos,
      campaign: {
        id: row.campaign_id,
        number: row.campaign_number,
        name: row.campaign_name,
        closesAt: row.campaign_closes_at,
      },
    };
  }
}
