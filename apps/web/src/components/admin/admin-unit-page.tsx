import Link from "next/link";
import styles from "./admin-unit-page.module.css";

export function AdminUnitPage({
  unitLabel,
  areas,
}: {
  unitLabel: string;
  areas: readonly string[];
}) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <strong>Cruzial Admin</strong>
        <Link href="/admin">← Elegir otra unidad</Link>
      </header>
      <p className={styles.notice}>
        Foundation — sin autenticación ni operaciones reales todavía. Estas
        áreas describen el alcance previsto, no funcionalidad activa.
      </p>
      <main className={styles.main}>
        <h1>Administrar {unitLabel}</h1>
        <p>
          Cuando exista autenticación de administrador confirmada, cada área
          se implementa por separado — sin datos de prueba ni CRUD simulado
          mientras tanto.
        </p>
        <div className={styles.areaGrid}>
          {areas.map((area) => (
            <div key={area} className={styles.areaCard}>
              <strong>{area}</strong>
              <span>Próximamente</span>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
