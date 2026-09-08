import "server-only";

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type {
  AvailabilityStatus,
  InventoryFormInput,
  ProductFormInput,
  ProductionStatus,
  PublicationStatus,
  VariantFormInput,
} from "./product-schema";

/**
 * Admin Parfums product data access.
 *
 * Every write goes through the `public.admin_*` RPC functions from
 * supabase/migrations/20260908000435_admin_parfums_product_mutations.sql —
 * never a raw `.insert()`/`.update()` on products/product_variants/inventory
 * — so create/variant/inventory writes stay atomic and every mutation is
 * audited with a server-resolved actor. Reads (list/get) use plain
 * PostgREST queries: RLS already scopes them correctly and there is nothing
 * to make atomic about a SELECT.
 *
 * ADMIN DB = Supabase (this repository). PUBLIC STOREFRONT still reads from
 * LegacyCatalogRepository (assets/data.js via the legacy fixture) — this
 * class never touches that path, and the storefront cutover is a separate,
 * later capability. Do not wire /parfums pages to this repository yet.
 */

/**
 * `supabase gen types` emits every plain (non-default) RPC parameter with its
 * bare SQL type — e.g. `p_brand: string` — even when the underlying column is
 * genuinely nullable and the SQL function has no `NOT NULL` on that parameter.
 * Postgres itself will accept `null` for these without complaint; this only
 * widens the TypeScript type to match what the database actually allows, for
 * the handful of full-replace update RPCs that legitimately send `null` to
 * clear an optional field.
 */
type RpcArgsWithNulls<T> = { [K in keyof T]: T[K] | null };

export type AdminRepositoryError =
  | { type: "unauthorized" }
  | { type: "forbidden" }
  | { type: "not_found" }
  | { type: "conflict" }
  | { type: "unique_violation"; constraint: string | null }
  | { type: "invalid_reference" }
  | { type: "unknown"; message: string };

export type AdminRepositoryResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: AdminRepositoryError };

type ProductRow = Database["public"]["Tables"]["products"]["Row"];
type VariantRow = Database["public"]["Tables"]["product_variants"]["Row"];
type InventoryRow = Database["public"]["Tables"]["inventory"]["Row"];
type CategoryRow = Database["public"]["Tables"]["categories"]["Row"];
type ProductCategoryRow = Database["public"]["Tables"]["product_categories"]["Row"];

export type ProductListItem = ProductRow & {
  variant_count: number;
};

export type ProductListFilters = {
  search?: string;
  publicationStatus?: PublicationStatus;
  productionStatus?: ProductionStatus;
  featuredOnly?: boolean;
  includeArchived?: boolean;
};

export type ProductListPage = {
  items: ProductListItem[];
  total: number;
  page: number;
  pageSize: number;
};

/** Maps a PostgREST/Postgres error onto a typed, non-leaky result. Never
 * forwards `error.message`/`error.details` verbatim to the caller for
 * anything except the `unknown` fallback, which callers must log server-side
 * only — never render to the admin. */
export function mapPostgrestError(error: PostgrestError): AdminRepositoryError {
  switch (error.code) {
    case "42501":
      return { type: "forbidden" };
    case "P0002":
      return { type: "not_found" };
    case "40001":
      return { type: "conflict" };
    case "23505":
      return { type: "unique_violation", constraint: extractConstraint(error) };
    case "P2004":
      return { type: "invalid_reference" };
    default:
      return { type: "unknown", message: error.message };
  }
}

function extractConstraint(error: PostgrestError): string | null {
  // Postgres puts the constraint name in `details`, e.g.
  // 'Key (business_unit_id, slug)=(...) already exists.' — this pulls the
  // column list out for the caller to decide which field to blame, without
  // parsing the human-readable message.
  const match = /Key \(([^)]+)\)=/.exec(error.details ?? "");
  return match?.[1] ?? null;
}

export class AdminParfumsProductsRepository {
  constructor(
    private readonly supabase: SupabaseClient<Database>,
    private readonly businessUnitId: string,
  ) {}

