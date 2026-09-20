import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getRecoverySession } from "@/lib/auth/recovery-session";
import { ResetPasswordForm } from "./reset-password-form";
import styles from "../auth-shared.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Restablecer contraseña",
  robots: { index: false, follow: false },
};

/**
 * Renders only for a session proven to originate from a recovery link
 * (`amr` contains `recovery`). A normal signed-in admin who types this URL
 * is redirected away rather than shown a password-change form.
 *
 * This page is a usability gate, not the security boundary — the Server
 * Action re-derives the same proof independently, because a POST can reach
 * it without this page ever rendering.
 *
 * Deliberately not gated on admin_memberships: a valid recovery link
 * already implies a provisioned account (there is no public signup), and
 * changing a password grants no access on its own — reaching /admin still
 * requires signing in again and clearing MFA to aal2.
 */
export default async function ResetPasswordPage() {
  const recovery = await getRecoverySession();

  if (recovery.status === "not_configured") {
    return (
      <div className={styles.page}>
        <main className={styles.main}>
          <p className={styles.notice}>
            El backend de administración no está configurado en este entorno.
          </p>
        </main>
      </div>
    );
  }

  if (recovery.status !== "ready") {
    redirect("/admin/forgot-password");
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <strong>Cruzial Admin</strong>
      </header>

      <main className={styles.main}>
        <h1>Restablecer contraseña</h1>
        <ResetPasswordForm />
      </main>
    </div>
  );
}
