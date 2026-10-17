import "server-only";

import { z } from "zod";
import { findStoredBlock, loadCarouselProductIds, loadStoredContentBlocks } from "./content-read";
import { findSection, type ContentPageSlug } from "./registry";
import { contentSchemas, parseBlockContent, type ContentBlockType } from "./schemas";

/**
 * What one editable section of a public page should render.
 */
export type SectionContent<B extends ContentBlockType> = {
  /** Always filled: the owner's edit when a visible row exists, otherwise the section's code fallback. */
  content: z.infer<(typeof contentSchemas)[B]>;
  /**
   * True when a visible stored row is being used. A page whose fallback carries bespoke markup (an <em> the CSS styles, a
   * conditional aria-label) needs to know, so it can keep that markup instead of painting plain text.
   */
  custom: boolean;
};

/**
 * Resolves one section of one public page.
 *
 * `page`, `key` and `blockType` come from the static registry, never from the request, and a stored row whose `block_type`
 * does not match its section is ignored (the page keeps its fallback) — so a corrupt or hand-edited row can never change a
 * page's structure. A read that fails is indistinguishable from "no row": the page renders its TSX copy, which is the
 * whole point of the fallback (docs/content-editor-architecture.md §5.2, principle 1).
 *
 * Throws only on a registry mistake (an unknown key or a mismatched block_type): a bug in this code base, not a data
 * problem, and one the unit tests for the registry catch.
 */
export async function readSection<B extends ContentBlockType>(
  page: ContentPageSlug,
  key: string,
  blockType: B,
): Promise<SectionContent<B>> {
  const section = findSection(page, key);
  if (!section) throw new Error(`[content] unknown section ${page}:${key}`);
  if (section.blockType !== blockType) throw new Error(`[content] section ${page}:${key} is not a ${blockType}`);
  const fallback = section.fallback as unknown as z.infer<(typeof contentSchemas)[B]>;

  const blocks = await loadStoredContentBlocks(page);
  const stored = findStoredBlock(blocks, key);
  if (!stored || stored.blockType !== blockType) return { content: fallback, custom: false };
  const parsed = parseBlockContent(blockType, stored.content);
  if (!parsed) return { content: fallback, custom: false };
  return { content: parsed, custom: true };
}

/**
 * Ordered product ids of one carousel section, or `[]` when the owner chose none — the page then keeps its current
 * automatic selection. Rows whose product was later unpublished are already dropped by the public read (RLS), so a hidden
 * or removed product never reaches the page.
 */
export async function readCarouselItems(sectionKey: string): Promise<string[]> {
  return loadCarouselProductIds(sectionKey);
}