  async list(
    filters: ProductListFilters,
    pagination: { page: number; pageSize: number },
  ): Promise<AdminRepositoryResult<ProductListPage>> {
    const page = Math.max(1, pagination.page);
    const pageSize = Math.min(100, Math.max(1, pagination.pageSize));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = this.supabase
      .from("products")
      .select("*, product_variants(count)", { count: "exact" })
      .eq("business_unit_id", this.businessUnitId)
      .order("updated_at", { ascending: false })
      .range(from, to);

    if (!filters.includeArchived) {
      query = query.is("archived_at", null);
    }
    if (filters.publicationStatus) {
      query = query.eq("publication_status", filters.publicationStatus);
    }
    if (filters.productionStatus) {
      query = query.eq("production_status", filters.productionStatus);
    }
    if (filters.featuredOnly) {
      query = query.eq("is_featured", true);
    }
    if (filters.search && filters.search.trim().length > 0) {
      const term = filters.search.trim().replace(/[%_]/g, (char) => `\\${char}`);
      query = query.or(`name.ilike.%${term}%,brand.ilike.%${term}%,slug.ilike.%${term}%`);
    }

    const { data, error, count } = await query;
    if (error) return { ok: false, error: mapPostgrestError(error) };

    const items: ProductListItem[] = (data ?? []).map((row) => {
      const { product_variants, ...product } = row as ProductRow & {
        product_variants: { count: number }[];
      };
      return { ...product, variant_count: product_variants?.[0]?.count ?? 0 };
    });

    return { ok: true, data: { items, total: count ?? 0, page, pageSize } };
  }

  async getById(
    productId: string,
  ): Promise<AdminRepositoryResult<{
    product: ProductRow;
    variants: (VariantRow & { inventory: InventoryRow | null })[];
    categories: (ProductCategoryRow & { category: CategoryRow | null })[];
  }>> {
    const { data: product, error: productError } = await this.supabase
      .from("products")
      .select("*")
      .eq("id", productId)
      .eq("business_unit_id", this.businessUnitId)
      .maybeSingle();

    if (productError) return { ok: false, error: mapPostgrestError(productError) };
    if (!product) return { ok: false, error: { type: "not_found" } };

    const { data: variants, error: variantsError } = await this.supabase
      .from("product_variants")
      .select("*, inventory(*)")
      .eq("product_id", productId)
      .order("sort_order", { ascending: true });

    if (variantsError) return { ok: false, error: mapPostgrestError(variantsError) };

    const { data: categories, error: categoriesError } = await this.supabase
      .from("product_categories")
      .select("*, category:categories(*)")
      .eq("product_id", productId)
      .order("sort_order", { ascending: true });

    if (categoriesError) return { ok: false, error: mapPostgrestError(categoriesError) };

    return {
      ok: true,
      data: {
        product,
        variants: (variants ?? []).map((row) => {
          const { inventory, ...variant } = row as VariantRow & { inventory: InventoryRow[] | InventoryRow | null };
          const inventoryRow = Array.isArray(inventory) ? inventory[0] ?? null : inventory ?? null;
          return { ...variant, inventory: inventoryRow };
        }),
        categories: (categories ?? []) as (ProductCategoryRow & { category: CategoryRow | null })[],
      },
    };
  }

