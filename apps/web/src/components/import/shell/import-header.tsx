import Link from "next/link";
import { IMPORT_SETTINGS } from "@/domains/platform/settings";
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
        <nav className={styles.navigation} aria-label="Navegación de Cruzial Import">
          <Link href="/import">Inicio</Link>
          <Link href="/import#catalogo">Catálogo</Link>
          <Link href="/import#como-funciona">Cómo funciona</Link>
          <Link href="/import#faq">FAQ</Link>
        </nav>
        <div className={styles.headerActions}>
          <a
            className={styles.whatsapp}
            href={`https://wa.me/${IMPORT_SETTINGS.whatsappNumber}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            WhatsApp
          </a>
          <Link href="/" className={styles.back}>Cruzial</Link>
        </div>
      </div>
    </header>
  );
}
