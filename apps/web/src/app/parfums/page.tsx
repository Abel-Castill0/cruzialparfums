import type { Metadata } from "next";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { ComboCarousel } from "@/components/parfums/home/combo-carousel";
import { LegacyCatalogRepository } from "@/domains/catalog/legacy-catalog-repository";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Cruzial Parfums",
  description: "Decants, frascos, combos y fragancias de entrega inmediata en Lima, Perú.",
};

const discoveryCategories = [
  { type: "arab", label: "Perfumería árabe", note: "Lattafa, Afnan, Rasasi y más" },
  { type: "designer", label: "Designer", note: "Casas reconocidas internacionalmente" },
  { type: "niche", label: "Nicho", note: "Selección de autor" },
] as const;

const principios = [
  {
    num: "01",
    title: "Originalidad absoluta",
    text: "Solo trabajamos con frascos auténticos de las casas oficiales. Cada decant se prepara con material nuevo por cliente.",
  },
  {
    num: "02",
    title: "Selección curada",
    text: "El catálogo pasa un filtro de carácter: proyección, duración y versatilidad antes de entrar.",
  },
  {
    num: "03",
    title: "Atención humana",
    text: "Tu pedido termina en una conversación real por WhatsApp: asesoramos, confirmamos stock y coordinamos la entrega.",
  },
];

export default function ParfumsHomePage() {
  const catalog = new LegacyCatalogRepository();
  const combos = catalog.listCombos();
  const { heroUrl } = catalog.getHeroMedia();

  return (
    <main className={styles.home}>
      <section className={styles.hero} aria-labelledby="home-hero-title">
        {heroUrl ? (
          <Image
            src={heroUrl}
            alt="Cruzial Parfums — perfumería árabe, designer y de nicho"
            fill
            sizes="100vw"
            priority
            className={styles.heroImage}
          />
        ) : null}
        <div className={styles.heroScrim} aria-hidden="true" />
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Cruzial Parfums</p>
          <h1 id="home-hero-title">Perfumería de descubrimiento.</h1>
          <p className={styles.heroSummary}>
            Decants desde 3 ml y frascos completos, entrega inmediata en Lima.
          </p>
          <Link href="/parfums/catalogo" className={styles.heroCta}>
            Explorar catálogo <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <section className={styles.trustStrip} aria-label="Por qué comprar en Cruzial">
        <div>
          <strong>100%</strong>
          <span>Originales</span>
          <p>Decants preparados desde frascos auténticos de las casas oficiales.</p>
        </div>
        <div>
          <strong>WhatsApp</strong>
          <span>Confirmación</span>
          <p>Un asesor revisa tu pedido y confirma stock, envío y total.</p>
        </div>
        <div>
          <strong>Shalom</strong>
          <span>Envío nacional</span>
          <p>Línea 1, motorizado y contraentrega en Lima; agencia a todo el Perú.</p>
        </div>
        <div>
          <strong>3 · 5 · 10</strong>
          <span>Formatos</span>
          <p>Empieza pequeño y escala cuando la fragancia te convenza.</p>
        </div>
      </section>

      <section className={styles.discovery} aria-labelledby="discovery-title">
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.eyebrow}>Catálogo</p>
            <h2 id="discovery-title">Encuentra tu <em>familia</em>.</h2>
          </div>
          <Link href="/parfums/catalogo">Ver todo el catálogo <span aria-hidden="true">→</span></Link>
        </div>
        <div className={styles.discoveryGrid}>
          {discoveryCategories.map((category) => (
            <Link
              key={category.type}
              href={`/parfums/catalogo?type=${category.type}` as Route}
              className={styles.discoveryCard}
            >
              <span className={styles.discoveryLabel}>{category.label}</span>
              <p>{category.note}</p>
              <span className={styles.discoveryArrow} aria-hidden="true">→</span>
            </Link>
          ))}
        </div>
      </section>

      {combos.length > 0 ? (
        <section className={styles.comboSection} aria-labelledby="combo-carousel-title">
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.eyebrow}>Sets ya armados</p>
              <h2 id="combo-carousel-title">Combos <em>Cruzial</em>.</h2>
            </div>
            <Link href="/parfums/combos">Ver todos los combos <span aria-hidden="true">→</span></Link>
          </div>
          <ComboCarousel combos={combos} />
        </section>
      ) : null}

      <section className={styles.finder} aria-labelledby="finder-title">
        <div>
          <p className={styles.eyebrow}>Encuentra tu fragancia</p>
          <h2 id="finder-title">¿No sabes por dónde <em>empezar</em>?</h2>
          <p>Responde 5 preguntas y te mostramos opciones explicables del catálogo actual.</p>
        </div>
        <Link href="/parfums/finder" className={styles.finderCta}>
          Iniciar Finder <span aria-hidden="true">→</span>
        </Link>
      </section>

      <section className={styles.authenticity} aria-labelledby="authenticity-title">
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.eyebrow}>Cómo trabajamos</p>
            <h2 id="authenticity-title">Autenticidad, sin <em>ruido</em>.</h2>
          </div>
          <Link href="/parfums/nosotros">Conoce Cruzial <span aria-hidden="true">→</span></Link>
        </div>
        <div className={styles.principiosGrid}>
          {principios.map((principio) => (
            <article key={principio.num}>
              <span>{principio.num}</span>
              <h3>{principio.title}</h3>
              <p>{principio.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.wholesaleCta} aria-labelledby="wholesale-cta-title">
        <div>
          <p className={styles.eyebrow}>Cruzial Business</p>
          <h2 id="wholesale-cta-title">¿Compras para <em>revender</em>?</h2>
          <p>Tarifas por volumen para tiendas, barberías, salones y creadores.</p>
        </div>
        <Link href="/parfums/mayorista" className={styles.wholesaleLink}>
          Ver Mayorista <span aria-hidden="true">→</span>
        </Link>
      </section>
    </main>
  );
}
