import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminPage, AdminPageHeader, BackLink, Notice } from "@/components/admin/admin-ui";
import { AdminParfumsCombosRepository } from "@/domains/admin-parfums/combos-repository";
import { isValidUuid } from "@/domains/admin-parfums/product-schema";
import { ComboWorkspace } from "./combo-workspace";

export const dynamic = "force-dynamic";

const LIST_HREF = "/admin/parfums/combos";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: isValidUuid(id) ? "Editar combo" : "Combo" };
}

function ProblemPage({ title }: { title: string }) {
  return (
    <AdminPage>
      <div>
        <BackLink href={LIST_HREF}>Combos</BackLink>
        <AdminPageHeader eyebrow="Cruzial Parfums · Combo" title="Combo" />
      </div>
      <Notice tone="danger" title={title}>Recarga la página. No hagas cambios hasta que el combo cargue completo.</Notice>
    </AdminPage>
  );
}

export default async function EditComboPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isValidUuid(id)) notFound();

  const result = await getAdminSession();
  if (result.status === "not_configured") redirect("/admin");
  if (result.status === "unavailable") redirect("/admin");
  if (result.status === "signed_out") redirect("/admin/login");
  if (result.status === "no_membership") redirect("/admin");
  if (result.status === "mfa_challenge_required") redirect("/admin/mfa/challenge");
  if (result.status === "mfa_enrollment_required") redirect("/admin/mfa/enroll");

  const membership = result.session.memberships.find(
    (candidate) => candidate.businessUnitCode === "parfums",
  );
  if (!membership) redirect("/admin");

  const supabase = await createSupabaseServerClient();
  if (!supabase) return <ProblemPage title="El backend de administración no está configurado en este entorno." />;

  const repository = new AdminParfumsCombosRepository(supabase, membership.businessUnitId);
  const detailResult = await repository.getById(id);

  if (!detailResult.ok) {
    if (detailResult.error.type === "not_found") notFound();
    return <ProblemPage title="No pudimos cargar el combo." />;
  }

  const { combo, product, comboProductVariants, items } = detailResult.data;
  const canWrite = membership.role === "admin";

  // Eligible additions exclude this combo's own product (the DB rejects a
  // self-reference too — this is the UI never even offering the choice).
  // Viewers never add items, so they skip the lookup entirely.
  const eligibleVariantsResult = canWrite ? await repository.listEligibleVariants(combo.product_id) : null;

  return (
    <ComboWorkspace
      combo={combo}
      product={product}
      comboProductVariants={comboProductVariants}
      items={items}
      eligibleVariants={eligibleVariantsResult?.ok ? eligibleVariantsResult.data : []}
      eligibleVariantsFailed={eligibleVariantsResult !== null && !eligibleVariantsResult.ok}
      canWrite={canWrite}
    />
  );
}
