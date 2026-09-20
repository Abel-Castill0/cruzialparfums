import "server-only";

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type {
  CategoryFormInput,
  CategoryKind,
  CategoryPublicationStatus,
} from "./category-schema";
import {
  mapPostgrestError,
  type AdminRepositoryError,
  type AdminRepositoryResult,
} from "./products-repository";

type CategoryRow = Database["public"]["Tables"]["categories"]["Row"];
type NullableRpcArgs<T> = { [K in keyof T]: T[K] | null };

export type CategoryMutationError =
  | AdminRepositoryError
  | { type: "invalid_hierarchy" }
  | { type: "relations_exist" }
  | { type: "archived_parent" }
  | { type: "archived_assignment" }
  | { type: "archived_edit" };

export type CategoryMutationResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: CategoryMutationError };

export type CategoryListItem = CategoryRow & {
  parent_name: string | null;
  product_count: number;
  active_child_count: number;
};

export type CategoryDetail = CategoryListItem;

export type CategoryListFilters = {
  search?: string;
  publicationStatus?: CategoryPublicationStatus | "archived";
  kind?: CategoryKind;
  includeArchived?: boolean;
};

export type CategoryListPage = {
  items: CategoryListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type CategoryParentOption = {
  id: string;
  name: string;
  kind: CategoryKind;
  path: string;
};

function mapCategoryError(error: PostgrestError): CategoryMutationError {
  switch (error.code) {
    case "P2001":
      return { type: "invalid_hierarchy" };
    case "P2002":
      return { type: "relations_exist" };
    case "P2003":
      return { type: "archived_parent" };
    case "P2004":
      return { type: "archived_assignment" };
    case "P2005":
      return { type: "archived_edit" };
    default:
      return mapPostgrestError(error);
  }
}

export class AdminParfumsCategoriesRepository {
  constructor(
    private readonly supabase: SupabaseClient<Database>,
    private readonly businessUnitId: string,
  ) {}

  async list(
    filters: CategoryListFilters,
    pagination: { page: number; pageSize: number },
  ): Promise<AdminRepositoryResult<CategoryListPage>> {
    const page = Math.max(1, pagination.page);
    const pageSize = Math.min(100, Math.max(1, pagination.pageSize));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = this.supabase
      .from("categories")
      .select(
        "*, product_categories(count), children:categories!parent_id(id, archived_at)",
        { count: "exact" },
      )
      .eq("business_unit_id", this.businessUnitId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
      .range(from, to);

    if (!filters.includeArchived) query = query.is("archived_at", null);
    if (filters.publicationStatus) query = query.eq("publication_status", filters.publicationStatus);
    if (filters.kind) query = query.eq("kind", filters.kind);
    if (filters.search?.trim()) {
      const term = filters.search.trim().replace(/[%_]/g, (character) => `\\${character}`);
      query = query.or(`name.ilike.%${term}%,slug.ilike.%${term}%`);
    }

    const { data, error, count } = await query;
    if (error) return { ok: false, error: mapPostgrestError(error) };

    const parentIds = [...new Set((data ?? []).flatMap((row) => row.parent_id ? [row.parent_id] : []))];
    const parentNames = new Map<string, string>();
    if (parentIds.length > 0) {
      const { data: parents, error: parentsError } = await this.supabase
        .from("categories")
        .select("id, name")
        .eq("business_unit_id", this.businessUnitId)
        .in("id", parentIds);
      if (parentsError) return { ok: false, error: mapPostgrestError(parentsError) };
      for (const parent of parents ?? []) parentNames.set(parent.id, parent.name);
    }

    const items = (data ?? []).map((row) => {
      const { product_categories, children, ...category } = row;
      return {
        ...category,
        parent_name: category.parent_id ? parentNames.get(category.parent_id) ?? null : null,
        product_count: product_categories?.[0]?.count ?? 0,
        active_child_count: (children ?? []).filter((child) => child.archived_at === null).length,
      } satisfies CategoryListItem;
    });

    return { ok: true, data: { items, total: count ?? 0, page, pageSize } };
  }

  async getById(categoryId: string): Promise<AdminRepositoryResult<CategoryDetail>> {
    const { data, error } = await this.supabase
      .from("categories")
      .select("*, product_categories(count), children:categories!parent_id(id, archived_at)")
      .eq("id", categoryId)
      .eq("business_unit_id", this.businessUnitId)
      .maybeSingle();

    if (error) return { ok: false, error: mapPostgrestError(error) };
    if (!data) return { ok: false, error: { type: "not_found" } };
    const { product_categories, children, ...category } = data;
    let parentName: string | null = null;
    if (category.parent_id) {
      const { data: parent, error: parentError } = await this.supabase
        .from("categories")
        .select("name")
        .eq("id", category.parent_id)
        .eq("business_unit_id", this.businessUnitId)
        .maybeSingle();
      if (parentError) return { ok: false, error: mapPostgrestError(parentError) };
      parentName = parent?.name ?? null;
    }
    return {
      ok: true,
      data: {
        ...category,
        parent_name: parentName,
        product_count: product_categories?.[0]?.count ?? 0,
        active_child_count: (children ?? []).filter((child) => child.archived_at === null).length,
      },
    };
  }

  /** One query for the whole parent tree. Descendants of the edited row are
   * removed client-side so the UI cannot offer an obvious cycle; the trigger
   * remains the final concurrency-safe guard. */
  async listParentOptions(currentCategoryId?: string): Promise<AdminRepositoryResult<CategoryParentOption[]>> {
    const { data, error } = await this.supabase
      .from("categories")
      .select("id, name, kind, parent_id")
      .eq("business_unit_id", this.businessUnitId)
      .is("archived_at", null)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) return { ok: false, error: mapPostgrestError(error) };
    const rows = data ?? [];
    const byId = new Map(rows.map((row) => [row.id, row]));
    const excluded = new Set<string>();
    if (currentCategoryId) {
      excluded.add(currentCategoryId);
      let changed = true;
      while (changed) {
        changed = false;
        for (const row of rows) {
          if (row.parent_id && excluded.has(row.parent_id) && !excluded.has(row.id)) {
            excluded.add(row.id);
            changed = true;
          }
        }
      }
    }

    function pathFor(id: string): string {
      const parts: string[] = [];
      const visited = new Set<string>();
      let current = byId.get(id);
      while (current && !visited.has(current.id)) {
        visited.add(current.id);
        parts.unshift(current.name);
        current = current.parent_id ? byId.get(current.parent_id) : undefined;
      }
      return parts.join(" › ");
    }

    return {
      ok: true,
      data: rows
        .filter((row) => !excluded.has(row.id))
        .filter((row): row is typeof row & { kind: CategoryKind } =>
          row.kind === "commercial_type" || row.kind === "olfactory_family")
        .map((row) => ({ id: row.id, name: row.name, kind: row.kind, path: pathFor(row.id) })),
    };
  }

  async create(input: CategoryFormInput): Promise<CategoryMutationResult<CategoryRow>> {
    const { data, error } = await this.supabase.rpc("admin_create_category", {
      p_business_unit_code: "parfums",
      p_kind: input.kind,
      p_slug: input.slug,
      p_name: input.name,
      ...(input.description ? { p_description: input.description } : {}),
      ...(input.parentId ? { p_parent_id: input.parentId } : {}),
      p_publication_status: input.publicationStatus,
      p_sort_order: input.sortOrder,
    });
    if (error) return { ok: false, error: mapCategoryError(error) };
    return { ok: true, data: data as CategoryRow };
  }

  async update(
    categoryId: string,
    expectedUpdatedAt: string,
    input: CategoryFormInput,
  ): Promise<CategoryMutationResult<CategoryRow>> {
    type Args = NullableRpcArgs<Database["public"]["Functions"]["admin_update_category"]["Args"]>;
    const payload: Args = {
      p_category_id: categoryId,
      p_expected_updated_at: expectedUpdatedAt,
      p_kind: input.kind,
      p_slug: input.slug,
      p_name: input.name,
      p_description: input.description,
      p_parent_id: input.parentId,
      p_publication_status: input.publicationStatus,
      p_sort_order: input.sortOrder,
    };
    const { data, error } = await this.supabase.rpc(
      "admin_update_category",
      payload as Database["public"]["Functions"]["admin_update_category"]["Args"],
    );
    if (error) return { ok: false, error: mapCategoryError(error) };
    return { ok: true, data: data as CategoryRow };
  }

  async archive(categoryId: string, expectedUpdatedAt: string): Promise<CategoryMutationResult<CategoryRow>> {
    const { data, error } = await this.supabase.rpc("admin_archive_category", {
      p_category_id: categoryId,
      p_expected_updated_at: expectedUpdatedAt,
    });
    if (error) return { ok: false, error: mapCategoryError(error) };
    return { ok: true, data: data as CategoryRow };
  }

  async restore(categoryId: string, expectedUpdatedAt: string): Promise<CategoryMutationResult<CategoryRow>> {
    const { data, error } = await this.supabase.rpc("admin_restore_category", {
      p_category_id: categoryId,
      p_expected_updated_at: expectedUpdatedAt,
    });
    if (error) return { ok: false, error: mapCategoryError(error) };
    return { ok: true, data: data as CategoryRow };
  }
}
