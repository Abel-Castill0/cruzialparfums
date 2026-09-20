import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listOwnTotpFactors } from "@/lib/auth/mfa";
import { AddFactorPanel } from "./add-factor-panel";
import styles from "../auth-shared.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Seguridad de la cuenta",
  robots: { index: false, follow: false },
};

/**
 * Minimal MFA self-management surface. getAdminSession() returning "ok"
 * already means aal2 (see admin-session.ts), so there is nothing extra to
 * check here beyond "is this an authorized admin/viewer session at all".
 *
 * V1 offers factor VIEWING and ADD enrollment of an extra backup factor
 * only. There is no self-service factor removal: removal is operator-only
 * via Supabase. Supabase does not offer recovery codes, so a second
 * verified TOTP factor on a separate device is this application's backup
 * path — see the Gate 2C1 operator recovery runbook for what happens if
 * all factors are lost.
 */
export default async function AdminSecurityPage() {
  const session = await getAdminSession();

  if (session.status === "signed_out") redirect("/admin/login");
  if (session.status === "mfa_challenge_required") redirect("/admin/mfa/challenge");
  if (session.status === "mfa_enrollment_required") redirect("/admin/mfa/enroll");
  if (session.status !== "ok") redirect("/admin/login");

  const supabase = await createSupabaseServerClient();
  const owned = supabase ? await listOwnTotpFactors(supabase) : null;
  const verified = owned?.ok ? owned.factors.filter((factor) => factor.status === "verified") : [];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <strong>Cruzial Admin</strong>
        <Link href="/admin">Volver</Link>
      </header>

      <main className={styles.mainWide}>
        <h1>Seguridad de la cuenta</h1>
        <p className={styles.intro}>
          Sesión activa como <strong>{session.session.email ?? "usuario sin correo"}</strong>.
        </p>

        <section>
          <h2>Factores de verificación en dos pasos</h2>
          <div className={styles.factorList}>
            {verified.map((factor, index) => (
              <div key={factor.id} className={styles.factorRow}>
                <span>{factor.friendlyName || `Factor ${index + 1}`}</span>
                <span>Verificado</span>
              </div>
            ))}
          </div>

          <p className={styles.note}>
            Recomendado para producción: mantén dos factores TOTP verificados
            en dispositivos o gestores de contraseñas separados. Los factores
            no pueden eliminarse desde esta interfaz; la recuperación ante la
            pérdida de todos los factores es un procedimiento exclusivo de
            operación.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Agregar un factor de respaldo</h2>
          <AddFactorPanel />
        </section>
      </main>
    </div>
  );
}
