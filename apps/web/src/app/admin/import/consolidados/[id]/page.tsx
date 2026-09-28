import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminPage, AdminPageHeader, BackLink, Notice } from "@/components/admin/admin-ui";
import { AdminImportCampaignsRepository } from "@/domains/admin-import/campaigns-repository";
import { AdminImportCampaignProductsRepository } from "@/domains/admin-import/campaign-products-repository";
import { isCampaignProductAvailability } from "@/domains/admin-import/campaign-products-schema";
import { isValidUuid } from "@/domains/admin-import/campaign-schema";
import {
  countOpenImportCampaigns,
  fetchPublicImportCampaign,
  loadCampaignPreparation,
} from "@/domains/admin-import/campaign-workspace-loader";
import { ConsolidadoWorkspaceView } from "./workspace-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Consolidado" };

export default async function ConsolidadoDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!isValidUuid(id)) notFound();

  const session = await getAdminSession();
  if (session.status === "not_configured" || session.status === "unavailable" || session.status === "no_membership") redirect("/admin");
  if (session.status === "mfa_challenge_required") redirect("/admin/mfa/challenge");
  if (session.status === "mfa_enrollment_required") redirect("/admin/mfa/enroll");
  if (session.status === "signed_out") redirect("/admin/login");
  const membership = session.session.memberships.find((candidate) => candidate.businessUnitCode === "import");
  if (!membership) redirect("/admin");
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/admin");

  const query = await searchParams;
  const requestedAvailability = typeof query.disponibilidad === "string" ? query.disponibilidad : "";
  const initialAvailabilityFilter = isCampaignProductAvailability(requestedAvailability) ? requestedAvailability : "all";

  const repository = new AdminImportCampaignsRepository(supabase, membership.businessUnitId);
  const result = await repository.getById(id);
  if (!result.ok) {
    if (result.error.type === "not_found") notFound();
    return (
      <AdminPage>
        <div>
          <BackLink href="/admin/import/consolidados">Consolidados</BackLink>
          <AdminPageHeader eyebrow="Cruzial Import · Consolidado" title="Consolidado" />
        </div>
        <Notice tone="danger" title="No pudimos cargar el consolidado">Recarga la página e inténtalo otra vez.</Notice>
      </AdminPage>
    );
  }
  const campaign = result.data;
  const isAdmin = membership.role === "admin";
  const now = new Date();

  const productsRepository = new AdminImportCampaignProductsRepository(supabase, membership.businessUnitId);
  // Bounded initial page only (4J2 correction) — the picker's own search
  // action (searchEligibleImportProductsAction) refines this client-side;
  // this SSR call never loads the whole Import catalog.
  const [campaignProducts, eligibleProducts, publicCampaign, openCampaignCount] = await Promise.all([
    productsRepository.getCampaignProducts(id),
    productsRepository.searchEligibleProducts({ query: "", limit: 20 }),
    fetchPublicImportCampaign(supabase),
    countOpenImportCampaigns(supabase, membership.businessUnitId),
  ]);

  if (!campaignProducts.ok || !eligibleProducts.ok) {
    return (
      <AdminPage>
        <div>
          <BackLink href="/admin/import/consolidados">Consolidados</BackLink>
          <AdminPageHeader eyebrow="Cruzial Import · Consolidado" title={`Consolidado #${campaign.number}`} description={campaign.name} />
        </div>
        <Notice tone="danger" title="No pudimos cargar los productos del consolidado">
          Recarga la página e inténtalo otra vez. No hagas cambios hasta que la lista cargue completa.
        </Notice>
      </AdminPage>
    );
  }

  const preparation = await loadCampaignPreparation(supabase, campaign, {
    canEdit: isAdmin,
    now,
    publicCampaign,
    openCampaignCount,
  });

  return (
    <ConsolidadoWorkspaceView
      campaign={campaign}
      isAdmin={isAdmin}
      now={now}
      steps={preparation.steps}
      customerView={preparation.customerView}
      loadFailed={preparation.loadFailed}
      readyForManualOpen={preparation.readiness ? preparation.readiness.ready_for_manual_open ?? null : null}
      offers={campaignProducts.data}
      eligibleProducts={eligibleProducts.data}
      initialAvailabilityFilter={initialAvailabilityFilter}
    />
  );
}
