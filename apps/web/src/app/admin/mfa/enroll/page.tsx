import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminPreMfaSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { startTotpEnrollment } from "./enrollment";
import { MfaEnrollForm } from "./enroll-form";
import styles from "../../auth-shared.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Configurar verificación en dos pasos",
  robots: { index: false, follow: false },
};

/**
 * Mandatory TOTP enrollment.
 *
 * Reachable only by an authenticated user with an active admin/viewer
 * membership who has not yet enrolled a verified MFA factor
 * (getAdminPreMfaSession — deliberately not getAdminSession, which would
 * refuse to return anything useful before aal2 exists). Already at aal2 or
 * already has a verified factor pending challenge? There is nothing to
 * enroll here, so this redirects rather than silently doing nothing.
 */
export default async function MfaEnrollPage() {
  const pre = await getAdminPreMfaSession();

  if (pre.status === "signed_out") redirect("/admin/login");
  if (pre.status === "no_membership") redirect("/admin/login");
  if (pre.status !== "ready") {
    return (
      <div className={styles.page}>
        <main className={styles.main}>
          <p className={styles.notice}>
            No se pudo verificar la sesión. Intenta iniciar sesión nuevamente.
          </p>
        </main>
      </div>
    );
  }

  if (pre.session.currentLevel === "aal2") redirect("/admin");
  if (pre.session.nextLevel === "aal2") redirect("/admin/mfa/challenge");

  const supabase = await createSupabaseServerClient();
  const enrollment = supabase ? await startTotpEnrollment(supabase) : null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <strong>Cruzial Admin</strong>
      </header>

      <main className={styles.main}>
        <h1>Configura la verificación en dos pasos</h1>
        <p className={styles.intro}>
          Todas las cuentas de administración requieren un segundo factor
          (aplicación autenticadora TOTP) antes de acceder a datos
          administrativos.
        </p>

        {enrollment ? (
          <MfaEnrollForm
            factorId={enrollment.factorId}
            qrCode={enrollment.qrCode}
            secret={enrollment.secret}
          />
        ) : (
          <p className={styles.notice}>
            No se pudo iniciar la configuración de verificación en dos pasos.
            Intenta recargar esta página.
          </p>
        )}
      </main>
    </div>
  );
}
