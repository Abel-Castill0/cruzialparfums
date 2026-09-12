"use client";

import Link from "next/link";
import { useImportContact } from "@/components/import/import-contact-context";
import styles from "./import-shell.module.css";

export function ImportFooter() {
  const contact = useImportContact();
  const whatsappNumber = contact?.whatsappNumber ?? "";
  const contactEmail = contact?.contactEmail ?? "";

  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <span>CRUZIAL IMPORT</span>
        <div className={styles.footerLinks}>
          {whatsappNumber ? (
            <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noopener noreferrer">
              WhatsApp
            </a>
          ) : null}
          {contactEmail ? (
            <a href={`mailto:${contactEmail}`}>Correo</a>
          ) : null}
          <Link href="/">Volver a Cruzial</Link>
        </div>
      </div>
    </footer>
  );
}
