import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { mapPostgrestError, type AdminRepositoryResult } from "@/domains/admin-parfums/products-repository";

type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
type OrderLineRow = Database["public"]["Tables"]["order_lines"]["Row"];

export type ImportOrderCustomerSnapshot = { name: string; phone: string; normalizedPhone?: string };
export type ImportOrderDeliverySnapshot = { method: string; district: string; address: string; note: string; deliveryFeeStatus?: string };

export type ImportOrderListItem = {
  id: string;
  orderNumber: string;
  createdAt: string;
  status: string;
  currency: string;
  subtotalAmount: number;
  depositPercentageSnapshot: number | null;
  depositAmountSnapshot: number | null;
  customerId: string | null;
  campaignId: string | null;
  customer: ImportOrderCustomerSnapshot;
  delivery: ImportOrderDeliverySnapshot;
  lineCount: number;
  campaignNumber: number | null;
};

export type ImportOrderListFilters = {
  search?: string | undefined;
  status?: string | undefined;
  campaignId?: string | undefined;
};

export type ImportOrderListPage = {
  items: ImportOrderListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type ImportOrderDetail = {
  id: string;
  orderNumber: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  currency: string;
  subtotalAmount: number;
  depositPercentageSnapshot: number | null;
  depositAmountSnapshot: number | null;
  customerId: string | null;
  verifiedCustomerStatusSnapshot: string | null;
  campaignId: string | null;
  customer: ImportOrderCustomerSnapshot;
  delivery: ImportOrderDeliverySnapshot;
  campaignNumber: number | null;
};

export type ImportOrderLineItem = {
  id: string;
  productNameSnapshot: string;
  variantLabelSnapshot: string;
  quantity: number;
  unitPriceAmount: number;
  lineTotalAmount: number;
};

function readCustomerSnapshot(value: Json): ImportOrderCustomerSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { name: "", phone: "" };
  }
  const record = value as Record<string, Json>;
  return {
    name: typeof record.name === "string" ? record.name : "",
    phone: typeof record.phone === "string" ? record.phone : "",
    ...(typeof record.normalizedPhone === "string" ? { normalizedPhone: record.normalizedPhone } : {}),
  };
}

function readDeliverySnapshot(value: Json): ImportOrderDeliverySnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { method: "private_delivery", district: "", address: "", note: "" };
  }
  const record = value as Record<string, Json>;
  return {
    method: typeof record.method === "string" ? record.method : "private_delivery",
    district: typeof record.district === "string" ? record.district : "",
    address: typeof record.address === "string" ? record.address : "",
    note: typeof record.note === "string" ? record.note : "",
    ...(typeof record.deliveryFeeStatus === "string" ? { deliveryFeeStatus: record.deliveryFeeStatus } : {}),
  };
}

// Supabase returns `campaigns(number)` as a single object or null, not an array
type CampaignJoin = { number: number } | null;

function toListItem(row: OrderRow & { order_lines?: { count: number }[]; campaigns?: CampaignJoin }): ImportOrderListItem {
  return {
    id: row.id,
    orderNumber: row.order_number,
    createdAt: row.created_at,
    status: row.status,
    currency: row.currency,
    subtotalAmount: row.subtotal_amount,
    depositPercentageSnapshot: row.deposit_percentage_snapshot,
    depositAmountSnapshot: row.deposit_amount_snapshot ?? null,
    customerId: row.customer_id,
    campaignId: row.campaign_id,
    customer: readCustomerSnapshot(row.customer_snapshot),
    delivery: readDeliverySnapshot(row.delivery_snapshot),
    lineCount: row.order_lines?.[0]?.count ?? 0,
    campaignNumber: row.campaigns?.number ?? null,
  };
}

export class AdminImportOrdersRepository {
  constructor(
    private readonly supabase: SupabaseClient<Database>,
    private readonly businessUnitId: string,
  ) {}

