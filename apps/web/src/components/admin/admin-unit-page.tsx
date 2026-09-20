import Link from "next/link";
import type { Route } from "next";
import styles from "./admin-unit-page.module.css";

export type AdminImplementedArea = {
  label: string;
  href: Route;
  summary: string;
};

export function AdminUnitPage({
  unitLabel,
  implementedAreas = [],
  placeholderAreas,
}: {
  unitLabel: string;
  implementedAreas?: readonly AdminImplementedArea[];
  placeholderAreas: readonly string[];
}) {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1>Administrar {unitLabel}</h1>
        <p>
          Tu sesión y tu acceso a esta unidad fueron verificados. Cada área se
          muestra con datos reales, nunca de prueba.
        </p>

        {implementedAreas.length > 0 ? (
          <div className={styles.implementedGrid}>
            {implementedAreas.map((area) => (
              <Link key={area.href} href={area.href} className={styles.implementedCard}>
                <strong>{area.label}</strong>
                <p>{area.summary}</p>
                <span aria-hidden="true">→</span>
              </Link>
            ))}
          </div>
        ) : null}

        {placeholderAreas.length > 0 ? (
          <div className={styles.areaGrid}>
            {placeholderAreas.map((area) => (
              <div key={area} className={styles.areaCard}>
                <strong>{area}</strong>
                <span>Sin implementar</span>
              </div>
            ))}
          </div>
        ) : null}
      </main>
    </div>
  );
}
