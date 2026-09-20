import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminParfumsSettingsRepository } from "@/domains/admin-parfums/settings-repository";
import { PublicContactSettingEditor } from "./contact-editor";
import { BusinessLegalSettingEditor } from "./legal-editor";
import baseStyles from "../productos/page.module.css";
import styles from "./configuracion.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Configuración" };

export default async function AdminParfumsSettingsPage() {
  const session = await getAdminSession();
  if (session.status === "not_configured" || session.status === "unavailable" || session.status === "no_membership") redirect("/admin");
  if (session.status === "mfa_challenge_required") redirect("/admin/mfa/challenge");
  if (session.status === "mfa_enrollment_required") redirect("/admin/mfa/enroll");
  if (session.status === "signed_out") redirect("/admin/login");
  const membership = session.session.memberships.find((candidate) => candidate.businessUnitCode === "parfums");
  if (!membership) redirect("/admin");

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return <div className={baseStyles.page}><main><p className={baseStyles.notice}>El backend de administración no está configurado.</p></main></div>;
  }

  const repository = new AdminParfumsSettingsRepository(supabase, membership.businessUnitId, "parfums");
  const [result, legalResult] = await Promise.all([
    repository.getPublicContact(),
    repository.getBusinessLegal(),
  ]);

  if (!result.ok || !legalResult.ok) {
    return <div className={baseStyles.page}><main><p className={baseStyles.notice} role="alert">No se pudo cargar Configuración. Intenta de nuevo.</p></main></div>;
  }

  return (
    <div className={baseStyles.page}>
      <header className={baseStyles.header}>
        <div>
          <h1>Configuración</h1>
          <p>Contacto público confirmado — WhatsApp y correo que ve el cliente.</p>
        </div>
      </header>

      <main className={styles.main}>
        {membership.role !== "admin" ? (
          <p className={baseStyles.notice} role="status">Estás en modo solo lectura para Parfums.</p>
        ) : null}

        {result.data ? (
          <PublicContactSettingEditor setting={result.data} disabled={membership.role !== "admin"} />
        ) : (
          <p className={baseStyles.notice} role="alert">
            Falta la configuración de contacto público. Revisa las migraciones.
          </p>
        )}

        <h2 className={styles.sectionTitle}>Datos legales y políticas públicas</h2>
        {legalResult.data ? (
          <BusinessLegalSettingEditor setting={legalResult.data} disabled={membership.role !== "admin"} />
        ) : (
          <p className={baseStyles.notice} role="alert">
            Falta la configuración legal. Revisa las migraciones.
          </p>
        )}
      </main>
    </div>
  );
}
