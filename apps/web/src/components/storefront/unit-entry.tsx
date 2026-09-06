import Link from "next/link";
import type { BusinessUnit } from "@/domains/platform/contracts";
import styles from "./unit-entry.module.css";

type UnitEntryProps = {
  index: number;
  unit: BusinessUnit;
};

export function UnitEntry({ index, unit }: UnitEntryProps) {
  return (
    <article className={styles.entry} data-unit={unit.code}>
      <span className={styles.index} aria-hidden="true">
        {String(index).padStart(2, "0")}
      </span>
      <div className={styles.copy}>
        <p className={styles.kicker}>{unit.label}</p>
        <h2>{unit.promise}</h2>
        <p className={styles.scope}>{unit.scope.join(" · ")}</p>
      </div>
      <Link className={styles.link} href={unit.href}>
        Entrar a {unit.shortName}
        <span aria-hidden="true">→</span>
      </Link>
    </article>
  );
}
