import Link from "next/link";
import type { BusinessUnit } from "@/domains/platform/contracts";
import styles from "./unit-entry.module.css";

type UnitEntryProps = {
  index: number;
  unit: BusinessUnit;
};

export function UnitEntry({ index, unit }: UnitEntryProps) {
  return (
    <Link className={styles.entry} data-unit={unit.code} href={unit.href}>
      <span className={styles.index} aria-hidden="true">
        {String(index).padStart(2, "0")}
      </span>
      <div className={styles.copy}>
        <p className={styles.kicker}>{unit.label}</p>
        <h2>{unit.promise}</h2>
        <p className={styles.scope}>{unit.scope.join(" · ")}</p>
      </div>
      <span className={styles.link}>
        Entrar a {unit.shortName}
        <span aria-hidden="true">→</span>
      </span>
    </Link>
  );
}
