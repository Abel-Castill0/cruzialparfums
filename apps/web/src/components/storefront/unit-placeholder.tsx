import Link from "next/link";
import type { BusinessUnit } from "@/domains/platform/contracts";
import styles from "./unit-placeholder.module.css";

export function UnitPlaceholder({ unit }: { unit: BusinessUnit }) {
  return (
    <main className={styles.page} data-unit={unit.code}>
      <p className={styles.brand}>CRUZIAL</p>
      <div className={styles.content}>
        <p className={styles.phase}>Foundation V2</p>
        <h1>{unit.label}</h1>
        <p>{unit.promise}</p>
        <p className={styles.scope}>{unit.scope.join(" · ")}</p>
      </div>
      <Link href="/">← Volver a Cruzial</Link>
    </main>
  );
}
