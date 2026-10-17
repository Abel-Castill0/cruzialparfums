import "server-only";

import { revalidateTag } from "next/cache";
import { CONTENT_BLOCKS_CACHE_TAG, contentPageCacheTag } from "./content-cache";
import type { ContentPageSlug } from "./registry";

/**
 * Call after any content mutation succeeded. Expires the single editorial tag (every cached page reloads its blocks) and the
 * page's own tag, so the change is visible on the public page within seconds instead of at the 5-minute TTL.
 */
export function revalidateContentBlocks(page: ContentPageSlug): void {
  revalidateTag(CONTENT_BLOCKS_CACHE_TAG, { expire: 0 });
  revalidateTag(contentPageCacheTag(page), { expire: 0 });
}
