import type { ContentPageSlug } from "./registry";

/**
 * Cache constants shared by the content read layer and the admin revalidation helper
 * (docs/content-editor-architecture.md §6.5): one tag for everything editorial plus one per page, and a 5-minute TTL as the
 * backstop for changes made outside the admin (a SQL edit, a restore).
 */

export const CONTENT_BLOCKS_CACHE_TAG = "content-blocks";
export const CONTENT_BLOCKS_REVALIDATE_SECONDS = 300;

export function contentPageCacheTag(page: ContentPageSlug): string {
  return `page-${page}`;
}
