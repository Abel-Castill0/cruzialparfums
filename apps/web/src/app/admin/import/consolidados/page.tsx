import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminImportCampaignsRepository } from "@/domains/admin-import/campaigns-repository";
import { isCampaignStatus } from "@/domains/admin-import/campaign-schema";
import { fetchPublicImportCampaign } from "@/domains/admin-import/campaign-workspace-loader";
import { ConsolidadosListView } from "./list-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Consolidados" };
const PAGE_SIZE = 20;

export default async function ConsolidadosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getAdminSession();
  if (session.status === "not_configured" || session.status === "unavailable" || session.status === "no_membership") redirect("/admin");
  if (session.status === "mfa_challenge_required") redirect("/admin/mfa/challenge");
  if (session.status === "mfa_enrollment_required") redirect("/admin/mfa/enroll");
  if (session.status === "signed_out") redirect("/admin/login");
  const membership = session.session.memberships.find((candidate) => candidate.businessUnitCode === "import");
  if (!membership) redirect("/admin");
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/admin");

  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q : "";
  const status = isCampaignStatus(params.status) ? params.status : undefined;
  const includeArchived = params.archived === "1";
  const page = Math.max(1, Number(typeof params.page === "string" ? params.page : "1") || 1);
  const isAdmin = membership.role === "admin";

  const repository = new AdminImportCampaignsRepository(supabase, membership.businessUnitId);
  const [result, publicCampaign] = await Promise.all([
    repository.list({ search, includeArchived, ...(status ? { status } : {}) }, { page, pageSize: PAGE_SIZE }),
    fetchPublicImportCampaign(supabase),
  ]);

  const cleanParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (typeof value === "string") cleanParams.set(key, value);
  const paginationHref = (nextPage: number) => {
    const next = new URLSearchParams(cleanParams);
    next.set("page", String(nextPage));
    return `/admin/import/consolidados?${next.toString()}`;
  };

  return (
    <ConsolidadosListView
      isAdmin={isAdmin}
      filters={{ search, status: status ?? "", includeArchived }}
      page={page}
      result={result.ok ? { ok: true, items: result.data.items, total: result.data.total, pageSize: result.data.pageSize } : { ok: false }}
      publicCampaign={publicCampaign}
      paginationHref={paginationHref}
    />
  );
}
