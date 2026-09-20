import "server-only";

import { revalidateTag } from "next/cache";
import { PARFUMS_CATALOG_CACHE_TAG } from "./parfums-storefront-cache";

/**
 * Call after any Parfums admin mutation that can change what the public
 * storefront shows (publication, prices, media, categories, combos,
 * wholesale policy, public contact). The next storefront request re-reads
 * Supabase instead of waiting out the 60 s data-cache window.
 */
export function revalidateParfumsStorefront(): void {
  revalidateTag(PARFUMS_CATALOG_CACHE_TAG, { expire: 0 });
}
