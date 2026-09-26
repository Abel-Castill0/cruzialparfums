import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";

const PARFUMS_BUSINESS_UNIT_ID = "11111111-1111-4111-8111-111111111111";

export type PersistedParfumsOrderLine = {
  productNameSnapshot: string;
  variantLabelSnapshot: string;
  unitPriceAmount: number;
  quantity: number;
  lineTotalAmount: number;
};

export type PersistedParfumsOrderSummary = {
  orderNumber: string;
  customerSnapshot: { name: string; phone: string };
  deliverySnapshot: { district: string; delivery: string; note: string };
  subtotalAmount: number;
  lines: PersistedParfumsOrderLine[];
};

function parseJsonSnapshot<T>(value: Json): T | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as T;
}

/** Fetches the authoritative persisted order for the WhatsApp handoff message
 * (or a replay of it) instead of the client-validated request, which can be
 * stale relative to the DB price/authority at persistence time and, on a
 * replayed idempotent request, can reflect payload the customer changed
 * after the original request was already accepted. Keyed on the exact
 * orderId the create() call just returned plus requestId and business unit,
 * so this can never enumerate another customer's order: an attacker would
 * need to already know both a real order UUID and its matching request UUID,
 * which are only ever paired here from the same server-side create() result. */
export async function getPersistedParfumsOrderSummary(
  supabase: SupabaseClient<Database>,
  orderId: string,
  requestId: string,
): Promise<PersistedParfumsOrderSummary | null> {
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .eq("request_id", requestId)
    .eq("business_unit_id", PARFUMS_BUSINESS_UNIT_ID)
    .maybeSingle();

  if (orderError || !order) return null;

  const customerSnapshot = parseJsonSnapshot<{ name: string; phone: string }>(order.customer_snapshot);
  const deliverySnapshot = parseJsonSnapshot<{ district: string; delivery: string; note: string }>(order.delivery_snapshot);
  if (!customerSnapshot || !deliverySnapshot) return null;

  const { data: lines, error: linesError } = await supabase
    .from("order_lines")
    .select("product_name_snapshot, variant_label_snapshot, unit_price_amount, quantity, line_total_amount, sort_order")
    .eq("order_id", orderId)
    .order("sort_order", { ascending: true });

  if (linesError) return null;

  const mappedLines: PersistedParfumsOrderLine[] = (lines ?? []).map((row) => ({
    productNameSnapshot: row.product_name_snapshot,
    variantLabelSnapshot: row.variant_label_snapshot,
    unitPriceAmount: Number(row.unit_price_amount),
    quantity: row.quantity,
    lineTotalAmount: Number(row.line_total_amount),
  }));

  return {
    orderNumber: order.order_number,
    customerSnapshot,
    deliverySnapshot,
    subtotalAmount: Number(order.subtotal_amount),
    lines: mappedLines,
  };
}
