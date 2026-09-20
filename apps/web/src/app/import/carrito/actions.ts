"use server";

import { selectPublicImportCampaign, type PublicImportCampaignRow } from "@/domains/import/public-import";
import { createSupabasePublicServerClient } from "@/lib/supabase/server";

export type CurrentImportCampaign = { id: string; number: number } | null;

/** Read-only lookup of the currently active consolidado's identity, used by
 * the (client-rendered) cart and checkout pages to reconcile a browser-
 * persisted cart against the campaign it actually belongs to. Never used to
 * authorize a mutation — order creation independently re-resolves and
 * validates the campaign/offers server-side. */
export async function getCurrentImportCampaign(): Promise<CurrentImportCampaign> {
  const supabase = createSupabasePublicServerClient();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("public_get_import_current_campaign");
  if (error) return null;
  const campaign = selectPublicImportCampaign((data ?? []) as PublicImportCampaignRow[]);
  return campaign ? { id: campaign.id, number: campaign.number } : null;
}
