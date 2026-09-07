import Link from "next/link";
import styles from "./import-shell.module.css";

export function ImportHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <div className={styles.lockup} aria-label="Cruzial Import">
          <span className={styles.mark} aria-hidden="true">C</span>
          <span>
            <strong>CRUZIAL</strong>
            <span>Import</span>
          </span>
        </div>
        <Link href="/" className={styles.back}>
          ← Volver a Cruzial
        </Link>
      </div>
    </header>
  );
}
