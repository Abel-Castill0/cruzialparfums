import Link from "next/link";
import type { Route } from "next";
import styles from "./admin-action-center.module.css";

export type AdminActionItem = {
  /** Complete sentence naming the real count, e.g. "3 solicitudes pendientes"
   * — never a bare label like "Pedidos: 3". Omit the item entirely (filter
   * it out before passing `items`) when the count is 0 or can't be derived
   * safely; there is no placeholder/zero-state row here by design. */
  label: string;
  href: Route;
  tone?: "default" | "attention";
};

export function AdminActionCenter({
  title,
  subtitle,
  items,
  emptyMessage,
}: {
  title: string;
  subtitle?: string;
  items: readonly AdminActionItem[];
  emptyMessage: string;
}) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </header>
      {items.length > 0 ? (
        <ul className={styles.list} aria-label="Acciones pendientes">
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`${styles.item} ${item.tone === "attention" ? styles.attention : ""}`}
              >
                <span>{item.label}</span>
                <span aria-hidden="true">→</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>{emptyMessage}</p>
      )}
    </div>
  );
}