  async create(
    businessUnitCode: "parfums" | "import",
    input: ProductFormInput,
  ): Promise<AdminRepositoryResult<ProductRow>> {
    // admin_create_product's optional parameters are generated as `p_x?: T`
    // (not `T | null`), and exactOptionalPropertyTypes rejects assigning
    // `undefined` to those keys directly — the key must be omitted instead.
    // A cleared/blank field is therefore left out of the call entirely,
    // which is exactly what the SQL `default null` on those params expects.
    const { data, error } = await this.supabase.rpc("admin_create_product", {
      p_business_unit_code: businessUnitCode,
      p_slug: input.slug,
      p_name: input.name,
      ...(input.brand ? { p_brand: input.brand } : {}),
      ...(input.shortDescription ? { p_short_description: input.shortDescription } : {}),
      ...(input.description ? { p_description: input.description } : {}),
      ...(input.gender ? { p_gender: input.gender } : {}),
      ...(input.concentration ? { p_concentration: input.concentration } : {}),
      p_sales_mode: input.salesMode,
      p_production_status: input.productionStatus,
      p_publication_status: input.publicationStatus,
      p_is_featured: input.isFeatured,
      ...(input.featuredRank !== null ? { p_featured_rank: input.featuredRank } : {}),
      ...(input.featuredFrom ? { p_featured_from: input.featuredFrom } : {}),
      ...(input.featuredUntil ? { p_featured_until: input.featuredUntil } : {}),
    });

    if (error) return { ok: false, error: mapPostgrestError(error) };
    return { ok: true, data: data as ProductRow };
  }

  async update(
    productId: string,
    expectedUpdatedAt: string,
    input: ProductFormInput,
  ): Promise<AdminRepositoryResult<ProductRow>> {
    type Args = RpcArgsWithNulls<Database["public"]["Functions"]["admin_update_product"]["Args"]>;
    const payload: Args = {
      p_product_id: productId,
      p_expected_updated_at: expectedUpdatedAt,
      p_slug: input.slug,
      p_name: input.name,
      p_brand: input.brand,
      p_short_description: input.shortDescription,
      p_description: input.description,
      p_gender: input.gender,
      p_concentration: input.concentration,
      p_sales_mode: input.salesMode,
      p_production_status: input.productionStatus,
      p_publication_status: input.publicationStatus,
      p_is_featured: input.isFeatured,
      p_featured_rank: input.featuredRank,
      p_featured_from: input.featuredFrom,
      p_featured_until: input.featuredUntil,
    };
    const { data, error } = await this.supabase.rpc(
      "admin_update_product",
      payload as Database["public"]["Functions"]["admin_update_product"]["Args"],
    );

    if (error) return { ok: false, error: mapPostgrestError(error) };
    return { ok: true, data: data as ProductRow };
  }

  async archive(
    productId: string,
    expectedUpdatedAt: string,
  ): Promise<AdminRepositoryResult<ProductRow>> {
    const { data, error } = await this.supabase.rpc("admin_archive_product", {
      p_product_id: productId,
      p_expected_updated_at: expectedUpdatedAt,
    });
    if (error) return { ok: false, error: mapPostgrestError(error) };
    return { ok: true, data: data as ProductRow };
  }

  async restore(
    productId: string,
    expectedUpdatedAt: string,
  ): Promise<AdminRepositoryResult<ProductRow>> {
    const { data, error } = await this.supabase.rpc("admin_restore_product", {
      p_product_id: productId,
      p_expected_updated_at: expectedUpdatedAt,
    });
    if (error) return { ok: false, error: mapPostgrestError(error) };
    return { ok: true, data: data as ProductRow };
  }

  async createVariant(
    productId: string,
    variant: VariantFormInput,
    inventory: InventoryFormInput,
  ): Promise<AdminRepositoryResult<VariantRow>> {
    // p_size_ml has no SQL default (a bottle variant can still legitimately
    // have no ml size) — see the RpcArgsWithNulls comment above.
    type Args = RpcArgsWithNulls<Database["public"]["Functions"]["admin_create_variant"]["Args"]>;
    const payload: Args = {
      p_product_id: productId,
      p_label: variant.label,
      p_variant_kind: variant.variantKind,
      p_size_ml: variant.sizeMl,
      p_price_amount: variant.priceAmount,
      p_currency: variant.currency,
      p_sku: variant.sku,
      p_publication_status: variant.publicationStatus,
      p_sort_order: variant.sortOrder,
      p_inventory_mode: inventory.inventoryMode,
      p_availability_status: inventory.availabilityStatus,
      p_quantity_on_hand: inventory.quantityOnHand,
    };
    const { data, error } = await this.supabase.rpc(
      "admin_create_variant",
      payload as Database["public"]["Functions"]["admin_create_variant"]["Args"],
    );
    if (error) return { ok: false, error: mapPostgrestError(error) };
    return { ok: true, data: data as VariantRow };
  }

