import Link from "next/link";
import styles from "./import-shell.module.css";

export function ImportFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <span>CRUZIAL IMPORT</span>
        <Link href="/">Volver a Cruzial</Link>
      </div>
    </footer>
  );
}
