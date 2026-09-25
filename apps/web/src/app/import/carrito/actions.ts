"use server";

import { selectPublicImportCampaign, type PublicImportCampaignRow } from "@/domains/import/public-import";
import type { ImportCartCampaignState } from "@/domains/carts/import-cart";
import { createSupabasePublicServerClient } from "@/lib/supabase/server";

/** Read-only lookup of the currently active consolidado's identity, used by
 * the (client-rendered) cart and checkout pages to reconcile a browser-
 * persisted cart against the campaign it actually belongs to. Never used to
 * authorize a mutation — order creation independently re-resolves and
 * validates the campaign/offers server-side.
 *
 * Distinguishes "confirmed closed" (RPC succeeded, no campaign) from
 * "couldn't verify" (missing client / RPC error) — collapsing both into
 * `null` would let a transient failure destructively clear a customer's
 * cart, or let a genuinely closed campaign's stale cart stay usable at
 * checkout. Never returns `{status: "loading"}` — that is purely the
 * caller's initial client state before this resolves. */
export async function getCurrentImportCampaignState(): Promise<
  Exclude<ImportCartCampaignState, { status: "loading" }>
> {
  const supabase = createSupabasePublicServerClient();
  if (!supabase) return { status: "error" };
  const { data, error } = await supabase.rpc("public_get_import_current_campaign");
  if (error) return { status: "error" };
  const campaign = selectPublicImportCampaign((data ?? []) as PublicImportCampaignRow[]);
  return campaign
    ? { status: "active", campaign: { id: campaign.id, number: campaign.number } }
    : { status: "closed" };
}
