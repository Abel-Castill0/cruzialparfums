import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminParfumsSettingsRepository } from "@/domains/admin-parfums/settings-repository";
import { PublicContactSettingEditor } from "./contact-editor";
import baseStyles from "../productos/page.module.css";
import styles from "./configuracion.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Configuración" };

export default async function AdminImportSettingsPage() {
  const session = await getAdminSession();
  if (session.status === "not_configured" || session.status === "unavailable" || session.status === "no_membership") redirect("/admin");
  if (session.status === "signed_out") redirect("/admin/login");
  const membership = session.session.memberships.find((candidate) => candidate.businessUnitCode === "import");
  if (!membership) redirect("/admin");

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return <div className={baseStyles.page}><main><p className={baseStyles.notice}>El backend de administración no está configurado.</p></main></div>;
  }

  const repository = new AdminParfumsSettingsRepository(supabase, membership.businessUnitId, "import");
  const result = await repository.getPublicContact();

  if (!result.ok) {
    return <div className={baseStyles.page}><main><p className={baseStyles.notice} role="alert">No se pudo cargar Configuración. Intenta de nuevo.</p></main></div>;
  }

  return (
    <div className={baseStyles.page}>
      <header className={baseStyles.header}>
        <div>
          <Link href="/admin/import" className={baseStyles.back}>← Cruzial Import</Link>
          <h1>Configuración</h1>
          <p>Contacto público confirmado — WhatsApp y correo que ve el cliente.</p>
        </div>
      </header>

      <main className={styles.main}>
        {membership.role !== "admin" ? (
          <p className={baseStyles.notice} role="status">Estás en modo solo lectura para Import.</p>
        ) : null}

        {result.data ? (
          <PublicContactSettingEditor setting={result.data} disabled={membership.role !== "admin"} />
        ) : (
          <p className={baseStyles.notice} role="alert">
            Falta la configuración de contacto público. Revisa las migraciones.
          </p>
        )}
      </main>
    </div>
  );
}
