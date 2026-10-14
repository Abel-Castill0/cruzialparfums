import "server-only";

import { revalidateTag } from "next/cache";
import { IMPORT_CAMPAIGN_CACHE_TAG } from "./import-campaign-cache";

/**
 * Call after any Import admin mutation that can change the state of a campaign (create, edit, dates, status, archive,
 * duplicate, products and offers). The next request to the gateway reads Supabase again instead of waiting out the TTL.
 * `expire: 0` makes the entry stale immediately, so the visitor never gets one more cached answer.
 */
export function revalidateImportCampaign(): void {
  revalidateTag(IMPORT_CAMPAIGN_CACHE_TAG, { expire: 0 });
}
