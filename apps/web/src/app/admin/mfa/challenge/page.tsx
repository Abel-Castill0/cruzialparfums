import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminPreMfaSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listOwnTotpFactors } from "@/lib/auth/mfa";
import { MfaChallengeForm } from "./challenge-form";
import styles from "../../auth-shared.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Verificación en dos pasos",
  robots: { index: false, follow: false },
};

/**
 * MFA challenge for an account that already has a verified TOTP factor.
 *
 * Only ever lists this user's own *verified* factors — never an
 * unverified/in-progress one, and never one belonging to anyone else.
 */
export default async function MfaChallengePage() {
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
  if (pre.session.nextLevel === "aal1") redirect("/admin/mfa/enroll");

  const supabase = await createSupabaseServerClient();
  const owned = supabase ? await listOwnTotpFactors(supabase) : null;
  const verified = owned?.ok
    ? owned.factors.filter((factor) => factor.status === "verified")
    : [];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <strong>Cruzial Admin</strong>
      </header>

      <main className={styles.main}>
        <h1>Verificación en dos pasos</h1>
        <p className={styles.intro}>
          Ingresa el código de 6 dígitos de tu aplicación autenticadora para
          continuar.
        </p>

        {verified.length > 0 ? (
          <MfaChallengeForm
            factors={verified.map((factor, index) => ({
              id: factor.id,
              label: factor.friendlyName || `Factor ${index + 1}`,
            }))}
          />
        ) : (
          <p className={styles.notice}>
            No se pudo cargar tu factor de verificación. Intenta recargar
            esta página o contacta al operador si perdiste acceso a tu
            aplicación autenticadora.
          </p>
        )}
      </main>
    </div>
  );
}
