import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminComplaintsRepository } from "@/domains/complaints/complaint-repository";
import { ComplaintDetail } from "@/components/admin/complaint-detail";
import { updateParfumsComplaintStatusAction } from "../actions";
import { AdminPage, Notice } from "@/components/admin/admin-ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Detalle de reclamo" };

export default async function AdminParfumsComplaintDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getAdminSession();
  if (result.status === "not_configured") redirect("/admin");
  if (result.status === "unavailable") redirect("/admin");
  if (result.status === "signed_out") redirect("/admin/login");
  if (result.status === "no_membership") redirect("/admin");
  if (result.status === "mfa_challenge_required") redirect("/admin/mfa/challenge");
  if (result.status === "mfa_enrollment_required") redirect("/admin/mfa/enroll");

  const membership = result.session.memberships.find((candidate) => candidate.businessUnitCode === "parfums");
  if (!membership) redirect("/admin");

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return <AdminPage><Notice tone="danger" title="El backend de administración no está configurado." /></AdminPage>;
  }

  const repository = new AdminComplaintsRepository(supabase, membership.businessUnitId);
  const entryResult = await repository.getById(id);
  if (!entryResult.ok) {
    if (entryResult.error.type === "not_found") notFound();
    return <AdminPage><Notice tone="danger" title="No se pudo cargar el reclamo." /></AdminPage>;
  }

  return (
    <ComplaintDetail
      unitName="Cruzial Parfums"
      basePath="/admin/parfums/reclamos"
      canWrite={membership.role === "admin"}
      entry={entryResult.data}
      updateStatus={updateParfumsComplaintStatusAction}
    />
  );
}
