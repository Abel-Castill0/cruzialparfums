import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { selectPublicImportCampaign, type PublicImportCampaign, type PublicImportCampaignRow } from "@/domains/import/public-import";
import { buildImportChecklist, deriveCustomerView, type ChecklistStep, type CustomerView } from "./campaign-presentation";

// Server-side reads behind the Import dashboard, the consolidado workspace
// and "Revisión para publicar". Every fact comes from an existing
// authoritative source — the storefront's own public selector, the
// campaign-scoped readiness RPC and the blocker-list RPC's own total_count
// per blocker filter — so each screen shows the same truth and a count can
// never disagree with the filtered list it links to. Unreadable facts are
// returned as null, never as zero.

type Rpc = (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;

function rpcOf(supabase: SupabaseClient<Database>): Rpc {
  return supabase.rpc.bind(supabase) as unknown as Rpc;
}

export type ImportReadinessJson = {
  unconfirmed_offer_count?: number;
  invalid_price_offer_count?: number;
  ready_for_manual_open?: boolean;
  total_products?: number;
  ready_products?: number;
  commercial_blockers?: number;
  media_blockers?: number;
  publication_blockers?: number;
  campaign_exists?: boolean;
  campaign_status?: string;
  campaign_number?: number;
};

export type WorkspaceCampaign = {
  id: string;
  number: number;
  name: string;
  status: string;
  opens_at: string | null;
  closes_at: string | null;
  archived_at: string | null;
};

const CHECKLIST_BLOCKERS = [
  "missing_offer",
  "offer_invalid_price",
  "missing_primary_media",
  "product_unpublished",
  "presentation_unpublished",
] as const;

/** undefined = the public selector could not be read. */
export async function fetchPublicImportCampaign(supabase: SupabaseClient<Database>): Promise<PublicImportCampaign | null | undefined> {
  const response = await rpcOf(supabase)("public_get_import_current_campaign");
  if (response.error) return undefined;
  return selectPublicImportCampaign((response.data ?? []) as PublicImportCampaignRow[]);
}

export async function countOpenImportCampaigns(supabase: SupabaseClient<Database>, businessUnitId: string): Promise<number | null> {
  const { count, error } = await supabase
    .from("campaigns")
    .select("*", { count: "exact", head: true })
    .eq("business_unit_id", businessUnitId)
    .eq("status", "open")
    .is("archived_at", null);
  return error ? null : count ?? 0;
}

export async function countCampaignBlocker(
  supabase: SupabaseClient<Database>,
  campaignId: string,
  blocker: string,
): Promise<number | null> {
  const response = await rpcOf(supabase)("admin_list_import_publication_blockers", {
    p_campaign_id: campaignId,
    p_blocker: blocker,
    p_page: 1,
    p_page_size: 1,
  });
  if (response.error) return null;
  return Number(((response.data ?? []) as { total_count?: number | string }[])[0]?.total_count ?? 0);
}

export async function countCampaignBlockers<T extends string>(
  supabase: SupabaseClient<Database>,
  campaignId: string,
  codes: readonly T[],
): Promise<Record<T, number | null>> {
  const counts = await Promise.all(codes.map((code) => countCampaignBlocker(supabase, campaignId, code)));
  return Object.fromEntries(codes.map((code, index) => [code, counts[index] ?? null])) as Record<T, number | null>;
}

export type CampaignPreparation = {
  steps: ChecklistStep[];
  customerView: CustomerView;
  readiness: ImportReadinessJson | null;
  offerCount: number | null;
  loadFailed: boolean;
};

export async function loadCampaignPreparation(
  supabase: SupabaseClient<Database>,
  campaign: WorkspaceCampaign,
  options: {
    canEdit: boolean;
    now: Date;
    publicCampaign: PublicImportCampaign | null | undefined;
    openCampaignCount: number | null;
  },
): Promise<CampaignPreparation> {
  const rpc = rpcOf(supabase);
  const { publicCampaign } = options;
  const isThisPublic = Boolean(publicCampaign && publicCampaign.id === campaign.id);

  const [readinessResult, offerResult, blockers, visibleResult] = await Promise.all([
    rpc("admin_get_import_publication_readiness", { p_campaign_id: campaign.id }),
    supabase.from("campaign_products").select("*", { count: "exact", head: true }).eq("campaign_id", campaign.id),
    countCampaignBlockers(supabase, campaign.id, CHECKLIST_BLOCKERS),
    isThisPublic ? rpc("public_list_import_catalog", { p_page: 1, p_page_size: 1 }) : Promise.resolve(null),
  ]);

  const readiness = readinessResult.error ? null : ((readinessResult.data ?? {}) as ImportReadinessJson);
  const offerCount = offerResult.error ? null : offerResult.count ?? 0;

  const steps = buildImportChecklist({
    campaignId: campaign.id,
    status: campaign.status,
    archived: campaign.archived_at !== null,
    opensAt: campaign.opens_at,
    closesAt: campaign.closes_at,
    now: options.now,
    offerCount,
    missingOfferCount: blockers.missing_offer,
    invalidPriceCount: blockers.offer_invalid_price,
    unconfirmedOfferCount: readiness ? readiness.unconfirmed_offer_count ?? null : null,
    missingMediaCount: blockers.missing_primary_media,
    unpublishedProductCount: blockers.product_unpublished,
    unpublishedPresentationCount: blockers.presentation_unpublished,
    readyForManualOpen: readiness ? readiness.ready_for_manual_open ?? null : null,
    isPublicNow: publicCampaign === undefined ? null : isThisPublic,
    canEdit: options.canEdit,
  });

  const visibleRows = visibleResult && !visibleResult.error ? ((visibleResult.data ?? []) as { total_count?: number | string }[]) : null;
  const customerView = deriveCustomerView({
    campaign,
    publicCampaign,
    visibleProducts: visibleRows ? Number(visibleRows[0]?.total_count ?? 0) : null,
    openCampaignCount: options.openCampaignCount,
    now: options.now,
  });

  return { steps, customerView, readiness, offerCount, loadFailed: !readiness || offerResult.error !== null };
}
