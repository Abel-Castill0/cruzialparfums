import Image from "next/image";
import Link from "next/link";
import { BrandLockup } from "@/components/design-system/brand-lockup";
import { WorldPanel } from "@/components/storefront/unit-entry";
import { BUSINESS_UNITS } from "@/domains/platform/contracts";
import styles from "./page.module.css";

const PRINCIPLES = [
  {
    title: "Plataforma compartida",
    text: "Una misma marca, dos operaciones. Catálogo y carrito independientes por unidad.",
  },
  {
    title: "Perfumería original",
    text: "Decants preparados a partir de frascos auténticos de casas oficiales.",
  },
  {
    title: "Importación por consolidado",
    text: "Cada consolidado reúne productos y disponibilidad por campaña activa.",
  },
  {
    title: "Coordinación directa",
    text: "Stock, envío y pago se confirman por WhatsApp en ambas unidades.",
  },
] as const;

export default function Home() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <BrandLockup />
        <nav className={styles.nav} aria-label="Unidades de negocio">
          <Link href="/parfums">Parfums</Link>
          <Link href="/import">Import</Link>
        </nav>
      </header>

      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Cruzial</p>
          <h1 id="hero-title">
            Dos negocios.
            <br />
            Una casa.
          </h1>
          <p className={styles.heroSummary}>
            Parfums e Import comparten identidad y plataforma, no catálogo ni
            carrito. Elige a qué mundo entrar.
          </p>
          <div className={styles.heroActions}>
            <Link href="/parfums" className={styles.ctaPrimary}>
              Entrar a Parfums
            </Link>
            <Link href="/import" className={styles.ctaSecondary}>
              Entrar a Import
            </Link>
          </div>
        </div>

        <div className={styles.heroVisual} aria-hidden="true">
          <div className={styles.heroPedestal}>
            <Image
              src="/images/home-redesign/home-parfums-pedestal.webp"
              alt=""
              fill
              sizes="(min-width: 1024px) 40vw, 80vw"
              className={styles.heroPedestalImage}
            />
          </div>
          <div className={styles.heroBottle}>
            <Image
              src="/images/home-redesign/home-hero-perfume.webp"
              alt=""
              fill
              priority
              sizes="(min-width: 1024px) 32vw, 70vw"
              className={styles.heroBottleImage}
            />
          </div>
        </div>
      </section>

      <section className={styles.worlds} aria-label="Unidades de Cruzial">
        {BUSINESS_UNITS.map((unit, index) => (
          <WorldPanel key={unit.code} index={index + 1} unit={unit} />
        ))}
      </section>

      <section className={styles.principles} aria-labelledby="principles-title">
        <h2 id="principles-title" className={styles.visuallyHidden}>
          Principios de Cruzial
        </h2>
        <ul className={styles.principlesList}>
          {PRINCIPLES.map((principle) => (
            <li key={principle.title} className={styles.principle}>
              <span className={styles.principleMark} aria-hidden="true" />
              <h3>{principle.title}</h3>
              <p>{principle.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.editorial} aria-labelledby="editorial-title">
        <Image
          src="/images/home-redesign/home-import-wave.webp"
          alt=""
          fill
          sizes="100vw"
          className={styles.editorialImage}
        />
        <div className={styles.editorialCopy}>
          <p className={styles.eyebrow}>Un mismo estándar</p>
          <h2 id="editorial-title">Dos mundos. Un solo criterio.</h2>
          <p>
            Parfums e Import se construyen sobre el mismo criterio: procesos
            claros, coordinación directa y una plataforma pensada para que
            cada unidad opere a su manera sin perder identidad Cruzial.
          </p>
        </div>
      </section>

      <section className={styles.finalCta} aria-labelledby="final-cta-title">
        <h2 id="final-cta-title">¿A qué mundo entras hoy?</h2>
        <div className={styles.finalCtaActions}>
          <Link href="/parfums" className={styles.ctaPrimary}>
            Entrar a Parfums
          </Link>
          <Link href="/import" className={styles.ctaSecondary}>
            Entrar a Import
          </Link>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerTop}>
          <BrandLockup />

          <div className={styles.footerGroup}>
            <p className={styles.footerHeading}>Parfums</p>
            <Link href="/parfums">Tienda</Link>
            <Link href="/parfums/terminos">Términos</Link>
            <Link href="/parfums/privacidad">Privacidad</Link>
          </div>

          <div className={styles.footerGroup}>
            <p className={styles.footerHeading}>Import</p>
            <Link href="/import">Tienda</Link>
            <Link href="/import/terminos">Términos</Link>
            <Link href="/import/privacidad">Privacidad</Link>
          </div>

          <div className={styles.footerGroup}>
            <p className={styles.footerHeading}>Legal</p>
            <Link href="/libro-de-reclamaciones">Libro de Reclamaciones</Link>
          </div>
        </div>

        <div className={styles.footerBottom}>
          <span>CRUZIAL</span>
          <span>Lima · Perú</span>
        </div>
      </footer>
    </main>
  );
}
