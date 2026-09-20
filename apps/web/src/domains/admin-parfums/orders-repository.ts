import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { mapPostgrestError, type AdminRepositoryResult } from "./products-repository";

/**
 * Admin Parfums orders data access (Phase 4E2 — Orders Inbox / Detail).
 *
 * Read-only: this repository never writes to `orders`/`order_lines`. All
 * reads use plain PostgREST queries — RLS (`orders_admin_read` /
 * `order_lines_admin_read`, see
 * supabase/migrations/20260907154358_rls_policies.sql) already scopes every
 * row to the caller's own business unit membership, so a Parfums admin or
 * viewer can read and an Import-only member gets zero rows back. There is
 * nothing here to make atomic with an RPC — a SELECT has no invariant to
 * protect.
 *
 * A current order is a WEB REQUEST handed off to WhatsApp, not a confirmed
 * sale — see `orderStatusLabel` for the UX copy contract. This module must
 * never reconstruct historical line data from the live catalogue; every
 * commercial fact it surfaces comes from the immutable snapshot columns.
 */

type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
type OrderLineRow = Database["public"]["Tables"]["order_lines"]["Row"];

export type OrderCustomerSnapshot = { name: string; phone: string };
export type OrderDeliverySnapshot = { district: string; delivery: string; note: string };

export type OrderListItem = {
  id: string;
  orderNumber: string;
  createdAt: string;
  status: string;
  currency: string;
  subtotalAmount: number;
  customer: OrderCustomerSnapshot;
  delivery: OrderDeliverySnapshot;
  lineCount: number;
};

export type OrderListFilters = {
  search?: string;
};

export type OrderListPage = {
  items: OrderListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type OrderDetail = {
  id: string;
  orderNumber: string;
  createdAt: string;
  status: string;
  currency: string;
  subtotalAmount: number;
  customer: OrderCustomerSnapshot;
  delivery: OrderDeliverySnapshot;
};

export type OrderLineItem = {
  id: string;
  productNameSnapshot: string;
  variantLabelSnapshot: string;
  quantity: number;
  unitPriceAmount: number;
  lineTotalAmount: number;
};

/** Reads a `{name, phone}` snapshot defensively — the column is `jsonb` with
 * no schema-level shape guarantee beyond what the write-path RPC enforced at
 * insert time, so a malformed/legacy row degrades to empty strings instead
 * of throwing. Never invents a value that was not actually in the JSON. */
function readCustomerSnapshot(value: Json): OrderCustomerSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { name: "", phone: "" };
  }
  const record = value as Record<string, Json>;
  return {
    name: typeof record.name === "string" ? record.name : "",
    phone: typeof record.phone === "string" ? record.phone : "",
  };
}

function readDeliverySnapshot(value: Json): OrderDeliverySnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { district: "", delivery: "", note: "" };
  }
  const record = value as Record<string, Json>;
  return {
    district: typeof record.district === "string" ? record.district : "",
    delivery: typeof record.delivery === "string" ? record.delivery : "",
    note: typeof record.note === "string" ? record.note : "",
  };
}

function toListItem(row: OrderRow, lineCount: number): OrderListItem {
  return {
    id: row.id,
    orderNumber: row.order_number,
    createdAt: row.created_at,
    status: row.status,
    currency: row.currency,
    subtotalAmount: row.subtotal_amount,
    customer: readCustomerSnapshot(row.customer_snapshot),
    delivery: readDeliverySnapshot(row.delivery_snapshot),
    lineCount,
  };
}

export class AdminParfumsOrdersRepository {
  constructor(
    private readonly supabase: SupabaseClient<Database>,
    private readonly businessUnitId: string,
  ) {}

  async list(
    filters: OrderListFilters,
    pagination: { page: number; pageSize: number },
  ): Promise<AdminRepositoryResult<OrderListPage>> {
    const page = Math.max(1, pagination.page);
    const pageSize = Math.min(100, Math.max(1, pagination.pageSize));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = this.supabase
      .from("orders")
      .select("*, order_lines(count)", { count: "exact" })
      .eq("business_unit_id", this.businessUnitId)
      .order("created_at", { ascending: false })
      .range(from, to);

    const search = filters.search?.trim();
    if (search) {
      // Same escaping convention as AdminParfumsProductsRepository.list —
      // `%`/`_` are the only PostgREST ilike metacharacters worth guarding
      // here, the field stays inside the app's own `.or()` filter DSL, never
      // raw SQL.
      const term = search.replace(/[%_]/g, (char) => `\\${char}`);
      query = query.or(
        `order_number.ilike.%${term}%,customer_snapshot->>name.ilike.%${term}%,customer_snapshot->>phone.ilike.%${term}%`,
      );
    }

    const { data, error, count } = await query;
    if (error) return { ok: false, error: mapPostgrestError(error) };

    const items: OrderListItem[] = (data ?? []).map((row) => {
      const { order_lines, ...order } = row as OrderRow & { order_lines: { count: number }[] };
      return toListItem(order, order_lines?.[0]?.count ?? 0);
    });

    return { ok: true, data: { items, total: count ?? 0, page, pageSize } };
  }

  async getById(
    orderId: string,
  ): Promise<AdminRepositoryResult<{ order: OrderDetail; lines: OrderLineItem[] }>> {
    const { data: order, error: orderError } = await this.supabase
      .from("orders")
      .select("*")
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

    return {
      ok: true,
      data: {
        order: {
          id: order.id,
          orderNumber: order.order_number,
          createdAt: order.created_at,
          status: order.status,
          currency: order.currency,
          subtotalAmount: order.subtotal_amount,
          customer: readCustomerSnapshot(order.customer_snapshot),
          delivery: readDeliverySnapshot(order.delivery_snapshot),
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

  /** Count of pending order requests for the Parfums dashboard tile — a real
   * count, not an invented metric. There is only one operational status
   * today (`pending_whatsapp_confirmation`), so this is not a general
   * "orders today"/revenue figure. */
  async countPendingWhatsappConfirmation(): Promise<number | null> {
    const { count, error } = await this.supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("business_unit_id", this.businessUnitId)
      .eq("status", "pending_whatsapp_confirmation");
    if (error) return null;
    return count ?? 0;
  }
}
