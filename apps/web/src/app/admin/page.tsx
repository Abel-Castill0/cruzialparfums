import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { signOutAdmin } from "./login/actions";
import styles from "./page.module.css";

// Authenticated surface: never prerendered or cached, so an admin shell can
// never be served from a static artifact to the wrong viewer.
export const dynamic = "force-dynamic";

/**
 * Business-unit selector.
 *
 * One login, then a choice of which business to administer — not two separate
 * auth systems. What appears here comes from the caller's own memberships,
 * resolved server-side; an admin of a single unit never sees a door to the
 * other one, and even if they typed the URL, RLS would refuse the data.
 */

const UNIT_LABELS = {
  parfums: { eyebrow: "Cruzial Parfums", label: "Administrar Parfums", href: "/admin/parfums" },
  import: { eyebrow: "Cruzial Import", label: "Administrar Import", href: "/admin/import" },
} as const;

export default async function AdminGatewayPage() {
  const result = await getAdminSession();

  if (result.status === "signed_out") redirect("/admin/login");

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <strong>Cruzial Admin</strong>
        {result.status === "ok" || result.status === "no_membership" ? (
          <form action={signOutAdmin}>
            <button type="submit" className={styles.signOut}>
              Cerrar sesión
            </button>
          </form>
        ) : (
          <Link href="/">Volver al sitio público</Link>
        )}
      </header>

      {result.status === "not_configured" ? (
        <>
          <p className={styles.notice}>
            El backend de administración no está configurado en este entorno.
            Sin Supabase no hay sesión ni datos reales, así que esta pantalla no
            simula operaciones disponibles.
          </p>
          <main className={styles.main}>
            <h1>Administración no disponible</h1>
            <p className={styles.body}>
              Configura las variables de Supabase (ver <code>.env.example</code>)
              para habilitar el acceso.
            </p>
          </main>
        </>
      ) : null}

      {result.status === "unavailable" ? (
        <>
          <p className={styles.notice}>
            La configuración existe, pero el servicio de administración no
            respondió correctamente. No se habilitan operaciones en este estado.
          </p>
          <main className={styles.main}>
            <h1>Administración temporalmente no disponible</h1>
            <p className={styles.body}>Intenta nuevamente cuando el backend esté operativo.</p>
          </main>
        </>
      ) : null}

      {result.status === "no_membership" ? (
        <>
          <p className={styles.notice}>
            Tu cuenta está autenticada pero no tiene acceso a ninguna unidad de
            negocio. Un administrador debe asignarte una membresía.
          </p>
          <main className={styles.main}>
            <h1>Sin unidades asignadas</h1>
            <p className={styles.body}>
              Sesión activa como <strong>{result.email ?? "usuario sin correo"}</strong>.
            </p>
          </main>
        </>
      ) : null}

      {result.status === "ok" ? (
        <main className={styles.main}>
          <h1>¿Qué quieres administrar?</h1>
          <p className={styles.body}>
            Sesión activa como <strong>{result.session.email ?? "usuario sin correo"}</strong>.
          </p>
          <div className={styles.selector}>
            {result.session.memberships.map((membership) => {
              const unit = UNIT_LABELS[membership.businessUnitCode];
              return (
                <Link key={membership.businessUnitCode} href={unit.href as Route}>
                  <span className={styles.selectorEyebrow}>{unit.eyebrow}</span>
                  <strong>{unit.label}</strong>
                  <span className={styles.selectorRole}>
                    {membership.role === "admin" ? "Administrador" : "Solo lectura"}
                  </span>
                </Link>
              );
            })}
          </div>
        </main>
      ) : null}

      <p className={styles.footer}>
        {result.status === "not_configured" || result.status === "unavailable"
          ? "La foundation está preparada, pero este entorno no tiene un backend operativo."
          : "Sesión y membresías verificadas. La administración de productos Parfums está disponible; pedidos, campañas y los demás módulos siguen pendientes."}
      </p>
    </div>
  );
}
