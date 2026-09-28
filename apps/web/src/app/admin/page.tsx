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
  parfums: {
    name: "Cruzial Parfums",
    description: "Tienda de perfumes: pedidos, catálogo, combos, mayorista y reclamos.",
    href: "/admin/parfums",
  },
  import: {
    name: "Cruzial Import",
    description: "Importación por consolidado: preparación, pedidos, clientes y reclamos.",
    href: "/admin/import",
  },
} as const;

export default async function AdminGatewayPage() {
  const result = await getAdminSession();

  if (result.status === "signed_out") redirect("/admin/login");
  if (result.status === "mfa_challenge_required") redirect("/admin/mfa/challenge");
  if (result.status === "mfa_enrollment_required") redirect("/admin/mfa/enroll");

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <strong>Cruzial Admin</strong>
        {result.status === "ok" || result.status === "no_membership" ? (
          <div className={styles.headerActions}>
            {result.status === "ok" ? <Link href="/admin/security">Seguridad</Link> : null}
            <form action={signOutAdmin}>
              <button type="submit" className={styles.signOut}>
                Cerrar sesión
              </button>
            </form>
          </div>
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
          <h1>¿Qué negocio quieres administrar?</h1>
          <p className={styles.body}>
            Sesión activa como <strong>{result.session.email ?? "usuario sin correo"}</strong>.
          </p>
          <ul className={styles.selector} aria-label="Negocios disponibles">
            {result.session.memberships.map((membership) => {
              const unit = UNIT_LABELS[membership.businessUnitCode];
              return (
                <li key={membership.businessUnitCode}>
                  <Link href={unit.href as Route} className={styles.unitCard} data-unit={membership.businessUnitCode}>
                    <strong>{unit.name}</strong>
                    <span className={styles.unitDescription}>{unit.description}</span>
                    <span className={styles.unitFooter}>
                      <span className={styles.selectorRole}>
                        {membership.role === "admin" ? "Administrador" : "Solo lectura"}
                      </span>
                      <span className={styles.unitEnter} aria-hidden="true">Entrar →</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </main>
      ) : null}

      <p className={styles.footer}>
        {result.status === "not_configured" || result.status === "unavailable"
          ? "Este entorno no tiene un backend operativo en este momento."
          : "Sesión y membresías verificadas."}
      </p>
    </div>
  );
}
