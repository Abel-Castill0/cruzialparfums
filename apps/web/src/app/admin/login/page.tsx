import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { AdminLoginForm } from "./login-form";
import styles from "./login.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Acceso",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage() {
  const configured = isSupabaseConfigured();
  let backendUnavailable = false;

  if (configured) {
    const session = await getAdminSession();
    // Already signed in with at least one membership: nothing to do here.
    if (session.status === "ok") redirect("/admin");
    backendUnavailable = session.status === "unavailable";
  }

  const loginEnabled = configured && !backendUnavailable;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <strong>Cruzial Admin</strong>
        <Link href="/">Volver al sitio público</Link>
      </header>

      <main className={styles.main}>
        <h1>Acceso de administración</h1>

        {loginEnabled ? (
          <p className={styles.intro}>
            Ingresa con la cuenta de administrador que se te haya provisionado.
          </p>
        ) : (
          <p className={styles.notice}>
            {backendUnavailable
              ? "El backend está configurado, pero no respondió correctamente. El formulario permanece deshabilitado."
              : "El backend de administración no está configurado en este entorno. Falta la configuración de Supabase, así que el formulario queda deshabilitado en lugar de simular un acceso que no existe."}
          </p>
        )}

        <AdminLoginForm configured={loginEnabled} />
      </main>
    </div>
  );
}
