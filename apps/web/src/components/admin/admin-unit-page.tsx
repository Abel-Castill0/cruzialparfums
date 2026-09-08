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
  role,
  email,
}: {
  unitLabel: string;
  implementedAreas?: readonly AdminImplementedArea[];
  placeholderAreas: readonly string[];
  role: "admin" | "viewer";
  email: string | null;
}) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <strong>Cruzial Admin</strong>
        <Link href="/admin">← Elegir otra unidad</Link>
      </header>
      <p className={styles.notice}>
        Sesión verificada en el servidor{email ? ` como ${email}` : ""} ·{" "}
        {role === "admin" ? "Administrador" : "Solo lectura"}.
      </p>
      <main className={styles.main}>
        <h1>Administrar {unitLabel}</h1>
        <p>
          La sesión y esta membresía fueron verificadas contra el backend. El
          schema y las políticas RLS están versionados; cada área se implementa
          por separado sobre esa base, sin datos de prueba.
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

        <div className={styles.areaGrid}>
          {placeholderAreas.map((area) => (
            <div key={area} className={styles.areaCard}>
              <strong>{area}</strong>
              <span>Sin implementar</span>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
