import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "./forgot-password-form";
import styles from "../auth-shared.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Recuperar acceso",
  robots: { index: false, follow: false },
};

/**
 * Public page, deliberately: a password-reset request form has to be
 * reachable by someone who is, by definition, not signed in.
 */
export default function ForgotPasswordPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <strong>Cruzial Admin</strong>
        <Link href="/admin/login">Volver a iniciar sesión</Link>
      </header>

      <main className={styles.main}>
        <h1>Recuperar acceso</h1>
        <p className={styles.intro}>
          Ingresa el correo de tu cuenta de administración. Si está
          autorizada, recibirás un enlace para restablecer tu contraseña.
        </p>

        <ForgotPasswordForm />
      </main>
    </div>
  );
}
