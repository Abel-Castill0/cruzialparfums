import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/** Priority order for "what should the operator fix next" — matches the
 * order publication blockers are actually worked in practice: an
 * unconfirmed/invalid offer or an unpublished structural entity blocks
 * public visibility before missing media does. Each blocker code is one the
 * existing admin_list_import_publication_blockers RPC already recognizes
 * (see 20260920050000_import_publication_campaign_scoped.sql) — this reuses
 * that RPC's own p_blocker filter + total_count rather than inventing a
 * second source of truth, so the assistant's count can never disagree with
 * what "Continuar preparación" actually navigates to (same principle as the
 * Import Action Center's own blocker-count fix). */
const PREPARATION_PRIORITY: { blocker: string; label: (n: number) => string }[] = [
  { blocker: "offer_unconfirmed", label: (n) => `${n} oferta${n === 1 ? "" : "s"} del consolidado por confirmar` },
  { blocker: "offer_invalid_price", label: (n) => `${n} oferta${n === 1 ? "" : "s"} con precio inválido` },
  { blocker: "product_unpublished", label: (n) => `${n} producto${n === 1 ? "" : "s"} no publicado${n === 1 ? "" : "s"}` },
  { blocker: "presentation_unpublished", label: (n) => `${n} presentación${n === 1 ? "" : "es"} sin publicar` },
  { blocker: "missing_primary_media", label: (n) => `${n} producto${n === 1 ? "" : "s"} sin imagen principal` },
  { blocker: "missing_offer", label: (n) => `${n} producto${n === 1 ? "" : "s"} publicado${n === 1 ? "" : "s"} sin oferta en este consolidado` },
];

export type PreparationStep = {
  label: string;
  blocker: string;
};

/** Resolves the single next unresolved preparation problem for a campaign,
 * in priority order, or null when nothing in the checked list is
 * outstanding. Runs all checks in parallel — cheap, bounded (page_size=1
 * per check), and each uses the exact same RPC/filter the destination
 * screen itself queries. */
export async function resolveNextPreparationStep(
  supabase: SupabaseClient<Database>,
  campaignId: string,
): Promise<PreparationStep | null> {
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;

  const results = await Promise.all(
    PREPARATION_PRIORITY.map((entry) =>
      rpc("admin_list_import_publication_blockers", {
        p_campaign_id: campaignId,
        p_blocker: entry.blocker,
        p_page: 1,
        p_page_size: 1,
      }),
    ),
  );

  for (let i = 0; i < PREPARATION_PRIORITY.length; i += 1) {
    const entry = PREPARATION_PRIORITY[i]!;
    const rows = (results[i]?.data ?? []) as { total_count?: number }[];
    const count = rows[0]?.total_count ?? 0;
    if (count > 0) {
      return { label: entry.label(count), blocker: entry.blocker };
    }
  }

  return null;
}
