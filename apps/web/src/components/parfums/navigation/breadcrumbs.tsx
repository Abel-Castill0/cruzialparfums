import type { Route } from "next";
import Link from "next/link";
import styles from "./breadcrumbs.module.css";

export type BreadcrumbItem = {
  label: string;
  href?: Route;
};

export function Breadcrumbs({ items }: { items: readonly BreadcrumbItem[] }) {
  return (
    <nav className={styles.breadcrumbs} aria-label="Ruta de navegación">
      <ol>
        {items.map((item, index) => {
          const current = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`}>
              {item.href && !current ? (
                <Link href={item.href}>{item.label}</Link>
              ) : (
                <span aria-current={current ? "page" : undefined}>{item.label}</span>
              )}
              {!current ? <span aria-hidden="true">/</span> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
