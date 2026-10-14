import "server-only";

import { unstable_cache } from "next/cache";
import type { ImportGate } from "@/domains/import/import-gate";
import { createSupabasePublicServerClient } from "@/lib/supabase/server";
import { IMPORT_CAMPAIGN_CACHE_TAG, IMPORT_CAMPAIGN_REVALIDATE_SECONDS } from "./import-campaign-cache";

type CampaignRows = Array<{ opens_at?: string | null }> | null;
type Rpc = (name: string) => Promise<{ data: unknown; error: unknown }>;

/**
 * Anonymous, cookie-free read of two public RPCs: is there a campaign open
 * right now and, if not, when does the next one open. Cached under the
 * `import-campaign` tag (every admin campaign action expires it at once; the 5 min TTL is only the fallback). Any error resolves to
 * "unknown" so the card never claims a closure it cannot back up.
 */
export const readImportGate = unstable_cache(
  async (): Promise<ImportGate> => {
    const supabase = createSupabasePublicServerClient();
    if (!supabase) return { state: "unknown" };
    // The upcoming-campaign RPC is not in the generated types; same cast as PublicImportRepository.
    const rpc = supabase.rpc.bind(supabase) as unknown as Rpc;
    try {
      const current = await rpc("public_get_import_current_campaign");
      if (current.error) return { state: "unknown" };
      if (((current.data ?? []) as NonNullable<CampaignRows>).length) return { state: "open" };
      const upcoming = await rpc("public_get_import_upcoming_campaign");
      if (upcoming.error) return { state: "unknown" };
      const row = ((upcoming.data ?? []) as CampaignRows)?.[0];
      return { state: "closed", opensAt: row?.opens_at ?? null };
    } catch {
      return { state: "unknown" };
    }
  },
  ["import-gate"],
  { revalidate: IMPORT_CAMPAIGN_REVALIDATE_SECONDS, tags: [IMPORT_CAMPAIGN_CACHE_TAG] },
);
