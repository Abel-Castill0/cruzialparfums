import Link from "next/link";
import type { Route } from "next";
import { AdminNavLink } from "./admin-nav-link";
import { signOutAdmin } from "@/app/admin/login/actions";
import styles from "./admin-shell.module.css";

export type AdminShellUnit = "parfums" | "import";

type NavItem = { label: string; href: Route; exact?: boolean };
type NavGroup = { label: string; items: NavItem[]; subdued?: boolean };

// Presentation-only IA: groups and plain-language labels over the SAME
// routes. Every URL stays a stable deep link; authorization is unaffected.
const NAV: Record<AdminShellUnit, { unitLabel: string; unitHint: string; groups: NavGroup[] }> = {
  parfums: {
    unitLabel: "Cruzial Parfums",
    unitHint: "Tienda de perfumes",
    groups: [
      { label: "Inicio", items: [{ label: "Resumen", href: "/admin/parfums", exact: true }] },
      { label: "Ventas", items: [{ label: "Pedidos", href: "/admin/parfums/pedidos" }] },
      {
        label: "Catálogo",
        items: [
          { label: "Productos", href: "/admin/parfums/productos" },
          { label: "Categorías", href: "/admin/parfums/categorias" },
          { label: "Combos", href: "/admin/parfums/combos" },
          { label: "Mayorista", href: "/admin/parfums/mayorista" as Route },
        ],
      },
      { label: "Atención", items: [{ label: "Reclamos", href: "/admin/parfums/reclamos" as Route }] },
      {
        label: "Gestión",
        items: [
          { label: "Operaciones", href: "/admin/parfums/operaciones" as Route },
          { label: "Configuración", href: "/admin/parfums/configuracion" as Route },
        ],
      },
      {
        label: "Más",
        subdued: true,
        items: [{ label: "Historial de cambios", href: "/admin/parfums/auditoria" as Route }],
      },
    ],
  },
  import: {
    unitLabel: "Cruzial Import",
    unitHint: "Importación por consolidado",
    groups: [
      { label: "Inicio", items: [{ label: "Resumen", href: "/admin/import", exact: true }] },
      {
        label: "Consolidado",
        items: [
          { label: "Consolidados", href: "/admin/import/consolidados" },
          { label: "Revisión para publicar", href: "/admin/import/publicacion" as Route },
        ],
      },
      {
        label: "Ventas",
        items: [
          { label: "Pedidos", href: "/admin/import/pedidos" as Route },
          { label: "Clientes", href: "/admin/import/clientes" as Route },
        ],
      },
      { label: "Catálogo", items: [{ label: "Productos", href: "/admin/import/productos" }] },
      {
        label: "Gestión",
        items: [
          { label: "Operaciones", href: "/admin/import/operaciones" as Route },
          { label: "Reclamos", href: "/admin/import/reclamos" as Route },
          { label: "Configuración", href: "/admin/import/configuracion" as Route },
        ],
      },
      {
        label: "Herramientas avanzadas",
        subdued: true,
        items: [
          { label: "Carga masiva", href: "/admin/import/lotes" as Route },
          { label: "Historial de cambios", href: "/admin/import/auditoria" as Route },
        ],
      },
    ],
  },
};

const OTHER_UNIT: Record<AdminShellUnit, { label: string; href: Route }> = {
  parfums: { label: "Cruzial Import", href: "/admin/import" },
  import: { label: "Cruzial Parfums", href: "/admin/parfums" },
};

function NavGroups({ unit, idPrefix }: { unit: AdminShellUnit; idPrefix: string }) {
  return (
    <div className={styles.navGroups}>
      {NAV[unit].groups.map((group, index) => {
        const headingId = `${idPrefix}-group-${index}`;
        return (
          <div key={group.label} className={`${styles.navGroup} ${group.subdued ? styles.navGroupSubdued : ""}`}>
            <p id={headingId} className={styles.groupLabel}>{group.label}</p>
            <ul className={styles.navList} aria-labelledby={headingId}>
              {group.items.map((item) => (
                <li key={item.href}>
                  <AdminNavLink href={item.href} exact={item.exact ?? false}>
                    {item.label}
                  </AdminNavLink>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function AccountPanel({
  unit,
  role,
  email,
  canSwitchToOtherUnit,
}: {
  unit: AdminShellUnit;
  role: "admin" | "viewer";
  email: string | null;
  canSwitchToOtherUnit: boolean;
}) {
  const other = OTHER_UNIT[unit];
  return (
    <div className={styles.account}>
      {canSwitchToOtherUnit ? (
        <Link href={other.href} className={styles.accountLink}>
          <span aria-hidden="true">⇄</span> Cambiar a {other.label}
        </Link>
      ) : null}
      <Link href="/admin/security" className={styles.accountLink}>
        <span aria-hidden="true">◇</span> Seguridad de la cuenta
      </Link>
      <div className={styles.identity}>
        <span className={styles.identityEmail} title={email ?? undefined}>{email ?? "Sin correo"}</span>
        <span className={styles.identityRole}>{role === "admin" ? "Administrador" : "Solo lectura"}</span>
      </div>
      <form action={signOutAdmin}>
        <button type="submit" className={styles.signOut}>
          Cerrar sesión
        </button>
      </form>
    </div>
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
  const { unitLabel, unitHint } = NAV[unit];
  const account = { unit, role, email, canSwitchToOtherUnit };

  return (
    <div className={styles.shell} data-unit={unit}>
      <a className={styles.skipLink} href="#admin-content">
        Saltar al contenido
      </a>

      <header className={styles.mobileHeader}>
        <div className={styles.mobileIdentity}>
          <Link href="/admin" className={styles.brand}>Cruzial Admin</Link>
          <span className={styles.mobileUnit}>{unitLabel}</span>
        </div>
        <details className={styles.drawer}>
          <summary>
            <span aria-hidden="true" className={styles.drawerIcon} />
            Menú
          </summary>
          <div className={styles.drawerPanel}>
            <nav aria-label={`Navegación de ${unitLabel}`}>
              <NavGroups unit={unit} idPrefix="mobile" />
            </nav>
            <AccountPanel {...account} />
          </div>
        </details>
      </header>

      <aside className={styles.sidebar}>
        <div className={styles.sidebarTop}>
          <Link href="/admin" className={styles.brand}>Cruzial Admin</Link>
          <div className={styles.unitCard}>
            <span className={styles.unitName}>{unitLabel}</span>
            <span className={styles.unitHint}>{unitHint}</span>
          </div>
        </div>
        <nav className={styles.sidebarNav} aria-label={`Navegación de ${unitLabel}`}>
          <NavGroups unit={unit} idPrefix="desktop" />
        </nav>
        <AccountPanel {...account} />
      </aside>

      <main id="admin-content" className={styles.content} tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
