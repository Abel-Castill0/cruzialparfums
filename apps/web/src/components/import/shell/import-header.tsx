"use client";

import Link from "next/link";
import { ImportCartBadge } from "@/components/import/cart/import-cart-badge";
import { useImportContact } from "@/components/import/import-contact-context";
import styles from "./import-shell.module.css";

export function ImportHeader() {
  const contact = useImportContact();
  const whatsappNumber = contact?.whatsappNumber ?? "";

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
          <ImportCartBadge />
          {whatsappNumber ? (
            <a
              className={styles.whatsapp}
              href={`https://wa.me/${whatsappNumber}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              WhatsApp
            </a>
          ) : null}
          <Link href="/" className={styles.back}>Cruzial</Link>
        </div>
      </div>
    </header>
  );
}
