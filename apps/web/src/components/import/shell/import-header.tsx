"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import type { Route } from "next";
import Link from "next/link";
import { ImportCartBadge } from "@/components/import/cart/import-cart-badge";
import { useImportContact } from "@/components/import/import-contact-context";
import styles from "./import-shell.module.css";

const NAV_ITEMS = [
  { href: "/import", label: "Inicio" },
  { href: "/import/catalogo", label: "Catálogo" },
  { href: "/import#como-funciona", label: "Cómo funciona" },
  { href: "/import#faq", label: "FAQ" },
] as const;

function ArrowIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.5 12.5 12.5 3.5M12.5 3.5H5.5M12.5 3.5V10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ImportHeader() {
  const pathname = usePathname();
  const isHome = pathname === "/import";
  const [heroObservation, setHeroObservation] = useState({ pathname: "", heroGone: false });
  const heroGone = heroObservation.pathname === pathname ? heroObservation.heroGone : false;
  const contact = useImportContact();
  const whatsappNumber = contact?.whatsappNumber ?? "";
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!isHome) return undefined;
    const hero = document.querySelector("[data-import-home-hero]");
    if (!hero) return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      setHeroObservation({ pathname, heroGone: !entry?.isIntersecting });
    }, { rootMargin: "-80px 0px 0px 0px", threshold: 0 });
    observer.observe(hero);
    return () => observer.disconnect();
  }, [isHome, pathname]);

  const hiddenOverHero = isHome && !heroGone;

  return (
    <header className={[styles.header, isHome ? styles.headerHome : "", hiddenOverHero ? styles.headerHidden : ""].join(" ")}>
      <div className={styles.headerInner}>
        <Link href="/import" className={styles.lockup} aria-label="Cruzial Import, ir al inicio">
          <Image src="/images/import-home/cruzial-import-logo.png" alt="" width={136} height={68} priority className={styles.importLogo} />
        </Link>

        <nav className={styles.navigation} aria-label="Navegación de Cruzial Import">
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href as Route}>
              {item.label}
            </Link>
          ))}
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
          <Link href="/" className={styles.back}>
            Volver a Cruzial
            <ArrowIcon />
          </Link>
          <button
            type="button"
            className={styles.menuToggle}
            aria-expanded={menuOpen}
            aria-controls="import-mobile-nav"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className={styles.srOnly}>{menuOpen ? "Cerrar menú" : "Abrir menú"}</span>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              {menuOpen ? (
                <path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              ) : (
                <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {menuOpen ? (
        <nav id="import-mobile-nav" className={styles.mobileNav} aria-label="Navegación de Cruzial Import, móvil">
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href as Route} onClick={() => setMenuOpen(false)}>
              {item.label}
            </Link>
          ))}
          {whatsappNumber ? (
            <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noopener noreferrer">
              WhatsApp
            </a>
          ) : null}
          <Link href="/" className={styles.mobileNavBack}>
            Volver a Cruzial <ArrowIcon />
          </Link>
        </nav>
      ) : null}
    </header>
  );
}
