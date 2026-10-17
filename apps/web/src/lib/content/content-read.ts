import "server-only";

import { unstable_cache } from "next/cache";
import { createSupabasePublicServerClient } from "@/lib/supabase/server";
import { CONTENT_BLOCKS_CACHE_TAG, CONTENT_BLOCKS_REVALIDATE_SECONDS, contentPageCacheTag } from "./content-cache";
import type { ContentPageSlug } from "./registry";

/**
 * Public read of the editable content.
 *
 * Anonymous, cookie-free, cached per page: the raw rows live in the Next data cache for CONTENT_BLOCKS_REVALIDATE_SECONDS
 * (tag `content-blocks` plus `page-<slug>`, so an admin save expires them immediately). A read that fails — Supabase not
 * configured, the table missing, a network error — returns `[]`, which is exactly the "no rows" case: every page falls back
 * to its TSX copy. The storefront therefore never depends on these tables being present.
 *
 * Only rows the owner marked visible are returned (the anon RLS policy already enforces `is_visible`, this is belt and
 * braces). The stored `content` is returned as-is; each consumer validates it with the Zod schema of its block type, and a
 * row that does not match is treated as absent.
 */

export type StoredContentBlock = {
  sectionKey: string;
  blockType: string;
  content: unknown;
  displayOrder: number;
  updatedAt: string;
};

type BlockRow = {
  section_key: string;
  block_type: string;
  content: unknown;
  display_order: number;
  updated_at: string;
};

async function fetchBlocks(page: ContentPageSlug): Promise<StoredContentBlock[]> {
  const supabase = createSupabasePublicServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("content_blocks")
    .select("section_key,block_type,content,display_order,updated_at")
    .eq("page_slug", page)
    .eq("is_visible", true)
    .order("display_order", { ascending: true });
  if (error || !data) return [];
  return (data as BlockRow[]).map((row) => ({
    sectionKey: row.section_key,
    blockType: row.block_type,
    content: row.content,
    displayOrder: row.display_order,
    updatedAt: row.updated_at,
  }));
}

const readers: Record<ContentPageSlug, () => Promise<StoredContentBlock[]>> = {
  home: unstable_cache(() => fetchBlocks("home"), ["content-blocks", "home"], {
    revalidate: CONTENT_BLOCKS_REVALIDATE_SECONDS,
    tags: [CONTENT_BLOCKS_CACHE_TAG, contentPageCacheTag("home")],
  }),
  parfums: unstable_cache(() => fetchBlocks("parfums"), ["content-blocks", "parfums"], {
    revalidate: CONTENT_BLOCKS_REVALIDATE_SECONDS,
    tags: [CONTENT_BLOCKS_CACHE_TAG, contentPageCacheTag("parfums")],
  }),
  import: unstable_cache(() => fetchBlocks("import"), ["content-blocks", "import"], {
    revalidate: CONTENT_BLOCKS_REVALIDATE_SECONDS,
    tags: [CONTENT_BLOCKS_CACHE_TAG, contentPageCacheTag("import")],
  }),
};

export async function loadStoredContentBlocks(page: ContentPageSlug): Promise<StoredContentBlock[]> {
  try {
    return await readers[page]();
  } catch (error) {
    console.error("[content] public blocks read failed", {
      page,
      message: error instanceof Error ? error.message : "unknown",
    });
    return [];
  }
}

export function findStoredBlock(blocks: readonly StoredContentBlock[], sectionKey: string): StoredContentBlock | null {
  return blocks.find((block) => block.sectionKey === sectionKey) ?? null;
}

/**
 * Ordered product ids of one carousel. Rows whose product was later unpublished are simply not returned by the public RLS
 * policy; the caller resolves the survivors against the catalog, so a hidden or removed product never appears.
 */
async function fetchCarouselProductIds(carouselKey: string): Promise<string[]> {
  const supabase = createSupabasePublicServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("carousel_items")
    .select("product_id")
    .eq("carousel_key", carouselKey)
    .order("display_order", { ascending: true });
  if (error || !data) return [];
  return (data as { product_id: string }[]).map((row) => row.product_id);
}

export const loadCarouselProductIds = unstable_cache(fetchCarouselProductIds, ["carousel-items"], {
  revalidate: CONTENT_BLOCKS_REVALIDATE_SECONDS,
  tags: [CONTENT_BLOCKS_CACHE_TAG],
});
