import Link from "next/link";
import type { Route } from "next";
import { AdminNavLink } from "./admin-nav-link";
import { signOutAdmin } from "@/app/admin/login/actions";
import styles from "./admin-shell.module.css";

export type AdminShellUnit = "parfums" | "import";

type NavItem = { label: string; href: Route; exact?: boolean };

const NAV: Record<AdminShellUnit, { unitLabel: string; items: NavItem[] }> = {
  parfums: {
    unitLabel: "Cruzial Parfums",
    items: [
      { label: "Resumen", href: "/admin/parfums", exact: true },
      { label: "Pedidos", href: "/admin/parfums/pedidos" },
      { label: "Productos", href: "/admin/parfums/productos" },
      { label: "Categorías", href: "/admin/parfums/categorias" },
      { label: "Combos", href: "/admin/parfums/combos" },
      { label: "Mayorista", href: "/admin/parfums/mayorista" as Route },
      { label: "Configuración", href: "/admin/parfums/configuracion" as Route },
      { label: "Reclamos", href: "/admin/parfums/reclamos" as Route },
      { label: "Auditoría", href: "/admin/parfums/auditoria" as Route },
    ],
  },
  import: {
    unitLabel: "Cruzial Import",
    items: [
      { label: "Resumen", href: "/admin/import", exact: true },
      { label: "Pedidos", href: "/admin/import/pedidos" as Route },
      { label: "Clientes", href: "/admin/import/clientes" as Route },
      { label: "Consolidado", href: "/admin/import/consolidados" },
      { label: "Productos", href: "/admin/import/productos" },
      { label: "Lotes", href: "/admin/import/lotes" as Route },
      { label: "Publicación", href: "/admin/import/publicacion" as Route },
      { label: "Configuración", href: "/admin/import/configuracion" as Route },
      { label: "Reclamos", href: "/admin/import/reclamos" as Route },
      { label: "Auditoría", href: "/admin/import/auditoria" as Route },
    ],
  },
};

const OTHER_UNIT: Record<AdminShellUnit, { code: AdminShellUnit; label: string; href: Route }> = {
  parfums: { code: "import", label: "Cruzial Import", href: "/admin/import" },
  import: { code: "parfums", label: "Cruzial Parfums", href: "/admin/parfums" },
};

function NavList({ unit }: { unit: AdminShellUnit }) {
  return (
    <ul className={styles.navList}>
      {NAV[unit].items.map((item) => (
        <li key={item.href}>
          <AdminNavLink href={item.href} exact={item.exact ?? false}>
            {item.label}
          </AdminNavLink>
        </li>
      ))}
    </ul>
  );
}

export function AdminShell({
  unit,
  role,
  email,
  canSwitchToOtherUnit,
  children,
}: {
  unit: AdminShellUnit;
  role: "admin" | "viewer";
  email: string | null;
  /** True only when the caller's own memberships (resolved server-side)
   * include the other business unit — never a client-supplied flag. */
  canSwitchToOtherUnit: boolean;
  children: React.ReactNode;
}) {
  const { unitLabel } = NAV[unit];
  const other = OTHER_UNIT[unit];

  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#admin-content">
        Saltar al contenido
      </a>
      <header className={styles.topbar}>
        <div className={styles.brandGroup}>
          <Link href="/admin" className={styles.brand}>
            Cruzial Admin
          </Link>
          <span className={styles.unitBadge}>{unitLabel}</span>
        </div>

        <details className={styles.mobileNav}>
          <summary>Menú · {unitLabel}</summary>
          <NavList unit={unit} />
          {canSwitchToOtherUnit ? (
            <Link href={other.href} className={styles.switchUnit}>
              Cambiar a {other.label}
            </Link>
          ) : null}
        </details>

        <div className={styles.topbarMeta}>
          {canSwitchToOtherUnit ? (
            <Link href={other.href} className={styles.switchUnit}>
              Cambiar a {other.label}
            </Link>
          ) : null}
          <span className={styles.roleBadge}>
            {role === "admin" ? "Administrador" : "Solo lectura"}
          </span>
          <span className={styles.emailBadge}>{email ?? "Sin correo"}</span>
          <Link href="/admin/security">Seguridad</Link>
          <form action={signOutAdmin}>
            <button type="submit" className={styles.signOut}>
              Cerrar sesión
            </button>
          </form>
        </div>
      </header>

      <div className={styles.body}>
        <nav className={styles.sidebar} aria-label={`Navegación de ${unitLabel}`}>
          <NavList unit={unit} />
        </nav>
        <main id="admin-content" className={styles.content}>
          {children}
        </main>
      </div>
    </div>
  );
}
