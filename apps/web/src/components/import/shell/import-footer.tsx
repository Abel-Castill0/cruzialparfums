import Link from "next/link";
import { IMPORT_SETTINGS } from "@/domains/platform/settings";
import styles from "./import-shell.module.css";

export function ImportFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <span>CRUZIAL IMPORT</span>
        <div className={styles.footerLinks}>
          <a href={`https://wa.me/${IMPORT_SETTINGS.whatsappNumber}`} target="_blank" rel="noopener noreferrer">
            WhatsApp
          </a>
          <a href={`mailto:${IMPORT_SETTINGS.contactEmail}`}>Correo</a>
          <Link href="/">Volver a Cruzial</Link>
        </div>
      </div>
    </footer>
  );
}
