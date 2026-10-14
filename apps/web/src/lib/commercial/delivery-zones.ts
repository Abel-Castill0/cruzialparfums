import "server-only";

import { unstable_cache } from "next/cache";
import type { DeliveryZone } from "@/domains/commercial/delivery-zones";
import { createSupabasePublicServerClient } from "@/lib/supabase/server";
import { DELIVERY_ZONES_CACHE_TAG, DELIVERY_ZONES_REVALIDATE_SECONDS } from "./delivery-zones-cache";

const PARFUMS_UNIT_ID = "11111111-1111-4111-8111-111111111111";

/** A failed read throws so `unstable_cache` never stores it; the caller below turns the failure into "not enforced". */
const readZones = unstable_cache(
  async (): Promise<DeliveryZone[]> => {
    const supabase = createSupabasePublicServerClient();
    if (!supabase) throw new Error("delivery zones: no public client");
    const { data, error } = await supabase
      .from("delivery_zones")
      .select("district,is_restricted")
      .eq("business_unit_id", PARFUMS_UNIT_ID)
      .order("district");
    if (error) throw new Error("delivery zones: read failed");
    return (data ?? []).map((row) => ({ district: row.district, isRestricted: row.is_restricted }));
  },
  ["delivery-zones"],
  { tags: [DELIVERY_ZONES_CACHE_TAG], revalidate: DELIVERY_ZONES_REVALIDATE_SECONDS },
);

/**
 * The Parfums delivery zones. Any failure resolves to an empty list, which the rules read as "nothing restricted": a
 * database hiccup must never turn the motorcycle off, and never blocks an order.
 */
export async function loadDeliveryZones(): Promise<DeliveryZone[]> {
  try {
    return await readZones();
  } catch {
    return [];
  }
}
