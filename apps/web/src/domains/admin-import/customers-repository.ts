import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { mapPostgrestError, type AdminRepositoryResult } from "@/domains/admin-parfums/products-repository";

type CustomerRow = Database["public"]["Tables"]["customers"]["Row"];

export type ImportCustomerListItem = {
  id: string;
  fullName: string;
  phone: string | null;
  verifiedCustomerStatus: string;
  verifiedAt: string | null;
  createdAt: string;
  archivedAt: string | null;
};

export type ImportCustomerListFilters = {
  search?: string | undefined;
  archived?: "active" | "archived" | "all";
  status?: string | undefined;
};

export type ImportCustomerListPage = {
  items: ImportCustomerListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type ImportCustomerDetail = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  documentId: string | null;
  verifiedCustomerStatus: string;
  verifiedBy: string | null;
  verifiedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

function toListItem(row: CustomerRow): ImportCustomerListItem {
  return {
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
    verifiedCustomerStatus: row.verified_customer_status,
    verifiedAt: row.verified_at,
    createdAt: row.created_at,
    archivedAt: row.archived_at,
  };
}

export class AdminImportCustomersRepository {
  constructor(
    private readonly supabase: SupabaseClient<Database>,
    private readonly businessUnitId: string,
  ) {}

  async orderHistory(customerId: string, requestedPage = 1) {
    const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const pageSize = 20;
    const base = () => this.supabase.from("orders")
      .select("id,order_number,status,created_at,subtotal_amount,currency", { count: "exact" })
      .eq("business_unit_id", this.businessUnitId).eq("customer_id", customerId);
    const [orders, completed, latest, summary] = await Promise.all([
      base().order("created_at", { ascending: false }).order("id").range((page - 1) * pageSize, page * pageSize - 1),
      this.supabase.from("orders").select("id", { count: "exact", head: true })
        .eq("business_unit_id", this.businessUnitId).eq("customer_id", customerId).eq("status", "fulfilled"),
      base().order("created_at", { ascending: false }).order("id").limit(1),
      this.supabase.rpc("admin_customer_order_summary",{p_customer_id:customerId}),
    ]);
    const error = orders.error ?? completed.error ?? latest.error ?? summary.error;
    if (error) return { ok: false as const, error: mapPostgrestError(error) };
    return { ok: true as const, data: { items: orders.data ?? [], total: orders.count ?? 0,
      summary: summary.data, completed: completed.count ?? 0, latest: latest.data?.[0] ?? null, page, pageSize } };
  }

  async list(
    filters: ImportCustomerListFilters,
    pagination: { page: number; pageSize: number },
  ): Promise<AdminRepositoryResult<ImportCustomerListPage>> {
    const page = Math.max(1, pagination.page);
    const pageSize = Math.min(100, Math.max(1, pagination.pageSize));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = this.supabase
      .from("customers")
      .select("*", { count: "exact" })
      .eq("business_unit_id", this.businessUnitId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (filters.archived === "archived") query = query.not("archived_at", "is", null);
    else if (filters.archived !== "all") query = query.is("archived_at", null);

    const search = filters.search?.trim();
    if (search) {
      const term = search.replace(/[,().]/g, " ").replace(/[%_]/g, (char) => `\\${char}`);
      query = query.or(`full_name.ilike.%${term}%,phone.ilike.%${term}%`);
    }

    if (filters.status) {
      query = query.eq("verified_customer_status", filters.status);
    }

    const { data, error, count } = await query;
    if (error) return { ok: false, error: mapPostgrestError(error) };

    return {
      ok: true,
      data: {
        items: (data ?? []).map(toListItem),
        total: count ?? 0,
        page,
        pageSize,
      },
    };
  }

  async getById(customerId: string): Promise<AdminRepositoryResult<ImportCustomerDetail>> {
    const { data, error } = await this.supabase
      .from("customers")
      .select("*")
      .eq("id", customerId)
      .eq("business_unit_id", this.businessUnitId)
      .maybeSingle();

    if (error) return { ok: false, error: mapPostgrestError(error) };
    if (!data) return { ok: false, error: { type: "not_found" } };

    return {
      ok: true,
      data: {
        id: data.id,
        fullName: data.full_name,
        phone: data.phone,
        email: data.email,
        documentId: data.document_id,
        verifiedCustomerStatus: data.verified_customer_status,
        verifiedBy: data.verified_by,
        verifiedAt: data.verified_at,
        notes: data.notes,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        archivedAt: data.archived_at,
      },
    };
  }

  /** Mirrors the exact window/is_active resolution create_import_order_request
   * itself uses (20260911020000_import_order_foundation_correction.sql) so the
   * admin UI can never state a percentage the server wouldn't also apply.
   * Returns null for a status with zero or more than one applicable row —
   * both are configuration problems, not a percentage to guess at. */
  async getActiveDepositPercentages(): Promise<{ new: number | null; returning: number | null }> {
    const nowIso = new Date().toISOString();
    const { data, error } = await this.supabase
      .from("deposit_policies")
      .select("customer_status, deposit_percentage, effective_from, effective_until")
      .eq("business_unit_id", this.businessUnitId)
      .eq("is_active", true)
      .lte("effective_from", nowIso)
      .or(`effective_until.is.null,effective_until.gt.${nowIso}`);

    if (error || !data) return { new: null, returning: null };

    const byStatus = (status: string): number | null => {
      const matches = data.filter((row) => row.customer_status === status);
      return matches.length === 1 ? matches[0]!.deposit_percentage : null;
    };

    return { new: byStatus("new"), returning: byStatus("returning") };
  }

  async countPendingVerification(): Promise<number | null> {
    const { count, error } = await this.supabase
      .from("customers")
      .select("*", { count: "exact", head: true })
      .eq("business_unit_id", this.businessUnitId)
      .eq("verified_customer_status", "pending_verification")
      .is("archived_at", null);
    if (error) return null;
    return count ?? 0;
  }

  async findActiveByNormalizedPhone(phone: string): Promise<{ count: number; customerId: string | null }> {
    const { data, error } = await this.supabase
      .from("customers")
      .select("id, phone")
      .eq("business_unit_id", this.businessUnitId)
      .is("archived_at", null);

    if (error || !data) return { count: 0, customerId: null };

    const normalized = phone.replace(/[^0-9]/g, "");
    const matches = data.filter((c) => {
      const cNormalized = c.phone?.replace(/[^0-9]/g, "") ?? "";
      return cNormalized === normalized && cNormalized.length >= 9;
    });

    return { count: matches.length, customerId: matches[0]?.id ?? null };
  }
}
