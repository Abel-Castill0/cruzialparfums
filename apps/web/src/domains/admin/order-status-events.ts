import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { OrderStatusEvent } from "./order-presentation";

/** Recorded status history for one order (same unit-scoped read the
 * automation proof already performs). Returns null when it cannot be read,
 * so the progression never claims a step it could not verify. */
export async function loadOrderStatusEvents(
  supabase: SupabaseClient<Database>,
  businessUnitId: string,
  orderId: string,
): Promise<OrderStatusEvent[] | null> {
  const { data, error } = await supabase
    .from("order_status_events")
    .select("from_status,to_status,occurred_at")
    .eq("business_unit_id", businessUnitId)
    .eq("order_id", orderId)
    .order("occurred_at");
  if (error || !data) return null;
  return data.map((row) => ({
    fromStatus: row.from_status ?? null,
    toStatus: row.to_status,
    occurredAt: row.occurred_at,
  }));
}
