import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminParfumsSettingsRepository } from "@/domains/admin-parfums/settings-repository";
import { AdminPage, AdminPageHeader, Notice } from "@/components/admin/admin-ui";
import { PublicContactSettingEditor } from "@/components/admin/public-contact-editor";
import { BusinessLegalSettingEditor } from "@/components/admin/business-legal-editor";
import { updateImportPublicContactSettingAction, updateImportBusinessLegalSettingAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Configuración" };

export default async function AdminImportSettingsPage() {
  const session = await getAdminSession();
  if (session.status === "not_configured" || session.status === "unavailable" || session.status === "no_membership") redirect("/admin");
  if (session.status === "mfa_challenge_required") redirect("/admin/mfa/challenge");
  if (session.status === "mfa_enrollment_required") redirect("/admin/mfa/enroll");
  if (session.status === "signed_out") redirect("/admin/login");
  const membership = session.session.memberships.find((candidate) => candidate.businessUnitCode === "import");
  if (!membership) redirect("/admin");
  const canWrite = membership.role === "admin";

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return (
      <AdminPage>
        <AdminPageHeader eyebrow="Cruzial Import" title="Configuración" />
        <Notice tone="danger" title="El backend de administración no está configurado." />
      </AdminPage>
    );
  }

  const repository = new AdminParfumsSettingsRepository(supabase, membership.businessUnitId, "import");
  const [result, legalResult] = await Promise.all([
    repository.getPublicContact(),
    repository.getBusinessLegal(),
  ]);

  if (!result.ok || !legalResult.ok) {
    return (
      <AdminPage>
        <AdminPageHeader eyebrow="Cruzial Import" title="Configuración" />
        <Notice tone="danger" title="No se pudo cargar Configuración">Intenta de nuevo.</Notice>
      </AdminPage>
    );
  }

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Cruzial Import"
        title="Configuración"
        description="Lo que tus clientes ven de tu negocio: contacto, identidad legal y políticas públicas."
        meta={canWrite ? undefined : "Estás en modo solo lectura para Import."}
      />

      {result.data ? (
        <PublicContactSettingEditor setting={result.data} canWrite={canWrite} updateAction={updateImportPublicContactSettingAction} />
      ) : (
        <Notice tone="danger" title="Falta la configuración de contacto público">Revisa las migraciones.</Notice>
      )}

      {legalResult.data ? (
        <BusinessLegalSettingEditor setting={legalResult.data} canWrite={canWrite} updateAction={updateImportBusinessLegalSettingAction} />
      ) : (
        <Notice tone="danger" title="Falta la configuración legal">Revisa las migraciones.</Notice>
      )}
    </AdminPage>
  );
}
