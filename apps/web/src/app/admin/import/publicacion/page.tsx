import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ActionLink, AdminPage, Notice } from "@/components/admin/admin-ui";
import { AdminImportCatalogRepository } from "@/domains/admin-import/catalog-repository";
import { countCampaignBlockers, type ImportReadinessJson } from "@/domains/admin-import/campaign-workspace-loader";
import { BLOCKER_PRIORITY, isBlockerCode } from "@/domains/admin-import/publication-blockers";
import { CampaignPicker, PublicationHeader, PublicationReviewView, PAGE_SIZE, type PublicationBlockerRow } from "./view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Publicación Import" };



export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const session = await getAdminSession();
  if (session.status === "signed_out") redirect("/admin/login");
  if (session.status !== "ok") redirect("/admin");
  const member = session.session.memberships.find(
    (m) => m.businessUnitCode === "import",
  );
  if (!member) redirect("/admin");
  const client = await createSupabaseServerClient();
  if (!client) redirect("/admin");
  const isAdmin = member.role === "admin";

  const repo = new AdminImportCatalogRepository(client, member.businessUnitId);
  const rpc = client.rpc.bind(client) as unknown as (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;

  // Which consolidado (campaign) is being assessed must always be explicit —
  // never an implicit "current campaign" guess inside the RPCs. The operator
  // picks one; ?campaign=<uuid> preserves that choice across reloads/links.
  const campaignsResult = await client
    .from("campaigns")
    .select("id,number,name,status,archived_at")
    .eq("business_unit_id", member.businessUnitId)
    .is("archived_at", null)
    .order("number", { ascending: false });
  const campaigns = campaignsResult.data ?? [];
  const requestedCampaignId = params.campaign ?? "";
  const selectedCampaign = requestedCampaignId
    ? campaigns.find((c) => c.id === requestedCampaignId) ?? null
    : campaigns[0] ?? null;

  // Only filter values the RPC accepts are forwarded; anything else would be
  // rejected server-side, so it is ignored here instead of erroring.
  const blockerQuery = params.blocker && isBlockerCode(params.blocker) ? params.blocker : "";
  const searchQuery = params.q ?? "";
  const page = Math.max(1, Number(params.page ?? 1) || 1);

  const header = <PublicationHeader />;

  if (campaignsResult.error) {
    return (
      <AdminPage>
        {header}
        <Notice tone="danger" title="No pudimos cargar los consolidados">Recarga la página e inténtalo otra vez.</Notice>
      </AdminPage>
    );
  }

  if (!selectedCampaign) {
    return (
      <AdminPage>
        {header}
        {requestedCampaignId && campaigns.length > 0 ? (
          <Notice tone="attention" title="No encontramos ese consolidado">
            Puede estar archivado o no pertenecer a Cruzial Import. Elige otro consolidado.
          </Notice>
        ) : null}
        {campaigns.length > 0 ? (
          <CampaignPicker campaigns={campaigns} selectedId="" />
        ) : (
          <Notice
            tone="attention"
            title="Todavía no hay consolidados activos"
            action={<ActionLink href={isAdmin ? "/admin/import/consolidados/nuevo" : "/admin/import/consolidados"} variant="primary">{isAdmin ? "Crear consolidado" : "Ver consolidados"}</ActionLink>}
          >
            Crea un consolidado para poder revisar qué le falta antes de publicarlo.
          </Notice>
        )}
      </AdminPage>
    );
  }

  const [qaResult, readinessResult, blockersResult, blockerCounts] = await Promise.all([
    repo.qa(),
    rpc("admin_get_import_publication_readiness", { p_campaign_id: selectedCampaign.id }),
    rpc("admin_list_import_publication_blockers", {
      p_campaign_id: selectedCampaign.id,
      p_query: searchQuery || null,
      p_blocker: blockerQuery || null,
      p_page: page,
      p_page_size: PAGE_SIZE,
    }),
    countCampaignBlockers(client, selectedCampaign.id, BLOCKER_PRIORITY),
  ]);

  return (
    <PublicationReviewView
      campaigns={campaigns}
      selectedCampaign={selectedCampaign}
      isAdmin={isAdmin}
      readiness={readinessResult.error ? null : ((readinessResult.data ?? {}) as ImportReadinessJson)}
      blockerCounts={blockerCounts}
      blockers={blockersResult.error ? null : ((blockersResult.data ?? []) as PublicationBlockerRow[])}
      qa={qaResult.ok ? qaResult.data : null}
      filters={{ q: searchQuery, blocker: blockerQuery, page }}
    />
  );
}
