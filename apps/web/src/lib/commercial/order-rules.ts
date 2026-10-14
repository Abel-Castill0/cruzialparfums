import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParfumsOrderRules } from "@/domains/orders/parfums-order-request";
import type { Database } from "@/lib/supabase/database.types";
import { loadDeliveryZones } from "./delivery-zones";

const PARFUMS_UNIT_ID = "11111111-1111-4111-8111-111111111111";

/** Product ids of the active `gift_exclusion` rule. Failure resolves to "none excluded": the database still enforces it on attach. */
async function loadGiftExclusions(client: SupabaseClient<Database>): Promise<string[]> {
  const { data, error } = await client
    .from("promotion_rules")
    .select("conditions")
    .eq("business_unit_id", PARFUMS_UNIT_ID)
    .eq("rule_type", "gift_exclusion")
    .eq("is_active", true)
    .maybeSingle();
  if (error || !data) return [];
  const ids = (data.conditions as { excluded_product_ids?: unknown } | null)?.excluded_product_ids;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
}

/** Everything the order validator needs from the database. The exclusion list is read only when a gift was chosen. */
export async function loadParfumsOrderRules(
  client: SupabaseClient<Database>,
  options: { giftChosen: boolean },
): Promise<ParfumsOrderRules> {
  const [zones, giftExcludedProductIds] = await Promise.all([
    loadDeliveryZones(),
    options.giftChosen ? loadGiftExclusions(client) : Promise.resolve([]),
  ]);
  return { zones, giftExcludedProductIds };
}
