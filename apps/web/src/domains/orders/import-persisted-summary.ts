import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";

const IMPORT_BUSINESS_UNIT_ID = "22222222-2222-4222-8222-222222222222";

export type PersistedImportOrderLine = {
  productNameSnapshot: string;
  variantLabelSnapshot: string;
  unitPriceAmount: number;
  quantity: number;
  lineTotalAmount: number;
  currency: string;
  sortOrder: number;
};

export type PersistedImportOrderSummary = {
  orderNumber: string;
  campaignNumber: number | null;
  customerSnapshot: { name: string; phone: string };
  deliverySnapshot: { district: string; address: string; note: string };
  subtotalAmount: number;
  depositPercentageSnapshot: number;
  depositAmountSnapshot: number;
  currency: string;
  lines: PersistedImportOrderLine[];
};

function parseJsonSnapshot<T>(value: Json): T | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as T;
}

type OrderRowRaw = Database["public"]["Tables"]["orders"]["Row"];

type OrderRowExtended = OrderRowRaw & {
  deposit_amount_snapshot: number | null;
};

export async function getPersistedImportOrderSummary(
  supabase: SupabaseClient<Database>,
  orderId: string,
  requestId: string,
): Promise<PersistedImportOrderSummary | null> {
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .eq("request_id", requestId)
    .eq("business_unit_id", IMPORT_BUSINESS_UNIT_ID)
    .maybeSingle();

  if (orderError || !order) return null;

  const ext = order as OrderRowExtended;

  const { data: lines, error: linesError } = await supabase
    .from("order_lines")
    .select("product_name_snapshot, variant_label_snapshot, unit_price_amount, quantity, line_total_amount, currency, sort_order")
    .eq("order_id", orderId)
    .order("sort_order", { ascending: true });

  if (linesError) return null;

  const customerSnapshot = parseJsonSnapshot<{ name: string; phone: string }>(ext.customer_snapshot);
  const deliverySnapshot = parseJsonSnapshot<{ district: string; address: string; note: string }>(ext.delivery_snapshot);

  if (!customerSnapshot || !deliverySnapshot) return null;

  let campaignNumber: number | null = null;
  if (ext.campaign_id) {
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("number")
      .eq("id", ext.campaign_id)
      .maybeSingle();
    campaignNumber = campaign?.number ?? null;
  }

  const mappedLines: PersistedImportOrderLine[] = (lines as unknown as Array<{
    product_name_snapshot: string;
    variant_label_snapshot: string;
    unit_price_amount: number;
    quantity: number;
    line_total_amount: number;
    currency: string;
    sort_order: number;
  }> ?? []).map(
    (row) => ({
      productNameSnapshot: row.product_name_snapshot,
      variantLabelSnapshot: row.variant_label_snapshot,
      unitPriceAmount: Number(row.unit_price_amount),
      quantity: row.quantity,
      lineTotalAmount: Number(row.line_total_amount),
      currency: row.currency,
      sortOrder: row.sort_order,
    }),
  );

  return {
    orderNumber: ext.order_number,
    campaignNumber,
    customerSnapshot,
    deliverySnapshot,
    subtotalAmount: Number(ext.subtotal_amount),
    depositPercentageSnapshot: Number(ext.deposit_percentage_snapshot ?? 0),
    depositAmountSnapshot: Number(ext.deposit_amount_snapshot ?? 0),
    currency: ext.currency,
    lines: mappedLines,
  };
}
