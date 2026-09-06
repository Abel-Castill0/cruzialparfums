import type { Route } from "next";
import Link from "next/link";
import type { CatalogProduct } from "@/domains/catalog/types";
import { ParfumsBrandLockup } from "./brand-lockup";
import { HeaderActions } from "./site-header-actions";
import { WhatsAppAction } from "./whatsapp-action";
import styles from "./parfums-shell.module.css";

export type HeaderSearchProduct = Pick<
  CatalogProduct,
  "slug" | "brand" | "name" | "notes" | "family" | "discontinued"
>;

const navItems = [
  { href: "/parfums/catalogo", label: "Catálogo" },
  { href: "/parfums/combos", label: "Arma tu combo" },
  { href: "/parfums/mayorista", label: "Mayorista" },
] as const;

export function SiteHeader({
  logoUrl,
  whatsappNumber,
  searchProducts,
}: {
  logoUrl: string | null;
  whatsappNumber: string;
  searchProducts: HeaderSearchProduct[];
}) {
  return (
    <header className={styles.siteHeader}>
      <div className={styles.headerInner}>
        <ParfumsBrandLockup logoUrl={logoUrl} />
        <nav className={styles.mainNav} aria-label="Navegación principal">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href as Route}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className={styles.headerActions}>
          <span className={styles.headerWhatsApp}>
            <WhatsAppAction number={whatsappNumber} />
          </span>
          <HeaderActions products={searchProducts} navItems={navItems} />
        </div>
      </div>
    </header>
  );
}
