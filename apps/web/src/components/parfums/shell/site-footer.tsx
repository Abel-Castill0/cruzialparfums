import type { Route } from "next";
import Link from "next/link";
import { ParfumsBrandLockup } from "./brand-lockup";
import { WhatsAppIcon } from "./shell-icons";
import styles from "./parfums-shell.module.css";

const columns = [
  { title: "Explorar", links: [["Catálogo", "/parfums/catalogo"], ["Arma tu combo", "/parfums/combos"], ["Mayorista", "/parfums/mayorista"]] },
  { title: "Ayuda", links: [["Nosotros", "/parfums/nosotros"], ["FAQ", "/parfums#faq"], ["Cómo comprar", "/parfums/nosotros#como-comprar"], ["Contacto", "/parfums/contacto"]] },
  { title: "Legal", links: [["Privacidad", "/parfums/privacidad"], ["Términos", "/parfums/terminos"]] },
] as const;

export function SiteFooter({ logoUrl, whatsappNumber, instagramUrl }: { logoUrl: string | null; whatsappNumber: string; instagramUrl: string }) {
  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        <div className={styles.footerGrid}>
          <div className={styles.footerBrand}>
            <ParfumsBrandLockup logoUrl={logoUrl} />
            <p>Perfumería de descubrimiento. Menos volumen, más criterio. Del frasco original a tu piel.</p>
            <div className={styles.footerSocial}>
              <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp"><WhatsAppIcon size={16} /></a>
              <a href={instagramUrl} target="_blank" rel="noopener noreferrer" aria-label="Instagram">IG</a>
            </div>
          </div>
          {columns.map((column) => (
            <div className={styles.footerColumn} key={column.title}>
              <h2>{column.title}</h2>
              {column.links.map(([label, href]) => <Link key={href} href={href as Route}>{label}</Link>)}
            </div>
          ))}
        </div>
        <div className={styles.footerBottom}>
          <span>© 2026 Cruzial Parfums</span>
          <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noopener noreferrer">WhatsApp directo</a>
          <span>Hecho con carácter en Perú</span>
        </div>
      </div>
    </footer>
  );
}