  async updateVariant(
    variantId: string,
    expectedUpdatedAt: string,
    variant: VariantFormInput,
  ): Promise<AdminRepositoryResult<VariantRow>> {
    type Args = RpcArgsWithNulls<Database["public"]["Functions"]["admin_update_variant"]["Args"]>;
    const payload: Args = {
      p_variant_id: variantId,
      p_expected_updated_at: expectedUpdatedAt,
      p_label: variant.label,
      p_variant_kind: variant.variantKind,
      p_size_ml: variant.sizeMl,
      p_price_amount: variant.priceAmount,
      p_currency: variant.currency,
      p_sku: variant.sku,
      p_publication_status: variant.publicationStatus,
      p_sort_order: variant.sortOrder,
    };
    const { data, error } = await this.supabase.rpc(
      "admin_update_variant",
      payload as Database["public"]["Functions"]["admin_update_variant"]["Args"],
    );
    if (error) return { ok: false, error: mapPostgrestError(error) };
    return { ok: true, data: data as VariantRow };
  }

  async archiveVariant(
    variantId: string,
    expectedUpdatedAt: string,
  ): Promise<AdminRepositoryResult<VariantRow>> {
    const { data, error } = await this.supabase.rpc("admin_archive_variant", {
      p_variant_id: variantId,
      p_expected_updated_at: expectedUpdatedAt,
    });
    if (error) return { ok: false, error: mapPostgrestError(error) };
    return { ok: true, data: data as VariantRow };
  }

  async restoreVariant(
    variantId: string,
    expectedUpdatedAt: string,
  ): Promise<AdminRepositoryResult<VariantRow>> {
    const { data, error } = await this.supabase.rpc("admin_restore_variant", {
      p_variant_id: variantId,
      p_expected_updated_at: expectedUpdatedAt,
    });
    if (error) return { ok: false, error: mapPostgrestError(error) };
    return { ok: true, data: data as VariantRow };
  }

  async updateInventory(
    variantId: string,
    expectedUpdatedAt: string,
    inventory: InventoryFormInput,
  ): Promise<AdminRepositoryResult<InventoryRow>> {
    type Args = RpcArgsWithNulls<Database["public"]["Functions"]["admin_update_inventory"]["Args"]>;
    const payload: Args = {
      p_variant_id: variantId,
      p_expected_updated_at: expectedUpdatedAt,
      p_inventory_mode: inventory.inventoryMode,
      p_availability_status: inventory.availabilityStatus,
      p_quantity_on_hand: inventory.quantityOnHand,
    };
    const { data, error } = await this.supabase.rpc(
      "admin_update_inventory",
      payload as Database["public"]["Functions"]["admin_update_inventory"]["Args"],
    );
    if (error) return { ok: false, error: mapPostgrestError(error) };
    return { ok: true, data: data as InventoryRow };
  }

  async setCategories(
    productId: string,
    categoryIds: string[],
  ): Promise<AdminRepositoryResult<ProductCategoryRow[]>> {
    const { data, error } = await this.supabase.rpc("admin_set_product_categories", {
      p_product_id: productId,
      p_category_ids: categoryIds,
    });
    if (error) return { ok: false, error: mapPostgrestError(error) };
    return { ok: true, data: (data ?? []) as ProductCategoryRow[] };
  }

  /** Non-archived categories for this business unit, for the assignment
   * checklist (draft ones included — an admin can see and assign those too).
   * This module does not add category CRUD. */
  async listAvailableCategories(): Promise<AdminRepositoryResult<CategoryRow[]>> {
    const { data, error } = await this.supabase
      .from("categories")
      .select("*")
      .eq("business_unit_id", this.businessUnitId)
      .is("archived_at", null)
      .order("sort_order", { ascending: true });

    if (error) return { ok: false, error: mapPostgrestError(error) };
    return { ok: true, data: data ?? [] };
  }
}

export type { AvailabilityStatus };
