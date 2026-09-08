import "server-only";

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { ComboItemInput, CompositionVerificationStatus } from "./combo-schema";
import {
  mapPostgrestError,
  type AdminRepositoryError,
  type AdminRepositoryResult,
} from "./products-repository";

/**
 * Admin Parfums combo data access.
 *
 * Every write goes through the `public.admin_*` RPC functions from
 * supabase/migrations/20260908040000_admin_parfums_combo_mutations.sql —
 * same reasoning as products-repository.ts: atomicity across combos/
 * combo_items, a non-spoofable audit trail, and optimistic concurrency with a
 * clear conflict error instead of a silent no-op. Reads use plain PostgREST
 * queries with embedded joins (never a loop of one query per row) — RLS
 * already scopes them correctly.
 *
 * A combo is 1:1 with a `products` row (the vendible entity) — this
 * repository never edits that product's own name/slug/description/variant
 * data; that stays owned by AdminParfumsProductsRepository. It only manages
 * the combo's own fields (composition_verification_status, archived_at) and
 * its composition (combo_items).
 */

export type ComboRow = Database["public"]["Tables"]["combos"]["Row"];
export type ComboItemRow = Database["public"]["Tables"]["combo_items"]["Row"];
type ProductRow = Database["public"]["Tables"]["products"]["Row"];

export type ComboMutationError =
  | AdminRepositoryError
  | { type: "self_reference" }
  | { type: "archived_reference" };

export type ComboMutationResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ComboMutationError };

function mapComboError(error: PostgrestError): ComboMutationError {
  switch (error.code) {
    case "P2006":
      return { type: "combo_reference" };
    case "22023":
      return { type: "archived_reference" };
    case "23514":
      // check_violation covers both the self-reference guard and the
      // (UI-unreachable, server-only) cross-unit guard — the message text is
      // the only thing that tells them apart, since both intentionally share
      // one SQLSTATE as a single "structural composition" error family.
      return /self-reference/i.test(error.message)
        ? { type: "self_reference" }
        : { type: "unknown", message: error.message };
    default:
      return mapPostgrestError(error);
  }
}

export type ComboListItem = ComboRow & {
  product_name: string;
  product_slug: string;
  product_brand: string | null;
  product_publication_status: string;
  item_count: number;
};

export type ComboListFilters = {
  search?: string;
  verificationStatus?: CompositionVerificationStatus;
  includeArchived?: boolean;
};

