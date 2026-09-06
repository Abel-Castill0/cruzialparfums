import { BrandLockup } from "@/components/design-system/brand-lockup";
import { UnitEntry } from "@/components/storefront/unit-entry";
import { BUSINESS_UNITS } from "@/domains/platform/contracts";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.gateway}>
      <header className={styles.header}>
        <BrandLockup />
        <p className={styles.phase}>Platform V2 · Foundation</p>
      </header>

      <section className={styles.intro} aria-labelledby="gateway-title">
        <p className={styles.eyebrow}>Una sola plataforma</p>
        <h1 id="gateway-title">Dos experiencias. Una misma casa.</h1>
        <p className={styles.summary}>
          Cruzial reúne entrega inmediata e importaciones bajo una identidad
          compartida, manteniendo cada operación en su propio flujo.
        </p>
      </section>

      <section className={styles.units} aria-label="Unidades de Cruzial">
        {BUSINESS_UNITS.map((unit, index) => (
          <UnitEntry key={unit.code} index={index + 1} unit={unit} />
        ))}
      </section>

      <footer className={styles.footer}>
        <span>CRUZIAL</span>
        <span>Lima · Perú</span>
      </footer>
    </main>
  );
}
