import "server-only";

import { revalidateTag } from "next/cache";
import { DELIVERY_ZONES_CACHE_TAG } from "./delivery-zones-cache";

/** Call after a delivery-zone mutation succeeded, so the checkout sees it within seconds instead of at the TTL. */
export function revalidateDeliveryZones(): void {
  revalidateTag(DELIVERY_ZONES_CACHE_TAG, { expire: 0 });
}