  async list(
    filters: ImportOrderListFilters,
    pagination: { page: number; pageSize: number },
  ): Promise<AdminRepositoryResult<ImportOrderListPage>> {
    const page = Math.max(1, pagination.page);
    const pageSize = Math.min(100, Math.max(1, pagination.pageSize));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = this.supabase
      .from("orders")
      .select("*, order_lines(count), campaigns(number)", { count: "exact" })
      .eq("business_unit_id", this.businessUnitId)
      .order("created_at", { ascending: false })
      .range(from, to);

    const search = filters.search?.trim();
    if (search) {
      const term = search.replace(/[%_]/g, (char) => `\\${char}`);
      query = query.or(
        `order_number.ilike.%${term}%,customer_snapshot->>name.ilike.%${term}%,customer_snapshot->>phone.ilike.%${term}%`,
      );
    }

    if (filters.status) {
      query = query.eq("status", filters.status);
    }

    if (filters.campaignId) {
      query = query.eq("campaign_id", filters.campaignId);
    }

    const { data, error, count } = await query;
    if (error) return { ok: false, error: mapPostgrestError(error) };

    const items: ImportOrderListItem[] = (data ?? []).map((row) => {
      const typed = row as OrderRow & { order_lines: { count: number }[]; campaigns: CampaignJoin };
      return toListItem(typed);
    });

    return { ok: true, data: { items, total: count ?? 0, page, pageSize } };
  }

  async getById(
    orderId: string,
  ): Promise<AdminRepositoryResult<{ order: ImportOrderDetail; lines: ImportOrderLineItem[] }>> {
    const { data: order, error: orderError } = await this.supabase
      .from("orders")
      .select("*, campaigns(number)")
      .eq("id", orderId)
      .eq("business_unit_id", this.businessUnitId)
      .maybeSingle();

    if (orderError) return { ok: false, error: mapPostgrestError(orderError) };
    if (!order) return { ok: false, error: { type: "not_found" } };

    const { data: lines, error: linesError } = await this.supabase
      .from("order_lines")
      .select("*")
      .eq("order_id", orderId)
      .order("sort_order", { ascending: true });

    if (linesError) return { ok: false, error: mapPostgrestError(linesError) };

    const typed = order as OrderRow & { campaigns: CampaignJoin };

    return {
      ok: true,
      data: {
        order: {
          id: typed.id,
          orderNumber: typed.order_number,
          createdAt: typed.created_at,
          updatedAt: typed.updated_at,
          status: typed.status,
          currency: typed.currency,
          subtotalAmount: typed.subtotal_amount,
          depositPercentageSnapshot: typed.deposit_percentage_snapshot,
          depositAmountSnapshot: typed.deposit_amount_snapshot ?? null,
          customerId: typed.customer_id,
          verifiedCustomerStatusSnapshot: typed.verified_customer_status_snapshot,
          campaignId: typed.campaign_id,
          customer: readCustomerSnapshot(typed.customer_snapshot),
          delivery: readDeliverySnapshot(typed.delivery_snapshot),
          campaignNumber: typed.campaigns?.number ?? null,
        },
        lines: (lines ?? []).map((line: OrderLineRow) => ({
          id: line.id,
          productNameSnapshot: line.product_name_snapshot,
          variantLabelSnapshot: line.variant_label_snapshot,
          quantity: line.quantity,
          unitPriceAmount: line.unit_price_amount,
          lineTotalAmount: line.line_total_amount,
        })),
      },
    };
  }

  async getLinkedCustomer(customerId: string): Promise<AdminRepositoryResult<{ id: string; full_name: string; phone: string | null; verified_customer_status: string; archived_at: string | null } | null>> {
    const { data, error } = await this.supabase
      .from("customers")
      .select("id, full_name, phone, verified_customer_status, archived_at")
      .eq("id", customerId)
      .eq("business_unit_id", this.businessUnitId)
      .maybeSingle();

    if (error) return { ok: false, error: mapPostgrestError(error) };
    return { ok: true, data };
  }

  async countByStatus(): Promise<Record<string, number> | null> {
    const statuses = ["pending_whatsapp_confirmation", "confirmed", "fulfilled", "cancelled"];
    const counts: Record<string, number> = {};
    for (const status of statuses) {
      const { count, error } = await this.supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("business_unit_id", this.businessUnitId)
        .eq("status", status);
      if (error) return null;
      counts[status] = count ?? 0;
    }
    return counts;
  }
}