export type ComboListPage = {
  items: ComboListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type EligibleProduct = {
  id: string;
  name: string;
  brand: string | null;
  slug: string;
};

export type EligibleVariant = {
  id: string;
  productId: string;
  productName: string;
  productBrand: string | null;
  label: string;
  sizeMl: number | null;
  priceAmount: number;
  currency: string;
};

export type ComboCompositionItem = {
  id: string;
  productVariantId: string;
  quantity: number;
  sortOrder: number;
  variantLabel: string;
  variantSizeMl: number | null;
  priceAmount: number;
  currency: string;
  variantArchived: boolean;
  productId: string;
  productName: string;
  productBrand: string | null;
  productArchived: boolean;
};

export type ComboDetail = {
  combo: ComboRow;
  product: Pick<ProductRow, "id" | "name" | "slug" | "brand" | "publication_status" | "archived_at">;
  items: ComboCompositionItem[];
};

type ProductEmbed = {
  name: string;
  slug: string;
  brand: string | null;
  publication_status: string;
  business_unit_id: string;
};

export class AdminParfumsCombosRepository {
  constructor(
    private readonly supabase: SupabaseClient<Database>,
    private readonly businessUnitId: string,
  ) {}

  async list(
    filters: ComboListFilters,
    pagination: { page: number; pageSize: number },
  ): Promise<AdminRepositoryResult<ComboListPage>> {
    const page = Math.max(1, pagination.page);
    const pageSize = Math.min(100, Math.max(1, pagination.pageSize));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = this.supabase
      .from("combos")
      .select(
        "*, product:products!inner(name, slug, brand, publication_status, business_unit_id), combo_items(count)",
        { count: "exact" },
      )
      .eq("product.business_unit_id", this.businessUnitId)
      .order("updated_at", { ascending: false })
      .range(from, to);

    if (!filters.includeArchived) query = query.is("archived_at", null);
    if (filters.verificationStatus) {
      query = query.eq("composition_verification_status", filters.verificationStatus);
    }
    if (filters.search && filters.search.trim().length > 0) {
      const term = filters.search.trim().replace(/[%_]/g, (char) => `\\${char}`);
      query = query.or(`name.ilike.%${term}%,slug.ilike.%${term}%`, { foreignTable: "product" });
    }

    const { data, error, count } = await query;
    if (error) return { ok: false, error: mapPostgrestError(error) };

    const items: ComboListItem[] = (data ?? []).map((row) => {
      const { product, combo_items, ...combo } = row as ComboRow & {
        product: ProductEmbed;
        combo_items: { count: number }[];
      };
      return {
        ...combo,
        product_name: product.name,
        product_slug: product.slug,
        product_brand: product.brand,
        product_publication_status: product.publication_status,
        item_count: combo_items?.[0]?.count ?? 0,
      };
    });

    return { ok: true, data: { items, total: count ?? 0, page, pageSize } };
  }

  async getById(comboId: string): Promise<AdminRepositoryResult<ComboDetail>> {
    const { data: comboRow, error: comboError } = await this.supabase
      .from("combos")
      .select(
        "*, product:products!inner(id, name, slug, brand, publication_status, archived_at, business_unit_id)",
      )
      .eq("id", comboId)
      .eq("product.business_unit_id", this.businessUnitId)
      .maybeSingle();

    if (comboError) return { ok: false, error: mapPostgrestError(comboError) };
    if (!comboRow) return { ok: false, error: { type: "not_found" } };

    const { product, ...combo } = comboRow as ComboRow & {
      product: Pick<ProductRow, "id" | "name" | "slug" | "brand" | "publication_status" | "archived_at"> & {
        business_unit_id: string;
      };
    };

    // One query with embedded joins for variant + its own product — not one
    // query per combo_items row.
    const { data: itemRows, error: itemsError } = await this.supabase
      .from("combo_items")
      .select(
        // A single string literal, not a concatenation — supabase-js needs
        // this as a literal type to type-check the embedded relations at
        // compile time; a `+`-built string degrades to an untyped result.
        "id, product_variant_id, quantity, sort_order, created_at, variant:product_variants(id, label, size_ml, price_amount, currency, archived_at, product:products(id, name, brand, archived_at))",
      )
      .eq("combo_id", comboId)
      .order("sort_order", { ascending: true });

    if (itemsError) return { ok: false, error: mapPostgrestError(itemsError) };

    const items: ComboCompositionItem[] = (itemRows ?? []).map((row) => {
      const variant = row.variant as unknown as {
        id: string;
        label: string;
        size_ml: number | null;
        price_amount: number;
        currency: string;
        archived_at: string | null;
        product: { id: string; name: string; brand: string | null; archived_at: string | null } | null;
      };
      return {
        id: row.id,
        productVariantId: row.product_variant_id,
        quantity: row.quantity,
        sortOrder: row.sort_order,
        variantLabel: variant.label,
        variantSizeMl: variant.size_ml,
        priceAmount: variant.price_amount,
        currency: variant.currency,
        variantArchived: variant.archived_at !== null,
        productId: variant.product?.id ?? "",
        productName: variant.product?.name ?? "(producto eliminado)",
        productBrand: variant.product?.brand ?? null,
        productArchived: variant.product?.archived_at !== null,
      };
    });

    return {
      ok: true,
      data: {
        combo,
        product: {
          id: product.id,
          name: product.name,
          slug: product.slug,
          brand: product.brand,
          publication_status: product.publication_status,
          archived_at: product.archived_at,
        },
        items,
      },
    };
  }

  /** Non-archived Parfums products that do not already own a combo — the
   * eligible set for "create a new combo". No name/brand/price is invented
   * here: this only filters an existing list. */
  async listEligibleProducts(): Promise<AdminRepositoryResult<EligibleProduct[]>> {
    const { data: products, error } = await this.supabase
      .from("products")
      .select("id, name, brand, slug")
      .eq("business_unit_id", this.businessUnitId)
      .is("archived_at", null)
      .order("name", { ascending: true });

    if (error) return { ok: false, error: mapPostgrestError(error) };

    const { data: existingCombos, error: comboError } = await this.supabase
      .from("combos")
      .select("product_id, product:products!inner(business_unit_id)")
      .eq("product.business_unit_id", this.businessUnitId);

    if (comboError) return { ok: false, error: mapPostgrestError(comboError) };

    const taken = new Set((existingCombos ?? []).map((row) => row.product_id));
    return { ok: true, data: (products ?? []).filter((product) => !taken.has(product.id)) };
  }

  /** Variants eligible as new composition additions: active, from an active
   * product, in this business unit, excluding the combo's own product
   * (mirrors the DB's self-reference guard so the UI never offers a choice
   * the server would reject). Existing composition rows are NOT filtered by
   * this — this list is only for the "add new item" picker. */
  async listEligibleVariants(excludeProductId: string): Promise<AdminRepositoryResult<EligibleVariant[]>> {
    const { data, error } = await this.supabase
      .from("product_variants")
      .select(
        "id, label, size_ml, price_amount, currency, product_id, product:products!inner(id, name, brand, business_unit_id, archived_at)",
      )
      .eq("product.business_unit_id", this.businessUnitId)
      .is("archived_at", null)
      .is("product.archived_at", null)
      .neq("product_id", excludeProductId)
      .order("product_id", { ascending: true })
      .order("sort_order", { ascending: true });

    if (error) return { ok: false, error: mapPostgrestError(error) };

    const items: EligibleVariant[] = (data ?? []).map((row) => {
      const product = row.product as unknown as { id: string; name: string; brand: string | null };
      return {
        id: row.id,
        productId: row.product_id,
        productName: product.name,
        productBrand: product.brand,
        label: row.label,
        sizeMl: row.size_ml,
        priceAmount: row.price_amount,
        currency: row.currency,
      };
    });

    return { ok: true, data: items };
  }

  async create(input: {
    productId: string;
    compositionVerificationStatus: CompositionVerificationStatus;
  }): Promise<ComboMutationResult<ComboRow>> {
    const { data, error } = await this.supabase.rpc("admin_create_combo", {
      p_product_id: input.productId,
      p_composition_verification_status: input.compositionVerificationStatus,
    });
    if (error) return { ok: false, error: mapComboError(error) };
    return { ok: true, data: data as ComboRow };
  }

  async updateVerification(
    comboId: string,
    expectedUpdatedAt: string,
    status: CompositionVerificationStatus,
  ): Promise<ComboMutationResult<ComboRow>> {
    const { data, error } = await this.supabase.rpc("admin_update_combo_verification", {
      p_combo_id: comboId,
      p_expected_updated_at: expectedUpdatedAt,
      p_composition_verification_status: status,
    });
    if (error) return { ok: false, error: mapComboError(error) };
    return { ok: true, data: data as ComboRow };
  }

  async archive(comboId: string, expectedUpdatedAt: string): Promise<ComboMutationResult<ComboRow>> {
    const { data, error } = await this.supabase.rpc("admin_archive_combo", {
      p_combo_id: comboId,
      p_expected_updated_at: expectedUpdatedAt,
    });
    if (error) return { ok: false, error: mapComboError(error) };
    return { ok: true, data: data as ComboRow };
  }

  async restore(comboId: string, expectedUpdatedAt: string): Promise<ComboMutationResult<ComboRow>> {
    const { data, error } = await this.supabase.rpc("admin_restore_combo", {
      p_combo_id: comboId,
      p_expected_updated_at: expectedUpdatedAt,
    });
    if (error) return { ok: false, error: mapComboError(error) };
    return { ok: true, data: data as ComboRow };
  }

  /** Full replace, one RPC call. Returns the fresh combo row (with its
   * bumped updated_at) alongside the new items, so the caller has a valid
   * concurrency token for whatever it does next — the RPC itself only
   * returns `setof combo_items`. */
  async setComposition(
    comboId: string,
    expectedUpdatedAt: string,
    items: ComboItemInput[],
  ): Promise<ComboMutationResult<{ combo: ComboRow; items: ComboItemRow[] }>> {
    const payload = items.map((item) => ({
      product_variant_id: item.productVariantId,
      quantity: item.quantity,
      sort_order: item.sortOrder,
    }));

    const { data, error } = await this.supabase.rpc("admin_set_combo_composition", {
      p_combo_id: comboId,
      p_expected_updated_at: expectedUpdatedAt,
      p_items: payload,
    });
    if (error) return { ok: false, error: mapComboError(error) };

    const { data: comboRow, error: comboError } = await this.supabase
      .from("combos")
      .select("*")
      .eq("id", comboId)
      .maybeSingle();
    if (comboError) return { ok: false, error: mapPostgrestError(comboError) };
    if (!comboRow) return { ok: false, error: { type: "not_found" } };

    return { ok: true, data: { combo: comboRow, items: (data ?? []) as ComboItemRow[] } };
  }
}
