"use client";

import type { Route } from "next";
import Link from "next/link";
import Image from "next/image";
import { useImportContact } from "@/components/import/import-contact-context";
import styles from "./import-shell.module.css";

export function ImportFooter() {
  const contact = useImportContact();
  const whatsappNumber = contact?.whatsappNumber ?? "";
  const contactEmail = contact?.contactEmail ?? "";
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div className={styles.footerTop}>
          <div className={styles.footerLockup} role="img" aria-label="Cruzial Import">
            <Image src="/images/import-home/cruzial-import-logo.png" alt="" width={164} height={82} />
          </div>

          <nav className={styles.footerNav} aria-label="Enlaces de Cruzial Import">
            <Link href="/import">Inicio</Link>
            <Link href={"/import/catalogo" as Route}>Catálogo</Link>
            <Link href="/import#como-funciona">Cómo funciona</Link>
            <Link href="/import#faq">FAQ</Link>
            {whatsappNumber ? (
              <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noopener noreferrer">
                WhatsApp
              </a>
            ) : null}
            {contactEmail ? (
              <a href={`mailto:${contactEmail}`}>Correo</a>
            ) : null}
          </nav>

          <Link href="/" className={styles.footerBack}>
            Volver a Cruzial <span aria-hidden="true">→</span>
          </Link>
        </div>

        <div className={styles.footerBottom}>
          <p>© {year} Cruzial Import. Todos los derechos reservados.</p>
          <div className={styles.footerLegal}>
            <Link href={"/import/privacidad" as Route}>Privacidad</Link>
            <Link href={"/import/terminos" as Route}>Términos</Link>
            <Link href={"/libro-de-reclamaciones?unidad=import" as Route}>Libro de Reclamaciones</Link>
            <a href="https://portafolio-henna-mu.vercel.app/" target="_blank" rel="noopener noreferrer">Diseñado y desarrollado por Abel ↗</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
