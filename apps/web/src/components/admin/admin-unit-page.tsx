import Link from "next/link";
import styles from "./admin-unit-page.module.css";

export function AdminUnitPage({
  unitLabel,
  areas,
  role,
  email,
}: {
  unitLabel: string;
  areas: readonly string[];
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
        {role === "admin" ? "Administrador" : "Solo lectura"}. Las áreas de abajo
        describen el alcance previsto: todavía no hay CRUD implementado, y nada
        aquí simula una operación que no existe.
      </p>
      <main className={styles.main}>
        <h1>Administrar {unitLabel}</h1>
        <p>
          La sesión y esta membresía fueron verificadas contra el backend. El
          schema y las políticas RLS están versionados; cada área se implementará
          por separado sobre esa base, sin datos de prueba.
        </p>
        <div className={styles.areaGrid}>
          {areas.map((area) => (
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
